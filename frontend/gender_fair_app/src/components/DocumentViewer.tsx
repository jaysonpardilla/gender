import PdfViewer from './PdfViewer';
import DocxRenderer from './DocxRenderer';
import { memo } from 'react';
import type { WordLineLocation } from '../utils/documentLineNumbers';

interface WordReplacement {
  original: string;
  replacement: string;
  approved: boolean;
  instanceId: string;
  page?: number;
  line?: number;
  occurrence?: number;
}

interface Props {
  documentBytes: Uint8Array | null;
  fileType: string;
  fileName: string;
  wordReplacements: WordReplacement[];
  focusReplacement: WordReplacement | null;
  onSaveDocument?: (modifiedBytes: Uint8Array) => void;
  isLoading?: boolean;
  downloadEnabled?: boolean;
  onLineLocations?: (locations: Map<string, WordLineLocation[]>) => void;
}

/**
 * Generic document viewer that supports multiple file types (PDF, DOCX).
 * Routes to appropriate viewer based on file type.
 */
const DocumentViewerContent: React.FC<Props> = ({
  documentBytes,
  fileType,
  fileName,
  wordReplacements,
  focusReplacement,
  onSaveDocument,
  isLoading = false,
  downloadEnabled = false,
  onLineLocations,
}) => {

  // Normalize file type
  const normalizedType = fileType.toLowerCase();
  const isPdf = normalizedType === 'pdf' || normalizedType.includes('pdf') || fileType === 'application/pdf';
  const isDocx = 
    normalizedType === 'docx' || 
    normalizedType.includes('word') || 
    normalizedType.includes('docx') ||
    fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  if (isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50">
        <div className="document-loading-spinner mb-4" aria-hidden="true" />
        <p className="text-gray-600">Loading document...</p>
      </div>
    );
  }

  if (!documentBytes) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50">
        <p className="text-gray-600">📄 No document loaded</p>
      </div>
    );
  }

  // PDF Viewer
  if (isPdf) {
    return (
      <PdfViewer
        originalPdfBytes={documentBytes}
        fileName={fileName}
        wordReplacements={wordReplacements}
        focusReplacement={focusReplacement}
        onSavePdf={onSaveDocument}
        onLineLocations={onLineLocations}
        downloadEnabled={downloadEnabled}
      />
    );
  }

  // DOCX Viewer - Real paginated preview with actual page dimensions
  if (isDocx) {
    return (
      <DocxRenderer
        docxBytes={documentBytes}
        fileName={fileName}
        wordReplacements={wordReplacements}
        focusReplacement={focusReplacement}
        onLineLocations={onLineLocations}
        downloadEnabled={downloadEnabled}
      />
    );
  }

  // Unsupported file type
  return (
    <div className="h-full flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="text-center">
        <p className="text-gray-700 font-semibold mb-2">❌ Unsupported File Type</p>
        <p className="text-gray-600">
          File type: <code className="bg-gray-200 px-2 py-1 rounded">{fileType}</code>
        </p>
        <p className="text-sm text-gray-500 mt-3">
          Supported formats: PDF, DOCX
        </p>
      </div>
    </div>
  );
};

// Memoize DocumentViewer to prevent unnecessary re-renders when parent updates
const DocumentViewer = memo(DocumentViewerContent);

export default DocumentViewer;
