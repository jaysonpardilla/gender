import React, { useState, useRef, useMemo, useEffect } from 'react';
import { FileText, Copy, Download, BarChart3 } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import Navigation from '../components/Navigation';
import '../styles/NewAnalysis.css';
import { analysisService } from '../services/authService';

interface ReplacementItem {
  original: string;
  replacement: string;
  approved: boolean;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const NewAnalysis: React.FC = () => {
  const [text, setText] = useState('The policeman and the chairman informed his employees that each salesman should submit his report on time.');
  const [replacements, setReplacements] = useState<ReplacementItem[]>([]);
  const [originalText, setOriginalText] = useState<string>('');
  const [recordedReplacements, setRecordedReplacements] = useState<ReplacementItem[]>([]);
  const [lastDocumentId, setLastDocumentId] = useState<number | null>(null);
  const [showResults, setShowResults] = useState(false);
  const resultSectionRef = useRef<HTMLDivElement | null>(null);

  const detectedItems = useMemo(() => {
    // Use replacements that were detected by the backend
    return replacements;
  }, [replacements]);

  const approvedDetectedCount = useMemo(() => {
    return recordedReplacements.length;
  }, [recordedReplacements]);

  const totalDetectedBiasWords = detectedItems.length;
  const fairnessScore = totalDetectedBiasWords > 0 ? Math.round((approvedDetectedCount / totalDetectedBiasWords) * 100) : 100;

  const fairnessRating = useMemo(() => {
    if (fairnessScore <= 20) return 'Highly Biased';
    if (fairnessScore <= 40) return 'Moderately Biased';
    if (fairnessScore <= 60) return 'Fair';
    if (fairnessScore <= 80) return 'Inclusive';
    return 'Highly Inclusive';
  }, [fairnessScore]);

  const resultText = useMemo(() => {
    const base = originalText || text;
    return replacements.reduce((currentText, replacement) => {
      if (!replacement.approved) return currentText;
      const regex = new RegExp(`\\b${escapeRegExp(replacement.original)}\\b`, 'gi');
      return regex.test(currentText) ? currentText.replace(regex, replacement.replacement) : currentText;
    }, base);
  }, [originalText, text, replacements]);

  useEffect(() => {
    if (showResults && resultSectionRef.current) {
      resultSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [showResults]);




  const toggleApproval = (original: string) => {
    // Get current approval state
    const currentItem = replacements.find(r => r.original === original);
    const wasApproved = currentItem?.approved || false;
    const willBeApproved = !wasApproved;

    // Update the replacements list
    setReplacements(prev => {
      return prev.map(item => {
        if (item.original === original) return { ...item, approved: willBeApproved };
        return item;
      });
    });

    // Update recorded replacements based on new state
    setRecordedReplacements(prevRecorded => {
      if (willBeApproved) {
        // Adding to recorded (toggling ON)
        const already = prevRecorded.find(r => r.original === original);
        if (!already) {
          const replacement = currentItem?.replacement || '';
          return [...prevRecorded, { original, replacement, approved: true }];
        }
        return prevRecorded;
      } else {
        // Removing from recorded (toggling OFF)
        return prevRecorded.filter(r => r.original !== original);
      }
    });

    // Persist to backend if document exists
    setTimeout(() => {
      if (lastDocumentId != null) {
        // Calculate the new approved count after this toggle
        const newApprovedList = replacements.map(item => 
          item.original === original ? { ...item, approved: willBeApproved } : item
        );
        const newCount = newApprovedList.filter(r => r.approved).length;
        
        analysisService.updateDocument(lastDocumentId, { approved_replacements_count: newCount })
          .catch(err => console.error('Failed to update document:', err));
      }
    }, 0);
  };

  const handleAnalyze = () => {
    const formattedDate = new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
    // capture the text being analyzed so we can clear the input but still show results
    setOriginalText(text);
    setAnalysisDate(formattedDate);
    // Don't show results yet - wait for API response

    // Call backend analyze endpoint to create a Document and capture its id
    (async () => {
      try {
        const token = localStorage.getItem('access_token');
        const res = await fetch('/api/analyze-text/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error('Analyze API failed');
        const data = await res.json();
        
        // Use the detected words and replacements from the backend
        if (data && data.replacements) {
          const detectedReplacements = Object.entries(data.replacements).map(([original, replacement]) => ({
            original,
            replacement: replacement as string,
            approved: false
          }));
          setReplacements(detectedReplacements);
          // Now that we have the detected replacements, show the results
          setShowResults(true);
        }
        
        if (data && data.document_id) setLastDocumentId(data.document_id);
      } catch (e) {
        console.warn('Could not persist analysis to backend:', e);
        // Still show results even if save fails, with empty detected list
        setReplacements([]);
        setShowResults(true);
      }
    })();

    // clear the input shortly after scrolling begins to preserve smooth animation UX
    window.setTimeout(() => setText(''), 600);
  };

  const [copyStatus, setCopyStatus] = useState<string>('');
  const [analysisDate, setAnalysisDate] = useState<string>('');

  const handleClear = () => {
    setText('');
    // Reset replacements to empty since we only show detected ones
    setReplacements([]);
    setShowResults(false);
    setOriginalText('');
    setRecordedReplacements([]);
    setLastDocumentId(null);
    setCopyStatus('');
  };

  const handleCopyResult = async () => {
    try {
      await navigator.clipboard.writeText(resultText);
      setCopyStatus('Copied!');
      window.setTimeout(() => setCopyStatus(''), 2000);
    } catch {
      setCopyStatus('Copy failed');
      window.setTimeout(() => setCopyStatus(''), 2000);
    }
  };

  return (
    <div>
      <Navigation userEmail={localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user') as string).email : 'User'} userInitials={(() => {
        const s = localStorage.getItem('user');
        if (!s) return 'U';
        try { return (JSON.parse(s).email || 'U').split('@')[0].slice(0,2).toUpperCase(); } catch { return 'U'; }
      })()} onLogout={() => { localStorage.removeItem('access_token'); localStorage.removeItem('refresh_token'); localStorage.removeItem('user'); window.location.href = '/login'; }} />

      <div className="page-layout">
        <Sidebar />

        <main className="page-content">
          <div className="page-header">
            <div>
              <h2>Text Analyzer</h2>
              <p className="page-description">Enter or paste your text below to analyze for gender bias.</p>
            </div>
          </div>

          <section className="analysis-input-card">
            <textarea className="analysis-textarea" value={text} onChange={(e) => setText(e.target.value)} rows={15} />
            <div className="input-actions">
              <div className="meta">Characters: {text.length} | Words: {text.trim() ? text.trim().split(/\s+/).length : 0}</div>
              <div className="action-buttons">
                <button className="btn-secondary" onClick={handleClear} type="button">Clear</button>
                <button className="btn-primary" onClick={handleAnalyze}>Analyze Text</button>
              </div>
            </div>
          </section>

          {showResults && (
            <section className="analysis-results">
              <h3><b>Analysis Results</b></h3>
              <div className="stats-grid dashboard">
                <div className="stat-card dashboard purple">
                  <div className="stat-card-top">
                    <div className="stat-card-icon"><FileText size={22} /></div>
                  </div>
                  <div className="stat-card-body">
                    <div className="stat-number">{detectedItems.length}</div>
                    <div className="stat-title">Bias Words Found</div>
                    <p className="stat-caption">Total detected in your document</p>
                  </div>
                  <div className="stat-card-wave" />
                </div>

                <div className="stat-card dashboard blue">
                  <div className="stat-card-top">
                    <div className="stat-card-icon"><Download size={22} /></div>
                  </div>
                  <div className="stat-card-body">
                    <div className="stat-number">{approvedDetectedCount}</div>
                    <div className="stat-title">Replacements Made</div>
                    <p className="stat-caption">Approved and applied</p>
                  </div>
                  <div className="stat-card-wave" />
                </div>

                <div className="stat-card dashboard pink">
                  <div className="stat-card-top">
                    <div className="stat-card-icon"><BarChart3 size={22} /></div>
                  </div>
                  <div className="stat-card-body">
                    <div className="stat-number">{fairnessScore}%</div>
                    <div className="stat-title">Fairness Score</div>
                    <p className="stat-caption">{fairnessRating}</p>
                  </div>
                  <div className="stat-card-wave" />
                </div>

                <div className="stat-card dashboard orange">
                  <div className="stat-card-top">
                    <div className="stat-card-icon">📅</div>
                  </div>
                  <div className="stat-card-body">
                    <div className="stat-number">{analysisDate || '—'}</div>
                    <div className="stat-title">Analysis Date</div>
                    <p className="stat-caption">When this analysis was run</p>
                  </div>
                  <div className="stat-card-wave" />
                </div>
              </div>

              <div className="analysis-panels" ref={resultSectionRef}>
                <div className="analysis-left-panel">
                  <h4>Bias Replacements</h4>
                  <div className="replacement-items">
                    {detectedItems.length === 0 ? (
                      <div className="no-detected">No bias words found in the current text.</div>
                    ) : detectedItems.map(item => (
                      <div key={item.original} className={`replacement-item ${item.approved ? 'approved' : ''}`}>
                        <div className="replacement-label">
                          <span className="replacement-original">{item.original}</span>
                          <span className="replacement-arrow">→</span>
                          <span className="replacement-suggestion">{item.replacement}</span>
                        </div>
                        <button
                          className={`approval-toggle ${item.approved ? 'approved' : ''}`}
                          onClick={() => toggleApproval(item.original)}
                          type="button"
                        >
                          {item.approved ? 'On' : 'Off'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="analysis-right-panel"> 
                  <div className="result-header-row"> 
                      <div>
                        <h4>Result Text</h4>
                      </div>
                      <button className="copy-result-button" type="button" onClick={handleCopyResult}>
                        <Copy size={18} />
                        <span>{copyStatus || 'Copy'}</span>
                      </button>
                    </div>
                  <div className="result-preview">  
                    <p className="result-text-body">{resultText}</p>
                  </div>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
};

export default NewAnalysis;
