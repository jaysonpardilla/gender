import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import Navigation from '../components/Navigation';
import DocumentPreview from '../components/DocumentPreview';
import { analysisService } from '../services/authService';
import '../styles/UploadDocument.css';
import '../styles/DocumentPreview.css';

interface UploadedFile {
  id: number;
  file_name: string;
  file_type: string;
  size: number;
  uploaded_at: string;
  document_id: number;
}

interface AnalysisResult {
  detected_words: string[];
  replacements: { [key: string]: string };
  original_text: string;
  processed_text: string;
  file_data: string;
  file_type: string;
}

interface WordReplacement {
  original: string;
  replacement: string;
  approved: boolean;
  instanceId: string;
}

const UploadDocument: React.FC = () => {
  const navigate = useNavigate();
  
  // Core UI states
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // File and analysis states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [wordReplacements, setWordReplacements] = useState<WordReplacement[]>([]);
  
  // UI feedback states
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Data states
  const [recentUploads, setRecentUploads] = useState<UploadedFile[]>([]);
  const [hasSavedAnalysis, setHasSavedAnalysis] = useState(false);
  
  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // DEBUG: Monitor wordReplacements changes
  useEffect(() => {
    console.log('🔍 wordReplacements state updated:', {
      total: wordReplacements.length,
      approved: wordReplacements.filter(w => w.approved).length,
      items: wordReplacements.map(w => ({ original: w.original, approved: w.approved }))
    });
    // Log with JSON.stringify to see actual values
    console.log('📋 Full replacements JSON:', JSON.stringify(wordReplacements, null, 2));
    
    // Check if ALL items are approved - if so, something might be auto-approving them
    const allApproved = wordReplacements.length > 0 && wordReplacements.every(w => w.approved);
    if (allApproved && wordReplacements.length > 0) {
      console.warn('⚠️ WARNING: ALL items are approved! This should not happen on initial load.');
      console.warn('⚠️ Stack trace:', new Error().stack);
    }
  }, [wordReplacements]);

  // DEBUG: Monitor analysisResult changes
  useEffect(() => {
    if (analysisResult) {
      console.log('📊 analysisResult changed:', analysisResult);
    }
  }, [analysisResult]);

  const userEmail = localStorage.getItem('user')
    ? JSON.parse(localStorage.getItem('user') as string).email
    : 'User';

  const userInitials = (() => {
    const s = localStorage.getItem('user');
    if (!s) return 'U';
    try {
      return (JSON.parse(s).email || 'U')
        .split('@')[0]
        .split('.')
        .map((part: string) => part[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    } catch {
      return 'U';
    }
  })();

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      selectFile(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (files && files.length > 0) {
      selectFile(files[0]);
    }
  };

  const selectFile = (file: File) => {
    // Validate file exists
    if (!file) {
      setError('No file selected. Please try again.');
      return;
    }

    // Validate file type
    const allowedTypes = ['text/plain', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
      setError('Invalid file type. Supported formats: .txt, .pdf, .docx');
      return;
    }

    // Validate file size (50 MB max)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('File size exceeds 50 MB limit.');
      return;
    }

    // Validate file is not empty
    if (file.size === 0) {
      setError('File is empty. Please select a file with content.');
      return;
    }

    console.log('File selected:', {
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified
    });

    setError(null);
    setSelectedFile(file);
    setAnalysisResult(null);
    setWordReplacements([]);
    setHasSavedAnalysis(false);
  };

  const handleAnalyze = async () => {
    if (!selectedFile) return;

    setIsAnalyzing(true);
    setError(null);
    setSuccess(null);

    try {
      // Abort previous request if still pending
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();
      // Increase timeout to 60 seconds for large PDF files
      const timeoutId = setTimeout(() => {
        console.warn('⏱️ Request timeout - aborting after 60 seconds');
        abortControllerRef.current?.abort();
      }, 60000);

      try {
        // Send file to API
        console.log(`📤 Uploading file: ${selectedFile.name} (${selectedFile.size} bytes, type: ${selectedFile.type})`);
        const response = await analysisService.uploadDocument(selectedFile, abortControllerRef.current.signal);
        clearTimeout(timeoutId);
        console.log('✅ API response received successfully');

        if (!response?.data) {
          throw new Error('No response from server');
        }

        const analysis = response.data;

        // DEBUG: Log raw response structure
        console.log('📥 Raw backend response:', analysis);
        console.log('📥 File data fields:', {
          file_data_length: analysis.file_data?.length,
          file_type: analysis.file_type,
          file_name: analysis.file_name,
        });
        console.log('📥 detected_words structure:', analysis.detected_words);
        console.log('📥 detected_words FULL JSON:', JSON.stringify(analysis.detected_words, null, 2));
        console.log('📥 replacements structure:', analysis.replacements);
        console.log('📥 replacements FULL JSON:', JSON.stringify(analysis.replacements, null, 2));

        if (!analysis.detected_words || !analysis.replacements) {
          throw new Error('Invalid analysis response from server');
        }

        // Use processed text from backend (handles all file types)
        const processedText = analysis.processed_text || analysis.analysis_text || '';
        
        // Only try to read as text for TXT files
        let fileContent = processedText;
        if (!fileContent && selectedFile.type === 'text/plain') {
          try {
            fileContent = await selectedFile.text();
          } catch {
            fileContent = selectedFile.name;
          }
        }

        // Set analysis result
        setAnalysisResult({
          detected_words: analysis.detected_words,
          replacements: analysis.replacements,
          original_text: analysis.original_text || fileContent,
          processed_text: fileContent,
          file_data: analysis.file_data || '',
          file_type: analysis.file_type || 'txt',
        });

        // Initialize word replacements - MUST start with approved: false
        // Ignore any approved fields from backend response - they should never auto-approve
        
        // Helper: Case-insensitive lookup for replacement value
        const getReplacement = (word: string, replacementsObj: { [key: string]: string }): string => {
          // First try exact match
          if (replacementsObj[word]) return replacementsObj[word];
          
          // Then try case-insensitive match (backend might return "Policeman" while detected word is "policeman")
          const matchingKey = Object.keys(replacementsObj).find(k => k.toLowerCase() === word.toLowerCase());
          return matchingKey ? replacementsObj[matchingKey] : word;
        };
        
        const replacements: WordReplacement[] = analysis.detected_words.map((word: string | Record<string, unknown>, index: number) => {
          // Handle both string and object formats from backend
          const wordStr = typeof word === 'string' ? word : (word.word || word.original || '') as string;
          const replacementValue = getReplacement(wordStr, analysis.replacements);
          const builtReplacement = {
            original: wordStr,
            replacement: replacementValue,
            approved: false,  // ALWAYS false on initial load - NEVER use backend approved value
            instanceId: `${wordStr.toLowerCase()}_${index}_${Date.now()}`, // Unique ID per occurrence
          };
          console.log(`  → Word "${wordStr}": replacement = "${replacementValue}", approved = ${builtReplacement.approved}, instanceId = ${builtReplacement.instanceId}`);
          return builtReplacement;
        });

        console.log('✅ Initialized replacements (should all be approved: false):', replacements);
        console.log('✅ Count - Total:', replacements.length, 'Approved:', replacements.filter(r => r.approved).length);
        console.log('✅ Full JSON:', JSON.stringify(replacements, null, 2));
        
        // CRITICAL: Verify what we're about to set
        replacements.forEach((r, i) => {
          if (r.approved === true) {
            console.error(`❌ ERROR: Item ${i} (${r.original}) is already approved: true BEFORE setWordReplacements!`);
          }
        });

        setWordReplacements(replacements);
        
        // Verify the state was set correctly (this logs AFTER state update)
        setTimeout(() => {
          console.log('⏱️ Checking state 100ms after setWordReplacements:', replacements);
        }, 100);
        
        setSuccess('File analyzed successfully!');
        setTimeout(() => setSuccess(null), 3000);

      } catch (apiErr) {
        if (apiErr instanceof Error && apiErr.name === 'AbortError') {
          console.error('❌ Request aborted/timed out:', apiErr.message);
          setError('Request timed out. The file may be too large or the server is busy. Please try again.');
        } else if (apiErr instanceof Error) {
          console.error('❌ API Error:', apiErr.message);
          setError(apiErr.message || 'Failed to analyze document');
        } else {
          console.error('❌ Unknown error:', apiErr);
          setError('Failed to analyze document');
        }
      }
    } finally {
      setIsAnalyzing(false);
      abortControllerRef.current = null;
    }
  };

  const handleFileUploadToServer = async () => {
    if (!selectedFile || !analysisResult) return;

    setUploading(true);
    setError(null);
    setSaveMessage(null);

    try {
      // Only include approved replacements when saving
      const approvedReplacements = wordReplacements
        .filter((r) => r.approved)
        .map((r) => ({
          original: r.original,
          replacement: r.replacement,
          approved: true,
          instanceId: r.instanceId,
        }));

      if (approvedReplacements.length === 0) {
        setSaveMessage({ type: 'error', text: 'No approved replacements to save. Please approve replacements and try again.' });
        setTimeout(() => setSaveMessage(null), 4000);
        setUploading(false);
        return;
      }

      // Request server to generate corrected file (server applies replacements)
      const originalText = analysisResult.processed_text || analysisResult.original_text || '';
      const fileType = analysisResult.file_type || selectedFile.type.split('/').pop() || 'txt';
      const fileName = selectedFile.name;

      const genResp = await analysisService.generateCorrectedFile(originalText, approvedReplacements, fileType, fileName);
      if (!genResp || !genResp.data) throw new Error('Failed to generate corrected file');

      // genResp.data is a Blob (responseType blob)
      const blob = genResp.data as Blob;
      const ext = fileType === 'pdf' ? 'pdf' : fileType === 'docx' ? 'docx' : fileName.split('.').pop() || 'txt';
      const correctedFileName = fileName.includes('.') ? fileName.replace(/\.[^.]+$/, `_corrected.${ext}`) : `${fileName}_corrected.${ext}`;
      const correctedFile = new File([blob], correctedFileName, { type: fileType === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

      // Upload corrected file to server as the saved analysis (server will create document record)
      const uploadResp = await analysisService.uploadDocument(correctedFile, {
        approved_replacements_count: approvedReplacements.length,
      });
      if (!uploadResp?.data) throw new Error('Failed to upload corrected file');

      setSaveMessage({ type: 'success', text: 'Analysis saved successfully! ✓' });
      setHasSavedAnalysis(true);

      const newUpload: UploadedFile = {
        id: uploadResp.data.document_id,
        file_name: correctedFileName,
        file_type: fileType,
        size: correctedFile.size,
        uploaded_at: new Date().toISOString(),
        document_id: uploadResp.data.document_id,
      };

      setRecentUploads((prev) => [newUpload, ...prev]);
      setTimeout(() => setSaveMessage(null), 6000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save analysis. Please try again.';
      setSaveMessage({ type: 'error', text: `Error: ${errorMessage}` });
      setTimeout(() => setSaveMessage(null), 6000);
    } finally {
      setUploading(false);
    }
  };

  const toggleApproval = (instanceId: string) => {
    const item = wordReplacements.find(w => w.instanceId === instanceId);
    console.log(`🔄 Toggling approval for instanceId ${instanceId}:`, { before: item });
    setWordReplacements(prev => {
      const next = prev.map((item) => 
        item.instanceId === instanceId ? { ...item, approved: !item.approved } : item
      );
      const updated = next.find(w => w.instanceId === instanceId);
      console.log(`✅ Approval toggled for instanceId ${instanceId}:`, { after: updated });
      // Any change to approvals requires re-saving before download
      setHasSavedAnalysis(false);
      return next;
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileTypeLabel = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toUpperCase() || 'FILE';
    const icons: { [key: string]: string } = {
      'DOCX': '📘',
      'PDF': '📕',
      'TXT': '📄',
    };
    return icons[ext] || '📎';
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Preview props logging to confirm what is passed to DocumentPreview
  const previewProps: {
    fileType: string;
    fileData?: string;
    fileName: string;
    detectedWords: string[];
    wordReplacements: WordReplacement[];
  } | null = useMemo(() => {
    if (!analysisResult) return null;
    return {
      fileType: analysisResult.file_type,
      fileData: analysisResult.file_data,
      fileName: selectedFile?.name || 'document',
      detectedWords: wordReplacements.map(w => w.original),
      wordReplacements: wordReplacements,
    };
  }, [analysisResult, selectedFile?.name, wordReplacements]);

  useEffect(() => {
    if (!previewProps) return;
    const approvedCount = previewProps.wordReplacements.filter(r => r.approved).length;
    console.log('📣 DocumentPreview props about to be passed:', {
      fileType: previewProps.fileType,
      fileDataLength: previewProps.fileData?.length || 0,
      detectedCount: previewProps.detectedWords.length,
      replacementsCount: previewProps.wordReplacements.length,
      approvedCount,
      sampleReplacements: previewProps.wordReplacements.slice(0, 6),
    });
  }, [previewProps]);

  return (
    <div>
      <Navigation
        userEmail={userEmail}
        userInitials={userInitials}
        onLogout={handleLogout}
      />

      <div className="page-layout">
        <Sidebar />
        <main className="page-content">
          {!analysisResult ? (
            // Upload Section - No Analysis Yet
            <>
              <div className="page-header">
                <div className="header-content">
                  <h3>Upload Document</h3>
                  <p className="header-subtitle">Upload a document to analyze for gender bias.</p>
                </div>
              </div>

              {error && (
                <div className="error-banner">
                  <strong>Error:</strong> {error}
                </div>
              )}

              {success && (
                <div className="success-banner">
                  <strong>Success:</strong> {success}
                </div>
              )}

              <section className="upload-section">
                <div
                  className={`upload-area ${dragActive ? 'active' : ''} ${selectedFile ? 'file-selected' : ''}`}
                  onDragEnter={dragActive || selectedFile ? undefined : handleDrag}
                  onDragLeave={dragActive && !selectedFile ? handleDrag : undefined}
                  onDragOver={!selectedFile ? handleDrag : undefined}
                  onDrop={!selectedFile ? handleDrop : undefined}
                >
                  {selectedFile ? (
                    <div className="file-selected-view">
                      <div className="selected-file-info">
                        <div className="file-icon-large">
                          {selectedFile.type.includes('pdf')
                            ? '📕'
                            : selectedFile.type.includes('word')
                            ? '📘'
                            : '📄'}
                        </div>
                        <div className="file-details">
                          <p className="file-name">{selectedFile.name}</p>
                          <p className="file-size">{formatFileSize(selectedFile.size)}</p>
                        </div>
                      </div>
                      <button
                        className="analyze-btn"
                        onClick={handleAnalyze}
                        disabled={isAnalyzing}
                      >
                        {isAnalyzing ? (
                          <>
                            <span className="mini-spinner"></span>
                            Analyzing...
                          </>
                        ) : (
                          'Analyze'
                        )}
                      </button>
                      <button
                        className="change-file-btn"
                        onClick={() => {
                          setSelectedFile(null);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        disabled={isAnalyzing}
                      >
                        Change File
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="upload-icon">☁️</div>
                      <p className="drag-text">Drag & drop your file here</p>
                      <p className="or-text">or</p>
                      <label className="browse-label">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".txt,.pdf,.docx"
                          onChange={handleFileSelect}
                          style={{ display: 'none' }}
                        />
                        <span className="browse-btn">Browse Files</span>
                      </label>
                    </>
                  )}
                </div>

                <div className="supported-formats">
                  <p>Supported formats: <strong>.docx, .pdf, .txt</strong> (Max size: 50MB)</p>
                </div>
              </section>

              {recentUploads.length > 0 && (
                <section className="recent-uploads-section">
                  <h3>Recent Uploads</h3>
                  <div className="table-wrapper">
                    <table className="uploads-table">
                      <thead>
                        <tr>
                          <th>File Name</th>
                          <th>Type</th>
                          <th>Size</th>
                          <th>Uploaded On</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentUploads.map((upload) => (
                          <tr key={upload.id}>
                            <td className="file-name-cell">
                              <span className="file-icon">
                                {getFileTypeLabel(upload.file_name)}
                              </span>
                              <span>{upload.file_name}</span>
                            </td>
                            <td className="type-cell">{upload.file_type.toUpperCase()}</td>
                            <td className="size-cell">{formatFileSize(upload.size)}</td>
                            <td className="date-cell">{formatDate(upload.uploaded_at)}</td>
                            <td className="action-cell">
                              <button
                                className="view-btn"
                                title="View analysis"
                                onClick={() => navigate(`/document/${upload.document_id}`)}
                              >
                                <Eye size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          ) : (
            // Analysis Results - Two Column Layout
            <>
              {saveMessage && (
                <div className={`save-message save-message-${saveMessage.type} save-message-overlay show`}>
                  <span className="message-icon">
                    {saveMessage.type === 'success' ? '✓' : '✕'}
                  </span>
                  <span className="message-text">{saveMessage.text}</span>
                </div>
              )}
              <div className="analysis-layout">
                <div className="analysis-left-column">

                <div className="analysis-summary"> 
                    <button
                      className="back-btn"
                      onClick={() => {
                        setAnalysisResult(null);
                        setWordReplacements([]);
                        setSelectedFile(null);
                      }}
                    >
                      ← Back
                    </button>
                  <h3>Analysis Summary</h3>
                  <div className="summary-stats" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div className="stat-item">
                      <span className="stat-label">Biased Words Found:</span>
                      <span className="stat-value">{wordReplacements.length}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Approved Replacements:</span>
                      <span className="stat-value">{wordReplacements.filter(w => w.approved).length}</span>
                    </div>
                  </div>
                </div>

                <div className="word-replacements">
                  <h4>Word Replacements</h4>
                  <div className="replacements-list">
                    {wordReplacements.length === 0 ? (
                      <p className="no-words">No biased words detected! ✓</p>
                    ) : (
                      wordReplacements.map((replacement) => {
                        // DEBUG: Log the actual state
                        console.log(`Replacement ${replacement.instanceId}:`, { 
                          original: replacement.original, 
                          approved: replacement.approved 
                        });
                        
                        return (
                        <div 
                          key={replacement.instanceId}
                          className={`replacement-item ${replacement.approved ? 'approved' : ''}`}
                          style={{
                            backgroundColor: replacement.approved ? '#ecfdf5' : '#f9fafb',
                            borderLeftColor: replacement.approved ? '#10b981' : '#fbbf24',
                          }}
                        >
                          <div className="replacement-content">
                            <span className="original-word">{replacement.original}</span>
                            <span className="arrow">→</span>
                            <span className="replacement-word">{replacement.replacement}</span>
                          </div>
                          <button
                            className={`check-btn ${replacement.approved ? 'checked' : ''}`}
                            style={{
                              backgroundColor: replacement.approved ? '#10b981' : 'transparent',
                              borderColor: replacement.approved ? '#10b981' : '#d1d5db',
                              color: replacement.approved ? 'white' : '#6b7280',
                            }}
                            onClick={() => toggleApproval(replacement.instanceId)}
                            title={replacement.approved ? 'Uncheck' : 'Approve replacement'}
                          >
                            {replacement.approved ? '✓' : '○'}
                          </button>
                        </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <button
                  className="save-analysis-btn"
                  onClick={handleFileUploadToServer}
                  disabled={uploading}
                >
                  {uploading ? 'Saving...' : 'Save Analysis'}
                </button>
              </div>

              <div className="analysis-right-column">
                <div className="file-preview">
                  <div className="preview-content">
                    {analysisResult && analysisResult.file_data ? (
                      <DocumentPreview
                        fileType={analysisResult.file_type}
                        fileData={analysisResult.file_data}
                        wordReplacements={wordReplacements}
                        downloadEnabled={hasSavedAnalysis}
                      />

                    ) : (
                      <div style={{ padding: '20px', color: '#999', textAlign: 'center' }}>
                        Loading document preview...
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default UploadDocument;

