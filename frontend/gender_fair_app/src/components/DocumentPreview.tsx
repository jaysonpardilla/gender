/* eslint-disable react-hooks/set-state-in-effect */
import React, { useEffect, useState, memo } from 'react';
import DocumentViewer from "./DocumentViewer";

interface WordReplacement {
  original: string;
  replacement: string;
  approved: boolean;
  instanceId: string;
}

type FileDataInput =
  | string
  | Uint8Array
  | ArrayBuffer
  | Blob
  | { arrayBuffer: () => Promise<ArrayBuffer> };

function isBlobLike(value: FileDataInput): value is { arrayBuffer: () => Promise<ArrayBuffer> } {
  return (
    typeof value !== 'string' &&
    !(value instanceof Uint8Array) &&
    !(value instanceof ArrayBuffer) &&
    typeof (value as { arrayBuffer?: unknown }).arrayBuffer === 'function'
  );
}

interface Props {
  fileType: string;
  fileData?: FileDataInput; // base64 string, binary buffer, or blob-like file data
  fileName?: string;
  detectedWords?: string[];
  wordReplacements: WordReplacement[];
  onModifiedPdfChange?: React.Dispatch<React.SetStateAction<Uint8Array | null>>;
  downloadEnabled?: boolean;
}

/**
 * Converts base64-encoded file data to Uint8Array and displays appropriate viewer.
 * Supports PDF and DOCX files.
 */
const DocumentPreviewContent: React.FC<Props> = ({
  fileType,
  fileData,
  fileName = 'document',
  wordReplacements = [],
  onModifiedPdfChange,
  downloadEnabled = false,
}) => {
  const [documentBytes, setDocumentBytes] = useState<Uint8Array | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Determine the normalized file type
  const normalizedType = fileType.toLowerCase();
  const isPdf = normalizedType === 'pdf' || fileType === 'application/pdf' || normalizedType.includes('pdf');
  const isDocx = normalizedType === 'docx' || 
    normalizedType.includes('word') || 
    fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  // Convert incoming file data (base64 string, Blob, ArrayBuffer, or Uint8Array)
  useEffect(() => {
    if (!fileData) {
      setDocumentBytes(null);
      setLoading(false);
      setError(null);
      return;
    }

    let isMounted = true;

    const decodeBase64ToUint8 = async (base64Str: string): Promise<Uint8Array> => {
      // Handle data URI format
      const match = base64Str.match(/^data:([a-zA-Z0-9/+.-]+\/[^;]+);base64,(.*)$/);
      const base64 = match ? match[2] : base64Str;

      // Use fetch trick for robust base64 -> ArrayBuffer conversion
      const resp = await fetch(`data:application/octet-stream;base64,${base64}`);
      const ab = await resp.arrayBuffer();
      return new Uint8Array(ab);
    };

    const processFile = async () => {
      try {
        console.log(`📄 Processing ${isPdf ? 'PDF' : isDocx ? 'DOCX' : 'unknown'} file`);
        console.log(`📊 File type: ${fileType}`);

        let bytes: Uint8Array | null = null;

        // If fileData is already binary-like
        if (fileData instanceof Uint8Array) {
          bytes = fileData;
        } else if (fileData instanceof ArrayBuffer) {
          bytes = new Uint8Array(fileData);
        } else if (isBlobLike(fileData)) {
          // Blob-like (axios blob or custom file object)
          const ab = await fileData.arrayBuffer();
          bytes = new Uint8Array(ab);
        } else if (typeof fileData === 'string') {
          console.log(`📏 Base64/string data length: ${fileData.length} characters`);
          bytes = await decodeBase64ToUint8(fileData);
        } else {
          throw new Error('Unsupported file data format');
        }

        if (!bytes) throw new Error('Failed to decode file data');

        console.log(`✅ Decoded to ${bytes.length} bytes`);

        // Validate file header
        const header = String.fromCharCode(...bytes.slice(0, 4));
        if (isPdf) {
          if (!header.startsWith('%PDF')) {
            throw new Error('Invalid PDF: missing %PDF header');
          }
          console.log(`✅ Valid PDF header detected`);
        } else if (isDocx) {
          // DOCX files start with PK (zip format)
          if (header[0] !== 'P' || header[1] !== 'K') {
            throw new Error('Invalid DOCX: missing PK header (DOCX is ZIP format)');
          }
          console.log(`✅ Valid DOCX header detected`);
        }

        if (isMounted) {
          setDocumentBytes(bytes);
          setLoading(false);
          setError(null);
          console.log(`✅ Document loaded successfully`);
        }
      } catch (err) {
        if (isMounted) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          setError(`Failed to load file: ${errorMsg}`);
          setLoading(false);
          setDocumentBytes(null);
          console.error('❌ File decoding error:', err);
        }
      }
    };

    processFile();

    return () => {
      isMounted = false;
    };
  }, [fileType, fileData, isPdf, isDocx]);

  const handleSaveDocument = (modifiedBytes: Uint8Array) => {
    onModifiedPdfChange?.(modifiedBytes);
    
    // Also download the file
    const ext = isPdf ? 'pdf' : isDocx ? 'docx' : 'bin';
    const filename = fileName.includes('.')
      ? fileName.replace(/\.[^.]+$/, `_modified.${ext}`)
      : `${fileName}_modified.${ext}`;
    
    const mimeType = isPdf 
      ? 'application/pdf' 
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    
    const blob = new Blob([modifiedBytes as BlobPart], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log(`✅ Document downloaded: ${filename}`);
  };

  // Error state
  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-red-50 p-4">
        <div className="text-center">
          <p className="text-red-700 font-semibold mb-2">❌ Error Loading File</p>
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  // Render appropriate viewer based on file type
  return (
    <DocumentViewer
      documentBytes={documentBytes}
      fileType={fileType}
      fileName={fileName || 'document'}
      wordReplacements={wordReplacements}
      onSaveDocument={handleSaveDocument}
      downloadEnabled={downloadEnabled}
      isLoading={loading}
    />
  );
};

// Memoize DocumentPreview to prevent unnecessary re-renders
const DocumentPreview = memo(DocumentPreviewContent);

export default DocumentPreview;
