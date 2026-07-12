import re
from pathlib import Path
from django.core.cache import cache
from .models import BiasedWordMapping
import os
from io import BytesIO
import textwrap
import logging

# Prefer a writable workbook in the backend root. The legacy .xls file is still supported as a fallback.
DATASET_DIR = Path(__file__).resolve().parent.parent.parent
DEFAULT_DATASET_PATH = DATASET_DIR / 'gender_fair_dataset_300.xlsx'
LEGACY_DATASET_PATH = DATASET_DIR / 'gender_fair_dataset_300.xls'
DATASET_PATH = DEFAULT_DATASET_PATH


def resolve_dataset_path(target_path=None):
    if target_path:
        return Path(target_path)

    for candidate in [DEFAULT_DATASET_PATH, LEGACY_DATASET_PATH]:
        if candidate.exists():
            return candidate

    return DEFAULT_DATASET_PATH


def load_dataset_to_db():
    """
    Load the gender-fair dataset from Excel file to the database.
    Supports both .xls (old format) and .xlsx (new format).
    This should be run once during initial setup or migration.
    """
    if BiasedWordMapping.objects.exists():
        return  # Already loaded

    dataset_path = resolve_dataset_path()
    if not dataset_path.exists():
        print(f"Dataset file not found at {dataset_path}. Skipping dataset loading.")
        return

    try:
        file_ext = dataset_path.suffix.lower()

        if file_ext == '.xls':
            # Use xlrd for old Excel format
            import xlrd
            workbook = xlrd.open_workbook(str(dataset_path))
            worksheet = workbook.sheet_by_index(0)
            
            # Skip header row and load mappings
            # Columns: id (col 0), gendered_term (col 1), gender_fair_term (col 2)
            # Uses get_or_create to skip duplicates and continue loading
            loaded = 0
            skipped = 0
            for row_idx in range(1, worksheet.nrows):
                biased_word = str(worksheet.cell_value(row_idx, 1)).strip().lower()
                fair_word = str(worksheet.cell_value(row_idx, 2)).strip()
                
                if biased_word and fair_word:
                    obj, created = BiasedWordMapping.objects.get_or_create(
                        biased_word=biased_word,
                        defaults={'fair_word': fair_word}
                    )
                    if created:
                        loaded += 1
                    else:
                        skipped += 1
            
            print(f"  Loaded {loaded} new mappings, skipped {skipped} duplicates")
        
        else:  # .xlsx format
            import openpyxl
            wb = openpyxl.load_workbook(str(dataset_path))
            ws = wb.active
            
            # Skip header row and load mappings
            # Columns: id (col 0), gendered_term (col 1), gender_fair_term (col 2)
            # Uses get_or_create to skip duplicates and continue loading
            loaded = 0
            skipped = 0
            for row in ws.iter_rows(min_row=2, values_only=True):
                if len(row) >= 3 and row[1] and row[2]:  # Ensure we have at least 3 columns
                    biased_word = str(row[1]).strip().lower()
                    fair_word = str(row[2]).strip()
                    
                    obj, created = BiasedWordMapping.objects.get_or_create(
                        biased_word=biased_word,
                        defaults={'fair_word': fair_word}
                    )
                    if created:
                        loaded += 1
                    else:
                        skipped += 1
            
            print(f"  Loaded {loaded} new mappings, skipped {skipped} duplicates")
        
        count = BiasedWordMapping.objects.count()
        try:
            cache.delete('gender_fair_dataset')
        except Exception:
            pass
        print(f"Loaded {count} biased word mappings from dataset.")
    
    except ImportError as ie:
        print(f"Error: Missing library - {ie}. Install with: pip install xlrd openpyxl")
    except Exception as e:
        print(f"Error loading dataset: {e}")


def append_mapping_to_excel(biased_word, fair_word):
    """
    Append a new biased word mapping to the Excel dataset file.
    Returns True on success, False on failure.
    """
    dataset_path = resolve_dataset_path()
    if not dataset_path.exists():
        logger = logging.getLogger('gender_fair_app.utils')
        logger.warning(f"Cannot append mapping: dataset file not found at {dataset_path}")
        return False

    try:
        if dataset_path.suffix.lower() == '.xlsx':
            import openpyxl
            wb = openpyxl.load_workbook(str(dataset_path))
            ws = wb.active
            next_row = ws.max_row + 1
            ws.cell(row=next_row, column=1, value=next_row - 1)
            ws.cell(row=next_row, column=2, value=biased_word)
            ws.cell(row=next_row, column=3, value=fair_word)
            wb.save(str(dataset_path))
            return True
        else:
            logger = logging.getLogger('gender_fair_app.utils')
            logger.warning("Appending to .xls is not supported. Convert dataset to .xlsx to enable updates.")
            return False
    except Exception as e:
        logger = logging.getLogger('gender_fair_app.utils')
        logger.error(f"Failed to append mapping to Excel: {e}")
        return False


def get_dataset_dict():
    """
    Get the biased word mappings as a dictionary.
    Uses caching to avoid database queries on every request.
    """
    cache_key = 'gender_fair_dataset'
    dataset = cache.get(cache_key)
    
    if dataset is None:
        # If DB has no mappings, attempt to load the dataset file into DB.
        try:
            if not BiasedWordMapping.objects.exists():
                # Attempt to populate DB from the dataset file (idempotent)
                try:
                    load_dataset_to_db()
                except Exception as e:
                    # Log and continue; we'll still return whatever mappings exist (possibly empty)
                    logger = logging.getLogger('gender_fair_app.utils')
                    logger.warning(f"Warning: load_dataset_to_db() failed: {e}")

        except Exception:
            # If DB is not available or other error, fall through and try to read mappings (may raise)
            pass

        mappings = BiasedWordMapping.objects.all()
        dataset = {mapping.biased_word: mapping.fair_word for mapping in mappings}
        cache.set(cache_key, dataset, 3600)  # Cache for 1 hour
    
    return dataset


def get_dataset_from_excel():
    """
    Return the dataset rows from the database, falling back to loading from the
    legacy Excel file when the database is still empty.
    """
    try:
        if not BiasedWordMapping.objects.exists():
            load_dataset_to_db()

        mappings = BiasedWordMapping.objects.all().order_by('biased_word')
        return [
            {
                'id': mapping.id,
                'biased_word': mapping.biased_word,
                'fair_word': mapping.fair_word,
            }
            for mapping in mappings
        ]
    except Exception as e:
        logger = logging.getLogger('gender_fair_app.utils')
        logger.error(f"Failed to read dataset from database: {e}")
        return []


def _normalize_excel_cell_value(value):
    if value is None:
        return ''
    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        return str(value)
    return str(value).strip()


