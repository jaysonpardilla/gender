/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import Sidebar from '../components/Sidebar';
import { FileText, X } from 'lucide-react';
import '../styles/AnalysisHistory.css';
import { analysisService } from '../services/authService';

interface Analysis {
  id: number;
  file_name: string;
  file_type: string;
  biased_words_found: number;
  fairness_score: number;
  created_at: string;
}

const AnalysisHistory: React.FC = () => {
  const navigate = useNavigate();
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'pdf' | 'docx'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'score' | 'name'>('date');
  const [currentPage, setCurrentPage] = useState(1);
  const [, setTopBiasWords] = useState<Array<{word:string;count:number}>>([]);

  const userEmail = (() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        return user.email || 'User';
      } catch (e) {
        return 'User';
      }
    }
    return 'User';
  })();

  const getUserInitials = (): string => {
    const parts = userEmail.split('@')[0].split('.');
    return (parts[0]?.[0] + (parts[1]?.[0] || '')).toUpperCase().slice(0, 2);
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  useEffect(() => {
    let mounted = true;
    analysisService.getUserHistory()
      .then((res: any) => {
        if (!mounted) return;
        // Map backend document serializer to Analysis shape
        const data = (res.data || res).map((d: any) => {
          const detected = Array.isArray(d.detected_words) ? d.detected_words : (d.detected_words ? JSON.parse(d.detected_words) : []);
          const biasedCount = detected ? detected.length : 0;
          const fairness = biasedCount ? Math.max(0, 100 - biasedCount * 5) : 100;
          return {
            id: d.id,
            file_name: d.file_name || 'Text Input',
            file_type: (d.file_type || 'text').toLowerCase(),
            biased_words_found: biasedCount,
            fairness_score: fairness,
            created_at: d.created_at,
          } as Analysis;
        });
        setAnalyses(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load history', err);
        setLoading(false);
      });

    // also fetch top bias words for sidebar/suggestions
    analysisService.getDashboardTopBiasWords(6)
      .then((res:any) => {
        const list = res.data || res;
        setTopBiasWords(Array.isArray(list) ? list : []);
      })
      .catch(() => {});

    return () => { mounted = false; };
  }, []);

  const getFileTypeLabel = (type: string): string => {
    const labels: { [key: string]: string } = {
      docx: '📘 Word',
      pdf: '📕 PDF',
    };
    return labels[type] || type;
  };

  const getFairnessLabel = (score: number): string => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Poor';
  };

  const getScoreColor = (score: number): string => {
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    if (score >= 40) return 'fair';
    return 'poor';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleDelete = (analysisId: number) => {
    const confirmed = window.confirm('Are you sure you want to delete this analysis?');
    if (!confirmed) {
      return;
    }

    analysisService.deleteDocument(analysisId)
      .then(() => {
        setAnalyses((prev) => prev.filter((item) => item.id !== analysisId));
      })
      .catch((err) => {
        console.error('Delete failed', err);
      });
  };

  const filteredAndSortedAnalyses = analyses
    .filter((a) => {
      const matchesType = filterType === 'all' ? true : a.file_type === filterType;
      return matchesType;
    })
    .sort((a, b) => {
      if (sortBy === 'date') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      } else if (sortBy === 'score') {
        return b.fairness_score - a.fairness_score;
      } else {
        return a.file_name.localeCompare(b.file_name);
      }
    });

  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(filteredAndSortedAnalyses.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedAnalyses = filteredAndSortedAnalyses.slice((safeCurrentPage - 1) * pageSize, safeCurrentPage * pageSize);


  if (loading) {
    return (
      <div>
        <Navigation userEmail={userEmail} userInitials={getUserInitials()} onLogout={handleLogout} />
        <div className="dashboard-body">
          <Sidebar onLogout={handleLogout} />
          <div className="sidebar-placeholder" />
          <div className="dashboard-content loading">
            <div className="spinner"></div>
            <p>Loading analysis history...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Navigation userEmail={userEmail} userInitials={getUserInitials()} onLogout={handleLogout} />
      <div className="dashboard-body">
        <Sidebar onLogout={handleLogout} />
        <div className="sidebar-placeholder" />
        <div className="dashboard-content">
          <div className="history-container">
            {/* Header Section */}
            <div className="history-header">
              <div>
                <h3>Analysis History</h3>
                <p className="header-subtitle">View and manage your previous document analyses</p>
              </div>
            </div>

            {/* Filters and Sort Section */}
            <div className="filters-section">
              <div style={{flex:1}} />
              <div style={{display:'flex',gap:12,alignItems:'flex-end'}}>
                <div className="filter-group">
                  <label>File Type</label>
                  <select value={filterType} onChange={(e) => { setFilterType(e.target.value as any); setCurrentPage(1); }}>
                    <option value="all">All Files</option>
                    <option value="pdf">PDF</option>
                    <option value="docx">Word Document</option>
                  </select>
                </div>
                <div className="filter-group">
                  <label>Sort By</label>
                  <select value={sortBy} onChange={(e) => { setSortBy(e.target.value as any); setCurrentPage(1); }}>
                    <option value="date">Date (Newest)</option>
                    <option value="score">Fairness Score</option>
                    <option value="name">File Name</option>
                  </select>
                </div>
                <button className="btn-primary-inline" onClick={() => navigate('/new-analysis')}>
                  + New Analysis
                </button>
              </div>
            </div>

            {/* Table Section */}
            <div className="table-section">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>File Name</th>
                    <th>Type</th>
                    <th>Bias Words</th>
                    <th>Fairness Score</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedAnalyses.length > 0 ? (
                    paginatedAnalyses.map((analysis) => (
                      <tr key={analysis.id}>
                        <td className="file-name-cell">
                          <FileText size={18} />
                          <span className="file-name">{analysis.file_name}</span>
                        </td>
                        <td>
                          <span className="type-badge">{getFileTypeLabel(analysis.file_type)}</span>
                        </td>
                        <td className="bias-count">{analysis.biased_words_found}</td>
                        <td>
                          <div className="score-display">
                            <div className={`score-bar ${getScoreColor(analysis.fairness_score)}`}>
                              <div
                                className="score-fill"
                                style={{ width: `${analysis.fairness_score}%` }}
                              ></div>
                            </div>
                            <span className="score-value">{analysis.fairness_score}%</span>
                            <span className="score-label">{getFairnessLabel(analysis.fairness_score)}</span>
                          </div>
                        </td>
                        <td className="date-cell">{formatDate(analysis.created_at)}</td>
                        <td className="actions-cell">
                          <button
                            className="action-icon delete"
                            title="Delete"
                            onClick={() => handleDelete(analysis.id)}
                          >
                          <X size={18} />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="empty-message">
                        No analyses found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="pagination-bar">
              <div className="pagination-info">
                Showing {Math.min((currentPage - 1) * pageSize + 1, filteredAndSortedAnalyses.length)} to {Math.min(currentPage * pageSize, filteredAndSortedAnalyses.length)} of {filteredAndSortedAnalyses.length} results
              </div>
              <div className="pagination-controls">
                <button
                  className="pagination-button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                >
                  Previous
                </button>
                <button
                  className="pagination-button"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                >
                  Next
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalysisHistory;
