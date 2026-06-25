/* eslint-disable no-useless-assignment */
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

interface DocumentOverTime {
  date: string;
  count: number;
}

const UserDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentAnalyses, setRecentAnalyses] = useState<RecentAnalysis[]>([]);
  const [topBiasWords, setTopBiasWords] = useState<TopBiasWord[]>([]);
  const [documentsOverTime, setDocumentsOverTime] = useState<DocumentOverTime[]>([]);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const lineRef = useRef<SVGPathElement | null>(null);
  const areaRef = useRef<SVGPathElement | null>(null);
  const scoreRef = useRef<number>(0);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; value: number } | null>(null);
  const [timeFilter, setTimeFilter] = useState<'week' | 'month' | 'year'>('month');
  const [filteredDocuments, setFilteredDocuments] = useState<DocumentOverTime[]>([]);
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

      const [statsRes, recentRes, wordsRes, timeRes] = await Promise.all([
        analysisService.getDashboardStats(),
        analysisService.getDashboardRecentAnalyses(),
        analysisService.getDashboardTopBiasWords(),
        analysisService.getDashboardDocumentsOverTime(),
      ]);

      setStats(statsRes.data);
      setRecentAnalyses(recentRes.data);
      setTopBiasWords(wordsRes.data);
      setDocumentsOverTime(timeRes.data);
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

  // compute filtered documents when original data or filter changes
  useEffect(() => {
    if (!documentsOverTime || documentsOverTime.length === 0) {
      setFilteredDocuments([]);
      return;
    }

    const now = new Date();
    let cutoff = new Date(0);
    if (timeFilter === 'week') {
      cutoff = new Date(now);
      cutoff.setDate(now.getDate() - 6); // last 7 days including today
      cutoff.setHours(0, 0, 0, 0);
    } else if (timeFilter === 'month') {
      cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (timeFilter === 'year') {
      cutoff = new Date(now.getFullYear(), 0, 1);
    }

    const filtered = documentsOverTime.filter(d => {
      const dt = new Date(d.date);
      return dt >= cutoff;
    });

    // If filtering produces empty result, fallback to last N points to always show something
    if (filtered.length === 0) {
      const lastN = documentsOverTime.slice(-7);
      setFilteredDocuments(lastN);
    } else {
      setFilteredDocuments(filtered);
    }
  }, [documentsOverTime, timeFilter]);

  // animate the line & area when filtered data updates
  useEffect(() => {
    if (lineRef.current) {
      const path = lineRef.current;
      try {
        const len = path.getTotalLength();
        path.style.strokeDasharray = `${len}`;
        path.style.strokeDashoffset = `${len}`;
        // force style/layout flush
        path.getBoundingClientRect();
        path.style.transition = 'stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)';
        setTimeout(() => {
          if (path) path.style.strokeDashoffset = '0';
        }, 30);
      } catch (e) {
        // ignore
      }
    }

    if (areaRef.current) {
      const a = areaRef.current;
      a.style.opacity = '0';
      a.style.transition = 'opacity 900ms ease 150ms';
      setTimeout(() => {
        a.style.opacity = '1';
      }, 80);
    }
  }, [filteredDocuments]);

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

  const getComparisonPercentage = (score: number): number => {
    return Math.round(score * 1.5);
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
            {/* Documents Over Time with filter */}
            <div className="chart-container documents-chart document-over-time">
              <div className="chart-header">
                <h3>Documents Processed Over Time</h3>
                <select
                  className="time-filter"
                  value={timeFilter}
                  onChange={(e) => setTimeFilter(e.target.value as 'week' | 'month' | 'year')}
                >
                  <option value="week">Last 6 Days</option>
                  <option value="month">This Month</option>
                  <option value="year">This Year</option>
                </select>
              </div>
              <div className="chart-placeholder" ref={chartContainerRef}>
                <svg viewBox="0 0 800 300" className="sparkline-chart" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="lineGrad" x1="0" x2="1">
                      <stop offset="0%" stopColor="#7c3aed" />
                      <stop offset="100%" stopColor="#6d28d9" />
                    </linearGradient>
                    <linearGradient id="areaGrad" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#6d28d9" stopOpacity="0.12" />
                      <stop offset="100%" stopColor="#6d28d9" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>

                  {filteredDocuments.length > 0 && (() => {
                    const paddingLeft = 48;
                    const paddingRight = 36;
                    const paddingTop = 10; // reduce top padding to use more vertical space
                    const paddingBottom = 14; // reduce bottom padding slightly
                    const width = 800 - paddingLeft - paddingRight;
                    const height = 300 - paddingTop - paddingBottom;

                    const ptsSource = filteredDocuments;
                    const max = Math.max(...ptsSource.map(x => x.count), 1);

                    const points = ptsSource.map((d, i) => {
                      const date = new Date(d.date);
                      const denom = (ptsSource.length - 1) || 1;
                      const x = paddingLeft + (i / denom) * width;
                      const y = paddingTop + (1 - d.count / max) * height;

                      // labels for different filter granularities
                      const weekdayLabel = date.toLocaleDateString('en-US', { weekday: 'short' });
                      const weekdayWithDay = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

                      // week start (Monday)
                      const day = date.getDay();
                      const monday = new Date(date);
                      const mondayOffset = (day + 6) % 7; // 0->Mon
                      monday.setDate(date.getDate() - mondayOffset);
                      const weekStartKey = `${monday.getFullYear()}-${monday.getMonth()}-${monday.getDate()}`;
                      const weekStartLabel = monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

                      const monthLabel = date.toLocaleDateString('en-US', { month: 'short' });

                      return {
                        x,
                        y,
                        label: d.date,
                        value: d.count,
                        weekdayLabel,
                        weekdayWithDay,
                        weekStartKey,
                        weekStartLabel,
                        monthLabel,
                      };
                    });

                    // Catmull-Rom to Bezier curve helper
                    const catmullRom2bezier = (pts: { x: number; y: number }[]) => {
                      const d = pts;
                      if (d.length < 2) return '';
                      let path = `M ${d[0].x},${d[0].y}`;
                      for (let i = 0; i < d.length - 1; i++) {
                        const p0 = d[i - 1] || d[i];
                        const p1 = d[i];
                        const p2 = d[i + 1];
                        const p3 = d[i + 2] || p2;

                        const bp1x = p1.x + (p2.x - p0.x) / 6;
                        const bp1y = p1.y + (p2.y - p0.y) / 6;
                        const bp2x = p2.x - (p3.x - p1.x) / 6;
                        const bp2y = p2.y - (p3.y - p1.y) / 6;

                        path += ` C ${bp1x},${bp1y} ${bp2x},${bp2y} ${p2.x},${p2.y}`;
                      }
                      return path;
                    };

                    const linePath = catmullRom2bezier(points);
                    const areaPath = linePath + ` L ${points[points.length - 1].x},${300 - paddingBottom} L ${points[0].x},${300 - paddingBottom} Z`;

                    // y axis labels (nice ticks)
                    const ticks = 5; // a bit more vertical resolution
                    const tickValues = Array.from({ length: ticks + 1 }, (_, i) => Math.round((max / ticks) * i));

                    return (
                      <g>
                        {/* horizontal gridlines and labels */}
                        {tickValues.map((tv, i) => {
                          const y = paddingTop + (1 - tv / max) * height;
                          return (
                            <g key={i}>
                              <line x1={paddingLeft - 8} y1={y} x2={800 - paddingRight} y2={y} stroke="rgba(0,0,0,0.06)" strokeWidth={1} />
                              <text x={paddingLeft - 12} y={y + 4} fontSize={11} fill="#6b7280" textAnchor="end">{tv}</text>
                            </g>
                          );
                        })}

                        {/* area under curve */}
                        <path ref={areaRef} d={areaPath} fill="url(#areaGrad)" style={{ opacity: 1 }} />

                        {/* smoothed line (animated) */}
                        <path ref={lineRef} d={linePath} fill="none" stroke="url(#lineGrad)" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" className="line-path" />

                        {/* point markers and x labels (with tooltip handlers) */}
                        {points.map((p, idx) => (
                          <g key={idx}>
                            <circle
                              cx={p.x}
                              cy={p.y}
                              r={6}
                              fill="#fff"
                              stroke="#7c3aed"
                              strokeWidth={2}
                              onMouseEnter={(e) => {
                                const rect = chartContainerRef.current?.getBoundingClientRect();
                                const left = rect ? e.clientX - rect.left : p.x;
                                const top = rect ? e.clientY - rect.top : p.y;
                                setTooltip({ x: left, y: top - 10, label: p.label, value: p.value });
                              }}
                              onMouseMove={(e) => {
                                const rect = chartContainerRef.current?.getBoundingClientRect();
                                const left = rect ? e.clientX - rect.left : p.x;
                                const top = rect ? e.clientY - rect.top : p.y;
                                setTooltip({ x: left, y: top - 10, label: p.label, value: p.value });
                              }}
                              onMouseLeave={() => setTooltip(null)}
                            />
                            {(() => {
                              let show = false;
                              let text = '';
                              if (timeFilter === 'week') {
                                // show each day that has a record
                                show = true;
                                text = p.weekdayWithDay; // e.g. "Mon Jun 1"
                              } else if (timeFilter === 'month') {
                                // show label for the first point of each week
                                show = idx === 0 || p.weekStartKey !== points[idx - 1].weekStartKey;
                                text = p.weekStartLabel; // e.g. "Jun 1"
                              } else {
                                // year: show label for first point of each month
                                show = idx === 0 || p.monthLabel !== points[idx - 1].monthLabel;
                                text = p.monthLabel; // e.g. "Jun"
                              }
                              return show ? (
                                <text x={p.x} y={300 - paddingBottom + 16} fontSize={12} fill="#9ca3af" textAnchor="middle">
                                  {text}
                                </text>
                              ) : null;
                            })()}
                          </g>
                        ))}
                      </g>
                    );
                  })()}
                </svg>
                {/* Tooltip rendered in HTML for easier positioning */}
                {tooltip && (
                  <div className="chart-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
                    <div className="tt-date">{new Date(tooltip.label).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                    <div className="tt-value">{tooltip.value} documents</div>
                  </div>
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
                      <stop offset="0%" stopColor="#EE9B97" />
                      <stop offset="100%" stopColor="#B6367D" />
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
                <p className="score-description">Your content is more inclusive than {getComparisonPercentage(animatedScore)}% of other documents</p>
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
          {/* Recent Analyses Table and Top Bias Words - Side by Side */}
          <div className="bottom-section-wrapper">
            {/* Recent Analyses Table */}
            <div className="recent-analyses-section">
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

            {/* Top Bias Words - Horizontal Bar Chart */}
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
          </div> 
        </div>  
      </div> 
    </div>
  );
};

export default UserDashboard;
