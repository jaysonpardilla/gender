/* eslint-disable react-hooks/set-state-in-effect */
import React, { useEffect, useState, useCallback, useRef, memo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { modifyPdfWithReplacements } from '../utils/documentModifier';
import { addDocumentLineNumbers, type WordLineLocation } from '../utils/documentLineNumbers';

// Use local worker
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

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
  originalPdfBytes: Uint8Array;
  fileName: string;
  wordReplacements: WordReplacement[];
  focusReplacement: WordReplacement | null;
  onSavePdf?: (modifiedBytes: Uint8Array) => void;
  onLineLocations?: (locations: Map<string, WordLineLocation[]>) => void;
  downloadEnabled?: boolean;
}

// Helper function to get only approved replacements
const getApprovedReplacements = (replacements: WordReplacement[]): WordReplacement[] => {
  return replacements.filter(r => r.approved);
};

interface PdfTextFragment {
  top: number;
  height: number;
  text: string;
  order: number;
}

interface PdfTextLine {
  top: number;
  fragments: PdfTextFragment[];
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
};

const collectPdfWordLocations = async (
  pdfDocument: PDFDocumentProxy,
  replacements: WordReplacement[],
): Promise<{ locations: Map<string, WordLineLocation[]>; pageStarts: Map<number, number> }> => {
  const locations = new Map<string, WordLineLocation[]>();
  const pageStarts = new Map<number, number>();
  const terms = Array.from(new Set(replacements.flatMap((replacement) => [
    replacement.original,
    replacement.replacement,
  ])));
  let nextLineNumber = 1;
  let previousLinePitch = 19.2;

  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    const fragments: PdfTextFragment[] = textContent.items.flatMap((item, order) => {
      if (!('str' in item) || !item.str.trim()) return [];
      const baselineTop = viewport.convertToViewportPoint(item.transform[4], item.transform[5])[1];
      return [{
        top: baselineTop - Math.abs(item.height),
        height: Math.abs(item.height),
        text: item.str,
        order,
      }];
    });

    fragments.sort((left, right) => left.top - right.top || left.order - right.order);
    const textHeight = median(fragments.map((fragment) => fragment.height)) || 16;
    const tolerance = Math.max(2, textHeight * 0.3);
    const lines: PdfTextLine[] = [];

    fragments.forEach((fragment) => {
      const currentLine = lines[lines.length - 1];
      const currentTop = currentLine ? median(currentLine.fragments.map((item) => item.top)) : 0;
      if (!currentLine || fragment.top - currentTop > tolerance) {
        lines.push({ top: fragment.top, fragments: [fragment] });
      } else {
        currentLine.fragments.push(fragment);
      }
    });

    const lineGaps = lines.slice(1)
      .map((line, index) => line.top - lines[index].top)
      .filter((gap) => gap > tolerance && gap <= textHeight * 2.5);
    const linePitch = median(lineGaps) || (lines.length > 0 ? textHeight : previousLinePitch);
    const pageHeight = viewport.height;
    pageStarts.set(pageNumber, nextLineNumber);

    if (lines.length > 0) {
      previousLinePitch = linePitch;
      let lineNumber = Math.max(1, Math.round(lines[0].top / linePitch) + 1);
      lines.forEach((line, index) => {
        if (index > 0) {
          lineNumber += Math.max(1, Math.round((line.top - lines[index - 1].top) / linePitch));
        }

        const lineText = line.fragments
          .sort((left, right) => left.order - right.order)
          .map((fragment) => fragment.text)
          .join(' ')
          .replace(/\s+/g, ' ');

        terms.forEach((term) => {
          const escapedTerm = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (!escapedTerm) return;
          const pattern = new RegExp(`(^|\\W)(${escapedTerm})(?=\\W|$)`, 'gi');
          let match = pattern.exec(lineText);
          while (match) {
            const key = term.trim().toLocaleLowerCase();
            const matches = locations.get(key) || [];
            matches.push({
              page: pageNumber,
              line: nextLineNumber + lineNumber - 1,
              occurrence: matches.filter((location) => location.page === pageNumber).length + 1,
            });
            locations.set(key, matches);
            match = pattern.exec(lineText);
          }
        });
      });

      const lastLineNumber = Math.max(1, Math.round(lines[0].top / linePitch) + 1)
        + lines.slice(1).reduce(
          (count, line, index) => count + Math.max(
            1,
            Math.round((line.top - lines[index].top) / linePitch),
          ),
          0,
        );
      const lineCount = lastLineNumber + Math.max(
        0,
        Math.floor((pageHeight - lines[lines.length - 1].top - 1) / linePitch),
      );
      nextLineNumber += lineCount;
    } else {
      nextLineNumber += Math.ceil(pageHeight / linePitch);
    }
  }

  return { locations, pageStarts };
};

