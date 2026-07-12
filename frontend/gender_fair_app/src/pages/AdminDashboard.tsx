/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo, Fragment, useRef, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Settings, Users, TrendingUp } from 'lucide-react';
import { adminService, authService } from '../services/authService';
import Navigation from '../components/Navigation';
import '../styles/UserDashboard.css';

interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role?: string;
  profile?: { role?: string };
  documents_count?: number;
  last_processed_at?: string | null;
  last_document_name?: string | null;
  last_document_type?: string | null;
  last_document_fairness_score?: number | null;
}

interface Mapping {
  id: number;
  biased_word: string;
  fair_word: string;
}

interface AnalyticsData {
  total_documents: number;
  total_users: number;
  total_biased_words_detected: number;
  total_analyses: number;
  average_fairness_score: number;
  active_users_last_30_days: number;
  documents_over_time: Array<{ date: string; count: number }>;
  fairness_score_trend: Array<{ date: string; score: number }>;
  document_type_breakdown: Array<{ type: string; count: number }>;
  bias_categories_distribution: Array<{ category: string; count: number }>;
  most_common_biased_words: Record<string, number>;
  support_summary: { total_messages: number; today: number; unresolved: number };
}

interface SupportMessage {
  id: number;
  user_email: string;
  user_name: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  created_at: string;
  is_resolved: boolean;
}

type AdminTab = 'analytics' | 'users' | 'dataset' | 'support';

const chartMargins = { top: 20, right: 20, bottom: 40, left: 42 };
const lineChartMargins = { top: 14, right: 8, bottom: 24, left: 10 };
const barChartMargins = { top: 16, right: 16, bottom: 8, left: 40 };

