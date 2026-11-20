import { useMemo, useState } from 'react';
import {
  CheckSquare,
  Download,
  FileText,
  Square,
} from 'lucide-react';
import type { AnalysisReport } from '../types/analysis';
import { buildRoadmapMarkdown } from '../utils/formatters';

interface RoadmapViewProps {
  report: AnalysisReport | null;
  onToggleDayComplete: (day: number) => void;
  onOpenReport: () => void;
  onStartNewAnalysis: () => void;
}

export function RoadmapView({
  report,
  onToggleDayComplete,
  onOpenReport,
  onStartNewAnalysis,
}: RoadmapViewProps) {
  const [filter, setFilter] = useState<'all' | 'high' | 'remaining' | 'completed'>('all');

  const filteredDays = useMemo(() => {
    if (!report) return [];
    return report.learningPlan.filter((day) => {
      const done = report.completedDays.includes(day.day);
      if (filter === 'high') return day.priority === 'High';
      if (filter === 'remaining') return !done;
      if (filter === 'completed') return done;
      return true;
    });
  }, [report, filter]);

  if (!report) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
        <h1 className="text-lg font-semibold text-slate-900">
          No 14-day roadmap generated yet
        </h1>
        <p className="text-sm text-slate-600 max-w-md mx-auto">
          Run a Resume vs Job Description analysis to generate a personalized 14-day upskilling plan based strictly on your actual missing and partially matched skills.
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

  const totalDays = report.learningPlan.length || 14;
  const completedCount = report.completedDays.length;
  const progressPct = Math.round((completedCount / totalDays) * 100);
  const totalHours = Math.round(
    report.learningPlan.reduce((sum, d) => sum + (d.estimatedHours || 2), 0) * 10
  ) / 10;

  const handleExportMarkdown = () => {
    const md = buildRoadmapMarkdown(report);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = report.jobTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    a.download = `14-day-roadmap-${safeTitle || 'plan'}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 pb-6 border-b border-slate-200">
        <div className="space-y-1">
          <p className="text-xs text-slate-500">
            Personalized 14-Day Learning Plan · {report.resumeFilename}
          </p>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
            {report.jobTitle}
          </h1>
          <p className="text-sm text-slate-600">
            Tailored to close{' '}
            <span className="font-mono tabular-nums font-medium text-slate-900">
              {report.missingSkills.length}
            </span>{' '}
            missing skills and strengthen{' '}
            <span className="font-mono tabular-nums font-medium text-slate-900">
              {report.partialSkills.length}
            </span>{' '}
            partial matches ({totalHours} estimated hours total).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onOpenReport}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileText className="w-4 h-4" aria-hidden="true" />
            Back to Report
          </button>
          <button
            type="button"
            onClick={handleExportMarkdown}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            Export Markdown
          </button>
        </div>
      </section>

      {/* Progress & Filter Toolbar */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-2 flex-1 max-w-md">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-700">Completion Progress</span>
            <span
              data-testid="roadmap-progress-label"
              className="font-mono tabular-nums text-slate-900 font-semibold"
            >
              {completedCount} / {totalDays} days ({progressPct}%)
            </span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#1D4ED8] rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Filter roadmap days"
          className="inline-flex items-center p-1 bg-slate-100 rounded-lg self-start"
        >
          {(
            [
              { id: 'all', label: 'All Days' },
              { id: 'high', label: 'High Priority' },
              { id: 'remaining', label: 'Remaining' },
              { id: 'completed', label: 'Completed' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={filter === tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filter === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {/* Day-by-Day Roadmap Schedule */}
      <div className="space-y-4">
        {filteredDays.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
            No days match this filter.
          </div>
        ) : (
          filteredDays.map((item) => {
            const isDone = report.completedDays.includes(item.day);
            const priorityClass =
              item.priority === 'High'
                ? 'text-[#B91C1C]'
                : item.priority === 'Medium'
                ? 'text-[#B45309]'
                : 'text-slate-600';

            return (
              <article
                key={item.day}
                className={`bg-white border rounded-xl p-6 transition-colors ${
                  isDone ? 'border-slate-200 bg-slate-50/50' : 'border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => onToggleDayComplete(item.day)}
                      aria-label={
                        isDone
                          ? `Mark Day ${item.day} (${item.skill}) incomplete`
                          : `Mark Day ${item.day} (${item.skill}) complete`
                      }
                      aria-pressed={isDone}
                      className="mt-0.5 text-slate-500 hover:text-[#1D4ED8] transition-colors cursor-pointer shrink-0"
                    >
                      {isDone ? (
                        <CheckSquare className="w-5 h-5 text-[#15803D]" aria-hidden="true" />
                      ) : (
                        <Square className="w-5 h-5" aria-hidden="true" />
                      )}
                    </button>

                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                        <span className="font-mono tabular-nums font-semibold text-slate-900">
                          Day {String(item.day).padStart(2, '0')}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className={`font-medium ${priorityClass}`}>
                          {item.priority} Priority
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {item.estimatedHours} hrs
                        </span>
                      </div>
                      <h2
                        className={`text-base font-semibold ${
                          isDone ? 'text-slate-500 line-through' : 'text-slate-900'
                        }`}
                      >
                        {item.skill}
                      </h2>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        {item.objective}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-5 text-sm">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-700 mb-2">
                      Recommended Activities
                    </h3>
                    <ul className="space-y-1.5 text-xs text-slate-600 list-disc pl-4 leading-relaxed">
                      {item.activities.map((act, idx) => (
                        <li key={idx}>{act}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold text-slate-700 mb-2">
                      Practical Exercise
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {item.exercise}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold text-slate-700 mb-2">
                      Expected Outcome
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {item.expectedOutcome}
                    </p>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