// Re-render when the source document, detected terms, or approved replacements change.
const arePropsEqual = (prevProps: Props, nextProps: Props): boolean => {
  // Always re-render if originalPdfBytes or fileName changes
  if (prevProps.originalPdfBytes !== nextProps.originalPdfBytes) return false;
  if (prevProps.fileName !== nextProps.fileName) return false;
  if (prevProps.onSavePdf !== nextProps.onSavePdf) return false;
  if (prevProps.onLineLocations !== nextProps.onLineLocations) return false;
  if (prevProps.downloadEnabled !== nextProps.downloadEnabled) return false;
  if (prevProps.focusReplacement?.instanceId !== nextProps.focusReplacement?.instanceId) return false;
  if (prevProps.focusReplacement?.original !== nextProps.focusReplacement?.original) return false;
  if (prevProps.focusReplacement?.replacement !== nextProps.focusReplacement?.replacement) return false;
  if (prevProps.focusReplacement?.approved !== nextProps.focusReplacement?.approved) return false;
  if (prevProps.focusReplacement?.page !== nextProps.focusReplacement?.page) return false;
  if (prevProps.focusReplacement?.line !== nextProps.focusReplacement?.line) return false;
  if (prevProps.focusReplacement?.occurrence !== nextProps.focusReplacement?.occurrence) return false;

  if (prevProps.wordReplacements.length !== nextProps.wordReplacements.length) return false;
  if (!prevProps.wordReplacements.every((item, index) => {
    const nextItem = nextProps.wordReplacements[index];
    return item.original === nextItem.original
      && item.replacement === nextItem.replacement
      && item.instanceId === nextItem.instanceId;
  })) return false;

  // Compare approved values after checking the detected-word list above.
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
  focusReplacement,
  onSavePdf,
  onLineLocations,
  downloadEnabled = true,
}) => {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageLineStarts, setPageLineStarts] = useState<Map<number, number>>(() => new Map());
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modifiedPdfBytes, setModifiedPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [isModifying, setIsModifying] = useState(false);

  // Preserve scroll position to prevent layout shift
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pdfPageRef = useRef<HTMLDivElement>(null);
  const manualPageNavigationRef = useRef(false);
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

  const focusReplacementInTextLayer = useCallback(() => {
    const term = focusReplacement
      ? (focusReplacement.approved ? focusReplacement.replacement : focusReplacement.original).trim()
      : '';
    const textLayer = scrollContainerRef.current?.querySelector('.react-pdf__Page__textContent');
    if (!term || !textLayer) return;

    const normalizedTerm = term.toLocaleLowerCase();
    const textSpans = Array.from(textLayer.querySelectorAll<HTMLElement>('span'));
    const matchesTerm = (span: HTMLElement) => (
      span.textContent?.trim().toLocaleLowerCase() === normalizedTerm
      || span.textContent?.toLocaleLowerCase().includes(normalizedTerm)
    );
    const target = focusReplacement?.occurrence
      ? textSpans.find((span) => (
        matchesTerm(span)
        && (!focusReplacement.line || span.getAttribute('data-document-line') === String(focusReplacement.line))
        && span.getAttribute('data-document-occurrence') === String(focusReplacement.occurrence)
      )) || textSpans.find(matchesTerm)
      : textSpans.find(matchesTerm);

    if (target) {
      target.style.backgroundColor = 'rgba(74, 222, 128, 0.35)';
      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }
  }, [focusReplacement]);

  const updatePageLineNumbers = useCallback(() => {
    if (pdfPageRef.current?.dataset.renderedPage === String(currentPage)) {
      const result = addDocumentLineNumbers(
        pdfPageRef.current,
        currentPage,
        wordReplacements.flatMap((replacement) => [replacement.original, replacement.replacement]),
        pageLineStarts.get(currentPage),
      );
      onLineLocations?.(result.locations);
    }
  }, [currentPage, onLineLocations, pageLineStarts, wordReplacements]);

  const handleTextLayerRendered = useCallback(() => {
    requestAnimationFrame(() => {
      if (pdfPageRef.current) {
        pdfPageRef.current.dataset.renderedPage = String(currentPage);
      }
      updatePageLineNumbers();
      focusReplacementInTextLayer();
    });
  }, [currentPage, focusReplacementInTextLayer, updatePageLineNumbers]);

  useEffect(() => {
    requestAnimationFrame(updatePageLineNumbers);
  }, [updatePageLineNumbers]);

  useEffect(() => {
    let isCurrentUpdate = true;

    const updatePdf = async () => {
      try {
        // Preserve scroll position and show subtle modifying state
        saveScrollPosition();
        setIsModifying(true);
        setError(null);

        const approvedReplacements = wordReplacements.filter((r) => r.approved);

        if (approvedReplacements.length === 0) {
          if (isCurrentUpdate) {
            setModifiedPdfBytes(originalPdfBytes);
            setLoading(false);
            setIsModifying(false);
            restoreScrollPosition();
          }
          return;
        }

        const modified = await modifyPdfWithReplacements(originalPdfBytes, approvedReplacements);
        if (!isCurrentUpdate) return;
        setModifiedPdfBytes(modified);
        setLoading(false);
        setIsModifying(false);
        restoreScrollPosition();
      } catch (err) {
        if (!isCurrentUpdate) return;
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

    return () => {
      isCurrentUpdate = false;
    };
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

  const onDocumentLoadSuccess = useCallback((document: PDFDocumentProxy) => {
    setPdfDocument(document);
    setPageLineStarts(new Map());
    setNumPages(document.numPages);
    setLoading(false);
    setCurrentPage((current) => {
      if (current > document.numPages) {
        return document.numPages;
      }
      return current || 1;
    });
  }, []);

  useEffect(() => {
    if (!pdfDocument) return;

    let isCurrentScan = true;
    const scanDocument = async () => {
      try {
        const result = await collectPdfWordLocations(pdfDocument, wordReplacements);
        if (!isCurrentScan) return;
        setPageLineStarts(result.pageStarts);
        onLineLocations?.(result.locations);
      } catch (scanError) {
        if (!isCurrentScan) return;
        const message = scanError instanceof Error ? scanError.message : String(scanError);
        console.error('Failed to scan PDF word locations:', scanError);
        setError(`Failed to find word locations in the PDF: ${message}`);
      }
    };

    void scanDocument();
    return () => {
      isCurrentScan = false;
    };
  }, [pdfDocument, wordReplacements, onLineLocations]);

  const onDocumentLoadError = useCallback((err: Error) => {
    console.error('PDF load error', err);
    setPdfDocument(null);
    setError(`Failed to load PDF: ${err.message}`);
    setLoading(false);
  }, []);

  useEffect(() => {
    manualPageNavigationRef.current = false;
  }, [focusReplacement]);

  useEffect(() => {
    if (!manualPageNavigationRef.current && focusReplacement?.page && focusReplacement.page !== currentPage) {
      setCurrentPage(Math.min(focusReplacement.page, numPages || focusReplacement.page));
    }
  }, [focusReplacement, currentPage, numPages]);

  useEffect(() => {
    if (manualPageNavigationRef.current || !focusReplacement || focusReplacement.page || !pdfDocument) return;

    let isCurrentSearch = true;
    const term = (
      focusReplacement.approved ? focusReplacement.replacement : focusReplacement.original
    ).trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    if (!term) return;

    const findPage = async () => {
      try {
        for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
          if (!isCurrentSearch) return;
          const page = await pdfDocument.getPage(pageNumber);
          const text = await page.getTextContent();
          if (!isCurrentSearch) return;
          const pageText = text.items
            .map((item) => ('str' in item ? item.str : ''))
            .join(' ')
            .replace(/\s+/g, ' ')
            .toLocaleLowerCase();

          if (isCurrentSearch && pageText.includes(term)) {
            setCurrentPage(pageNumber);
            return;
          }
        }
      } catch (searchError) {
        if (!isCurrentSearch) return;
        const message = searchError instanceof Error ? searchError.message : String(searchError);
        console.error('Failed to locate the selected word in the PDF:', searchError);
        setError(`Failed to locate the selected word in the PDF: ${message}`);
      }
    };

    void findPage();
    return () => {
      isCurrentSearch = false;
    };
  }, [focusReplacement, pdfDocument]);

  const handleSave = useCallback(() => {
    if (!downloadEnabled) return;
    if (modifiedPdfBytes && onSavePdf) {
      onSavePdf(modifiedPdfBytes);
      return;
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
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }, [modifiedPdfBytes, onSavePdf, fileName, downloadEnabled]);

  // If we have no PDF yet (initial load), show loader inside parent container
  if (loading && !modifiedPdfBytes) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50 min-h-[280px]">
        <div className="document-loading-spinner mb-4" aria-hidden="true" />
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
            onClick={() => {
              manualPageNavigationRef.current = true;
              setCurrentPage(Math.max(1, currentPage - 1));
            }}
            disabled={currentPage <= 1}
            className="px-3 py-1 bg-blue-500 text-white rounded disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-blue-600"
          >
            ← Previous
          </button>

          <button
            onClick={() => {
              manualPageNavigationRef.current = true;
              setCurrentPage(Math.min(numPages || currentPage, currentPage + 1));
            }}
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
            <div className="document-loading-spinner document-loading-spinner--small" aria-hidden="true" />
            <span className="text-sm text-gray-700">Applying replacements...</span>
          </div>
        )}

        {/* Inline-block wrapper keeps the PDF centered even if its width changes */}
        <div className="bg-white shadow-lg inline-block mx-auto">
          <Document
            key={pdfBlobUrl || 'loading'}
            file={pdfBlobUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={(
              <div className="p-4 flex flex-col items-center text-gray-500">
                <div className="document-loading-spinner document-loading-spinner--small mb-2" aria-hidden="true" />
                <span>Loading PDF...</span>
              </div>
            )}
          >
            <div ref={pdfPageRef} className="pdf-page-frame">
              <Page
                pageNumber={currentPage}
                renderMode="canvas"
                onRenderTextLayerSuccess={handleTextLayerRendered}
              />
            </div>
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