def _log_dataset_snapshot(label, rows):
    logger = logging.getLogger('gender_fair_app.utils')
    normalized_rows = [[_normalize_excel_cell_value(cell) for cell in row] for row in rows]
    logger.info(f"📄 {label} | rows={normalized_rows}")
    print(f"[DATASET IMPORT] {label}")
    for row in normalized_rows:
        print(f"  {row}")
    if not normalized_rows:
        print('  <empty>')


def _is_excel_header_row(row):
    """
    Detect if a row is a header row by looking for known header keywords.
    Uses exact word matching, not substring matching.
    """
    normalized = [_normalize_excel_cell_value(cell).lower() for cell in row]
    
    # Exact header keywords (full word matches, not substrings)
    header_keywords = {
        'id',
        'gendered_term',
        'gender_fair_term',
        'biased_word',
        'biased word',
        'fair_word',
        'fair word',
        'fair alternative',
        'gender fair term',
    }

    # Check for exact matches only (full words, case-insensitive)
    for cell in normalized:
        # Normalize: remove leading/trailing spaces, convert to lowercase
        cell_lower = cell.lower().strip()
        
        # Exact match check
        if cell_lower in header_keywords:
            return True
        
        # Check if any header keyword is a standalone word in the cell
        # e.g., "gendered_term" or "gendered term" should match, but "fairterm1" should NOT
        for keyword in header_keywords:
            # Split by spaces and check if keyword appears as a complete word
            cell_words = set(cell_lower.replace('_', ' ').split())
            keyword_words = set(keyword.replace('_', ' ').split())
            if keyword_words <= cell_words:  # keyword is subset of cell words
                return True
    
    # Check for pattern: [id, gender*, fair*] or [id, biased*, fair*]
    if len(normalized) >= 2:
        cell0_lower = normalized[0].lower().replace('_', ' ')
        cell1_lower = normalized[1].lower().replace('_', ' ')
        
        if 'id' in cell0_lower:
            if ('gender' in cell1_lower or 'biased' in cell1_lower):
                return True

    return False


def _extract_mappings_from_excel_file(uploaded_file):
    logger = logging.getLogger('gender_fair_app.utils')
    
    # CRITICAL DEBUG: Verify we're reading from the uploaded file, not a default location
    file_name = getattr(uploaded_file, 'name', 'unknown')
    file_id = id(uploaded_file)  # Python object id to track if it's the same object
    
    logger.info(f"📥 === EXTRACTION START === | file_name={file_name} | object_id={file_id}")
    logger.info(f"📥 File object type: {type(uploaded_file)}")
    logger.info(f"📥 File object has 'read' method: {hasattr(uploaded_file, 'read')}")
    
    # CRITICAL: Read the first 100 bytes to verify what file is actually being read
    try:
        uploaded_file.seek(0)
        first_bytes = uploaded_file.read(100)
        uploaded_file.seek(0)  # Reset for actual extraction
        logger.info(f"📥 First 100 bytes of file (hex): {first_bytes[:100].hex()}")
        logger.info(f"📥 First 100 bytes decoded: {first_bytes[:100]}")
    except Exception as e:
        logger.error(f"📥 Failed to peek at file bytes: {e}")
    
    # Make sure we're at the start of the file
    try:
        uploaded_file.seek(0)
        current_pos = uploaded_file.tell()
        logger.info(f"📥 File seek successful | position={current_pos}")
    except Exception as e:
        logger.error(f"📥 File seek FAILED: {e}")
        raise
    
    ext = Path(file_name).suffix.lower() if file_name else ''
    logger.info(f"📥 File extension: {ext}")

    rows = []
    if ext == '.xlsx':
        import openpyxl
        try:
            workbook = openpyxl.load_workbook(uploaded_file, data_only=True)
            sheet = workbook.active
            rows = list(sheet.iter_rows(values_only=True))
            logger.info(f"📥 XLSX loaded | sheet_name={sheet.title} | rows={len(rows)} | max_col={sheet.max_column}")
        except Exception as e:
            logger.error(f"📥 XLSX load failed: {e}")
            raise
            
    elif ext == '.xls':
        import xlrd
        try:
            file_bytes = uploaded_file.read()
            logger.info(f"📥 XLS bytes read | total_bytes={len(file_bytes)}")
            workbook = xlrd.open_workbook(file_contents=file_bytes)
            sheet = workbook.sheet_by_index(0)
            rows = [
                [sheet.cell_value(row_idx, col_idx) for col_idx in range(sheet.ncols)]
                for row_idx in range(sheet.nrows)
            ]
            logger.info(f"📥 XLS loaded | rows={len(rows)} | ncols={sheet.ncols} | nrows={sheet.nrows}")
        except Exception as e:
            logger.error(f"📥 XLS load failed: {e}")
            raise
    else:
        raise ValueError(f'Unsupported file type: {ext}')

    # Log ALL rows - but cap at showing first 10 and last row to avoid spam
    logger.info(f"📥 ALL {len(rows)} ROWS FROM FILE:")
    if len(rows) <= 12:
        # If <= 12 rows total, show all
        for idx, row in enumerate(rows):
            normalized = [_normalize_excel_cell_value(cell) for cell in row]
            logger.info(f"📥   ROW[{idx}]: {normalized}")
    else:
        # If > 12 rows, show first 5, then "..." then last row
        for idx in range(min(5, len(rows))):
            normalized = [_normalize_excel_cell_value(cell) for cell in rows[idx]]
            logger.info(f"📥   ROW[{idx}]: {normalized}")
        logger.info(f"📥   ... ({len(rows) - 6} rows omitted) ...")
        normalized = [_normalize_excel_cell_value(cell) for cell in rows[-1]]
        logger.info(f"📥   ROW[{len(rows)-1}]: {normalized}")
    
    mappings = []
    header_row = None
    has_detected_headers = False
    
    # First pass: check if any row looks like a header
    for row_idx, row in enumerate(rows[:5]):  # Check first 5 rows only
        if _is_excel_header_row(row):
            header_row = [_normalize_excel_cell_value(cell).lower() for cell in row]
            has_detected_headers = True
            logger.info(f"📥 ROW[{row_idx}] HEADER DETECTED: {header_row}")
            break
    
    if not has_detected_headers:
        logger.info(f"📥 NO HEADERS DETECTED - treating all rows as data")
    
    for row_idx, row in enumerate(rows):
        if not row:
            logger.info(f"📥 ROW[{row_idx}] SKIPPED: empty row")
            continue
        
        # Skip header row if we detected one
        if has_detected_headers and header_row and row_idx < 5:
            if _is_excel_header_row(row):
                logger.info(f"📥 ROW[{row_idx}] SKIPPED: header row")
                continue

        values = [_normalize_excel_cell_value(cell) for cell in row]
        if not values or all(v == '' for v in values):
            logger.info(f"📥 ROW[{row_idx}] SKIPPED: all values empty")
            continue

        logger.info(f"📥 ROW[{row_idx}] VALUES: {values}")

        biased_idx = None
        fair_idx = None
        
        # Only try header-based detection if we have headers
        if has_detected_headers and header_row:
            for idx, header in enumerate(header_row):
                if idx >= len(values):
                    continue
                normalized_header = header.replace(' ', '_')
                if normalized_header in {'biased_word', 'gendered_term', 'gendered_term', 'biased_word', 'biased', 'term'}:
                    biased_idx = idx
                if normalized_header in {'fair_word', 'gender_fair_term', 'gender_fair_term', 'fair', 'replacement', 'fair alternative'}:
                    fair_idx = idx
            if biased_idx is None:
                for idx, header in enumerate(header_row):
                    if idx >= len(values):
                        continue
                    if 'biased' in header or 'gender' in header or 'term' in header:
                        biased_idx = idx
            if fair_idx is None:
                for idx, header in enumerate(header_row):
                    if idx >= len(values):
                        continue
                    if 'fair' in header or 'replacement' in header or 'alternative' in header:
                        fair_idx = idx
            logger.info(f"📥 ROW[{row_idx}] HEADER-BASED: biased_idx={biased_idx}, fair_idx={fair_idx}")

        # If no headers detected, use column positions directly
        if biased_idx is None and fair_idx is None:
            if len(values) >= 2:
                biased_idx, fair_idx = 0, 1
                logger.info(f"📥 ROW[{row_idx}] NO-HEADER MODE: biased_idx=0, fair_idx=1")
            elif len(values) == 1:
                biased_idx, fair_idx = 0, 0
                logger.info(f"📥 ROW[{row_idx}] AUTO-DETECT: 1 col → biased_idx=0, fair_idx=0")
            else:
                logger.info(f"📥 ROW[{row_idx}] SKIPPED: not enough columns")
                continue

        if biased_idx is None:
            biased_idx = 0
        if fair_idx is None:
            fair_idx = 1 if len(values) > 1 else 0

        biased_word = values[biased_idx].strip().lower() if biased_idx < len(values) else ''
        fair_word = values[fair_idx].strip() if fair_idx < len(values) else ''
        
        logger.info(f"📥 ROW[{row_idx}] EXTRACTED: biased='{biased_word}' (from col {biased_idx}), fair='{fair_word}' (from col {fair_idx})")
        
        if biased_word and fair_word:
            mappings.append((biased_word, fair_word))
            logger.info(f"📥 ROW[{row_idx}] ✅ ADDED TO MAPPINGS")
        else:
            logger.info(f"📥 ROW[{row_idx}] ❌ REJECTED: empty biased_word or fair_word")

    logger.info(f"📥 === EXTRACTION END === | total_mappings={len(mappings)}")
    return mappings


