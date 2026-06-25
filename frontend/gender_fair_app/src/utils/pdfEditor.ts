import * as pdfjsLib from 'pdfjs-dist';

export interface WordReplacement {
  original: string;
  replacement: string;
  approved: boolean;
}

export interface TextItemInfo {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontName: string;
  transform: number[];
}

export interface WordOccurrence {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pageIndex: number;
  transform: number[];
}

// ---------------------------------------------------------------------------
// PDF.js text extraction
// ---------------------------------------------------------------------------

/**
 * Extract text items with their positions from a PDF page using PDF.js
 */
export async function extractTextItemsWithPositions(
  page: pdfjsLib.PDFPageProxy
): Promise<TextItemInfo[]> {
  const textContent = await page.getTextContent({ disableCombineTextItems: true } as Parameters<typeof page.getTextContent>[0]);
  const items: TextItemInfo[] = [];

  for (const item of textContent.items) {
    if ('str' in item && item.str) {
      const tx = item.transform;
      const fontSize = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1]) || 12;

      items.push({
        text: item.str as string,
        x: tx[4],
        y: tx[5],
        width: item.width || 0,
        height: item.height || 0,
        fontSize: fontSize,
        fontName: (item.fontName as string) || 'Helvetica',
        transform: tx,
      });
    }
  }

  return items;
}

/**
 * Find occurrences of target words in the extracted text items
 */
export function findWordOccurrences(
  textItems: TextItemInfo[],
  targetWords: string[],
  pageIndex: number
): WordOccurrence[] {
  const occurrences: WordOccurrence[] = [];
  const lowerTargets = targetWords.map(w => w.toLowerCase());

  for (const item of textItems) {
    for (let i = 0; i < lowerTargets.length; i++) {
      const target = lowerTargets[i];
      const regex = new RegExp(`\\b${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      let match;
      while ((match = regex.exec(item.text)) !== null) {
        const matchedText = item.text.substring(match.index, match.index + match[0].length);
        occurrences.push({
          text: matchedText,
          x: item.x,
          y: item.y,
          width: item.width * (matchedText.length / item.text.length),
          height: item.height,
          pageIndex,
          transform: [item.fontSize, 0, 0, item.fontSize, item.x, item.y],
        });
      }
    }
  }

  return occurrences;
}

// ---------------------------------------------------------------------------
// PDF modification (backend-based)
// ---------------------------------------------------------------------------

/**
 * Generate a modified PDF by sending it to the backend for PyMuPDF-based text replacement.
 * The backend handles text replacement properly using PyMuPDF (fitz),
 * avoiding issues with content stream manipulation on the frontend.
 * 
 * This approach is more reliable because:
 * - PyMuPDF handles all PDF encodings properly
 * - Text replacement works even with embedded fonts
 * - No buffer detachment issues
 * - Cleaner, more maintainable code
 */
export async function generateNewPDFWithText(
  pdfBytes: Uint8Array,
  replacements: WordReplacement[]
): Promise<Uint8Array> {
  const approvedReplacements = replacements.filter(r => r.approved);

  if (approvedReplacements.length === 0) {
    console.log('⚠️ No approved replacements - returning original bytes');
    return pdfBytes;
  }

  console.log(`🔄 Starting PDF modification via backend with ${approvedReplacements.length} approved replacements`);
  console.log('📋 Replacements to send:', approvedReplacements.map(r => ({ 
    original: r.original, 
    replacement: r.replacement,
    approved: r.approved
  })));

  try {
    // Create FormData for the backend request
    const formData = new FormData();
    
    // Convert Uint8Array to Blob
    const pdfBlob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
    formData.append('pdf_file', pdfBlob, 'document.pdf');
    
    // Append replacements as JSON string
    const replacementsJson = JSON.stringify(approvedReplacements);
    formData.append('replacements', replacementsJson);

    console.log('📤 Sending PDF to backend for modification...');
    console.log('📦 FormData payload:', {
      pdf_file_size: pdfBlob.size,
      replacements_count: approvedReplacements.length,
      replacements_json: replacementsJson
    });
    
    // Call the backend API
    const response = await fetch('/api/modify-pdf/', {
      method: 'POST',
      body: formData,
      // Don't set Content-Type header - browser will set it with boundary for multipart/form-data
    });

    console.log('📥 Backend response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      const errorMsg = errorData.error || `Backend returned ${response.status}`;
      console.error('❌ Backend error response:', errorData);
      throw new Error(`PDF modification failed: ${errorMsg}`);
    }

    // Get the modified PDF as ArrayBuffer
    const modifiedArrayBuffer = await response.arrayBuffer();
    const modifiedBytes = new Uint8Array(modifiedArrayBuffer);

    console.log(`✅ Backend returned modified PDF (${modifiedBytes.length} bytes)`);
    console.log('✅ Modified PDF first bytes (should be %PDF):', String.fromCharCode(...modifiedBytes.slice(0, 10)));
    
    return modifiedBytes;

  } catch (error) {
    console.error('❌ PDF modification failed:', error);
    const err = error instanceof Error ? error : new Error(String(error));
    const wrappedError = new Error(`Failed to modify PDF on backend: ${err.message}`);
    (wrappedError as { cause?: Error }).cause = err;
    throw wrappedError;
  }
}

/**
 * Extract raw text content from a PDF for analysis
 */
export async function extractTextFromPDF(pdfBytes: Uint8Array): Promise<string> {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
  const pdfjsDoc = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
  const textParts: string[] = [];

  for (let i = 1; i <= pdfjsDoc.numPages; i++) {
    const page = await pdfjsDoc.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: Record<string, unknown>) => item.str as string)
      .join(' ');
    textParts.push(pageText);
  }

  return textParts.join('\n');
}
