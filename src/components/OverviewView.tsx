import {
  ArrowRight,
  CalendarDays,
  FileSearch,
  FileText,
  FolderOpen,
  LogIn,
} from 'lucide-react';
import type { AnalysisHistoryItem, AnalysisReport } from '../types/analysis';
import { formatDateShort, getScoreTone } from '../utils/formatters';

interface OverviewViewProps {
  activeReport: AnalysisReport | null;
  history: AnalysisHistoryItem[];
  historyLoading: boolean;
  isSignedIn: boolean;
  onStartNewAnalysis: () => void;
  onOpenReportView: () => void;
  onOpenRoadmapView: () => void;
  onSelectHistoryItem: (id: number) => void;
  onSignIn: () => void;
}

export function OverviewView({
  activeReport,
  history,
  historyLoading,
  isSignedIn,
  onStartNewAnalysis,
  onOpenReportView,
  onOpenRoadmapView,
  onSelectHistoryItem,
  onSignIn,
}: OverviewViewProps) {
  const totalSaved = history.length;
  const avgScore =
    totalSaved > 0
      ? Math.round(
          history.reduce((sum, item) => sum + item.compatibilityScore, 0) / totalSaved
        )
      : activeReport
      ? activeReport.compatibilityScore
      : null;

  const totalGapsTracked =
    totalSaved > 0
      ? history.reduce((sum, item) => sum + item.missingCount, 0)
      : activeReport
      ? activeReport.missingSkills.length
      : 0;

  const latestCompletedDays = activeReport
    ? activeReport.completedDays.length
    : history[0]?.completedDaysCount ?? 0;

  return (
    <div className="space-y-8">
      {/* Page Intro & Primary Action */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between pb-6 border-b border-slate-200">
        <div className="space-y-1.5 max-w-2xl">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
            Resume vs Job Description Gap Analyser
          </h1>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
            Upload any PDF resume and compare it against a real job description. Extract normalized skills, inspect verbatim JD evidence, calculate a transparent compatibility score, and follow a personalized 14-day upskilling plan.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onStartNewAnalysis}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
          >
            <FileSearch className="w-4 h-4" aria-hidden="true" />
            New Gap Analysis
          </button>
        </div>
      </section>

      {/* 4-Column KPI Summary Strip (Strictly Real Data, Tabular Numerals) */}
      <section
        aria-label="Workspace Summary Metrics"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      >
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Saved Analyses</p>
          <p className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {totalSaved}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {isSignedIn ? 'Stored in your account history' : 'Sign in to persist reports'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">
            {totalSaved > 0 ? 'Average Compatibility' : 'Active Compatibility'}
          </p>
          <p className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {avgScore !== null ? `${avgScore}%` : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {avgScore !== null ? getScoreTone(avgScore).label : 'Run an analysis to calculate'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Missing Skills Identified</p>
          <p className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {totalGapsTracked}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Backed by verbatim JD requirements
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">14-Day Plan Progress</p>
          <p className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {latestCompletedDays} / 14
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Days completed on current roadmap
          </p>
        </div>
      </section>

      {/* Active Session Report Callout (if an analysis has been run) */}
      {activeReport && (
        <section
          aria-label="Active Analysis Summary"
          className="bg-white border border-slate-200 rounded-xl p-6"
        >
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                <span>Active Report</span>
                <span aria-hidden="true">·</span>
                <span>{activeReport.resumeFilename}</span>
                <span aria-hidden="true">·</span>
                <span>{formatDateShort(activeReport.createdAt)}</span>
              </div>
              <h2 className="text-lg font-semibold text-slate-900">
                {activeReport.jobTitle}
                {activeReport.companyName ? ` — ${activeReport.companyName}` : ''}
              </h2>
              <p className="text-sm text-slate-600">
                <span className={`font-semibold font-mono tabular-nums ${getScoreTone(activeReport.compatibilityScore).textClass}`}>
                  {activeReport.compatibilityScore}% compatibility
                </span>
                <span aria-hidden="true"> · </span>
                <span className="font-mono tabular-nums">{activeReport.matchedSkills.length}</span> matched
                <span aria-hidden="true"> · </span>
                <span className="font-mono tabular-nums">{activeReport.partialSkills.length}</span> partial
                <span aria-hidden="true"> · </span>
                <span className="font-mono tabular-nums">{activeReport.missingSkills.length}</span> missing
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={onOpenReportView}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileText className="w-4 h-4" aria-hidden="true" />
                Open Report
              </button>
              <button
                type="button"
                onClick={onOpenRoadmapView}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <CalendarDays className="w-4 h-4" aria-hidden="true" />
                14-Day Roadmap
              </button>
            </div>
          </div>
        </section>
      )}

      {/* How the Pipeline Works + Recent History Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Recent Analyses Table */}
        <section className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Recent Analyses</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Real-world reports generated from your uploaded resumes and job descriptions
              </p>
            </div>
            {!isSignedIn && (
              <button
                type="button"
                onClick={onSignIn}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
                Sign in for History
              </button>
            )}
          </div>

          {historyLoading ? (
            <div className="p-6 space-y-3" aria-label="Loading recent analyses">
              {[1, 2, 3].map((row) => (
                <div key={row} className="h-10 bg-slate-100 rounded animate-pulse" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
                <FolderOpen className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-slate-900">
                  No saved analyses yet
                </h3>
                <p className="text-sm text-slate-600 max-w-md mx-auto">
                  {isSignedIn
                    ? 'Upload a PDF resume and enter any job description to generate your first compatibility report and 14-day roadmap.'
                    : 'Run a live analysis right now, or sign in with Google to automatically save and revisit your reports across sessions.'}
                </p>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onStartNewAnalysis}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors cursor-pointer"
                >
                  Start First Analysis
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                    <th className="py-3 px-6">Role & Resume</th>
                    <th className="py-3 px-4 text-right">Score</th>
                    <th className="py-3 px-4 text-right">Matched / Missing</th>
                    <th className="py-3 px-4 text-right">Date</th>
                    <th className="py-3 px-6 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {history.slice(0, 6).map((item) => {
                    const tone = getScoreTone(item.compatibilityScore);
                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50/80 transition-colors"
                      >
                        <td className="py-3.5 px-6">
                          <div className="font-medium text-slate-900 truncate max-w-xs">
                            {item.jobTitle}
                          </div>
                          <div className="text-xs text-slate-500 truncate max-w-xs">
                            {item.resumeFilename}
                            {item.companyName ? ` · ${item.companyName}` : ''}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold">
                          <span className={tone.textClass}>
                            {item.compatibilityScore}%
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-slate-600">
                          <span className="text-[#15803D]">{item.matchedCount}</span>
                          <span className="text-slate-400"> / </span>
                          <span className="text-[#B91C1C]">{item.missingCount}</span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-slate-500 whitespace-nowrap">
                          {formatDateShort(item.createdAt)}
                        </td>
                        <td className="py-3.5 px-6 text-right">
                          <button
                            type="button"
                            onClick={() => onSelectHistoryItem(item.id)}
                            className="text-xs font-medium text-[#1D4ED8] hover:text-[#1E40AF] hover:underline whitespace-nowrap cursor-pointer"
                          >
                            View Report
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Transparent Methodology Overview */}
        <section className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">
            Analysis Methodology
          </h2>
          <ol className="space-y-4 text-sm text-slate-600 divide-y divide-slate-100">
            <li className="pt-0">
              <p className="font-medium text-slate-900">01. PDF & Scanned OCR Extraction</p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                Extracts selectable text while detecting multi-column layouts, tables, and scanned pages with automatic multimodal OCR fallback.
              </p>
            </li>
            <li className="pt-3.5">
              <p className="font-medium text-slate-900">02. Taxonomy & Semantic Matching</p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                Normalizes aliases (e.g. ReactJS to React, Postgres to PostgreSQL) and computes neural vector cosine similarity for semantically equivalent skills.
              </p>
            </li>
            <li className="pt-3.5">
              <p className="font-medium text-slate-900">03. Deterministic Evidence Score</p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                Calculates compatibility mathematically from verified skill coverage, qualifications, and experience—never invented by an LLM.
              </p>
            </li>
            <li className="pt-3.5">
              <p className="font-medium text-slate-900">04. Personalized 14-Day Plan</p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                Builds a concrete two-week roadmap grounded directly in your missing and partial skills, complete with hands-on exercises.
              </p>
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
}
