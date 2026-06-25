/* eslint-disable react-hooks/set-state-in-effect */
import React, { useEffect, useState, useCallback, useRef, memo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { modifyPdfWithReplacements } from '../utils/documentModifier';

// Use local worker
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

interface WordReplacement {
  original: string;
  replacement: string;
  approved: boolean;
  instanceId: string;
}

interface Props {
  originalPdfBytes: Uint8Array;
  fileName: string;
  wordReplacements: WordReplacement[];
  onSavePdf?: (modifiedBytes: Uint8Array) => void;
  downloadEnabled?: boolean;
}

// Helper function to get only approved replacements
const getApprovedReplacements = (replacements: WordReplacement[]): WordReplacement[] => {
  return replacements.filter(r => r.approved);
};

// Custom comparison function - only re-render if approved replacements change
const arePropsEqual = (prevProps: Props, nextProps: Props): boolean => {
  // Always re-render if originalPdfBytes or fileName changes
  if (prevProps.originalPdfBytes !== nextProps.originalPdfBytes) return false;
  if (prevProps.fileName !== nextProps.fileName) return false;
  if (prevProps.onSavePdf !== nextProps.onSavePdf) return false;

  // Only compare approved replacements, not the entire array
  const prevApproved = getApprovedReplacements(prevProps.wordReplacements);
  const nextApproved = getApprovedReplacements(nextProps.wordReplacements);

  // If lengths are different, they're not equal
  if (prevApproved.length !== nextApproved.length) return false;

  // Compare each approved item
  return prevApproved.every((item, index) => {
    const nextItem = nextApproved[index];
    return (
      item.original === nextItem.original &&
      item.replacement === nextItem.replacement &&
      item.approved === nextItem.approved &&
      item.instanceId === nextItem.instanceId
    );
  });
};

const PdfViewerContent: React.FC<Props> = ({
  originalPdfBytes,
  fileName,
  wordReplacements,
  onSavePdf,
  downloadEnabled = true,
}) => {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modifiedPdfBytes, setModifiedPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [isModifying, setIsModifying] = useState(false);

  // Preserve scroll position to prevent layout shift
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef<number>(0);
  const blobUrlRef = useRef<string | null>(null);

  const saveScrollPosition = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollPositionRef.current = scrollContainerRef.current.scrollTop;
    }
  }, []);

  const restoreScrollPosition = useCallback(() => {
    if (scrollContainerRef.current) {
      setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollPositionRef.current;
        }
      }, 0);
    }
  }, []);

  const approvedCount = wordReplacements.filter((r) => r.approved).length;

  useEffect(() => {
    const updatePdf = async () => {
      try {
        // Preserve scroll position and show subtle modifying state
        saveScrollPosition();
        setIsModifying(true);
        setError(null);

        const approvedReplacements = wordReplacements.filter((r) => r.approved);

        if (approvedReplacements.length === 0) {
          setModifiedPdfBytes(originalPdfBytes);
          setLoading(false);
          setIsModifying(false);
          restoreScrollPosition();
          return;
        }

        const modified = await modifyPdfWithReplacements(originalPdfBytes, approvedReplacements);
        setModifiedPdfBytes(modified);
        setLoading(false);
        setIsModifying(false);
        restoreScrollPosition();
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error('Error modifying PDF:', err);
        setError(`Failed to modify PDF: ${errorMsg}`);
        setModifiedPdfBytes(originalPdfBytes);
        setLoading(false);
        setIsModifying(false);
        restoreScrollPosition();
      }
    };

    updatePdf();
  }, [wordReplacements, originalPdfBytes, saveScrollPosition, restoreScrollPosition]);

  // Create Blob URL from modified PDF bytes to avoid ArrayBuffer detachment
  useEffect(() => {
    if (!modifiedPdfBytes) {
      setPdfBlobUrl(null);
      return;
    }

    // Clean up old blob URL
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
    }

    // Create new blob URL from bytes
    const arrayBuffer = (modifiedPdfBytes.buffer.slice(
      modifiedPdfBytes.byteOffset,
      modifiedPdfBytes.byteOffset + modifiedPdfBytes.byteLength
    )) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    blobUrlRef.current = url;
    setPdfBlobUrl(url);

    // Cleanup on unmount
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, [modifiedPdfBytes]);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoading(false);
    setCurrentPage((current) => {
      if (current > numPages) {
        return numPages;
      }
      return current || 1;
    });
  }, []);

  const onDocumentLoadError = useCallback((err: Error) => {
    console.error('PDF load error', err);
    setError(`Failed to load PDF: ${err.message}`);
    setLoading(false);
  }, []);

  const handleSave = useCallback(() => {
    if (!downloadEnabled) return;
    if (modifiedPdfBytes && onSavePdf) {
      onSavePdf(modifiedPdfBytes);
    }

    if (modifiedPdfBytes) {
      const arrayBuffer = (modifiedPdfBytes.buffer.slice(
        modifiedPdfBytes.byteOffset,
        modifiedPdfBytes.byteOffset + modifiedPdfBytes.byteLength
      )) as ArrayBuffer;
      const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName.replace('.pdf', '') + '_modified.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }, [modifiedPdfBytes, onSavePdf, fileName, downloadEnabled]);

  // If we have no PDF yet (initial load), show loader inside parent container
  if (loading && !modifiedPdfBytes) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50 min-h-[280px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4" />
        <p className="text-gray-600">Loading PDF...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-red-50 p-4 min-h-[280px]">
        <div className="text-center">
          <p className="text-red-700 font-semibold mb-2">❌ Error</p>
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!modifiedPdfBytes) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 min-h-[280px]">
        <p className="text-gray-600">No PDF data available</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white min-h-0">
      <div className="bg-gray-100 border-b border-gray-300 p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-gray-700 font-medium">{fileName}</span>
          <span className="text-sm text-gray-600">Page {currentPage} of {numPages || '?'}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            className="px-3 py-1 bg-blue-500 text-white rounded disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-blue-600"
          >
            ← Previous
          </button>

          <button
            onClick={() => setCurrentPage(Math.min(numPages || currentPage, currentPage + 1))}
            disabled={!numPages || currentPage >= numPages}
            className="px-3 py-1 bg-blue-500 text-white rounded disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-blue-600"
          >
            Next →
          </button>

          <button onClick={handleSave} disabled={!downloadEnabled} className={`ml-4 px-4 py-1 ${downloadEnabled ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-gray-200 text-gray-500 cursor-not-allowed'} rounded`}>
            💾 {downloadEnabled ? 'Download PDF' : 'Save to enable download'}
          </button>
        </div>
      </div>

      {/* PDF viewer container - fixed flex area to keep layout stable */}
      <div ref={scrollContainerRef} className="flex-1 overflow-auto flex items-start justify-center bg-gray-200 pt-8 p-4 relative min-h-0">
        {/* Subtle modifier indicator - absolute so it doesn't change layout */}
        {isModifying && (
          <div className="absolute top-4 right-4 flex items-center gap-2 bg-white px-3 py-2 rounded shadow-md z-10 opacity-90">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-transparent border-t-blue-500" />
            <span className="text-sm text-gray-700">Applying replacements...</span>
          </div>
        )}

        {/* Inline-block wrapper keeps the PDF centered even if its width changes */}
        <div className="bg-white shadow-lg inline-block mx-auto">
          <Document
            key={`${approvedCount}-${pdfBlobUrl || 'loading'}`}
            file={pdfBlobUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={<div className="p-4 text-gray-500">Loading PDF...</div>}
          >
            <Page pageNumber={currentPage} renderMode="canvas" />
          </Document>
        </div>
      </div>

      {/* Status bar - reserved space to prevent layout shift when toggling */}
      <div className="h-12">
        {wordReplacements.filter((r) => r.approved).length > 0 ? (
          <div className="h-12 bg-blue-50 border-t border-blue-300 p-3 text-sm text-blue-700 flex items-center">
            ✅ {wordReplacements.filter((r) => r.approved).length} replacement{wordReplacements.filter((r) => r.approved).length !== 1 ? 's' : ''} applied
          </div>
        ) : (
          <div className="h-12" aria-hidden />
        )}
      </div>
    </div>
  );
};

// Memoize with custom comparison - only re-render if approved replacements change
const PdfViewer = memo(PdfViewerContent, arePropsEqual);

export default PdfViewer;
