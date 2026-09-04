/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Download, Settings } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import Navigation from '../components/Navigation';
import { analysisService } from '../services/authService';
import '../styles/UserDashboard.css';

interface DashboardStats {
  total_documents: number;
  total_biased_words: number;
  total_replacements: number;
  last_analysis_date: string | null;
  fairness_score: number;
}

interface RecentAnalysis {
  id: number;
  file_name: string;
  file_type: string;
  biased_words_found: number;
  fairness_score: number;
  created_at: string;
}

interface TopBiasWord {
  word: string;
  count: number;
}

const UserDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentAnalyses, setRecentAnalyses] = useState<RecentAnalysis[]>([]);
  const [topBiasWords, setTopBiasWords] = useState<TopBiasWord[]>([]);
  const scoreRef = useRef<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [animatedScore, setAnimatedScore] = useState(0);
  const [sparkles, setSparkles] = useState<Array<{ id: number; tx: string; ty: string }>>([]);
  
  // Load user email from localStorage (read-only, no state needed)
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

  // Fetch dashboard data from API
  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [statsRes, recentRes, wordsRes] = await Promise.all([
        analysisService.getDashboardStats(),
        analysisService.getDashboardRecentAnalyses(),
        analysisService.getDashboardTopBiasWords(),
      ]);

      setStats(statsRes.data);
      setRecentAnalyses(recentRes.data);
      setTopBiasWords(wordsRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      console.error('Dashboard data fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch dashboard data on component mount
  useEffect(() => {
    fetchDashboardData();
  }, []);

  // animate score count-up and generate sparkles
  useEffect(() => {
    if (!stats) return;

    const targetScore = stats.fairness_score || 0;
    const duration = 1800; // 1.8 seconds
    const startTime = Date.now();
    const startScore = scoreRef.current;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function for smooth count-up
      const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
      const currentScore = Math.floor(startScore + (targetScore - startScore) * easeOut(progress));
      
      scoreRef.current = currentScore;
      setAnimatedScore(currentScore);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);

    // Generate floating sparkles
    const sparkleArray = Array.from({ length: 8 }, (_, i) => {
      const angle = (i / 8) * Math.PI * 2;
      const radius = 120;
      const tx = `${Math.cos(angle) * radius}px`;
      const ty = `${Math.sin(angle) * radius}px`;
      return { id: i, tx, ty };
    });
    setSparkles(sparkleArray);
  }, [stats]);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const getUserInitials = (): string => {
    const parts = userEmail.split('@')[0].split('.');
    return (parts[0]?.[0] + (parts[1]?.[0] || '')).toUpperCase().slice(0, 2);
  };

  const getFairnessLabel = (score: number): string => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Poor';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    });
  };

  const getTypeLabel = (type: string): string => {
    const labels: { [key: string]: string } = {
      'txt': '📄 Text',
      'docx': '📘 Word',
      'pdf': '📕 PDF',
      'text': '📄 Text',
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <div>
        <Navigation userEmail={userEmail} userInitials={getUserInitials()} onLogout={handleLogout} />
        <div className="dashboard-body">
          <Sidebar onLogout={handleLogout} />
          <div className="sidebar-placeholder" />
          <div className="dashboard-content loading">
            <div className="spinner"></div>
            <p>Loading dashboard...</p>
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
          {error && <div className="error-banner">{error}</div>}
          {/* Stats Cards */}
          <div className="stats-grid dashboard">
            <div className="stat-card dashboard lightblue">
              <div className="stat-card-top">
                <div className="stat-card-icon"><FileText size={22} /></div>
              </div>
              <div className="stat-card-body">
                <div className="stat-number">{stats?.total_documents || 0}</div>
                <div className="stat-title">Documents Analyzed</div>
                <p className="stat-caption">Total documents processed</p>
              </div>
              <div className="stat-card-wave" />
            </div>

            <div className="stat-card dashboard lightblue">
              <div className="stat-card-top">
                <div className="stat-card-icon"><Settings size={22} /></div>
              </div>
              <div className="stat-card-body">
                <div className="stat-number">{stats?.total_biased_words || 0}</div>
                <div className="stat-title">Bias Words Detected</div>
                <p className="stat-caption">Across all documents</p>
              </div>
              <div className="stat-card-wave" />
            </div>

            <div className="stat-card dashboard lightblue">
              <div className="stat-card-top">
                <div className="stat-card-icon"><Download size={22} /></div>
              </div>
              <div className="stat-card-body">
                <div className="stat-number">{stats?.total_replacements || 0}</div>
                <div className="stat-title">Replacements Made</div>
                <p className="stat-caption">Words replaced with fair terms</p>
              </div>
              <div className="stat-card-wave" />
            </div>

            <div className="stat-card dashboard lightblue">
              <div className="stat-card-top">
                <div className="stat-card-icon">📅</div>
              </div>
              <div className="stat-card-body">
                <div className="stat-number">
                  {stats?.last_analysis_date
                    ? new Date(stats.last_analysis_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : '—'}
                </div>
                <div className="stat-title">Last Analysis</div>
                <p className="stat-caption">
                  {stats?.last_analysis_date
                    ? new Date(stats.last_analysis_date).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'No analysis yet'}
                </p>
              </div>
              <div className="stat-card-wave" />
            </div>
          </div>
          {/* Charts Section */}
          <div className="charts-section"> 
            {/* Top 7 Bias Words */}
            <div className="top-bias-words-section">
              <h3>Top 7 Bias Words</h3>
              <div className="bar-chart-container">
                {topBiasWords.length > 0 ? (
                  topBiasWords.slice(0, 7).map((word, index) => {
                    const maxCount = Math.max(...topBiasWords.slice(0, 7).map(w => w.count), 1);
                    const percentage = (word.count / maxCount) * 100;
                    return (
                      <div key={index} className="bar-items">
                        <div className="bar-label">
                          <span className="bar-word">{word.word}</span>
                        </div>
                        <div className="bar-wrapper">
                          <div
                            className="bar-fill"
                            style={{
                              '--bar-width': `${percentage}%`,
                            } as React.CSSProperties & { '--bar-width': string }}
                          >
                            <span className="bar-value">{word.count}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="empty-state">No bias words detected yet.</div>
                )}
              </div>
            </div>

            {/* Gender Fairness Score with animated circle and sparkles */}
            <div className="chart-container fairness-chart">
              <h3>Gender Fairness Score</h3>
              <div className="fairness-circle">
                <svg viewBox="0 0 200 200" className="progress-circle">
                  <circle
                    cx="100"
                    cy="100"
                    r="80"
                    fill="none"
                    stroke="url(#scoreGradient)"
                    strokeWidth="8"
                    strokeDasharray={`${(stats?.fairness_score || 0) / 100 * 502.65} 502.65`}
                    className="progress-ring"
                  />
                  <defs>
                    <linearGradient id="scoreGradient" x1="0" y1="0" x2="100" y2="100">
                      <stop offset="0%" stopColor="#c4b5fd" />
                      <stop offset="100%" stopColor="#6d28d9" />
                    </linearGradient>
                  </defs>
                  <text x="100" y="95" textAnchor="middle" fontSize="40" fontWeight="bold" fill="#EC4E4BB8" dominantBaseline="middle" className="score-percentage">
                    {animatedScore}%
                  </text>
                  <text x="100" y="127" textAnchor="middle" fontSize="18" fontWeight="600" fill="#9B4657" dominantBaseline="middle">
                    {getFairnessLabel(animatedScore)}
                  </text>
                </svg>
                {sparkles.map((sparkle) => (
                  <div
                    key={sparkle.id}
                    className="sparkle"
                    style={{
                      '--tx': sparkle.tx,
                      '--ty': sparkle.ty,
                      animation: `floatSparkle 2s ease-out forwards`,
                      animationDelay: `${sparkle.id * 0.1}s`,
                    } as React.CSSProperties & { '--tx': string; '--ty': string }}
                  />
                ))}
                <p className="score-description">
                  {animatedScore > 60
                    ? 'Your content uses language that promotes fairness and inclusion.'
                    : 'Your content can be improved with more inclusive and balanced language.'}
                </p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="quick-actions-inline card">
              <h3>Quick Actions</h3>
              <div className="actions-grid">
              <button className="action-btn" onClick={() => navigate('/new-analysis')}>
                <span className="icon">✍️</span>
                <span className="label">New Text Analysis</span>
                <span className="desc">Type or paste your text</span>
              </button>
              <button className="action-btn" onClick={() => navigate('/upload-document')}>
                <span className="icon">📤</span>
                <span className="label">Upload Document</span>
                <span className="desc">Analyze .docx, .pdf or .txt</span>
              </button>
              <button className="action-btn" onClick={() => navigate('/history')}>
                <span className="icon">📋</span>
                <span className="label">View History</span>
                <span className="desc">See your past analyses</span>
              </button>
            </div>
            </div>
          </div>
          {/* Recent Analyses Table */}
          <div className="bottom-section-wrapper">
            <div className="recent-analyses-section full-width">
              <div className="section-header">
                <h3>Recent Analysis</h3>
                <button className="btn-text" onClick={() => navigate('/history')}>
                  View All History →
                </button>
              </div>
              <div className="table-container">
                <table className="analyses-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>File Name</th>
                      <th>Type</th>
                      <th>Bias Words Found</th>
                      <th>Fairness Score</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentAnalyses.length > 0 ? (
                      recentAnalyses.map((analysis, index) => (
                        <tr key={analysis.id}>
                          <td>{index + 1}</td>
                          <td className="file-name">
                            <FileText size={16} />
                            <span title={analysis.file_name}>{analysis.file_name}</span>
                          </td>
                          <td className="file-type">
                            <span className="type-badge">{getTypeLabel(analysis.file_type)}</span>
                          </td>
                          <td className="word-count">
                            <span className="count-badge">{analysis.biased_words_found}</span>
                          </td>
                          <td className="score">
                            <div className="score-bar">
                              <div
                                className={`score-fill ${
                                  analysis.fairness_score >= 80
                                    ? 'excellent'
                                    : analysis.fairness_score >= 70
                                    ? 'good'
                                    : 'poor'
                                }`}
                                style={{
                                  width: `${analysis.fairness_score}%`,
                                }}
                              ></div>
                            </div>
                            <span className="score-text">{analysis.fairness_score}%</span>
                          </td>
                          <td className="date">
                            {formatDate(analysis.created_at)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="empty-state">
                          No analyses yet. Start by uploading a document or analyzing text.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div> 
        </div>  
      </div> 
    </div>
  );
};

export default UserDashboard;