def _read_existing_rows_from_path(path):
    path = Path(path)
    if not path.exists():
        return [], None

    ext = path.suffix.lower()
    if ext == '.xlsx':
        from openpyxl import load_workbook
        workbook = load_workbook(path, data_only=True)
        sheet = workbook.active
        rows = list(sheet.iter_rows(values_only=True))
        return rows, workbook

    if ext == '.xls':
        import xlrd
        with open(path, 'rb') as handle:
            workbook = xlrd.open_workbook(file_contents=handle.read())
        sheet = workbook.sheet_by_index(0)
        rows = [
            [sheet.cell_value(row_idx, col_idx) for col_idx in range(sheet.ncols)]
            for row_idx in range(sheet.nrows)
        ]
        return rows, workbook

    return [], None


def _write_rows_to_path(path, rows):
    path = Path(path)
    ext = path.suffix.lower()
    if ext == '.xlsx':
        try:
            from openpyxl import Workbook
        except ImportError:
            logger = logging.getLogger('gender_fair_app.utils')
            logger.warning('openpyxl is unavailable, falling back to .xls output path')
            return _write_rows_to_path(path.with_suffix('.xls'), rows)

        workbook = Workbook()
        sheet = workbook.active
        sheet.title = 'Sheet1'
        for row in rows:
            sheet.append([_normalize_excel_cell_value(value) for value in row])
        workbook.save(path)
        return True

    if ext == '.xls':
        import xlwt
        workbook = xlwt.Workbook()
        sheet = workbook.add_sheet('Sheet1')
        for row_idx, row in enumerate(rows):
            for col_idx, value in enumerate(row):
                sheet.write(row_idx, col_idx, value)
        workbook.save(str(path))
        return True

    raise ValueError('Unsupported file type. Please save the dataset as .xls or .xlsx.')


def append_mappings_to_excel_file(uploaded_file, target_path=None, merge_existing=True):
    """
    Append mappings from an uploaded Excel file to the dataset workbook.
    
    ⚠️ CRITICAL: This function ONLY reads from the uploaded file.
    It NEVER loads default dataset files or reads from disk.
    
    If merge_existing=False, only the uploaded file content is imported (no merging with existing data).
    If merge_existing=True, new mappings are merged with existing dataset rows.
    """
    logger = logging.getLogger('gender_fair_app.utils')
    
    # ⚠️ CRITICAL: Do NOT call load_dataset_to_db() here - only read uploaded file
    logger.info(f"📤 IMPORT REQUEST | file={getattr(uploaded_file, 'name', 'unknown')} | merge_existing={merge_existing}")
    logger.info(f"📤 ⚠️ CRITICAL: Will only read from UPLOADED FILE, not from default dataset file")
    
    xls_path = Path(resolve_dataset_path(target_path))

    # Preserve the existing dataset format for legacy .xls files.
    # Only fallback from .xlsx to .xls if openpyxl is unavailable.
    if xls_path.suffix.lower() == '.xlsx':
        try:
            import importlib.util
            if importlib.util.find_spec('openpyxl') is None:
                logger.warning('openpyxl not installed; falling back to .xls storage')
                xls_path = xls_path.with_suffix('.xls')
        except Exception:
            pass

    try:
        # ✅ Extract ONLY from uploaded file - DO NOT load any default files
        imported_mappings = _extract_mappings_from_excel_file(uploaded_file)
        logger.info(f"📤 IMPORTED MAPPINGS | count={len(imported_mappings)} | mappings={imported_mappings}")
        
        if not imported_mappings:
            logger.warning('append_mappings_to_excel_file received no valid mappings to import')
            return False

        added_rows = 0
        updated_rows = 0

        # Save all mappings from uploaded file directly to database
        for biased_word, fair_word in imported_mappings:
            if not biased_word or not fair_word:
                continue

            obj, created = BiasedWordMapping.objects.update_or_create(
                biased_word=biased_word,
                defaults={'fair_word': fair_word}
            )
            
            if created:
                added_rows += 1
                logger.info(f"✅ Added new mapping: {biased_word} → {fair_word}")
            elif obj.fair_word != fair_word:
                obj.fair_word = fair_word
                obj.save()
                updated_rows += 1
                logger.info(f"🔄 Updated mapping: {biased_word} → {fair_word}")

        # Clear cache to reflect new data
        try:
            cache.delete('gender_fair_dataset')
        except Exception:
            pass

        result = {
            'success': True,
            'imported_rows': len(imported_mappings),
            'added_rows': added_rows,
            'updated_rows': updated_rows,
            'changed': (added_rows + updated_rows) > 0,
        }

        logger.info(f'✅ Import complete: added {added_rows} new mappings, updated {updated_rows} existing mappings from uploaded file')
        return result
        
    except Exception as e:
        logger.error(f'Failed to import mappings from file: {e}', exc_info=True)
        return False


