/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState, type FC } from 'react';
import { useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import Sidebar from '../components/Sidebar';
import { analysisService } from '../services/authService';
import * as XLSX from 'xlsx';
import { Download } from 'lucide-react';
import { GENDER_TERM_CATEGORIES, getGenderTermCategoryLabel } from '../utils/genderTermCategories';
import '../styles/Reports.css';

interface AnalysisRow {
  id: number;
  file_name: string;
  file_type: string;
  detected_words: string[];
  detected_term_categories: Record<string, string>;
  approved_replacements_count: number;
  biased_words_found: number;
  fairness_score: number;
  created_at: string;
}

interface BiasWord {
  word: string;
  count: number;
}

type ChartData = {
  month: string;
  value: number;
}[];

const getLocalDateParts = (value: string | Date) => {
  const date = typeof value === 'string' ? new Date(value) : value;
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
};

const getLocalYearMonth = (value: string | Date) => {
  const { year, month } = getLocalDateParts(value);
  return `${year}-${String(month).padStart(2, '0')}`;
};

const getLocalDateKey = (value: string | Date) => {
  const { year, month, day } = getLocalDateParts(value);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const getLocalWeekKey = (value: string | Date) => {
  const { year, month, day } = getLocalDateParts(value);
  const week = Math.ceil(day / 7);
  return `${year}-${String(month).padStart(2, '0')}-W${week}`;
};

const summarizeCategories = (rows: AnalysisRow[]) => {
  const counts = new Map<string, number>(
    GENDER_TERM_CATEGORIES.map(({ value }) => [value, 0])
  );
  rows.forEach((row) => {
    row.detected_words.forEach((word) => {
      const requestedCategory = row.detected_term_categories[word.toLowerCase()];
      const category = counts.has(requestedCategory) ? requestedCategory : 'other';
      counts.set(category, (counts.get(category) || 0) + 1);
    });
  });
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  return GENDER_TERM_CATEGORIES.map(({ value, label }) => ({
    value,
    label,
    count: counts.get(value) || 0,
    percentage: total ? Math.round((counts.get(value) || 0) * 1000 / total) / 10 : 0,
  })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
};

const LineChartSVG: FC<{ data: ChartData }> = ({ data }) => {
  const width = 640;
  const height = 280;
  const padding = 40;
  const max = 100;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const stepX = innerWidth / Math.max(1, data.length - 1);
  const yTicks = [0, 25, 50, 75, 100];

  const getY = (value: number) => padding + (1 - value / max) * innerHeight;
  const points = data.map((d, i) => `${padding + i * stepX},${getY(d.value)}`).join(' ');

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="lineAreaGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.24" />
          <stop offset="100%" stopColor="#f7f5ff" stopOpacity="0.04" />
        </linearGradient>
      </defs>
      <g>
        {yTicks.map((tick) => {
          const y = getY(tick);
          return (
            <g key={`line-grid-${tick}`}>
              <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="rgba(148, 163, 184, 0.14)" strokeDasharray="4 6" />
              <text x={padding - 10} y={y + 4} textAnchor="end" fill="#64748b" fontSize="11">{`${tick}%`}</text>
            </g>
          );
        })}
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#cbd5e1" />
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#cbd5e1" />
      </g>
      <polygon
        points={`${padding},${height - padding} ${points} ${padding + innerWidth},${height - padding}`}
        fill="url(#lineAreaGrad)"
      />
      <polyline points={points} fill="none" stroke="#6d28d9" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      {data.map((d, i) => {
        const x = padding + i * stepX;
        const y = getY(d.value);
        return (
          <g key={d.month}>
            <circle cx={x} cy={y} r={6} fill="#fff" stroke="#6d28d9" strokeWidth={3} />
            <text x={x} y={y - 14} textAnchor="middle" fill="#0f172a" fontSize="12" fontWeight={700}>
              {d.value}%
            </text>
            <text x={x} y={height - padding + 22} textAnchor="middle" fill="#475569" fontSize="12">
              {d.month}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

export default function Reports() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<AnalysisRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string>(getLocalYearMonth(new Date()));
  const [selectedInterval, setSelectedInterval] = useState<'day' | 'week' | 'month'>('week');
  const [downloadMonth, setDownloadMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [downloadWeek, setDownloadWeek] = useState<string>('All');

  const userEmail = (() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        return user.email || 'User';
      } catch {
        return 'User';
      }
    }
    return 'User';
  })();

  const getUserInitials = (): string => {
    const parts = userEmail.split('@')[0].split('.');
    return (parts[0]?.[0] + (parts[1]?.[0] || '')).toUpperCase().slice(0, 2);
  };

  useEffect(() => {
    let mounted = true;
    analysisService.getUserHistory()
      .then((res) => {
        if (!mounted) return;
        const rawResponse = (res as { data?: unknown }).data ?? res;
        const responseData = Array.isArray(rawResponse) ? rawResponse : [];
        const data = responseData.map((item) => {
          const row = item as Record<string, unknown>;
          const detected = Array.isArray(row.detected_words)
            ? row.detected_words
            : typeof row.detected_words === 'string'
            ? (() => {
                try {
                  const parsed = JSON.parse(row.detected_words as string);
                  return Array.isArray(parsed) ? parsed : [];
                } catch {
                  return [];
                }
              })()
            : [];
          const biasedCount = Array.isArray(detected) ? detected.length : 0;
          const fairness = biasedCount ? Math.max(0, 100 - biasedCount * 5) : 100;
          const categoryValue = row.detected_term_categories;
          return {
            id: Number(row.id) || 0,
            file_name: String(row.file_name || 'Text Input'),
            file_type: String(row.file_type || 'text').toLowerCase(),
            detected_words: detected.map((word) => String(word)),
            detected_term_categories: categoryValue && typeof categoryValue === 'object'
              ? categoryValue as Record<string, string>
              : {},
            approved_replacements_count: Number(row.approved_replacements_count) || 0,
            biased_words_found: biasedCount,
            fairness_score: fairness,
            created_at: String(row.created_at || new Date().toISOString()),
          } as AnalysisRow;
        });

        setRows(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load history', err);
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Filter rows by selected month
  const filteredRows = useMemo(() => {
    return rows.filter((row) => getLocalYearMonth(row.created_at) === selectedMonth);
  }, [rows, selectedMonth]);

  const distinctMonths = useMemo(() => {
    const months = new Set(rows.map((row) => getLocalYearMonth(row.created_at)));
    return [...months].sort();
  }, [rows]);

  useEffect(() => {
    if (distinctMonths.length === 0) return;
    if (!distinctMonths.includes(selectedMonth)) {
      setSelectedMonth(distinctMonths[distinctMonths.length - 1]);
    }
  }, [distinctMonths, selectedMonth]);

  const downloadMonthRows = useMemo(
    () => rows.filter((row) => getLocalYearMonth(row.created_at) === downloadMonth),
    [rows, downloadMonth]
  );

  const downloadWeekOptions = useMemo(() => {
    const weeks = new Set(
      downloadMonthRows.map((row) => `W${Math.ceil(getLocalDateParts(row.created_at).day / 7)}`)
    );
    return ['All', ...[...weeks].sort((a, b) => a.localeCompare(b))];
  }, [downloadMonthRows]);

  const downloadRows = useMemo(() => {
    if (downloadWeek === 'All') {
      return downloadMonthRows;
    }
    return downloadMonthRows.filter((row) => {
      const week = `W${Math.ceil(getLocalDateParts(row.created_at).day / 7)}`;
      return week === downloadWeek;
    });
  }, [downloadMonthRows, downloadWeek]);

  const performanceView = selectedInterval;

  const handleDownloadAll = () => {
    // Export the currently selected download scope to Excel
    const sheetData = downloadRows.map((row) => ({
      'File Name': row.file_name,
      'File Type': row.file_type.toUpperCase(),
      'Biased Words Found': row.biased_words_found,
      'Detected Terms': row.detected_words.join(', '),
      'Detected Categories': [...new Set(row.detected_words.map((word) =>
        getGenderTermCategoryLabel(row.detected_term_categories[word.toLowerCase()])
      ))].join(', '),
      'Approved Replacements': row.approved_replacements_count,
      'Fairness Score': `${row.fairness_score}%`,
      'Created At': new Date(row.created_at).toLocaleString(),
    }));

    if (sheetData.length === 0) {
      alert('No data available for the selected download filters');
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(sheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Report Data');
    const categorySheet = XLSX.utils.json_to_sheet(summarizeCategories(downloadRows).map((item) => ({
      Category: item.label,
      'Detected Terms': item.count,
      'Share of Detected Terms': `${item.percentage}%`,
    })));
    XLSX.utils.book_append_sheet(workbook, categorySheet, 'Category Breakdown');
    const fileWeekSuffix = downloadWeek === 'All' ? 'all-weeks' : downloadWeek.toLowerCase();
    XLSX.writeFile(workbook, `gender_fair_report_${downloadMonth}_${fileWeekSuffix}.xlsx`);
  };


  const summary = useMemo(() => {
    const totalDocuments = filteredRows.length;
    const totalBiasWords = filteredRows.reduce((sum, row) => sum + row.biased_words_found, 0);
    const totalReplacements = filteredRows.reduce((sum, row) => sum + row.approved_replacements_count, 0);
    const averageFairness = totalDocuments ? Math.round(filteredRows.reduce((sum, row) => sum + row.fairness_score, 0) / totalDocuments) : 0;
    return { totalDocuments, totalBiasWords, totalReplacements, averageFairness };
  }, [filteredRows]);

  const groupedWords = useMemo(() => {
    const words: Record<string, BiasWord> = {};
    filteredRows.forEach((row) => {
      row.detected_words.forEach((word) => {
        const key = word.toLowerCase();
        if (!words[key]) {
          words[key] = { word, count: 0 };
        }
        words[key].count += 1;
      });
    });
    const sorted = Object.values(words).sort((a, b) => b.count - a.count);
    return sorted.slice(0, 5);
  }, [filteredRows]);

  const categorySummary = useMemo(() => summarizeCategories(filteredRows), [filteredRows]);

  const bestDocuments = useMemo(
    () => [...filteredRows].sort((a, b) => b.fairness_score - a.fairness_score).slice(0, 5),
    [filteredRows]
  );

  const lowestDocuments = useMemo(
    () => [...filteredRows].sort((a, b) => a.fairness_score - b.fairness_score).slice(0, 5),
    [filteredRows]
  );

  const monthlyPerformance = useMemo(() => {
    const performanceMap: Record<string, { label: string; dateKey: string; count: number; totalScore: number }> = {};

    filteredRows.forEach((row) => {
      const date = new Date(row.created_at);
      const week = Math.ceil(date.getDate() / 7);
      const { key, label } = performanceView === 'day'
        ? {
            key: getLocalDateKey(date),
            label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          }
        : performanceView === 'week'
        ? {
            key: getLocalWeekKey(date),
            label: `W${week}`,
          }
        : {
            key: getLocalYearMonth(date),
            label: date.toLocaleDateString('en-US', { month: 'short' }),
          };

      if (!performanceMap[key]) {
        performanceMap[key] = { label, dateKey: key, count: 0, totalScore: 0 };
      }
      performanceMap[key].count++;
      performanceMap[key].totalScore += row.fairness_score;
    });

    const result = Object.values(performanceMap)
      .map((data) => ({
        month: data.label,
        value: data.count > 0 ? Math.round(data.totalScore / data.count) : 0,
        dateKey: data.dateKey,
      }))
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

    if (result.length === 0) {
      if (performanceView === 'week') {
        return Array.from({ length: 4 }, (_, i) => ({ month: `W${i + 1}`, value: 0, dateKey: `0000-W${i + 1}` }));
      }
      if (performanceView === 'day') {
        return Array.from({ length: 7 }, (_, i) => ({ month: `Day ${i + 1}`, value: 0, dateKey: `0000-00-${(i + 1).toString().padStart(2, '0')}` }));
      }
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return months.map((m, idx) => ({ month: m, value: 0, dateKey: `0000-${(idx + 1).toString().padStart(2, '0')}` }));
    }

    return result;
  }, [filteredRows, performanceView]);

  const topCategory = categorySummary.find((item) => item.count > 0) || null;

  // Pie chart removed per request

  if (loading) {
    return (
      <div>
        <Navigation userEmail={userEmail} userInitials={getUserInitials()} onLogout={() => { localStorage.clear(); navigate('/login'); }} />
        <div className="dashboard-body">
          <Sidebar onLogout={() => { localStorage.clear(); navigate('/login'); }} />
          <div className="sidebar-placeholder" />
          <div className="dashboard-content loading">
            <p>Loading reports...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Navigation userEmail={userEmail} userInitials={getUserInitials()} onLogout={() => { localStorage.clear(); navigate('/login'); }} />
      <div className="dashboard-body reports-page">
        <Sidebar onLogout={() => { localStorage.clear(); navigate('/login'); }} />
        <div className="sidebar-placeholder" />
        <div className="dashboard-content reports-content">
          <section className="reports-hero">
            <div>
              <div className="reports-hero-title">
                <div>
                  <h1>Reports</h1>
                  <p>Detailed analytics and insights from your language analysis.</p>
                </div>
              </div>
            </div>
            <div className="reports-hero-actions">
              <div className="hero-filters">
                <div className="filter-field">
                  <label>Filter month</label>
                  <select value={downloadMonth} onChange={(e) => { setDownloadMonth(e.target.value); setDownloadWeek('All'); }}>
                    {distinctMonths.map((month) => (
                      <option key={month} value={month}>
                        {new Date(`${month}-01`).toLocaleString('default', { month: 'long', year: 'numeric' })}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="filter-field">
                  <label>Filter week</label>
                  <select value={downloadWeek} onChange={(e) => setDownloadWeek(e.target.value)}>
                    {downloadWeekOptions.map((week) => (
                      <option key={week} value={week}>
                        {week}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button className="reports-action-btn export-excel" onClick={() => handleDownloadAll()}>
                <Download size={16} /> Export Excel
              </button>
            </div>
          </section>

          <div className="reports-grid">
            <div className="reports-main">
              <section className="summary-card dashboard lightblue interactive-card">
                <div className="stat-card-top">
                  <div>
                    <p>Monthly Language Summary</p>
                    <h2>{new Date(selectedMonth + '-01').toLocaleString('default', { month: 'long', year: 'numeric' })}</h2>
                  </div>
                  <div className="summary-filter summary-card-dropdown">
                    <label htmlFor="summaryMonth">Filter month</label>
                    <select id="summaryMonth" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
                      {distinctMonths.map((month) => (
                        <option key={month} value={month}>
                          {new Date(`${month}-01`).toLocaleString('default', { month: 'long', year: 'numeric' })}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="stat-card-body">
                  <div className="summary-metrics">
                    <div className="metric-box">
                      <span>Documents Analyzed</span>
                      <strong>{summary.totalDocuments}</strong>
                    </div>
                    <div className="metric-box">
                      <span>Bias Words Detected</span>
                      <strong>{summary.totalBiasWords}</strong>
                    </div>
                    <div className="metric-box">
                      <span>Replacements Made</span>
                      <strong>{summary.totalReplacements}</strong>
                    </div>
                    <div className="metric-box">
                      <span>Average Fairness Score</span>
                      <strong>{summary.averageFairness}%</strong>
                    </div>
                  </div>
                </div>
                <div className="stat-card-wave" />
              </section>

              <section className="charts-row">
                <div className="chart-card trend-card full-width-card">
                  <div className="chart-card-header">
                    <div>
                      <p>Fairness Score Over Time</p>
                      <h3>{performanceView === 'week' ? 'By week' : performanceView === 'day' ? 'By day' : 'By month'}</h3>
                    </div>
                    <div className="interval-picker">
                      <button type="button" className={`interval-button ${selectedInterval === 'day' ? 'active' : ''}`} onClick={() => setSelectedInterval('day')}>
                        Day
                      </button>
                      <button type="button" className={`interval-button ${selectedInterval === 'week' ? 'active' : ''}`} onClick={() => setSelectedInterval('week')}>
                        Week
                      </button>
                    </div>
                  </div>
                  <div className="line-chart performance-vis">
                    <LineChartSVG data={monthlyPerformance} />
                  </div>
                </div>
              </section>
            </div>

            <aside className="reports-sidebar">
              <div className="insights-card">
                <div className="card-header">
                  <p>Key Insights</p>
                </div>
                {(() => {
                  const top = groupedWords[0] || null;
                  
                  return (
                    <>
                      <div className="insight-row">
                        <div>
                          <span>Most Detected Word</span>
                          <strong>{top ? top.word : '—'}</strong>
                        </div>
                        <span>{top ? `${top.count}x` : '—'}</span>
                      </div>
                      <div className="insight-row">
                        <div>
                          <span>Most Frequent Category</span>
                          <strong>{topCategory?.label || '—'}</strong>
                        </div>
                        <span>{topCategory ? `${topCategory.count}x` : '—'}</span>
                      </div>
                    </>
                  );
                })()}
                <div className="insight-row">
                  <div>
                    <span>Highest Fairness Score</span>
                    <strong>{bestDocuments[0]?.fairness_score || '—'}%</strong>
                  </div>
                  <span>{bestDocuments[0]?.file_name || '—'}</span>
                </div>
                <div className="insight-row">
                  <div>
                    <span>Lowest Fairness Score</span>
                    <strong>{lowestDocuments[0]?.fairness_score || '—'}%</strong>
                  </div>
                  <span>{lowestDocuments[0]?.file_name || '—'}</span>
                </div>
                <div className="insight-row">
                  <div>
                    <span>Documents This Month</span>
                    <strong>{filteredRows.length}</strong>
                  </div>
                </div>
                <div className="insight-row last">
                  <div>
                    <span>Avg Fairness Score</span>
                    <strong>{summary.averageFairness}%</strong>
                  </div>
                </div>
              </div>
            </aside>
          </div>

          <section className="category-analytics-card">
            <div className="category-analytics-header">
              <div>
                <p>Term Classification</p>
                <h2>Detected Terms by Category</h2>
                <span>Based on saved analyses for {new Date(`${selectedMonth}-01`).toLocaleString('default', { month: 'long', year: 'numeric' })}.</span>
              </div>
              <div className="category-total">
                <span>Total detected terms</span>
                <strong>{summary.totalBiasWords}</strong>
              </div>
            </div>
            <div className="category-breakdown">
              {categorySummary.map((item) => (
                <div className="category-breakdown-row" key={item.value}>
                  <div className="category-breakdown-label">
                    <span>{item.label}</span>
                    <strong>{item.count} <small>({item.percentage}%)</small></strong>
                  </div>
                  <div
                    className="category-breakdown-track"
                    role="progressbar"
                    aria-label={`${item.label}: ${item.count} detected terms`}
                    aria-valuemin={0}
                    aria-valuemax={Math.max(1, summary.totalBiasWords)}
                    aria-valuenow={item.count}
                  >
                    <div className="category-breakdown-fill" style={{ width: `${item.percentage}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <p className="category-analytics-note">
              Categories describe detected terms only. They are not document-level gender-responsiveness assessments.
            </p>
          </section>

          <div className="summary-row">
            <div className="report-block docs-block">
              <div className="block-header">
                <div>
                  <p>Best Performing Documents</p>
                </div>
              </div>
              <div className="doc-list">
                {bestDocuments.map((doc) => (
                  <div key={doc.id} className="doc-item">
                    <div>
                      <strong>{doc.file_name}</strong>
                      <p>{new Date(doc.created_at).toLocaleDateString()}</p>
                    </div>
                    <span className="tag success">{doc.fairness_score}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="report-block docs-block">
              <div className="block-header">
                <div>
                  <p className="">Lowest Scoring Documents</p>
                </div>
              </div>
              <div className="doc-list">
                {lowestDocuments.map((doc) => (
                  <div key={doc.id} className="doc-item">
                    <div>
                      <strong>{doc.file_name}</strong>
                      <p>{new Date(doc.created_at).toLocaleDateString()}</p>
                    </div>
                    <span className="tag danger">{doc.fairness_score}%</span>
                  </div>
                ))}
              </div>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
}
