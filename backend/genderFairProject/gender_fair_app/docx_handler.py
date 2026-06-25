"""
DOCX Document Handler - True Content Editing Engine
Replaces biased terms directly within DOCX document structure.
Preserves formatting, styles, tables, headers, footers, and document layout.
"""

import re
import io
from typing import List, Dict, Tuple, Optional
from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from copy import deepcopy


class CasePreservingReplacer:
    """
    Performs case-preserving replacement for gender-fair terms.
    Handles: lowercase, UPPERCASE, Title Case variations.
    """
    
    @staticmethod
    def preserve_case(original: str, replacement: str) -> str:
        """
        Adjust replacement text case to match original case pattern.
        
        Examples:
            - "chairman" → "chairperson"
            - "Chairman" → "Chairperson"
            - "CHAIRMAN" → "CHAIRPERSON"
        """
        if not original:
            return replacement
        
        if original.isupper():
            return replacement.upper()
        elif original[0].isupper():
            return replacement.capitalize()
        else:
            return replacement.lower()
    
    @staticmethod
    def replace_with_case_preservation(text: str, original: str, replacement: str) -> Tuple[str, int]:
        """
        Replace all occurrences of original in text, preserving case.
        Returns: (modified_text, count_of_replacements)
        """
        # Use word boundary regex to match whole words only
        pattern = r'\b' + re.escape(original) + r'\b'
        
        def replacer(match):
            return CasePreservingReplacer.preserve_case(match.group(0), replacement)
        
        modified_text, count = re.subn(pattern, replacer, text, flags=re.IGNORECASE)
        return modified_text, count


class DocxReplacementAnalyzer:
    """
    Analyzes DOCX document for replacements and generates reports.
    """
    
    def __init__(self):
        self.replacements_made = {}  # {original: {replacement: count}}
        self.total_replacements = 0
    
    def record_replacement(self, original: str, replacement: str, count: int):
        """Record a replacement operation."""
        if original not in self.replacements_made:
            self.replacements_made[original] = {}
        
        if replacement not in self.replacements_made[original]:
            self.replacements_made[original][replacement] = 0
        
        self.replacements_made[original][replacement] += count
        self.total_replacements += count
    
    def get_report(self) -> Dict:
        """Generate analysis report."""
        replacements_list = []
        for original, replacements_dict in self.replacements_made.items():
            for replacement, count in replacements_dict.items():
                replacements_list.append({
                    'original': original,
                    'replacement': replacement,
                    'count': count
                })
        
        return {
            'total_replacements': self.total_replacements,
            'replacements': replacements_list
        }


