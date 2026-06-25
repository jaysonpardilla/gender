import axios from 'axios';

interface WordReplacement {
  original: string;
  replacement: string;
  approved: boolean;
  instanceId: string;
}

/**
 * Modifies document files (PDF or DOCX) with gender-fair text replacements.
 * Calls backend API endpoints to apply replacements while preserving formatting.
 */

/**
 * Modify a PDF with approved word replacements
 * @param pdfBytes - The PDF file as Uint8Array
 * @param replacements - Array of replacements with approved flags
 * @returns Modified PDF as Uint8Array
 */
export async function modifyPdfWithReplacements(
  pdfBytes: Uint8Array,
  replacements: WordReplacement[]
): Promise<Uint8Array> {
  console.log('🔄 PDF Modifier: Starting PDF modification');
  console.log(`📊 Replacements received: ${replacements.length} items`);
  console.log('📋 Replacement details:');
  replacements.forEach((r, i) => {
    console.log(`   [${i}] "${r.original}" → "${r.replacement}" (approved: ${r.approved})`);
  });

  const approvedReplacements = replacements.filter((r) => r.approved);
  console.log(`✅ Approved replacements: ${approvedReplacements.length}`);

  if (approvedReplacements.length === 0) {
    console.log('⏭️  No approved replacements, returning original PDF');
    return pdfBytes;
  }

  try {
    const formData = new FormData();
    const pdfArrayBuffer = (pdfBytes.buffer.slice(
      pdfBytes.byteOffset,
      pdfBytes.byteOffset + pdfBytes.byteLength
    )) as ArrayBuffer;
    const pdfBlob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });
    formData.append('pdf_file', pdfBlob, 'document.pdf');

    const replacementsJson = JSON.stringify(
      approvedReplacements.map((r) => ({
        original: r.original,
        replacement: r.replacement,
        approved: true,
      }))
    );
    console.log(`📦 Sending to API:
      - PDF size: ${pdfBytes.length} bytes
      - Approved replacements JSON: ${replacementsJson.length} characters`);
    formData.append('replacements', replacementsJson);

    const response = await axios.post('/api/modify-pdf/', formData, {
      responseType: 'arraybuffer',
    });

    const modifiedBytes = new Uint8Array(response.data);
    console.log(`✅ PDF modification successful | Output size: ${modifiedBytes.length} bytes`);
    return modifiedBytes;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('❌ PDF modification failed');
      console.error(`   Status: ${error.response?.status}`);
      console.error(`   Message: ${error.message}`);
      if (error.response?.data) {
        const errorData = new TextDecoder().decode(new Uint8Array(error.response.data));
        console.error(`   Response: ${errorData}`);
      }
    }
    throw error;
  }
}

/**
 * Modify a DOCX with approved word replacements
 * @param docxBytes - The DOCX file as Uint8Array
 * @param replacements - Array of replacements with approved flags
 * @returns Modified DOCX as Uint8Array
 */
export async function modifyDocxWithReplacements(
  docxBytes: Uint8Array,
  replacements: WordReplacement[]
): Promise<Uint8Array> {
  console.log('🔄 DOCX Modifier: Starting DOCX modification');
  console.log(`📊 Replacements received: ${replacements.length} items`);
  console.log('📋 Replacement details:');
  replacements.forEach((r, i) => {
    console.log(`   [${i}] "${r.original}" → "${r.replacement}" (approved: ${r.approved})`);
  });

  const approvedReplacements = replacements.filter((r) => r.approved);
  console.log(`✅ Approved replacements: ${approvedReplacements.length}`);

  if (approvedReplacements.length === 0) {
    console.log('⏭️  No approved replacements, returning original DOCX');
    return docxBytes;
  }

  try {
    const formData = new FormData();
    const docxArrayBuffer = (docxBytes.buffer.slice(
      docxBytes.byteOffset,
      docxBytes.byteOffset + docxBytes.byteLength
    )) as ArrayBuffer;
    const docxBlob = new Blob([docxArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    formData.append('docx_file', docxBlob, 'document.docx');

    const replacementsJson = JSON.stringify(
      approvedReplacements.map((r) => ({
        original: r.original,
        replacement: r.replacement,
        approved: true,
      }))
    );
    console.log(`📦 Sending to API:
      - DOCX size: ${docxBytes.length} bytes
      - Approved replacements JSON: ${replacementsJson.length} characters`);
    formData.append('replacements', replacementsJson);

    const response = await axios.post('/api/modify-docx/', formData, {
      responseType: 'arraybuffer',
    });

    const modifiedBytes = new Uint8Array(response.data);
    console.log(`✅ DOCX modification successful | Output size: ${modifiedBytes.length} bytes`);
    return modifiedBytes;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('❌ DOCX modification failed');
      console.error(`   Status: ${error.response?.status}`);
      console.error(`   Message: ${error.message}`);
      if (error.response?.data) {
        const errorData = new TextDecoder().decode(new Uint8Array(error.response.data));
        console.error(`   Response: ${errorData}`);
      }
    }
    throw error;
  }
}

/**
 * Generic document modifier that routes to the appropriate handler
 * @param documentBytes - The document file as Uint8Array
 * @param fileType - MIME type of the document (application/pdf or application/vnd.openxmlformats-officedocument.wordprocessingml.document)
 * @param replacements - Array of replacements with approved flags
 * @returns Modified document as Uint8Array
 */
export async function modifyDocumentWithReplacements(
  documentBytes: Uint8Array,
  fileType: string,
  replacements: WordReplacement[]
): Promise<Uint8Array> {
  console.log(`🔄 Document Modifier: Routing to appropriate handler`);
  console.log(`   File type: ${fileType}`);

  if (fileType === 'application/pdf' || fileType.includes('pdf')) {
    return modifyPdfWithReplacements(documentBytes, replacements);
  } else if (
    fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    fileType.includes('word') ||
    fileType.includes('docx')
  ) {
    return modifyDocxWithReplacements(documentBytes, replacements);
  } else {
    throw new Error(`Unsupported file type: ${fileType}`);
  }
}