def append_mapping_to_excel(biased_word: str, fair_word: str):
    """
    Append a new mapping to the database.
    """
    logger = logging.getLogger('gender_fair_app.utils')
    biased_word = biased_word.strip()
    fair_word = fair_word.strip()
    if not biased_word or not fair_word:
        logger.warning('append_mapping_to_excel called with empty biased_word or fair_word')
        return False

    if biased_word.endswith('-direct') or fair_word.endswith('-direct'):
        logger.warning('append_mapping_to_excel rejected test values ending with -direct')
        return False

    obj, created = BiasedWordMapping.objects.update_or_create(
        biased_word=biased_word,
        defaults={'fair_word': fair_word}
    )
    if not created and obj.fair_word != fair_word:
        obj.fair_word = fair_word
        obj.save()

    try:
        cache.delete('gender_fair_dataset')
    except Exception:
        pass

    return True


def tokenize_text(text):
    """
    Tokenize text into words and positions.
    Returns a list of (word, start_pos, end_pos) tuples.
    """
    tokens = []
    # Pattern to find words (including hyphenated words)
    pattern = r'\b[\w\-]+\b'
    
    for match in re.finditer(pattern, text):
        word = match.group()
        tokens.append({
            'word': word,
            'original': word,
            'start': match.start(),
            'end': match.end(),
            'is_capitalized': word[0].isupper() if word else False
        })
    
    return tokens


def analyze_text(text):
    """
    Analyze text for biased words and return results.
    
    Returns:
        {
            'original_text': original text,
            'processed_text': text with replacements,
            'detected_words': [list of detected biased words],
            'replacements': {biased: fair}
        }
    """
    dataset = get_dataset_dict()

    detected_words = []
    replacements = {}

    # Sort biased keys by length (longest first) so multi-word phrases match before single words
    biased_keys = sorted(dataset.keys(), key=lambda k: -len(k))

    # Track occupied character positions to avoid overlapping matches
    occupied = [False] * max(1, len(text))

    for biased in biased_keys:
        fair = dataset.get(biased, '')
        if not biased:
            continue
        # Word-boundary aware, case-insensitive
        try:
            pattern = re.compile(r'\b' + re.escape(biased) + r'\b', flags=re.IGNORECASE)
        except re.error:
            continue

        for match in pattern.finditer(text):
            start, end = match.start(), match.end()
            # Skip if any char in this span already matched a longer phrase
            if any(occupied[i] for i in range(start, end)):
                continue

            matched_text = match.group(0)
            # Preserve capitalization
            fair_word = fair
            if matched_text and matched_text[0].isupper() and fair_word:
                fair_word = fair_word[0].upper() + fair_word[1:]

            replacements[matched_text] = fair_word
            detected_words.append(biased)

            for i in range(start, end):
                occupied[i] = True

    # Apply replacements (only approved logic lives in the generate endpoint; here we show suggested replacements)
    processed_text = text
    for original, fair in replacements.items():
        if not original or not fair:
            continue

        try:
            pattern = re.compile(r'\b' + re.escape(original) + r'\b', flags=re.IGNORECASE)
        except re.error:
            continue

        def _replace_case(m):
            mt = m.group(0)
            if mt and mt[0].isupper():
                return fair[0].upper() + fair[1:] if len(fair) > 1 else fair.upper()
            return fair

        processed_text = pattern.sub(_replace_case, processed_text)

    # Unique detected biased words (normalized)
    detected_words = list(dict.fromkeys(detected_words))

    return {
        'original_text': text,
        'processed_text': processed_text,
        'detected_words': detected_words,
        'replacements': replacements
    }


def extract_text_from_txt(file):
    """Extract text from .txt file"""
    # TXT files are treated as single page
    return file.read().decode('utf-8', errors='ignore')


def extract_text_from_docx(file):
    """Extract text from .docx file"""
    from docx import Document
    
    doc = Document(file)
    text = []
    for para in doc.paragraphs:
        if para.text.strip():
            text.append(para.text)
    
    # DOCX files are treated as single page (page breaks are not easily detectable)
    return '\n'.join(text)


def extract_text_from_pdf(file):
    """Extract text from .pdf file.

    Tries multiple PDF parsers in order: PyPDF2 / pypdf, then PyMuPDF (fitz).
    Reads the uploaded file bytes into a BytesIO stream for compatibility.
    Preserves page boundaries using [PAGE_BREAK] marker.
    """
    file_bytes = file.read()
    stream = BytesIO(file_bytes)
    text = []

    # Try PyPDF2 or pypdf first
    try:
        try:
            from PyPDF2 import PdfReader
        except Exception:
            from pypdf import PdfReader

        reader = PdfReader(stream)
        for page in reader.pages:
            try:
                page_text = page.extract_text() or ''
            except Exception:
                # ensure we don't fail the whole extraction on a single page
                page_text = ''
            text.append(page_text)

        return '[PAGE_BREAK]'.join(text)
    except Exception:
        # If PyPDF2/pypdf not available or failed, try PyMuPDF (fitz)
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(stream=file_bytes, filetype='pdf')
            for page in doc:
                try:
                    page_text = page.get_text() or ''
                except Exception:
                    page_text = ''
                text.append(page_text)

            return '[PAGE_BREAK]'.join(text)
        except Exception:
            raise ImportError(
                "No PDF parser available. Install one of: PyPDF2, pypdf, or PyMuPDF. "
                "Run: pip install PyPDF2 pypdf PyMuPDF"
            )


def extract_text_from_file(file):
    """
    Extract text from uploaded file based on file type.
    Supports .txt, .docx, .pdf
    """
    file_ext = file.name.split('.')[-1].lower()
    
    try:
        if file_ext == 'txt':
            return extract_text_from_txt(file), file_ext
        elif file_ext == 'docx':
            return extract_text_from_docx(file), file_ext
        elif file_ext == 'pdf':
            return extract_text_from_pdf(file), file_ext
        else:
            raise ValueError(f"Unsupported file type: {file_ext}")
    except Exception as e:
        raise ValueError(f"Error processing {file_ext} file: {str(e)}")