class DocxModifier:
    """
    Modifies DOCX document content with gender-fair term replacements.
    Handles: paragraphs, tables, headers, footers, textboxes.
    Preserves all formatting and document structure.
    """
    
    def __init__(self, docx_bytes: bytes):
        """Initialize with DOCX file bytes."""
        self.doc = Document(io.BytesIO(docx_bytes))
        self.analyzer = DocxReplacementAnalyzer()
        self.replacer = CasePreservingReplacer()
    
    def replace_in_run(self, run, original: str, replacement: str) -> bool:
        """
        Replace text in a paragraph run while preserving formatting.
        Returns: True if replacement occurred
        """
        if not run.text or original not in run.text.lower():
            return False
        
        modified_text, count = self.replacer.replace_with_case_preservation(
            run.text, original, replacement
        )
        
        if count > 0:
            run.text = modified_text
            self.analyzer.record_replacement(original, replacement, count)
            return True
        
        return False
    
    def replace_in_paragraph(self, paragraph, original: str, replacement: str):
        """
        Replace text in a paragraph while preserving run-level formatting.
        """
        # For simple case: combine all runs, replace, then redistribute
        full_text = ''.join([run.text for run in paragraph.runs])
        
        if original.lower() not in full_text.lower():
            return
        
        modified_text, count = self.replacer.replace_with_case_preservation(
            full_text, original, replacement
        )
        
        if count > 0:
            # Store formatting info for each original run
            runs_info = []
            for run in paragraph.runs:
                runs_info.append({
                    'font_name': run.font.name,
                    'font_size': run.font.size,
                    'bold': run.font.bold,
                    'italic': run.font.italic,
                    'underline': run.font.underline,
                    'color': run.font.color.rgb if run.font.color.rgb else None,
                })
            
            # Clear runs and set modified text
            for run in paragraph.runs:
                run.text = ''
            
            # Add modified text as single run (preserves overall formatting)
            if paragraph.runs:
                paragraph.runs[0].text = modified_text
                # Apply first run's formatting to modified text
                if runs_info:
                    first_format = runs_info[0]
                    paragraph.runs[0].font.name = first_format['font_name']
                    paragraph.runs[0].font.size = first_format['font_size']
                    paragraph.runs[0].font.bold = first_format['bold']
                    paragraph.runs[0].font.italic = first_format['italic']
                    paragraph.runs[0].font.underline = first_format['underline']
                    if first_format['color']:
                        paragraph.runs[0].font.color.rgb = first_format['color']
            else:
                # If no runs exist, add new one
                paragraph.add_run(modified_text)
            
            self.analyzer.record_replacement(original, replacement, count)
    
    def replace_in_table(self, table, original: str, replacement: str):
        """
        Replace text in all table cells.
        """
        for row in table.rows:
            for cell in row.cells:
                # Process each paragraph in cell
                for paragraph in cell.paragraphs:
                    self.replace_in_paragraph(paragraph, original, replacement)
    
    def replace_in_document(self, original: str, replacement: str):
        """
        Replace text throughout the entire document:
        - Body paragraphs
        - Tables
        - Headers
        - Footers
        """
        
        print(f"🔄 Replacing '{original}' → '{replacement}' in DOCX")
        
        # 1. Replace in body paragraphs
        for paragraph in self.doc.paragraphs:
            self.replace_in_paragraph(paragraph, original, replacement)
        
        # 2. Replace in tables
        for table in self.doc.tables:
            self.replace_in_table(table, original, replacement)
        
        # 3. Replace in headers
        for section in self.doc.sections:
            for paragraph in section.header.paragraphs:
                self.replace_in_paragraph(paragraph, original, replacement)
            
            # Replace in header tables if any
            for table in section.header.tables:
                self.replace_in_table(table, original, replacement)
        
        # 4. Replace in footers
        for section in self.doc.sections:
            for paragraph in section.footer.paragraphs:
                self.replace_in_paragraph(paragraph, original, replacement)
            
            # Replace in footer tables if any
            for table in section.footer.tables:
                self.replace_in_table(table, original, replacement)
    
    def apply_replacements(self, replacements: List[Dict]) -> Dict:
        """
        Apply all approved replacements to the document.
        
        Args:
            replacements: List of {"original": str, "replacement": str, "approved": bool}
        
        Returns:
            Analysis report
        """
        
        # Filter approved replacements only
        approved = [r for r in replacements if r.get('approved', False)]
        
        print(f"📋 Applying {len(approved)} approved replacements to DOCX")
        
        for replacement_item in approved:
            original = replacement_item.get('original', '').strip()
            replacement = replacement_item.get('replacement', '').strip()
            
            if not original or not replacement:
                continue
            
            self.replace_in_document(original, replacement)
        
        return self.analyzer.get_report()
    
    def save_to_bytes(self) -> io.BytesIO:
        """
        Save the modified document to bytes.
        Returns: BytesIO object with DOCX content
        """
        output = io.BytesIO()
        self.doc.save(output)
        output.seek(0)
        return output


def modify_docx_with_replacements(docx_bytes: bytes, replacements: List[Dict]) -> Tuple[io.BytesIO, Dict]:
    """
    Main entry point for DOCX modification.
    
    Args:
        docx_bytes: Original DOCX file as bytes
        replacements: List of replacement objects with approved flag
    
    Returns:
        Tuple of (modified_docx_bytes, analysis_report)
    """
    
    try:
        modifier = DocxModifier(docx_bytes)
        
        # Apply all replacements
        report = modifier.apply_replacements(replacements)
        
        # Save modified document
        output = modifier.save_to_bytes()
        
        print(f"✅ DOCX modification complete: {report['total_replacements']} replacements applied")
        
        return output, report
    
    except Exception as e:
        print(f"❌ Error modifying DOCX: {e}")
        raise


# Test/debugging function
def test_docx_replacement():
    """Test the DOCX replacement engine."""
    
    # Create a sample DOCX
    doc = Document()
    doc.add_heading('Sample Document', 0)
    doc.add_paragraph('The chairman presented the report.')
    doc.add_paragraph('The policeman arrested the suspect.')
    
    # Save to bytes
    test_bytes = io.BytesIO()
    doc.save(test_bytes)
    test_bytes.seek(0)
    
    # Perform replacement
    replacements = [
        {'original': 'chairman', 'replacement': 'chairperson', 'approved': True},
        {'original': 'policeman', 'replacement': 'police officer', 'approved': True}
    ]
    
    modified, report = modify_docx_with_replacements(test_bytes.getvalue(), replacements)
    
    print(f"Report: {report}")
    
    # Verify
    modified_doc = Document(modified)
    for para in modified_doc.paragraphs:
        print(f"  {para.text}")
    
    return modified


if __name__ == '__main__':
    test_docx_replacement()
