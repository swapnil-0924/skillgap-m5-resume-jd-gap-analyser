import { useCallback, useEffect, useState } from 'react';
import {
  CalendarDays,
  FileBarChart2,
  FileSearch,
  History,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import type { AnalysisHistoryItem, AnalysisReport } from './types/analysis';
import {
  deleteAnalysisById,
  fetchAnalysisById,
  fetchAnalysisHistory,
  saveSessionAnalysis,
  updateRoadmapProgress,
} from './services/api';
import { OverviewView } from './components/OverviewView';
import { AnalyzeView } from './components/AnalyzeView';
import { ReportView } from './components/ReportView';
import { RoadmapView } from './components/RoadmapView';
import { HistoryView } from './components/HistoryView';

type AppView = 'overview' | 'analyze' | 'report' | 'roadmap' | 'history';

const VIEW_LABELS: Record<AppView, string> = {
  overview: 'Overview',
  analyze: 'New Analysis',
  report: 'Analysis Report',
  roadmap: '14-Day Roadmap',
  history: 'Analysis History',
};

function WorkspaceApp() {
  const { user, loading: authLoading, authError, signInWithGoogle, signOut, getIdToken, clearAuthError } =
    useAuth();

  const [view, setView] = useState<AppView>('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [activeReport, setActiveReport] = useState<AnalysisReport | null>(null);
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [savingReport, setSavingReport] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!user) {
      setHistory([]);
      setHistoryError(null);
      return;
    }
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const token = await getIdToken();
      if (!token) return;
      const items = await fetchAnalysisHistory(token);
      setHistory(items);
    } catch (error: unknown) {
      setHistoryError(
        error instanceof Error ? error.message : 'Unable to load analysis history.'
      );
    } finally {
      setHistoryLoading(false);
    }
  }, [user, getIdToken]);

  useEffect(() => {
    if (!authLoading) {
      loadHistory();
    }
  }, [authLoading, loadHistory]);

  const navigate = (next: AppView) => {
    setView(next);
    setMobileNavOpen(false);
    setNotice(null);
  };

  const handleAnalysisComplete = (report: AnalysisReport) => {
    setActiveReport(report);
    setView('report');
    setNotice(
      report.saved
        ? 'Analysis completed and saved to your history.'
        : 'Analysis completed. Sign in with Google to save this report permanently.'
    );
    if (report.saved) {
      loadHistory();
    }
  };

  const handleSaveSessionReport = async () => {
    if (!activeReport || activeReport.saved) return;
    setSavingReport(true);
    setNotice(null);
    try {
      let token = await getIdToken();
      if (!token) {
        const signedInUser = await signInWithGoogle();
        if (!signedInUser) {
          setSavingReport(false);
          return;
        }
        token = await signedInUser.getIdToken();
      }
      const saved = await saveSessionAnalysis(activeReport, token);
      setActiveReport(saved);
      setNotice('Report saved to your analysis history.');
      await loadHistory();
    } catch (error: unknown) {
      setNotice(
        error instanceof Error ? error.message : 'Failed to save analysis report.'
      );
    } finally {
      setSavingReport(false);
    }
  };

  const handleOpenHistoryItem = async (id: number) => {
    setOpeningId(id);
    setHistoryError(null);
    try {
      const token = await getIdToken();
      if (!token) return;
      const report = await fetchAnalysisById(id, token);
      setActiveReport(report);
      setView('report');
    } catch (error: unknown) {
      setHistoryError(
        error instanceof Error ? error.message : 'Unable to open analysis report.'
      );
    } finally {
      setOpeningId(null);
    }
  };

  const handleDeleteHistoryItem = async (id: number) => {
    setDeletingId(id);
    setHistoryError(null);
    try {
      const token = await getIdToken();
      if (!token) return;
      await deleteAnalysisById(id, token);
      setHistory((prev) => prev.filter((item) => item.id !== id));
      if (activeReport && activeReport.id === id) {
        setActiveReport(null);
      }
    } catch (error: unknown) {
      setHistoryError(
        error instanceof Error ? error.message : 'Unable to delete analysis report.'
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleDayComplete = async (day: number) => {
    if (!activeReport) return;
    const exists = activeReport.completedDays.includes(day);
    const nextDays = exists
      ? activeReport.completedDays.filter((d) => d !== day)
      : [...activeReport.completedDays, day].sort((a, b) => a - b);

    setActiveReport({ ...activeReport, completedDays: nextDays });

    if (activeReport.saved && typeof activeReport.id === 'number') {
      try {
        const token = await getIdToken();
        if (!token) return;
        const updated = await updateRoadmapProgress(activeReport.id, nextDays, token);
        setActiveReport(updated);
        setHistory((prev) =>
          prev.map((h) =>
            h.id === activeReport.id
              ? { ...h, completedDaysCount: updated.completedDays.length }
              : h
          )
        );
      } catch (error) {
        console.error('Failed to persist roadmap day toggle:', error);
      }
    }
  };

  const navItems: Array<{
    id: AppView;
    label: string;
    icon: typeof LayoutDashboard;
    count?: number;
  }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'analyze', label: 'New Analysis', icon: FileSearch },
    { id: 'report', label: 'Analysis Report', icon: FileBarChart2 },
    { id: 'roadmap', label: '14-Day Roadmap', icon: CalendarDays },
    {
      id: 'history',
      label: 'Analysis History',
      icon: History,
      count: history.length > 0 ? history.length : undefined,
    },
  ];

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full justify-between">
      <div>
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200">
          <button
            type="button"
            onClick={() => navigate('overview')}
            className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
          >
            SkillGap M5
          </button>
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setMobileNavOpen(false)}
            className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 rounded-md cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <nav aria-label="Main navigation" className="p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-slate-100 text-slate-900'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active ? 'text-[#1D4ED8]' : 'text-slate-400'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.count !== undefined && (
                  <span className="text-xs font-mono tabular-nums text-slate-500">
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Account Footer inside Sidebar */}
      <div className="p-4 border-t border-slate-200">
        {user ? (
          <div className="space-y-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-900 truncate">
                {user.displayName || 'Signed in user'}
              </p>
              <p className="text-xs text-slate-500 truncate">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              Sign Out
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-500 leading-relaxed">
              Sign in with Google to save reports and track 14-day progress across sessions.
            </p>
            <button
              type="button"
              disabled={authLoading}
              onClick={signInWithGoogle}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
              Sign in with Google
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex">
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block w-60 shrink-0 bg-white border-r border-slate-200 sticky top-0 h-screen">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Slide-Over Sidebar */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-64 max-w-[80vw] bg-white h-full border-r border-slate-200">
            {renderSidebarContent()}
          </aside>
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb Left, 1 Primary Action Right */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg cursor-pointer"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>

            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline whitespace-nowrap">
                Workspace
              </span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <span className="font-medium text-slate-900 truncate">
                {VIEW_LABELS[view]}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {view !== 'analyze' && (
              <button
                type="button"
                onClick={() => navigate('analyze')}
                className="px-3.5 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                New Analysis
              </button>
            )}
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 w-full max-w-[1220px] mx-auto px-4 sm:px-8 py-6 sm:py-8">
          {authError && (
            <div
              role="alert"
              className="mb-6 flex items-center justify-between gap-3 p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800"
            >
              <span>{authError}</span>
              <button
                type="button"
                onClick={clearAuthError}
                className="font-medium underline shrink-0 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {notice && (
            <div
              role="status"
              className="mb-6 flex items-center justify-between gap-3 p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900"
            >
              <span>{notice}</span>
              <button
                type="button"
                onClick={() => setNotice(null)}
                className="font-medium underline shrink-0 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {view === 'overview' && (
            <OverviewView
              activeReport={activeReport}
              history={history}
              historyLoading={historyLoading}
              isSignedIn={Boolean(user)}
              onStartNewAnalysis={() => navigate('analyze')}
              onOpenReportView={() => navigate('report')}
              onOpenRoadmapView={() => navigate('roadmap')}
              onSelectHistoryItem={handleOpenHistoryItem}
              onSignIn={signInWithGoogle}
            />
          )}

          {view === 'analyze' && (
            <AnalyzeView
              getIdToken={getIdToken}
              onAnalysisComplete={handleAnalysisComplete}
            />
          )}

          {view === 'report' && (
            <ReportView
              report={activeReport}
              isSignedIn={Boolean(user)}
              savingReport={savingReport}
              onSaveSessionReport={handleSaveSessionReport}
              onOpenRoadmap={() => navigate('roadmap')}
              onStartNewAnalysis={() => navigate('analyze')}
            />
          )}

          {view === 'roadmap' && (
            <RoadmapView
              report={activeReport}
              onToggleDayComplete={handleToggleDayComplete}
              onOpenReport={() => navigate('report')}
              onStartNewAnalysis={() => navigate('analyze')}
            />
          )}

          {view === 'history' && (
            <HistoryView
              isSignedIn={Boolean(user)}
              history={history}
              loading={historyLoading}
              error={historyError}
              openingId={openingId}
              deletingId={deletingId}
              onOpenReport={handleOpenHistoryItem}
              onDeleteReport={handleDeleteHistoryItem}
              onSignIn={signInWithGoogle}
              onStartNewAnalysis={() => navigate('analyze')}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <WorkspaceApp />
    </AuthProvider>
  );
}