def create_docx_from_text(text):
    try:
        from docx import Document as DocxDocument
    except ImportError as ie:
        raise ImportError(
            "python-docx is required to generate .docx files. Install with: pip install python-docx"
        ) from ie

    from docx.shared import Pt
    from docx.oxml.ns import qn
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    doc = DocxDocument()

    # Try to set the Normal style to Arial so paragraphs use Arial by default
    try:
        style = doc.styles['Normal']
        style.font.name = 'Arial'
        style.font.size = Pt(11)
        # Also set East Asia font name to Arial where available
        try:
            r_fonts = style.element.rPr.rFonts
            r_fonts.set(qn('w:eastAsia'), 'Arial')
        except Exception:
            pass
    except Exception:
        # If style manipulation fails, continue and set font per-run below
        pass

    for line in text.splitlines():
        p = doc.add_paragraph(line)
        # Set paragraph alignment to justified
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        # Ensure each run uses Arial
        for run in p.runs:
            try:
                run.font.name = 'Arial'
                run.font.size = Pt(11)
            except Exception:
                pass

    output = BytesIO()
    doc.save(output)
    output.seek(0)
    return output


def create_pdf_from_text(text):
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.lib.enums import TA_JUSTIFY
    except ImportError as ie:
        raise ImportError(
            "reportlab is required to generate .pdf files. Install with: pip install reportlab"
        ) from ie

    output = BytesIO()
    doc = SimpleDocTemplate(output, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)
    
    # Create a justified paragraph style
    styles = getSampleStyleSheet()
    justified_style = ParagraphStyle(
        'JustifiedStyle',
        parent=styles['Normal'],
        alignment=TA_JUSTIFY,
        fontSize=11,
        fontName='Helvetica',
        leading=16,
        spaceAfter=6
    )
    
    # Build the story with paragraphs
    story = []
    for paragraph_text in text.split('\n'):
        if paragraph_text.strip():
            # Create a paragraph with justified alignment
            para = Paragraph(paragraph_text, justified_style)
            story.append(para)
        else:
            # Add space for empty lines
            story.append(Spacer(1, 0.1*inch))
    
    # Build the PDF
    doc.build(story)
    output.seek(0)
    return output


def calculate_text_width_in_pdf(page, text, fontname, fontsize):
    """
    Calculate the approximate width of text in PDF coordinates.
    Uses character-by-character calculation based on font metrics.
    """
    try:
        # Get an estimate by measuring text in the page
        # This is approximate but works well for most fonts
        char_width_estimate = fontsize * 0.5  # rough estimate: ~50% of font size
        width = len(text) * char_width_estimate
        return width
    except Exception as e:
        print(f"      ⚠️ Could not calculate text width: {e}")
        return len(text) * fontsize * 0.5  # fallback


