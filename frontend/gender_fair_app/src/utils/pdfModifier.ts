import axios from 'axios';

interface WordReplacement {
  original: string;
  replacement: string;
  approved: boolean;
}

/**
 * Modifies a PDF by calling the backend API.
 * The backend uses PyMuPDF for reliable PDF text replacement with proper font handling.
 * 
 * This approach ensures:
 * - Font sizes match the original text
 * - Text shifts naturally when replacement is longer
 * - No white rectangles or overlays
 * - Proper PDF content modification
 */
export async function modifyPdfWithReplacements(
  pdfBytes: Uint8Array,
  replacements: WordReplacement[]
): Promise<Uint8Array> {
  try {
    // Only send approved replacements to the backend
    const approvedReplacements = replacements.filter((r) => r.approved);

    console.log('📨 pdfModifier called:');
    console.log(`   Total replacements: ${replacements.length}`);
    console.log(`   Approved: ${approvedReplacements.length}`);
    
    if (approvedReplacements.length === 0) {
      console.log('⚠️ No approved replacements - returning original PDF');
      return pdfBytes;
    }

    console.log('🔄 Sending PDF to backend for modification...');
    console.log(`📋 Replacements to send:`);
    approvedReplacements.forEach((r, i) => {
      console.log(`   [${i}] "${r.original}" → "${r.replacement}"`);
    });

    // Create FormData to send the PDF
    const formData = new FormData();
    
    // Convert Uint8Array to Blob
    const pdfArrayBuffer = (pdfBytes.buffer.slice(
      pdfBytes.byteOffset,
      pdfBytes.byteOffset + pdfBytes.byteLength
    )) as ArrayBuffer;
    const pdfBlob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });
    // Important: Use 'pdf_file' to match backend expectation
    formData.append('pdf_file', pdfBlob, 'document.pdf');
    formData.append('replacements', JSON.stringify(approvedReplacements));

    // Call backend API
    const response = await axios.post(
      '/api/modify-pdf/',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        responseType: 'arraybuffer',
      }
    );

    const modifiedBytes = new Uint8Array(response.data);
    console.log(`✅ PDF modified successfully (${modifiedBytes.length} bytes)`);
    return modifiedBytes;
  } catch (error) {
    console.error('❌ Error modifying PDF:', error);
    
    // If backend call fails, log error but return original
    // This allows the user to at least see the PDF
    if (axios.isAxiosError(error)) {
      console.error('API Error:', error.response?.status, error.response?.data);
      throw new Error(
        `Failed to modify PDF: ${error.response?.status} ${error.response?.statusText}`, { cause: error }
      );
    }
    
    throw error;
  }
}
