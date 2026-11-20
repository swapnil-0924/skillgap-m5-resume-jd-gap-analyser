import type { AnalysisReport, SkillCategory, SkillMatchResult } from '../types/analysis';

export const CATEGORY_LABELS: Record<SkillCategory, string> = {
  programming_language: 'Languages',
  framework: 'Frameworks',
  library: 'Libraries',
  database: 'Databases',
  cloud: 'Cloud & Infra',
  dev_tool: 'Dev Tools',
  technical_skill: 'Technical',
  soft_skill: 'Soft Skills',
  qualification: 'Qualifications',
  certification: 'Certifications',
};

export function formatCategoryLabel(category: SkillCategory): string {
  return CATEGORY_LABELS[category] || 'Technical';
}

export function formatDateShort(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function getScoreTone(score: number): {
  label: string;
  textClass: string;
  barColor: string;
} {
  if (score >= 75) {
    return {
      label: 'Strong Match',
      textClass: 'text-[#15803D]',
      barColor: '#15803D',
    };
  }
  if (score >= 50) {
    return {
      label: 'Moderate Match',
      textClass: 'text-[#B45309]',
      barColor: '#D97706',
    };
  }
  return {
    label: 'Significant Gaps',
    textClass: 'text-[#B91C1C]',
    barColor: '#DC2626',
  };
}

export interface CategoryChartDatum {
  category: string;
  matched: number;
  partial: number;
  missing: number;
  total: number;
}

export function buildCategoryChartData(
  matched: SkillMatchResult[],
  partial: SkillMatchResult[],
  missing: SkillMatchResult[]
): CategoryChartDatum[] {
  const buckets = new Map<SkillCategory, CategoryChartDatum>();

  const register = (items: SkillMatchResult[], field: 'matched' | 'partial' | 'missing') => {
    for (const item of items) {
      let bucket = buckets.get(item.category);
      if (!bucket) {
        bucket = {
          category: formatCategoryLabel(item.category),
          matched: 0,
          partial: 0,
          missing: 0,
          total: 0,
        };
        buckets.set(item.category, bucket);
      }
      bucket[field] += 1;
      bucket.total += 1;
    }
  };

  register(matched, 'matched');
  register(partial, 'partial');
  register(missing, 'missing');

  return Array.from(buckets.values()).sort((a, b) => b.total - a.total);
}

export function buildRoadmapMarkdown(report: AnalysisReport): string {
  const lines: string[] = [
    `# 14-Day Personalized Learning Roadmap — ${report.jobTitle}`,
    report.companyName ? `**Target Company:** ${report.companyName}` : '',
    `**Resume:** ${report.resumeFilename}`,
    `**Compatibility Score:** ${report.compatibilityScore}%`,
    `**Generated:** ${formatDateTime(report.createdAt)}`,
    '',
    '---',
    '',
  ].filter(Boolean);

  for (const day of report.learningPlan) {
    const done = report.completedDays.includes(day.day) ? '[x]' : '[ ]';
    lines.push(`## ${done} Day ${day.day}: ${day.skill} (${day.priority} Priority · ${day.estimatedHours} hrs)`);
    lines.push(`**Objective:** ${day.objective}`);
    lines.push('');
    lines.push('**Learning Activities:**');
    for (const act of day.activities) {
      lines.push(`- ${act}`);
    }
    lines.push('');
    lines.push(`**Practical Exercise:** ${day.exercise}`);
    lines.push(`**Expected Outcome:** ${day.expectedOutcome}`);
    lines.push('');
  }

  return lines.join('\n');
}