def modify_pdf_with_replacements(pdf_bytes, replacements):
    """
    Modify a PDF by replacing text using PyMuPDF (fitz).
    This approach:
    - Calculates width differences between original and replacement text
    - Expands white rectangle if replacement is longer (prevents overlay)
    - Inserts replacement text at exact position
    - Maintains proper font sizes and styling
    - Automatically prevents text overlay by expanding coverage area

    Args:
        pdf_bytes: The original PDF as bytes
        replacements: List of {"original": str, "replacement": str, "approved": bool}

    Returns:
        BytesIO object containing the modified PDF
    """
    try:
        import fitz  # PyMuPDF
    except ImportError:
        raise ImportError("PyMuPDF is required for PDF modification. Install with: pip install PyMuPDF")

    try:
        # Load PDF from bytes
        pdf_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        print(f"📖 PDF loaded successfully | Pages: {len(pdf_doc)}")
        
        # Get approved replacements only
        approved_replacements = [r for r in replacements if r.get('approved', False)]
        print(f"🔍 Approved replacements to apply: {len(approved_replacements)}")
        for i, r in enumerate(approved_replacements):
            print(f"   [{i}] '{r.get('original')}' → '{r.get('replacement')}'")

        if not approved_replacements:
            # No replacements, return original
            print("⚠️ No approved replacements - returning original PDF")
            output = BytesIO()
            pdf_doc.save(output)
            output.seek(0)
            pdf_doc.close()
            return output

        # Track statistics
        total_replacements_made = 0

        # Process each page
        for page_num in range(len(pdf_doc)):
            page = pdf_doc[page_num]
            print(f"\n📄 Processing page {page_num + 1}/{len(pdf_doc)}")

            # For each approved replacement
            for replacement_idx, replacement in enumerate(approved_replacements):
                original = str(replacement.get('original', '')).strip()
                new_text = str(replacement.get('replacement', '')).strip()

                if not original or not new_text:
                    print(f"  ⚠️ Skipped replacement {replacement_idx}: empty original or replacement")
                    continue

                print(f"  🔄 Replacement {replacement_idx}: '{original}' → '{new_text}'")

                # Search for text - case-insensitive
                search_results = []
                try:
                    # Try exact case-sensitive first
                    search_results = page.search_for(original, flags=fitz.TEXT_PRESERVE_WHITESPACE)
                    if search_results:
                        print(f"    ✅ Found {len(search_results)} exact match(es)")
                except Exception as e:
                    print(f"    ⚠️ Exact search failed: {e}")
                
                # Try case-insensitive if not found
                if not search_results:
                    try:
                        search_results = page.search_for(
                            original,
                            flags=fitz.TEXT_PRESERVE_WHITESPACE | fitz.TEXT_IGNORE_CASE
                        )
                        if search_results:
                            print(f"    ✅ Found {len(search_results)} case-insensitive match(es)")
                    except Exception as e:
                        print(f"    ⚠️ Case-insensitive search failed: {e}")
                
                if search_results:
                    # Get text dict to extract font information
                    try:
                        dict_obj = page.get_text("dict")
                        text_info_map = {}  # Map of (rect) -> {fontsize, fontname}
                        
                        for block in dict_obj.get("blocks", []):
                            for line in block.get("lines", []):
                                for span in line.get("spans", []):
                                    span_rect = fitz.Rect(span['bbox'])
                                    # Store font info indexed by rect
                                    if 'size' in span and 'font' in span:
                                        text_info_map[str(span_rect)] = {
                                            'fontsize': span.get('size'),
                                            'fontname': span.get('font'),
                                        }
                    except Exception as e:
                        print(f"    ⚠️ Could not extract detailed text info: {e}")
                        text_info_map = {}
                    
                    # Process each match
                    for idx, rect in enumerate(search_results):
                        try:
                            # Extract font metrics from matched text
                            fontsize = 12  # default
                            fontname = "Helvetica"
                            
                            # Try to get exact font from text dict
                            try:
                                dict_obj = page.get_text("dict")
                                for block in dict_obj.get("blocks", []):
                                    for line in block.get("lines", []):
                                        for span in line.get("spans", []):
                                            span_rect = fitz.Rect(span['bbox'])
                                            # Check if this span overlaps with our match rect
                                            if not (span_rect & rect).is_empty:
                                                fontsize = span.get('size', fontsize)
                                                fontname = span.get('font', fontname)
                                                break
                            except Exception as e:
                                print(f"      ⚠️ Font extraction failed: {e}")
                                # Fallback: estimate fontsize from rect height
                                fontsize = max(rect.height * 0.8, 8)
                            
                            # ✅ FIX #1: Calculate width of original and replacement text
                            original_width = calculate_text_width_in_pdf(page, original, fontname, fontsize)
                            replacement_width = calculate_text_width_in_pdf(page, new_text, fontname, fontsize)
                            
                            print(f"      📐 Original text rect: ({rect.x0:.1f}, {rect.y0:.1f}, {rect.x1:.1f}, {rect.y1:.1f})")
                            print(f"      📏 Width - Original: {original_width:.1f}, Replacement: {replacement_width:.1f}")
                            print(f"      🔤 Font: {fontname}, Size: {fontsize:.1f}pt")
                            
                            # ✅ FIX #2: Expand white rectangle if replacement is longer
                            # This prevents overlay by covering extra area that replacement will occupy
                            rect_to_cover = rect
                            
                            if replacement_width > original_width:
                                # Replacement is longer - expand rectangle to cover the extra width
                                extra_width = replacement_width - original_width
                                expanded_right = rect.x1 + extra_width
                                rect_to_cover = fitz.Rect(rect.x0, rect.y0, expanded_right, rect.y1)
                                print(f"      🔴 Replacement longer by {extra_width:.1f}pt - expanding coverage")
                            else:
                                print(f"      ✅ Replacement fits within original bounds")
                            
                            # Draw white rectangle to cover original + any overflow area
                            page.draw_rect(
                                rect_to_cover,
                                color=None,
                                fill=(1, 1, 1),
                                width=0
                            )
                            print(f"      ✅ Covered with white rect: ({rect_to_cover.x0:.1f}, {rect_to_cover.y0:.1f}, {rect_to_cover.x1:.1f}, {rect_to_cover.y1:.1f})")
                            
                            # ✅ FIX #3: Insert replacement text at same position
                            # The expanded white rect above prevents any overlay issues
                            inserted = False
                            text_baseline = rect.y1 - (fontsize * 0.2)
                            text_point = fitz.Point(rect.x0, text_baseline)
                            
                            # Try with the original font first
                            try:
                                page.insert_text(
                                    text_point,
                                    new_text,
                                    fontsize=fontsize,
                                    fontname=fontname,
                                    color=(0, 0, 0),
                                    render_mode=0
                                )
                                print(f"      ✅ Inserted replacement: '{new_text}'")
                                inserted = True
                            except Exception as font_err:
                                print(f"      ⚠️ Font '{fontname}' failed: {font_err}")
                                
                                # Try common fallback fonts
                                for fallback_font in ["Helvetica", "Times-Roman", "Courier"]:
                                    try:
                                        page.insert_text(
                                            text_point,
                                            new_text,
                                            fontsize=fontsize,
                                            fontname=fallback_font,
                                            color=(0, 0, 0)
                                        )
                                        print(f"      ✅ Inserted with fallback font '{fallback_font}'")
                                        inserted = True
                                        break
                                    except:
                                        continue
                                
                                # Last resort: try without specifying font
                                if not inserted:
                                    try:
                                        page.insert_text(
                                            text_point,
                                            new_text,
                                            fontsize=fontsize,
                                            color=(0, 0, 0)
                                        )
                                        print(f"      ✅ Inserted with default font")
                                        inserted = True
                                    except Exception as final_err:
                                        print(f"      ❌ All insertion attempts failed: {final_err}")
                            
                            if inserted:
                                total_replacements_made += 1 
                        finally:
                            pass
            print(f"  ✅ Page {page_num + 1} completed")

        # Summary
        print(f"\n📊 FINAL SUMMARY:")
        print(f"   ✅ Total replacements made: {total_replacements_made}")
        print(f"   ✅ Pages processed: {len(pdf_doc)}")

        # Write modified PDF to BytesIO
        output = BytesIO()
        pdf_doc.save(output)
        output.seek(0)
        pdf_doc.close()
        
        print(f"✅ Modified PDF saved: {output.getbuffer().nbytes} bytes")
        return output

    except Exception as e:
        print(f"❌ ERROR in modify_pdf_with_replacements: {e}")
        import traceback
        print(traceback.format_exc())
        raise


def create_document_file(text, file_type='txt'):
    normalized_type = (file_type or 'txt').lower()
    if normalized_type == 'docx':
        return create_docx_from_text(text)
    if normalized_type == 'pdf':
        return create_pdf_from_text(text)

    output = BytesIO(text.encode('utf-8'))
    output.seek(0)
    return output


# ============================================================================
# PDF TEXT REFLOW SYSTEM - 3-Phase Implementation
# ============================================================================
# Solves the word replacement overlay problem by:
# Phase 1: EXTRACT PDF structure as text blocks with positioning
# Phase 2: REPLACE biased words in the text blocks
# Phase 3: REBUILD PDF with proper ReportLab layout engine for text reflow
# ============================================================================

from dataclasses import dataclass
from typing import List, Optional
import json


@dataclass
class PDFTextBlock:
    """Represents a single text element in a PDF page."""
    text: str
    x: float
    y: float
    fontname: str
    fontsize: float
    page_num: int
    is_bold: bool = False
    is_italic: bool = False
    is_underline: bool = False
    is_modified: bool = False
    original_text: str = None
    
    def __post_init__(self):
        if self.original_text is None:
            self.original_text = self.text


@dataclass
class PDFPageStructure:
    """Represents the structure of a single PDF page."""
    page_num: int
    blocks: List[PDFTextBlock]
    page_height: float
    page_width: float
    left_margin: float = 50  # Default: ~0.5 inch
    right_margin: float = 50
    top_margin: float = 50
    bottom_margin: float = 50


