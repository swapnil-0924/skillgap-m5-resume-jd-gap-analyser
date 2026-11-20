import { useMemo, useState } from 'react';
import {
  FolderOpen,
  Loader2,
  LogIn,
  Search,
  Trash2,
} from 'lucide-react';
import type { AnalysisHistoryItem } from '../types/analysis';
import { formatDateShort, getScoreTone } from '../utils/formatters';

interface HistoryViewProps {
  isSignedIn: boolean;
  history: AnalysisHistoryItem[];
  loading: boolean;
  error: string | null;
  openingId: number | null;
  deletingId: number | null;
  onOpenReport: (id: number) => void;
  onDeleteReport: (id: number) => void;
  onSignIn: () => void;
  onStartNewAnalysis: () => void;
}

export function HistoryView({
  isSignedIn,
  history,
  loading,
  error,
  openingId,
  deletingId,
  onOpenReport,
  onDeleteReport,
  onSignIn,
  onStartNewAnalysis,
}: HistoryViewProps) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'highest' | 'lowest'>('newest');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = history.filter((item) => {
      if (!q) return true;
      return (
        item.jobTitle.toLowerCase().includes(q) ||
        (item.companyName || '').toLowerCase().includes(q) ||
        item.resumeFilename.toLowerCase().includes(q)
      );
    });

    if (sortBy === 'highest') {
      return [...list].sort((a, b) => b.compatibilityScore - a.compatibilityScore);
    }
    if (sortBy === 'lowest') {
      return [...list].sort((a, b) => a.compatibilityScore - b.compatibilityScore);
    }
    return list;
  }, [history, search, sortBy]);

  if (!isSignedIn) {
    return (
      <div className="space-y-6">
        <div className="pb-5 border-b border-slate-200">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Analysis History
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Access previously generated Resume vs JD compatibility reports and 14-day roadmaps.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-4">
          <div className="w-11 h-11 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
            <LogIn className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900">
              Sign in to view your saved history
            </h2>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              Sign in with Google to save every analysis report permanently, track 14-day roadmap progress across sessions, and revisit or delete past reports.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={onSignIn}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors cursor-pointer"
            >
              <LogIn className="w-4 h-4" aria-hidden="true" />
              Sign in with Google
            </button>
            <button
              type="button"
              onClick={onStartNewAnalysis}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              Run Unsaved Analysis
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Analysis History
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            <span className="font-mono tabular-nums">{history.length}</span> saved{' '}
            {history.length === 1 ? 'report' : 'reports'} linked to your account.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search
              className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <label htmlFor="history-search" className="sr-only">
              Search analysis history
            </label>
            <input
              id="history-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search role or resume..."
              className="pl-8 pr-3 py-2 text-xs border border-slate-300 bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8] w-52"
            />
          </div>

          <label htmlFor="history-sort" className="sr-only">
            Sort reports
          </label>
          <select
            id="history-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'newest' | 'highest' | 'lowest')}
            className="px-3 py-2 text-xs border border-slate-300 bg-white rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
          >
            <option value="newest">Newest First</option>
            <option value="highest">Highest Score</option>
            <option value="lowest">Lowest Score</option>
          </select>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((row) => (
              <div key={row} className="h-11 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
              <FolderOpen className="w-5 h-5" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-slate-900">
              {history.length === 0
                ? 'No saved analysis reports yet'
                : 'No reports match your search'}
            </p>
            {history.length === 0 && (
              <button
                type="button"
                onClick={onStartNewAnalysis}
                className="px-4 py-2 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors cursor-pointer"
              >
                Run New Analysis
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-3 px-6">Target Role & Resume</th>
                  <th className="py-3 px-4 text-right">Score</th>
                  <th className="py-3 px-4 text-right">Matched / Partial / Missing</th>
                  <th className="py-3 px-4 text-right">Plan Progress</th>
                  <th className="py-3 px-4 text-right">Date</th>
                  <th className="py-3 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((item) => {
                  const tone = getScoreTone(item.compatibilityScore);
                  const isOpening = openingId === item.id;
                  const isDeleting = deletingId === item.id;
                  const confirming = confirmDeleteId === item.id;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70">
                      <td className="py-3.5 px-6">
                        <p className="font-medium text-slate-900">
                          {item.jobTitle}
                          {item.companyName ? ` — ${item.companyName}` : ''}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {item.resumeFilename} · {item.jdSourceName}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold">
                        <span className={tone.textClass}>{item.compatibilityScore}%</span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs">
                        <span className="text-[#15803D]">{item.matchedCount}</span>
                        <span className="text-slate-400"> / </span>
                        <span className="text-[#B45309]">{item.partialCount}</span>
                        <span className="text-slate-400"> / </span>
                        <span className="text-[#B91C1C]">{item.missingCount}</span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-slate-600">
                        {item.completedDaysCount} / 14
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-slate-500 whitespace-nowrap">
                        {formatDateShort(item.createdAt)}
                      </td>
                      <td className="py-3.5 px-6 text-right whitespace-nowrap">
                        {confirming ? (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={() => {
                                setConfirmDeleteId(null);
                                onDeleteReport(item.id);
                              }}
                              className="px-2.5 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-md cursor-pointer"
                            >
                              {isDeleting ? 'Deleting...' : 'Confirm'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-3">
                            <button
                              type="button"
                              disabled={isOpening}
                              onClick={() => onOpenReport(item.id)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-[#1D4ED8] hover:underline cursor-pointer disabled:opacity-50"
                            >
                              {isOpening && (
                                <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                              )}
                              Open
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete analysis for ${item.jobTitle}`}
                              onClick={() => setConfirmDeleteId(item.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 rounded-md transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" aria-hidden="true" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