const buildLinePath = (
  data: Array<{ date: string; count: number }>,
  width: number,
  height: number,
  margins = chartMargins
) => {
  if (!data || data.length === 0) {
    return `M${margins.left} ${height - margins.bottom}`;
  }

  const innerWidth = width - margins.left - margins.right;
  const innerHeight = height - margins.top - margins.bottom;
  const maxCount = Math.max(...data.map((point) => point.count), 1);
  const step = innerWidth / Math.max(data.length - 1, 1);

  return data
    .map((point, index) => {
      const x = margins.left + index * step;
      const y = margins.top + innerHeight - (point.count / maxCount) * innerHeight;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
};

const getPointCoords = (
  data: Array<{ date: string; count: number }>,
  index: number,
  width: number,
  height: number,
  margins = chartMargins
) => {
  const innerWidth = width - margins.left - margins.right;
  const innerHeight = height - margins.top - margins.bottom;
  const maxCount = Math.max(...data.map((point) => point.count), 1);
  const step = innerWidth / Math.max(data.length - 1, 1);
  const x = margins.left + index * step;
  const y = margins.top + innerHeight - (data[index].count / maxCount) * innerHeight;
  return { x, y };
};

const chartColors = ['#6366f1', '#22c55e', '#fb7185', '#f59e0b', '#14b8a6', '#a855f7', '#f43f5e'];

const buildPieSegments = (
  items: Array<{ label: string; value: number }>,
  radius: number,
  innerRadius = 0,
  center = 110
) => {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  let currentAngle = -Math.PI / 2;

  return items.map((item, index) => {
    const sliceAngle = total > 0 ? (item.value / total) * Math.PI * 2 : 0;
    const nextAngle = currentAngle + sliceAngle;
    const x1 = center + radius * Math.cos(currentAngle);
    const y1 = center + radius * Math.sin(currentAngle);
    const x2 = center + radius * Math.cos(nextAngle);
    const y2 = center + radius * Math.sin(nextAngle);
    const largeArcFlag = sliceAngle > Math.PI ? 1 : 0;
    const outerArc = `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2.toFixed(4)} ${y2.toFixed(4)}`;

    let path = `M ${center} ${center} L ${x1.toFixed(4)} ${y1.toFixed(4)} ${outerArc} Z`;
    if (innerRadius > 0) {
      const innerX2 = center + innerRadius * Math.cos(nextAngle);
      const innerY2 = center + innerRadius * Math.sin(nextAngle);
      const innerX1 = center + innerRadius * Math.cos(currentAngle);
      const innerY1 = center + innerRadius * Math.sin(currentAngle);
      const innerArc = `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerX1.toFixed(4)} ${innerY1.toFixed(4)}`;
      path = `M ${x1.toFixed(4)} ${y1.toFixed(4)} ${outerArc} L ${innerX2.toFixed(4)} ${innerY2.toFixed(4)} ${innerArc} Z`;
    }

    const segment = {
      label: item.label,
      value: item.value,
      path,
      color: chartColors[index % chartColors.length],
      percentage: total > 0 ? (item.value / total) * 100 : 0,
    };
    currentAngle = nextAngle;
    return segment;
  });
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<AdminTab>('analytics');
  const tabs: Array<{ id: AdminTab; label: string; icon: typeof Users }> = [
    { id: 'analytics', label: 'Analytics', icon: TrendingUp },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'dataset', label: 'Dataset', icon: Settings },
    { id: 'support', label: 'Support', icon: FileText },
  ];
  const [users, setUsers] = useState<User[]>([]);
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [supportPage, setSupportPage] = useState(1);
  const [datasetPage, setDatasetPage] = useState(1);
  const [expandedSupportIds, setExpandedSupportIds] = useState<number[]>([]);
  const usersPerPage = 20;
  const supportMessagesPerPage = 10;
  const datasetPerPage = 20;

  const [showAddModal, setShowAddModal] = useState(false);
  const [newBiasedWord, setNewBiasedWord] = useState('');
  const [newFairWord, setNewFairWord] = useState('');
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateMessage, setDuplicateMessage] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported_rows: number;
    added_rows: number;
    updated_rows: number;
    changed: boolean;
  } | null>(null);
  const [fileValidationError, setFileValidationError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [lineTooltip, setLineTooltip] = useState<{ label: string; value: number } | null>(null);
  const lineChartRef = useRef<HTMLDivElement | null>(null);

  const handleLineHover = (point: { date: string; count: number }, coords: { x: number; y: number }) => {
    if (!lineChartRef.current) return;
    const rect = lineChartRef.current.getBoundingClientRect();
    const scaleX = rect.width / 700;
    const scaleY = rect.height / 260;
    const left = Math.min(rect.width - 120, Math.max(8, coords.x * scaleX - 44));
    const top = Math.max(8, coords.y * scaleY - 40);
    lineChartRef.current.style.setProperty('--tooltip-left', `${left}px`);
    lineChartRef.current.style.setProperty('--tooltip-top', `${top}px`);
    setLineTooltip({
      label: new Date(point.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      value: point.count,
    });
  };

  const user = authService.getUser();
  const userEmail = user?.email || 'Admin';

  const loadTabData = async () => {
    setLoading(true);
    setError('');
    try {
      switch (activeTab) {
        case 'analytics': {
          const analyticsRes = await adminService.getAnalytics();
          setAnalytics(analyticsRes.data);
          break;
        }
        case 'users': {
          const usersRes = await adminService.getAllUsers();
          setUsers(usersRes.data);
          break;
        }
        case 'support': {
          const supportRes = await adminService.getSupportMessages();
          setSupportMessages(supportRes.data);
          setSupportPage(1);
          setExpandedSupportIds([]);
          break;
        }
        case 'dataset': {
          const datasetRes = await adminService.getDataset(searchTerm);
          setMappings(datasetRes.data);
          setDatasetPage(1);
          break;
        }
      }
    } catch (err: any) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleImportFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setFileValidationError('');
    setImportResult(null);

    if (!file) {
      setImportFile(null);
      return;
    }

    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !['xls', 'xlsx'].includes(extension)) {
      setFileValidationError('Please select a .xls or .xlsx file.');
      setImportFile(null);
      event.target.value = '';
      return;
    }

    setImportFile(file);
  };

  const handleDeleteMapping = async (mappingId: number) => {
    if (!window.confirm('Delete this dataset mapping?')) return;

    try {
      await adminService.deleteDatasetMapping(mappingId);
      setMappings((prev) => prev.filter((mapping) => mapping.id !== mappingId));
      setSuccessMessage('Mapping deleted successfully.');
      setError('');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to delete mapping.');
    }
  };

  const handleImportDataset = async () => {
    setError('');
    setSuccessMessage('');
    setImportResult(null);

    if (!importFile) {
      setFileValidationError('Please choose an .xls or .xlsx file to import.');
      return;
    }

    setFileValidationError('');
    setImportLoading(true);

    try {
      const res = await adminService.importDatasetFile(importFile);
      const data = res.data;
      setImportResult({
        imported_rows: data.imported_rows || 0,
        added_rows: data.added_rows || 0,
        updated_rows: data.updated_rows || 0,
        changed: data.changed ?? false,
      });
      setSuccessMessage('Dataset import completed successfully.');
      window.setTimeout(() => {
        setSuccessMessage('');
      }, 4000);
      setImportFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      await loadTabData();
    } catch (err: any) {
      const message = err?.response?.data?.error || 'Import failed. Please check the file and try again.';
      setError(message);
    } finally {
      setImportLoading(false);
    }
  };

  useEffect(() => {
    if (!authService.isAuthenticated() || user?.profile?.role !== 'admin') {
      navigate('/login');
    }
  }, [navigate, user]);

  useEffect(() => {
    if (!authService.isAuthenticated() || user?.profile?.role !== 'admin') {
      return;
    }

    const fetchData = async () => {
      await loadTabData();
    };

    void fetchData();

    if (activeTab === 'analytics') {
      const intervalId = window.setInterval(() => {
        void fetchData();
      }, 15000);

      const handleFocus = () => {
        void fetchData();
      };

      window.addEventListener('focus', handleFocus);
      return () => {
        window.clearInterval(intervalId);
        window.removeEventListener('focus', handleFocus);
      };
    }
  }, [activeTab, user?.profile?.role]);

  const handleLogout = () => {
    authService.logout();
    navigate('/login');
  };

  const getUserInitials = (): string => {
    const parts = userEmail.split('@')[0].split('.');
    return (parts[0]?.[0] + (parts[1]?.[0] || '')).toUpperCase().slice(0, 2);
  };

  const overtimeLineData = analytics?.documents_over_time || [];
  const overtimeMaxCount = Math.max(...overtimeLineData.map((point) => point.count), 1);
  const overtimeLabelInterval = Math.max(1, Math.ceil(overtimeLineData.length / 5));
  const overtimeAxisSteps = [0, 1, 2, 3, 4];
  const overtimeAxisValues = overtimeAxisSteps.map((step) => Math.round(overtimeMaxCount - (overtimeMaxCount / 4) * step));
  const overtimeInnerHeight = 260 - lineChartMargins.top - lineChartMargins.bottom;

  const filteredMappings = useMemo(
    () =>
      mappings.filter((mapping) =>
        mapping.biased_word.toLowerCase().includes(searchTerm.toLowerCase()) ||
        mapping.fair_word.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [mappings, searchTerm]
  );

  const datasetStart = (datasetPage - 1) * datasetPerPage;
  const datasetEnd = Math.min(datasetStart + datasetPerPage, filteredMappings.length);
  const pagedMappings = filteredMappings.slice(datasetStart, datasetStart + datasetPerPage);
  const datasetPageCount = Math.max(1, Math.ceil(filteredMappings.length / datasetPerPage));

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation userEmail={userEmail} userInitials={getUserInitials()} onLogout={handleLogout} />
      <div className="relative min-h-[calc(100vh-70px)] pt-24">
        <aside className="fixed left-0 top-[70px] h-[calc(100vh-70px)] w-72 overflow-y-auto border-r border-slate-200 bg-slate-900 p-4 text-white shadow-2xl">
          <div className="mb-6 border-b border-white/10 pb-4">
            <h2 className="mt-2 text-xl font-semibold text-white">Admin Dashboard</h2>
          </div>
          <nav className="space-y-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    if (tab.id === 'users') {
                      setCurrentPage(1);
                    }
                    if (tab.id === 'support') {
                      setSupportPage(1);
                      setExpandedSupportIds([]);
                    }
                    if (tab.id === 'dataset') {
                      setDatasetPage(1);
                    }
                    setSuccessMessage('');
                  }}
                  className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                    activeTab === tab.id
                      ? 'bg-purple-600 text-white shadow-lg shadow-purple-950/20'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon size={18} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="w-full max-w-full overflow-x-hidden px-4 pb-8 sm:px-6 lg:ml-72 lg:w-[calc(100%-18rem)] lg:px-8 lg:pr-6">
          {error && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-600">
              {error}
            </div>
          )}
          {successMessage && (
            <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">
              {successMessage}
            </div>
          )}

          {loading && <p className="py-8 text-center text-gray-500">Loading...</p>}

            {/* Analytics Tab */}
          {activeTab === 'analytics' && analytics && !loading && (
            <> 
            <div className="mb-6 pr-2">
              <h1 className="m-0 text-2xl font-bold text-purple-700">Admin Dashboard</h1>
            </div>
            <div className="grid-stats-5col"> 
              
              <div className="stat-card dashboard lightblue">
                <div className="stat-card-top">
                  <div className="stat-card-icon"><Users size={22} /></div>
                </div>
                <div className="stat-card-body">
                  <div className="stat-number">{analytics.total_users}</div>
                  <div className="stat-title">Total Users</div>
                  <p className="stat-caption">All registered users in the system</p>
                </div>
                <div className="stat-card-wave" />
              </div>
              <div className="stat-card dashboard lightblue">
                <div className="stat-card-top">
                  <div className="stat-card-icon"><FileText size={22} /></div>
                </div>
                <div className="stat-card-body">
                  <div className="stat-number">{analytics.total_documents}</div>
                  <div className="stat-title">Documents Processed</div>
                  <p className="stat-caption">Uploaded or text documents</p>
                </div>
                <div className="stat-card-wave" />
              </div>
              <div className="stat-card dashboard lightblue">
                <div className="stat-card-top">
                  <div className="stat-card-icon"><Settings size={22} /></div>
                </div>
                <div className="stat-card-body">
                  <div className="stat-number">{analytics.total_biased_words_detected}</div>
                  <div className="stat-title">Bias Words Detected</div>
                  <p className="stat-caption">Across all documents</p>
                </div>
                <div className="stat-card-wave" />
              </div>
              <div className="stat-card dashboard lightblue">
                <div className="stat-card-top">
                  <div className="stat-card-icon"><TrendingUp size={22} /></div>
                </div>
                <div className="stat-card-body">
                  <div className="stat-number">{analytics.average_fairness_score}%</div>
                  <div className="stat-title">Avg. Fairness Score</div>
                  <p className="stat-caption">Average over time</p>
                </div>
                <div className="stat-card-wave" />
              </div>
              <div className="stat-card dashboard lightblue">
                <div className="stat-card-top">
                  <div className="stat-card-icon">📊</div>
                </div>
                <div className="stat-card-body">
                  <div className="stat-number">{analytics.active_users_last_30_days}</div>
                  <div className="stat-title">Active Users (30d)</div>
                  <p className="stat-caption">Users who analyzed content</p>
                </div>
                <div className="stat-card-wave" />
              </div>
            </div>


            <div className="grid-charts-70-30">
              <div className="card-lightblue rounded-2xl shadow border border-slate-200 overflow-hidden">
                <div className="px-6 py-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-sm text-slate-500 uppercase tracking-[0.2em]">Analyses Over Time</p>
                      <h2 className="text-xl font-semibold text-slate-900">Last 30 Days</h2>
                    </div>
                    <span className="text-xs text-slate-500">Daily cumulative</span>
                  </div>
                </div>
                <div className="h-64 w-full relative py-4" ref={lineChartRef}>
                  <svg viewBox="0 0 700 260" className="w-full h-full">
                    <defs>
                      <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#7c3aed" />
                        <stop offset="100%" stopColor="#22d3ee" />
                      </linearGradient>
                    </defs>
                    <rect x="0" y="0" width="700" height="260" rx="24" fill="#f8fafc" />
                    <line x1={lineChartMargins.left} y1={lineChartMargins.top} x2={lineChartMargins.left} y2={260 - lineChartMargins.bottom} stroke="#c7d2fe" strokeWidth="1" />
                    {overtimeAxisSteps.map((row) => {
                      const y = lineChartMargins.top + (overtimeInnerHeight / 4) * row;
                      return (
                        <g key={row}>
                          <line x1={lineChartMargins.left} y1={y} x2={700 - lineChartMargins.right} y2={y} stroke="#e2e8f0" strokeWidth="1" />
                          <text x={lineChartMargins.left - 6} y={y + 4} textAnchor="end" className="text-[10px] fill-slate-500">
                            {overtimeAxisValues[row]}
                          </text>
                        </g>
                      );
                    })}
                    {analytics.documents_over_time.map((point, index) => {
                      const label = new Date(point.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                      const coords = getPointCoords(analytics.documents_over_time, index, 700, 260, lineChartMargins);
                      return (
                        <g key={point.date}>
                          <line x1={coords.x} y1={coords.y} x2={coords.x} y2={260 - lineChartMargins.bottom + 4} stroke="#c7d2fe" strokeWidth="1" opacity="0.12" />
                          <circle
                            cx={coords.x}
                            cy={coords.y}
                            r="5"
                            fill="#7c3aed"
                            stroke="#ffffff"
                            strokeWidth="2"
                            className="cursor-pointer"
                            onMouseEnter={() => handleLineHover(point, coords)}
                            onMouseLeave={() => setLineTooltip(null)}
                          >
                            <title>{`${label}: ${point.count}`}</title>
                          </circle>
                          <text x={coords.x} y={coords.y - 12} textAnchor="middle" className="text-[11px] font-semibold" fill="#0f172a">
                            {point.count}
                          </text>
                          {(index % overtimeLabelInterval === 0 || index === analytics.documents_over_time.length - 1) && (
                            <text x={coords.x} y={260 - lineChartMargins.bottom + 16} textAnchor="middle" className="text-[10px] fill-slate-500">
                              {label}
                            </text>
                          )}
                        </g>
                      );
                    })}
                    <path
                      d={buildLinePath(analytics.documents_over_time, 700, 260, lineChartMargins)}
                      fill="none"
                      stroke="url(#lineGradient)"
                      strokeWidth="4"
                      strokeLinecap="round"
                    />
                    <text x="20" y="30" className="text-xs font-semibold text-slate-500">
                      Documents
                    </text>
                    <text x="20" y={260 - lineChartMargins.bottom + 16} className="text-xs text-slate-500">
                      0
                    </text>
                  </svg>
                  {lineTooltip && (
                    <div className="pointer-events-none absolute z-10 rounded-2xl border border-slate-200 bg-slate-950/95 px-3 py-2 text-left text-xs text-white shadow-xl chart-tooltip">
                      <div className="font-semibold">{lineTooltip.label}</div>
                      <div className="mt-1 text-[11px] text-slate-300">Documents: {lineTooltip.value}</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="card-lightblue rounded-2xl shadow p-6 border border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm text-slate-500 uppercase tracking-[0.2em] font-semibold">Fairness Trend</p>
                    <h2 className="text-xl font-semibold text-slate-900">Weekly Score</h2>
                  </div>
                  <span className="text-xs text-slate-500">Last 5 Days</span>
                </div>
                <div className="h-56 w-full">
                  <svg viewBox="0 0 620 280" className="w-full h-full">
                    <defs>
                      <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7c3aed" />
                        <stop offset="100%" stopColor="#818cf8" />
                      </linearGradient>
                      <linearGradient id="barGlow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(124,58,237,0.35)" />
                        <stop offset="100%" stopColor="rgba(124,58,237,0)" />
                      </linearGradient>
                    </defs>
                    <rect x="0" y="0" width="620" height="280" rx="24" fill="#f8fafc" />
                    {[0, 1, 2, 3, 4].map((row) => {
                      const y = barChartMargins.top + ((280 - barChartMargins.top - barChartMargins.bottom) / 4) * row;
                      return (
                        <g key={row}>
                          <line x1={barChartMargins.left} y1={y} x2={620 - barChartMargins.right} y2={y} stroke="#e2e8f0" strokeWidth="1" />
                          <text x="18" y={y + 4} textAnchor="end" className="text-[10px] fill-slate-500">
                            {Math.round((100 - row * 25)).toString()}%
                          </text>
                        </g>
                      );
                    })}
                    {analytics.fairness_score_trend.slice(-5).map((point, index, all) => {
                      const barInnerWidth = 620 - barChartMargins.left - barChartMargins.right;
                      const barWidth = barInnerWidth / all.length;
                      const x = barChartMargins.left + index * barWidth;
                      const barInnerHeight = 280 - barChartMargins.top - barChartMargins.bottom;
                      const height = Math.max(12, (point.score / 100) * barInnerHeight);
                      const y = barChartMargins.top + barInnerHeight - height;
                      const label = new Date(point.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

                      return (
                        <g key={point.date}>
                          <rect x={x + 8} y={y} width={barWidth - 16} height={height} rx="14" fill="url(#barGradient)" />
                          <rect x={x + 8} y={y} width={barWidth - 16} height={Math.max(12, height * 0.25)} rx="14" fill="url(#barGlow)" />
                          <text x={x + barWidth / 2} y={y - 8} textAnchor="middle" className="text-[11px] font-semibold" fill="#111827">
                            {point.score}%
                          </text>
                          <text x={x + barWidth / 2} y={280 - barChartMargins.bottom + 10} textAnchor="middle" className="text-[10px] text-slate-500">
                            {label}
                          </text>
                        </g>
                      );
                    })}
                    <text x="40" y="20" className="text-xs font-semibold text-slate-500">
                      Fairness
                    </text>
                    <text x="40" y="278" className="text-[10px] text-slate-500">
                      Score
                    </text>
                  </svg>
                </div>
              </div>
            </div>

            <div className="grid xl:grid-cols-3 gap-4 mb-8">
              <div className="card-lightblue rounded-2xl shadow p-6 border border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm text-slate-500 uppercase tracking-[0.2em]">Bias Categories</p>
                    <h2 className="text-xl font-semibold text-slate-900">Distribution</h2>
                  </div>
                  <span className="text-xs text-slate-500">Live data</span>
                </div>
                <div className="flex flex-col xl:flex-row items-center gap-6">
                  <div className="mx-auto w-full max-w-[300px]">
                    <svg viewBox="0 0 200 200" className="h-full w-full">
                      {buildPieSegments(
                        analytics.bias_categories_distribution.map((item) => ({ label: item.category, value: item.count })),
                        90,
                        20,
                        110
                      ).map((segment) => (
                        <path key={segment.label} d={segment.path} fill={segment.color} />
                      ))}
                    </svg>
                  </div>
                  <div className="w-full space-y-3">
                    {buildPieSegments(
                      analytics.bias_categories_distribution.map((item) => ({ label: item.category, value: item.count })),
                      90,
                      0,
                      110
                    ).map((segment) => (
                      <div key={segment.label} className="flex items-center justify-between gap-4 rounded-2xl bg-slate-300 px-1 py-1">
                        <div className="flex items-center gap-3">
                          <svg className="h-3 w-3" viewBox="0 0 6 6" aria-hidden="true">
                            <circle cx="3" cy="3" r="3" fill={segment.color} />
                          </svg>
                          <span className="text-sm text-slate-700">{segment.label}</span>
                        </div>
                        <span className="text-sm font-semibold text-slate-900">{segment.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="card-lightblue rounded-2xl shadow p-6 border border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm text-slate-500 uppercase tracking-[0.2em]">Document Types</p>
                    <h2 className="text-xl font-semibold text-slate-900">Composition</h2>
                  </div>
                  <span className="text-xs text-slate-500">Live data</span>
                </div>
                <div className="flex flex-col xl:flex-row items-center gap-6">
                  <div className="relative mx-auto w-full max-w-[300px]">
                    <svg viewBox="0 0 220 220" className="h-full w-full">
                      {buildPieSegments(
                        analytics.document_type_breakdown
                          .filter((item) => item.type?.toLowerCase() !== 'other')
                          .map((item) => ({ label: item.type, value: item.count })),
                        90,
                        50,
                        110
                      ).map((segment) => (
                        <path key={segment.label} d={segment.path} fill={segment.color} />
                      ))}
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="text-center">
                        <p className="text-xs text-slate-500 uppercase tracking-[0.2em]">Total</p>
                        <p className="text-xl font-semibold text-slate-900">
                          {analytics.document_type_breakdown
                            .filter((item) => item.type?.toLowerCase() !== 'other')
                            .reduce((sum, item) => sum + item.count, 0)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="w-full space-y-3">
                      {buildPieSegments(
                        analytics.document_type_breakdown
                          .filter((item) => item.type?.toLowerCase() !== 'other')
                          .map((item) => ({ label: item.type, value: item.count })),
                        90,
                        50,
                        110
                      ).map((segment) => (
                        <div key={segment.label} className="flex items-center justify-between gap-4 rounded-2xl bg-slate-300 px-2 py-1">
                          <div className="flex items-center gap-3">
                            <svg className="h-5 w-5" viewBox="0 0 8 8" aria-hidden="true">
                              <circle cx="5" cy="5" r="5" fill={segment.color} />
                            </svg>
                            <span className="text-sm text-slate-700">{segment.label}</span>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold text-slate-900">{segment.value}</div>
                            <div className="text-xs text-slate-500">{segment.percentage.toFixed(0)}%</div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div> 

              <div className="card-lightblue rounded-2xl shadow p-6 border border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm text-slate-500 uppercase tracking-[0.2em]">Top Bias Words</p>
                    <h2 className="text-xl font-semibold text-slate-900">Detected Words</h2>
                  </div>
                  <span className="text-xs text-slate-500">Real time</span>
                </div>
                <div className="space-y-3">
                  {Object.keys(analytics.most_common_biased_words || {})
                    .sort((a, b) => (analytics.most_common_biased_words?.[b] || 0) - (analytics.most_common_biased_words?.[a] || 0))
                    .slice(0, 5)
                    .map((word) => (
                      <div key={word} className="flex items-center justify-between gap-4 rounded-3xl bg-slate-300 px-4 py-2">
                        <span className="text-sm text-slate-700">{word}</span>
                        <span className="text-sm font-semibold text-slate-900">
                          {analytics.most_common_biased_words?.[word] ?? 0}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>

          </>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && !loading && (  
          <>
          <div className="mb-6 pr-2">
            <h1 className="m-0 text-2xl font-bold text-purple-700">All Registered Users</h1>
          </div> 

          <div className="table-container bg-white rounded-3xl shadow border border-slate-200 overflow-hidden">
            
            <table className="dashboard-table w-full text-left text-sm">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Documents</th>
                  <th>Last Processed</th>
                  <th>Last Document</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {users.slice((currentPage - 1) * usersPerPage, currentPage * usersPerPage).map((usr) => (
                  <tr key={usr.id} className="dashboard-table-row">
                    <td className="dashboard-table-cell font-medium text-slate-900">{usr.email}</td>
                    <td className="dashboard-table-cell text-slate-700">{usr.first_name} {usr.last_name}</td>
                    <td className="dashboard-table-cell">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${(usr.role || usr.profile?.role || 'user') === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                        {usr.role || usr.profile?.role || 'user'}
                      </span>
                    </td>
                    <td className="dashboard-table-cell text-slate-700">{usr.documents_count || 0}</td>
                    <td className="dashboard-table-cell text-slate-700">{usr.last_processed_at ? new Date(usr.last_processed_at).toLocaleString() : '—'}</td>
                    <td className="dashboard-table-cell text-slate-700">{usr.last_document_name || '—'}</td>
                    <td className="dashboard-table-cell text-slate-700">{usr.last_document_fairness_score != null ? `${usr.last_document_fairness_score}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-col gap-3 sm:flex-row justify-between items-center p-4 bg-slate-50 border-t border-slate-200">
              <p className="text-sm text-gray-500">Showing {Math.min(users.length, currentPage * usersPerPage)} of {users.length} users</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 rounded-lg bg-white border text-sm text-gray-700 disabled:opacity-50"
                >Previous</button>
                <button
                  onClick={() => setCurrentPage((page) => Math.min(page + 1, Math.ceil(users.length / usersPerPage)))}
                  disabled={currentPage >= Math.ceil(users.length / usersPerPage)}
                  className="px-4 py-2 rounded-lg bg-white border text-sm text-gray-700 disabled:opacity-50"
                >Next</button>
              </div>
            </div>
          </div> 
          </>
        )}

        {/* Support Tab */}
        {activeTab === 'support' && !loading && (
          <>
          <div className="mb-6 pr-2">
            <h1 className="m-0 text-2xl font-bold text-purple-700">Help & Support</h1>
          </div> 
          <div className="table-container bg-white rounded-3xl shadow border border-slate-200 overflow-hidden">
            <table className="dashboard-table w-full text-left text-sm">
              <thead>
                <tr>
                  <th>Submitted By</th>
                  <th>Email</th>
                  <th>Subject</th>
                  <th>Message</th>
                  <th>Created At</th>
                  <th>Resolved</th>
                </tr>
              </thead>
              <tbody>
                {supportMessages.slice((supportPage - 1) * supportMessagesPerPage, supportPage * supportMessagesPerPage).map((msg) => {
                  const isExpanded = expandedSupportIds.includes(msg.id);
                  const shouldTruncateSubject = msg.subject.length > 40;
                  const shouldTruncateMessage = msg.message.length > 80;
                  const truncatedSubject = shouldTruncateSubject ? `${msg.subject.slice(0, 40)}...` : msg.subject;
                  const truncatedMessage = shouldTruncateMessage ? `${msg.message.slice(0, 80)}...` : msg.message;

                  return (
                    <Fragment key={msg.id}>
                      <tr className="dashboard-table-row">
                        <td className="dashboard-table-cell font-medium text-slate-900">{msg.user_name || msg.name}</td>
                        <td className="dashboard-table-cell text-slate-700">{msg.email}</td>
                        <td className="dashboard-table-cell text-slate-700">
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedSupportIds((prev) =>
                                prev.includes(msg.id) ? prev.filter((id) => id !== msg.id) : [...prev, msg.id]
                              );
                            }}
                            className="text-left w-full"
                          >
                            <span>{truncatedSubject}</span>
                            {shouldTruncateSubject && (
                              <span className="ml-2 text-purple-600 underline">{isExpanded ? 'Hide' : 'Show'}</span>
                            )}
                          </button>
                        </td>
                        <td className="dashboard-table-cell text-slate-700 max-w-xl break-words">
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedSupportIds((prev) =>
                                prev.includes(msg.id) ? prev.filter((id) => id !== msg.id) : [...prev, msg.id]
                              );
                            }}
                            className="text-left w-full"
                          >
                            <span>{truncatedMessage}</span>
                            {shouldTruncateMessage && (
                              <span className="ml-2 text-purple-600 underline">{isExpanded ? 'Hide' : 'Show'}</span>
                            )}
                          </button>
                        </td>
                        <td className="dashboard-table-cell text-slate-700">{new Date(msg.created_at).toLocaleString()}</td>
                        <td className="dashboard-table-cell text-slate-700">
                          <button
                            type="button"
                            onClick={async () => {
                              const newResolved = !msg.is_resolved;
                              try {
                                await adminService.updateSupportMessage(msg.id, { is_resolved: newResolved });
                                setSupportMessages((prev) =>
                                  prev.map((item) =>
                                    item.id === msg.id ? { ...item, is_resolved: newResolved } : item
                                  )
                                );
                              } catch (error: any) {
                                setError('Failed to update resolved state.');
                              }
                            }}
                            className={`px-3 py-1 rounded-full text-xs font-semibold ${msg.is_resolved ? 'bg-emerald-100 text-emerald-800' : 'bg-yellow-100 text-yellow-800'} hover:opacity-90`}
                          >
                            {msg.is_resolved ? 'Yes' : 'No'}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`details-${msg.id}`} className="bg-gray-50">
                          <td colSpan={6} className="px-6 py-4 text-sm text-gray-700">
                            <div className="space-y-2">
                              <div>
                                <span className="font-semibold text-gray-900">Full Subject:</span>
                                <p className="mt-1 text-gray-800">{msg.subject}</p>
                              </div>
                              <div>
                                <span className="font-semibold text-gray-900">Full Message:</span>
                                <p className="mt-1 text-gray-800 whitespace-pre-wrap">{msg.message}</p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {supportMessages.length === 0 && (
              <div className="p-8 text-center text-gray-500">No support messages found.</div>
            )}
            {supportMessages.length > supportMessagesPerPage && (
              <div className="flex items-center justify-between gap-4 p-4 border-t bg-gray-50">
                <p className="text-sm text-gray-600">
                  Showing {Math.min((supportPage - 1) * supportMessagesPerPage + 1, supportMessages.length)}
                  {' '}to {Math.min(supportPage * supportMessagesPerPage, supportMessages.length)} of {supportMessages.length}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSupportPage((page) => Math.max(page - 1, 1))}
                    disabled={supportPage === 1}
                    className="px-4 py-2 rounded-lg bg-white border text-sm text-gray-700 disabled:opacity-50"
                  >Previous</button>
                  <button
                    onClick={() => setSupportPage((page) => Math.min(page + 1, Math.ceil(supportMessages.length / supportMessagesPerPage)))}
                    disabled={supportPage >= Math.ceil(supportMessages.length / supportMessagesPerPage)}
                    className="px-4 py-2 rounded-lg bg-white border text-sm text-gray-700 disabled:opacity-50"
                  >Next</button>
                </div>
              </div>
            )}
          </div> 
          </>
        )}

        {/* Dataset Tab */}
        {activeTab === 'dataset' && ( 
          <>
          <div className="mb-6 pr-2">
            <h1 className="m-0 text-2xl font-bold text-purple-700">System Dataset</h1> 
            <p className="text-sm text-slate-500">Import dataset rows from an Excel file (.xls or .xlsx).</p>
          </div>  
          
          <div className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="w-full lg:max-w-sm">
                <input
                  id="dataset-search"
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setDatasetPage(1);
                  }}
                  placeholder="Search biased or fair terms"
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm outline-none ring-0 focus:border-purple-500"
                />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-300 bg-white p-2 shadow-sm">
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200">
                    <span>{importFile ? 'Change file' : 'Choose file'}</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xls,.xlsx"
                      onChange={handleImportFileChange}
                      className="hidden"
                    />
                  </label>
                  <button
                    onClick={handleImportDataset}
                    disabled={importLoading}
                    className="px-5 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {importLoading ? 'Importing...' : 'Import Dataset'}
                  </button>
                </div>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="h-fit px-5 py-3 bg-teal-600 text-white rounded-2xl hover:bg-teal-700 font-semibold transition"
                >
                  Add
                </button>
              </div>
            </div>


             <div className="space-y-3">              {fileValidationError && (
                <p className="text-sm text-red-600">{fileValidationError}</p>
              )}
              {importFile && !fileValidationError && (
                <p className="text-sm text-slate-600">Selected file: {importFile.name}</p>
              )}
            </div>
            <div className="table-container bg-white rounded-3xl shadow border border-slate-200 overflow-hidden relative">
              {loading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80">
                  <div className="text-sm font-medium text-gray-700">Loading...</div>
                </div>
              )}
              <table className="dashboard-table w-full text-left text-sm">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Biased Word</th>
                    <th>Fair Alternative</th>
                    <th className="w-24">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedMappings.map((mapping) => (
                    <tr key={mapping.id} className="dashboard-table-row">
                      <td className="dashboard-table-cell text-slate-700">{mapping.id}</td>
                      <td className="dashboard-table-cell font-semibold text-slate-900">{mapping.biased_word}</td>
                      <td className="dashboard-table-cell text-teal-700">{mapping.fair_word}</td>
                      <td className="dashboard-table-cell">
                        <button
                          type="button"
                          onClick={() => handleDeleteMapping(mapping.id)}
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-100"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredMappings.length === 0 && (
                <div className="p-8 text-center text-gray-500">
                  {searchTerm
                    ? 'No mappings match your search.'
                    : 'No mappings found. Try initializing the dataset.'}
                </div>
              )}
              {filteredMappings.length > datasetPerPage && (
                <div className="flex flex-col gap-3 sm:flex-row items-center justify-between p-4 border-t bg-gray-50">
                  <p className="text-sm text-gray-600">
                    Showing {datasetStart + 1} to {datasetEnd} of {filteredMappings.length} mappings
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDatasetPage((page) => Math.max(page - 1, 1))}
                      disabled={datasetPage === 1}
                      className="px-4 py-2 rounded-lg bg-white border text-sm text-gray-700 disabled:opacity-50"
                    >Previous</button>
                    <button
                      onClick={() => setDatasetPage((page) => Math.min(page + 1, datasetPageCount))}
                      disabled={datasetPage >= datasetPageCount}
                      className="px-4 py-2 rounded-lg bg-white border text-sm text-gray-700 disabled:opacity-50"
                    >Next</button>
                  </div>
                </div>
              )}

              {/* Add Mapping Modal */}
              {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                  <div className="bg-white rounded-lg w-full max-w-md p-6">
                    <h3 className="text-lg font-semibold mb-4">Add Bias Mapping</h3>
                    <div className="space-y-3">
                      <div>
                        <label htmlFor="biased-word" className="text-sm text-gray-700">Biased Word</label>
                        <input
                          id="biased-word"
                          value={newBiasedWord}
                          onChange={(e) => setNewBiasedWord(e.target.value)}
                          placeholder="Enter biased word"
                          title="Biased word"
                          className="w-full mt-1 px-3 py-2 border rounded-lg"
                        />
                      </div>
                      <div>
                        <label htmlFor="fair-word" className="text-sm text-gray-700">Gender-Fair Term</label>
                        <input
                          id="fair-word"
                          value={newFairWord}
                          onChange={(e) => setNewFairWord(e.target.value)}
                          placeholder="Enter fair alternative"
                          title="Fair alternative"
                          className="w-full mt-1 px-3 py-2 border rounded-lg"
                        />
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                      <button onClick={() => { setShowAddModal(false); setNewBiasedWord(''); setNewFairWord(''); }} className="px-4 py-2 bg-gray-100 rounded-lg">Cancel</button>
                      <button onClick={async () => {
                        try {
                          setLoading(true);
                          const res = await adminService.addDatasetMapping({ biased_word: newBiasedWord.trim().toLowerCase(), fair_word: newFairWord.trim() });
                          
                          // Check if it's a duplicate
                          if (res.data.is_duplicate) {
                            setDuplicateMessage(`The biased word "${newBiasedWord}" already exists with the fair term "${res.data.fair_word}".`);
                            setShowDuplicateModal(true);
                            setShowAddModal(false);
                          } else {
                            // Prepend new mapping to list
                            setMappings((prev) => [res.data, ...prev]);
                            setShowAddModal(false);
                            setNewBiasedWord('');
                            setNewFairWord('');
                            setSuccessMessage('Mapping added successfully!');
                            setTimeout(() => setSuccessMessage(''), 3000);
                          }
                        } catch (e: any) {
                          console.error('Failed to add mapping', e);
                          setError(e?.response?.data?.error || 'Failed to add mapping');
                        } finally {
                          setLoading(false);
                        }
                      }} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Add</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Duplicate Bias Word Modal */}
              {showDuplicateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                  <div className="bg-white rounded-lg w-full max-w-md p-6 shadow-lg">
                    <h3 className="text-lg font-semibold mb-4 text-amber-600">⚠️ Bias Word Already Exists</h3>
                    <p className="text-gray-700 mb-6">{duplicateMessage}</p>
                    <div className="flex justify-end">
                      <button 
                        onClick={() => {
                          setShowDuplicateModal(false);
                          setDuplicateMessage('');
                          setNewBiasedWord('');
                          setNewFairWord('');
                        }} 
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg"
                      >
                        OK
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div> 
          </>
        )}
        </main>
      </div>
    </div>
  );
}