def extract_pdf_structure(pdf_bytes: bytes) -> List[PDFPageStructure]:
    """
    PHASE 1: Extract PDF content as a structured representation.
    
    This extracts all text with positioning information, grouping by page.
    The structure is independent of rendering, allowing proper text reflow.
    
    Returns: List[PDFPageStructure] with all text blocks and positioning
    """
    try:
        import fitz  # PyMuPDF
    except ImportError:
        raise ImportError("PyMuPDF is required. Install with: pip install PyMuPDF")
    
    try:
        pdf_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        pages_structure = []
        
        print(f"\n📖 PHASE 1: EXTRACT PDF STRUCTURE")
        print(f"   Total pages: {len(pdf_doc)}")
        
        for page_num in range(len(pdf_doc)):
            page = pdf_doc[page_num]
            blocks = []
            
            try:
                # Get page dimensions - try different methods for compatibility
                try:
                    page_rect = page.get_bbox()
                except AttributeError:
                    # Fallback for newer PyMuPDF versions
                    page_rect = page.rect
                
                page_width = page_rect.width if hasattr(page_rect, 'width') else page_rect[2]
                page_height = page_rect.height if hasattr(page_rect, 'height') else page_rect[3]
                
                # Extract text with positioning
                text_dict = page.get_text("dict")
                
                min_x = float('inf')  # Track leftmost position for left margin
                min_y = float('inf')  # Track topmost position for top margin
                
                for block in text_dict.get("blocks", []):
                    if block.get("type") != 0:  # Skip non-text blocks
                        continue
                    
                    for line in block.get("lines", []):
                        for span in line.get("spans", []):
                            text = span.get("text", "").strip()
                            if not text:
                                continue
                            
                            bbox = span.get("bbox")
                            fontname = span.get("font", "Helvetica")
                            fontsize = span.get("size", 12)
                            
                            # Extract font flags (bold, italic, underline)
                            flags = span.get("flags", 0)  # PyMuPDF provides font flags
                            is_bold = bool(flags & 2)  # Bit 1 = bold
                            is_italic = bool(flags & 1)  # Bit 0 = italic
                            is_underline = bool(flags & 8)  # Bit 3 = underline
                            
                            # Also check font name for bold/italic (some PDFs encode it in the name)
                            fontname_lower = fontname.lower()
                            if not is_bold and ('bold' in fontname_lower):
                                is_bold = True
                            if not is_italic and ('italic' in fontname_lower or 'oblique' in fontname_lower):
                                is_italic = True
                            
                            # Track margins from actual content
                            min_x = min(min_x, bbox[0])
                            min_y = min(min_y, bbox[1])
                            
                            block_obj = PDFTextBlock(
                                text=text,
                                x=bbox[0],
                                y=bbox[1],
                                fontname=fontname,
                                fontsize=fontsize,
                                page_num=page_num,
                                is_bold=is_bold,
                                is_italic=is_italic,
                                is_underline=is_underline
                            )
                            blocks.append(block_obj)
                
                # Calculate margins from content positions
                left_margin = min_x if min_x != float('inf') else 50
                top_margin = min_y if min_y != float('inf') else 50
                right_margin = page_width - max([b.x + 300 for b in blocks], default=page_width - 50)  # Assume ~300 width per block
                bottom_margin = page_height - max([b.y + 20 for b in blocks], default=page_height - 50)  # Assume ~20 height per block
                
                page_struct = PDFPageStructure(
                    page_num=page_num,
                    blocks=blocks,
                    page_width=page_width,
                    page_height=page_height,
                    left_margin=left_margin,
                    top_margin=top_margin,
                    right_margin=max(right_margin, 30),  # Minimum 30 for safety
                    bottom_margin=max(bottom_margin, 30)
                )
                pages_structure.append(page_struct)
                
                print(f"   Page {page_num + 1}: {len(blocks)} text blocks extracted")
                
            except Exception as e:
                print(f"   ⚠️  Page {page_num + 1} extraction warning: {e}")
                import traceback
                traceback.print_exc()
                continue
        
        pdf_doc.close()
        print(f"✅ PHASE 1 Complete: Extracted {len(pages_structure)} pages")
        return pages_structure
        
    except Exception as e:
        print(f"❌ ERROR in extract_pdf_structure: {e}")
        raise


def apply_text_replacements_to_structure(
    pages: List[PDFPageStructure],
    replacements: List[dict]
) -> List[PDFPageStructure]:
    """
    PHASE 2: Apply text replacements to the extracted structure.
    
    This replaces biased words in text blocks, preserving positioning and
    formatting metadata. Uses case-insensitive matching like the original system.
    
    Returns: Modified pages with is_modified flags
    """
    print(f"\n🔄 PHASE 2: APPLY TEXT REPLACEMENTS")
    
    approved_replacements = [r for r in replacements if r.get('approved', False)]
    print(f"   Approved replacements: {len(approved_replacements)}")
    
    if not approved_replacements:
        print("⚠️  No approved replacements - structure unchanged")
        return pages
    
    total_replacements = 0
    
    for page in pages:
        for block in page.blocks:
            original_text = block.text
            
            # Apply each replacement to this block
            for replacement in approved_replacements:
                original = replacement.get('original', '').strip()
                new_text = replacement.get('replacement', '').strip()
                
                if not original or not new_text:
                    continue
                
                # Case-insensitive replacement
                # Build a regex that preserves original case pattern
                pattern = re.compile(re.escape(original), re.IGNORECASE)
                if pattern.search(block.text):
                    block.text = pattern.sub(new_text, block.text)
                    block.is_modified = True
                    total_replacements += 1
                    
                    if original != block.original_text:
                        block.original_text = original_text
    
    print(f"✅ PHASE 2 Complete: Applied {total_replacements} replacements")
    return pages


