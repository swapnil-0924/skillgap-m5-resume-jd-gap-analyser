import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookmarkCheck,
  CalendarDays,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Search,
  Send,
  XCircle,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AnalysisReport, MatchStatus, SkillMatchResult } from '../types/analysis';
import { askGapCoach } from '../services/api';
import {
  buildCategoryChartData,
  formatCategoryLabel,
  formatDateTime,
  getScoreTone,
} from '../utils/formatters';

interface ReportViewProps {
  report: AnalysisReport | null;
  isSignedIn: boolean;
  savingReport: boolean;
  onSaveSessionReport: () => void;
  onOpenRoadmap: () => void;
  onStartNewAnalysis: () => void;
}

export function ReportView({
  report,
  isSignedIn,
  savingReport,
  onSaveSessionReport,
  onOpenRoadmap,
  onStartNewAnalysis,
}: ReportViewProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | MatchStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [coachQuestion, setCoachQuestion] = useState('');
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachAnswer, setCoachAnswer] = useState<string | null>(null);
  const [coachError, setCoachError] = useState<string | null>(null);

  const allSkills = useMemo<SkillMatchResult[]>(() => {
    if (!report) return [];
    return [
      ...report.missingSkills,
      ...report.partialSkills,
      ...report.matchedSkills,
    ];
  }, [report]);

  const filteredSkills = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allSkills.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (!q) return true;
      return (
        item.jdSkill.toLowerCase().includes(q) ||
        item.rawJdSkill.toLowerCase().includes(q) ||
        (item.matchedResumeSkill || '').toLowerCase().includes(q) ||
        item.jdEvidence.toLowerCase().includes(q) ||
        formatCategoryLabel(item.category).toLowerCase().includes(q)
      );
    });
  }, [allSkills, statusFilter, searchQuery]);

  const categoryChartData = useMemo(() => {
    if (!report) return [];
    return buildCategoryChartData(
      report.matchedSkills,
      report.partialSkills,
      report.missingSkills
    );
  }, [report]);

  const pillarChartData = useMemo(() => {
    if (!report) return [];
    return report.scoreBreakdown.pillars.map((p) => ({
      name: p.label.replace(' & Certifications', '').replace(' & Domain', ''),
      score: p.rawScore,
      weightPct: Math.round(p.weight * 100),
    }));
  }, [report]);

  if (!report) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
        <h1 className="text-lg font-semibold text-slate-900">No active analysis report</h1>
        <p className="text-sm text-slate-600 max-w-md mx-auto">
          Upload a PDF resume and job description to inspect matched skills, missing gaps with JD evidence, and a transparent compatibility score.
        </p>
        <div className="pt-2">
          <button
            type="button"
            onClick={onStartNewAnalysis}
            className="px-4 py-2 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors cursor-pointer"
          >
            Start New Analysis
          </button>
        </div>
      </div>
    );
  }

  const scoreTone = getScoreTone(report.compatibilityScore);
  const totalJdSkills = allSkills.length;

  const handleAskCoach = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = coachQuestion.trim();
    if (!q || coachLoading) return;
    setCoachLoading(true);
    setCoachError(null);
    try {
      const res = await askGapCoach({ question: q, report });
      setCoachAnswer(res.answer);
    } catch (error: unknown) {
      setCoachError(
        error instanceof Error ? error.message : 'Unable to fetch guidance right now.'
      );
    } finally {
      setCoachLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Report Header */}
      <section className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 pb-6 border-b border-slate-200">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <span>{report.resumeFilename}</span>
            <span aria-hidden="true">·</span>
            <span>{report.jdSourceName}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{formatDateTime(report.createdAt)}</span>
            <span aria-hidden="true">·</span>
            <span>
              {report.extractionMeta.resumeExtractionMethod === 'pdf_text'
                ? 'Text PDF'
                : 'OCR Extracted'}{' '}
              ({report.extractionMeta.resumePageCount}{' '}
              {report.extractionMeta.resumePageCount === 1 ? 'page' : 'pages'})
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
            {report.jobTitle}
            {report.companyName ? ` — ${report.companyName}` : ''}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {!report.saved && (
            <button
              type="button"
              disabled={savingReport}
              onClick={onSaveSessionReport}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              {savingReport ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <BookmarkCheck className="w-4 h-4" aria-hidden="true" />
              )}
              {isSignedIn ? 'Save to History' : 'Sign In & Save'}
            </button>
          )}
          <button
            type="button"
            onClick={onOpenRoadmap}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <CalendarDays className="w-4 h-4" aria-hidden="true" />
            View 14-Day Roadmap
          </button>
        </div>
      </section>

      {/* Score Summary + Deterministic Formula Breakdown */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Dominant Focal Anchor: Compatibility Score */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">
              Evidence-Based Compatibility Score
            </p>
            <div className="mt-3 flex items-baseline gap-3">
              <span
                data-testid="compatibility-score-value"
                className={`text-5xl font-bold font-mono tabular-nums tracking-tight ${scoreTone.textClass}`}
              >
                {report.compatibilityScore}%
              </span>
              <span className={`text-sm font-medium ${scoreTone.textClass}`}>
                {scoreTone.label}
              </span>
            </div>
            <div className="mt-4 w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${report.compatibilityScore}%`,
                  backgroundColor: scoreTone.barColor,
                }}
              />
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-slate-100 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xl font-semibold font-mono tabular-nums text-[#15803D]">
                {report.matchedSkills.length}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Matched</p>
            </div>
            <div>
              <p className="text-xl font-semibold font-mono tabular-nums text-[#B45309]">
                {report.partialSkills.length}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Partial</p>
            </div>
            <div>
              <p className="text-xl font-semibold font-mono tabular-nums text-[#B91C1C]">
                {report.missingSkills.length}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Missing</p>
            </div>
          </div>
        </div>

        {/* Transparent Weighted Formula Audit Table */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between">
          <div>
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-900">
                Transparent Score Breakdown
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {report.extractionMeta.semanticMatchingEngine === 'gemini_embedding_2'
                  ? 'Calculated deterministically from extracted evidence (exact taxonomy + Gemini semantic embeddings).'
                  : 'Calculated deterministically from extracted evidence (exact taxonomy + lexical fallback; semantic embeddings unavailable).'}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                    <th className="py-2.5 px-6">Scoring Pillar</th>
                    <th className="py-2.5 px-4 text-right">Weight</th>
                    <th className="py-2.5 px-4 text-right">Pillar Score</th>
                    <th className="py-2.5 px-6 text-right">Contribution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.scoreBreakdown.pillars.map((pillar) => (
                    <tr key={pillar.key}>
                      <td className="py-3 px-6">
                        <p className="font-medium text-slate-900">{pillar.label}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {pillar.formulaNote}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                        {Math.round(pillar.weight * 100)}%
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                        {pillar.rawScore}%
                      </td>
                      <td className="py-3 px-6 text-right font-mono tabular-nums font-semibold text-slate-900">
                        +{pillar.weightedContribution.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="px-6 py-3 bg-slate-50/80 border-t border-slate-200 text-xs text-slate-600 font-mono tabular-nums">
            Formula: {report.scoreBreakdown.summaryFormula}
          </div>
        </div>
      </section>

      {/* Skill Comparison Visualizations (Recharts) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-slate-900">
              Skill Coverage by Category
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Distribution of matched, partially matched, and missing JD skills across categories
            </p>
          </div>
          <div className="h-64 w-full">
            {categoryChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={categoryChartData}
                  margin={{ top: 8, right: 12, left: -16, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis
                    dataKey="category"
                    tick={{ fontSize: 12, fill: '#475569' }}
                    axisLine={{ stroke: '#CBD5E1' }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: '#475569' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderColor: '#E2E8F0',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                  <Bar dataKey="matched" name="Matched" stackId="a" fill="#15803D" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="partial" name="Partial" stackId="a" fill="#D97706" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="missing" name="Missing" stackId="a" fill="#DC2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-slate-500">
                No categorized skills extracted.
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-slate-900">
              Pillar Score Comparison
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Raw percentage score achieved on each evaluation dimension
            </p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={pillarChartData}
                layout="vertical"
                margin={{ top: 8, right: 20, left: 10, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tick={{ fontSize: 12, fill: '#475569' }}
                  tickFormatter={(v) => `${v}%`}
                  axisLine={{ stroke: '#CBD5E1' }}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fontSize: 12, fill: '#334155' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value: unknown) => [`${value}%`, 'Pillar Score']}
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E2E8F0',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={22}>
                  {pillarChartData.map((entry, idx) => (
                    <Cell
                      key={`cell-${idx}`}
                      fill={
                        entry.score >= 75
                          ? '#15803D'
                          : entry.score >= 50
                          ? '#D97706'
                          : '#DC2626'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Skill Gap & Verbatim JD Evidence Matrix */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Skill Comparison & Verbatim JD Evidence
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Showing <span className="font-mono tabular-nums">{filteredSkills.length}</span> of{' '}
              <span className="font-mono tabular-nums">{totalJdSkills}</span> normalized JD requirements
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Segmented Filter Control */}
            <div
              role="tablist"
              aria-label="Filter skills by match status"
              className="inline-flex items-center p-1 bg-slate-100 rounded-lg"
            >
              {(
                [
                  { id: 'all', label: `All (${totalJdSkills})` },
                  { id: 'missing', label: `Missing (${report.missingSkills.length})` },
                  { id: 'partial', label: `Partial (${report.partialSkills.length})` },
                  { id: 'matched', label: `Matched (${report.matchedSkills.length})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search
                className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <label htmlFor="skill-search-input" className="sr-only">
                Search skills or JD evidence
              </label>
              <input
                id="skill-search-input"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter skills..."
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8] w-48"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-3 px-6">JD Requirement</th>
                <th className="py-3 px-4">Match Status</th>
                <th className="py-3 px-4">Resume Match & Similarity</th>
                <th className="py-3 px-6">Supporting JD Evidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSkills.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-10 px-6 text-center text-sm text-slate-500">
                    No skills match your current filter.
                  </td>
                </tr>
              ) : (
                filteredSkills.map((item, idx) => (
                  <tr key={`${item.jdSkill}-${idx}`} className="align-top hover:bg-slate-50/60">
                    <td className="py-3.5 px-6 min-w-[180px]">
                      <p className="font-medium text-slate-900">{item.jdSkill}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {formatCategoryLabel(item.category)}
                        <span aria-hidden="true"> · </span>
                        <span className="capitalize">{item.importance}</span>
                      </p>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {item.status === 'matched' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#15803D]">
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          Matched
                        </span>
                      ) : item.status === 'partial' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#B45309]">
                          <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                          {item.reviewRequired ? 'Partial · Review' : 'Partial'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#B91C1C]">
                          <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                          Missing
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 min-w-[175px]">
                      {item.matchedResumeSkill ? (
                        <div>
                          <p className="text-slate-800 font-medium text-xs">
                            {item.matchedResumeSkill}
                          </p>
                          <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                            {Math.round(item.similarityScore * 100)}%{' '}
                            {item.matchMethod === 'exact_normalized'
                              ? 'exact'
                              : item.matchMethod === 'semantic_embedding'
                              ? 'embedding'
                              : 'lexical fallback'}
                          </p>
                          {item.matchReason && item.status === 'partial' && (
                            <p className="text-[11px] text-amber-700 mt-0.5 leading-snug">
                              {item.matchReason}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Not found in resume</span>
                      )}
                    </td>
                    <td className="py-3.5 px-6 max-w-md">
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {item.evidenceVerified ? `“${item.jdEvidence}”` : item.jdEvidence}
                      </p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Qualifications, Experience Alignment & Quick Gap Coach */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Experience & Qualifications Alignment
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {report.experienceAlignment.assessmentNote}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Resume Experience</dt>
              <dd className="mt-1 font-medium text-slate-900 font-mono tabular-nums">
                {report.experienceAlignment.resumeYears !== null
                  ? `${report.experienceAlignment.resumeYears} yrs`
                  : 'Not stated'}{' '}
                · {report.experienceAlignment.resumeSeniority}
              </dd>
              {report.experienceAlignment.relevantYearsEstimate !== undefined &&
                report.experienceAlignment.relevantYearsEstimate !== null &&
                report.experienceAlignment.relevanceFactor !== undefined && (
                  <p className="text-[11px] text-slate-500 mt-0.5 font-mono tabular-nums">
                    ~{report.experienceAlignment.relevantYearsEstimate} relevant yrs (
                    {Math.round(report.experienceAlignment.relevanceFactor * 100)}% role relevance)
                  </p>
                )}
            </div>
            <div>
              <dt className="text-xs text-slate-500">JD Requirement</dt>
              <dd className="mt-1 font-medium text-slate-900 font-mono tabular-nums">
                {report.experienceAlignment.requiredYears !== null
                  ? `${report.experienceAlignment.requiredYears}+ yrs`
                  : 'Not stated'}{' '}
                · {report.experienceAlignment.requiredSeniority}
              </dd>
            </div>
          </dl>

          <div className="space-y-3 pt-3 border-t border-slate-100 text-xs">
            <div>
              <p className="font-medium text-slate-800">Matched Qualifications & Certifications</p>
              <p className="text-slate-600 mt-1">
                {[
                  ...report.experienceAlignment.matchedQualifications,
                  ...report.experienceAlignment.matchedCertifications,
                ].join(' · ') || 'None explicitly matched'}
              </p>
            </div>
            <div>
              <p className="font-medium text-slate-800">Missing Qualifications & Certifications</p>
              <p className="text-slate-600 mt-1">
                {[
                  ...report.experienceAlignment.missingQualifications,
                  ...report.experienceAlignment.missingCertifications,
                ].join(' · ') || 'None identified'}
              </p>
            </div>
            <div>
              <p className="font-medium text-slate-800">Candidate Skills Extracted from Resume</p>
              <p className="text-slate-600 mt-1 leading-relaxed">
                {report.resumeSkills.map((s) => s.canonicalName).join(' · ') ||
                  'No skills extracted'}
              </p>
            </div>
          </div>
        </div>

        {/* Low-Latency Gap Coach (gemini-3.1-flash-lite) */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Quick Skill Gap Advisor
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Ask how to prioritize a specific missing skill or present a partial match honestly in interviews.
              </p>
            </div>
            <MessageSquare className="w-4 h-4 text-slate-400 shrink-0 mt-1" aria-hidden="true" />
          </div>

          <form onSubmit={handleAskCoach} className="flex items-center gap-2">
            <label htmlFor="gap-coach-input" className="sr-only">
              Ask about your skill gaps
            </label>
            <input
              id="gap-coach-input"
              type="text"
              value={coachQuestion}
              onChange={(e) => setCoachQuestion(e.target.value)}
              placeholder="e.g., Which 2 missing skills matter most before applying?"
              disabled={coachLoading}
              className="flex-1 rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
            />
            <button
              type="submit"
              disabled={coachLoading || coachQuestion.trim().length < 4}
              aria-label="Ask Skill Gap Advisor"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
            >
              {coachLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="w-4 h-4" aria-hidden="true" />
              )}
              Ask
            </button>
          </form>

          {coachError && (
            <p role="alert" className="text-xs text-red-700">
              {coachError}
            </p>
          )}

          {coachAnswer && (
            <div className="pt-3 border-t border-slate-100 text-sm text-slate-700 whitespace-pre-line leading-relaxed">
              {coachAnswer}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