def rebuild_pdf_from_structure(pages: List[PDFPageStructure]) -> BytesIO:
    """
    PHASE 3: Rebuild PDF from structured content using ReportLab.
    
    This uses ReportLab's professional layout engine to handle:
    - Automatic text wrapping
    - Proper line spacing
    - Text reflow when content changes
    - Word processor-style layout (text automatically shifts right)
    
    Returns: BytesIO with complete new PDF
    """
    try:
        from reportlab.lib.pagesizes import letter, A4
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.lib.enums import TA_LEFT, TA_JUSTIFY
        from reportlab.platypus import SimpleDocTemplate, Paragraph, PageBreak, Spacer
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
    except ImportError:
        raise ImportError("ReportLab is required. Install with: pip install reportlab")
    
    print(f"\n🏗️  PHASE 3: REBUILD PDF WITH REPORTLAB")
    
    try:
        # Create PDF in memory
        output = BytesIO()
        
        # Use standard letter size
        pagesize = letter
        
        # Use STANDARD margins (0.5 inches = 36 points) instead of extracting broken margins
        # This prevents overflow and page multiplication
        STANDARD_MARGIN = 0.5 * inch  # 36 points
        
        print(f"   Using standard margins: {STANDARD_MARGIN:.1f} points ({STANDARD_MARGIN/72:.2f} inches)")
        
        doc = SimpleDocTemplate(
            output,
            pagesize=pagesize,
            rightMargin=STANDARD_MARGIN,
            leftMargin=STANDARD_MARGIN,
            topMargin=STANDARD_MARGIN,
            bottomMargin=STANDARD_MARGIN,
        )
        
        # Build document elements
        elements = []
        styles = getSampleStyleSheet()
        
        # Create a default style optimized for text reflow
        default_style = ParagraphStyle(
            'Default',
            parent=styles['Normal'],
            fontSize=11,
            leading=13,  # Reduced from 14 for better fit
            leftIndent=0,
            rightIndent=0,
            spaceAfter=4,  # Reduced from 6 for better fit
            alignment=TA_LEFT,  # Changed from TA_JUSTIFY to prevent stretching
        )
        
        total_blocks = sum(len(p.blocks) for p in pages)
        print(f"   Processing {len(pages)} pages with {total_blocks} text blocks total")
        
        for page_num, page in enumerate(pages):
            print(f"   Rebuilding page {page_num + 1} ({len(page.blocks)} blocks)...")
            
            if not page.blocks:
                continue
            
            # Step 1: Group blocks into lines (blocks at similar Y position = same line)
            lines = {}
            for block in page.blocks:
                y_key = round(block.y / 5) * 5  # Round to nearest 5 points
                if y_key not in lines:
                    lines[y_key] = []
                lines[y_key].append(block)
            
            # Step 2: Sort lines top-to-bottom and build line texts
            sorted_y_keys = sorted(lines.keys())
            line_data = []  # List of (y_position, line_text, avg_fontsize)
            
            # Calculate average line height for proper leading
            line_heights = []
            
            for y_key in sorted_y_keys:
                line_blocks = sorted(lines[y_key], key=lambda b: b.x)
                
                # Build line text with font preservation AND bold/italic/underline formatting
                line_text = ''
                avg_fontsize = 0
                for block in line_blocks:
                    fontsize = max(block.fontsize or 11, 8)
                    avg_fontsize += fontsize
                    safe_text = block.text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                    
                    # Wrap with formatting tags if needed
                    formatted_text = safe_text
                    if block.is_underline:
                        formatted_text = f'<u>{formatted_text}</u>'
                    if block.is_bold:
                        formatted_text = f'<b>{formatted_text}</b>'
                    if block.is_italic:
                        formatted_text = f'<i>{formatted_text}</i>'
                    
                    line_text += f'<font size="{fontsize}">{formatted_text}</font> '
                
                avg_fontsize = avg_fontsize / max(len(line_blocks), 1)
                line_heights.append(avg_fontsize)
                line_text = line_text.strip()
                if line_text:
                    line_data.append((y_key, line_text, avg_fontsize))
            
            # Calculate average line height for leading
            avg_line_height = sum(line_heights) / len(line_heights) if line_heights else 12
            calculated_leading = avg_line_height * 1.2  # 20% extra for spacing
            
            # Step 3: Group lines into paragraphs based on vertical spacing
            # Also track paragraph spacing
            paragraphs = []  # List of (lines, spacing_after)
            current_paragraph = []
            previous_y = None
            paragraph_gaps = []
            
            for y_pos, line_text, fontsize in line_data:
                if previous_y is not None:
                    gap = y_pos - previous_y
                    # If gap is too large (> 20 points), it's a paragraph break
                    if gap > 20:
                        # Save current paragraph with the spacing before the break
                        if current_paragraph:
                            paragraphs.append((current_paragraph, gap))
                            current_paragraph = []
                        paragraph_gaps.append(gap)
                
                current_paragraph.append(line_text)
                previous_y = y_pos
            
            # Don't forget the last paragraph
            if current_paragraph:
                paragraphs.append((current_paragraph, 0))  # Last paragraph has no spacing after
            
            # Calculate average gap between paragraphs for spacing
            avg_paragraph_gap = sum(paragraph_gaps) / len(paragraph_gaps) if paragraph_gaps else 10
            calculated_space_after = avg_paragraph_gap * 0.8  # Adjust for ReportLab scale
            
            # Step 4: Create Paragraph elements for each paragraph with custom styles
            for idx, (paragraph_lines, spacing_after) in enumerate(paragraphs):
                # Join lines of a paragraph with space
                paragraph_text = ' '.join(paragraph_lines)
                
                if paragraph_text:
                    # Create a custom style for this paragraph with the calculated spacing
                    para_style = ParagraphStyle(
                        f'Para_{page_num}_{idx}',
                        parent=styles['Normal'],
                        fontSize=11,
                        leading=calculated_leading,  # Calculated from average line height
                        leftIndent=0,
                        rightIndent=0,
                        spaceAfter=max(calculated_space_after, 2),  # Use calculated spacing, minimum 2
                        alignment=TA_JUSTIFY,
                    )
                    para = Paragraph(paragraph_text, para_style)
                    elements.append(para)
            
            # Add page break between pages (except last)
            if page_num < len(pages) - 1:
                elements.append(PageBreak())
        
        # Build the PDF
        doc.build(elements)
        output.seek(0)
        
        print(f"✅ PHASE 3 Complete: PDF rebuilt with {len(pages)} pages")
        return output
        
    except Exception as e:
        print(f"❌ ERROR in rebuild_pdf_from_structure: {e}")
        raise


def modify_pdf_with_text_reflow(pdf_bytes: bytes, replacements: List[dict]) -> BytesIO:
    """
    Main entry point for PDF text reflow system.
    
    Implements 3-phase approach:
    1. Extract PDF structure (text blocks with positioning)
    2. Apply replacements to text blocks
    3. Rebuild PDF with ReportLab for proper text reflow
    
    Benefits over visual overlay:
    ✅ No text overlaps
    ✅ Automatic text wrapping
    ✅ Proper spacing
    ✅ Word processor-style layout
    ✅ Multi-page support
    
    Falls back to coordinate-based approach if text reflow fails.
    
    Args:
        pdf_bytes: Original PDF as bytes
        replacements: List of {"original": str, "replacement": str, "approved": bool}
    
    Returns:
        BytesIO with modified PDF
    """
    print("\n" + "="*70)
    print("🔄 PDF TEXT REFLOW SYSTEM - PROCESSING")
    print("="*70)
    
    try:
        # Phase 1: Extract structure
        pages = extract_pdf_structure(pdf_bytes)
        
        # Phase 2: Apply replacements
        modified_pages = apply_text_replacements_to_structure(pages, replacements)
        
        # Phase 3: Rebuild PDF
        output = rebuild_pdf_from_structure(modified_pages)
        
        print("\n" + "="*70)
        print("✅ TEXT REFLOW SYSTEM - SUCCESS")
        print("="*70)
        return output
        
    except Exception as e:
        print(f"\n⚠️  TEXT REFLOW FAILED: {e}")
        print("   Falling back to coordinate-based approach...")
        print("="*70)
        
        # Fallback to the original visual overlay approach
        return modify_pdf_with_replacements(pdf_bytes, replacements)
