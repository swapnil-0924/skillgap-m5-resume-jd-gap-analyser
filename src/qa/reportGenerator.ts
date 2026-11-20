import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import type { QaRunDetailResponse } from '../types/qa.ts';

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function escapeMdCell(value: string | null | undefined): string {
  if (!value) return '—';
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

export function generateTestReportMarkdown(detail: QaRunDetailResponse): string {
  const { run, results, comparison } = detail;
  const lines: string[] = [
    '# SkillGap M5 — Automated Test Execution Report',
    '',
    `- **Run ID:** ${run.id}`,
    `- **Suite Type:** \`${run.runType}\``,
    `- **Overall Status:** \`${run.overallStatus}\``,
    `- **Application Version:** \`${run.applicationVersion}\``,
    `- **Commit Hash:** \`${run.commitHash || 'unavailable'}\``,
    `- **Started At:** ${run.startedAt}`,
    `- **Completed At:** ${run.completedAt || 'incomplete'}`,
    `- **Duration:** ${formatDuration(run.durationMs)}`,
    '',
    '## Execution Summary',
    '',
    '| Metric | Value |',
    '|---|---:|',
    `| Total Tests | ${run.totalTests} |`,
    `| Passed | ${run.passed} |`,
    `| Failed | ${run.failed} |`,
    `| Blocked | ${run.blocked} |`,
    `| Skipped | ${run.skipped} |`,
    `| Pass Rate (Executed) | ${run.passPercentage}% |`,
    '',
  ];

  if (comparison) {
    lines.push(
      '## Comparison vs Previous Run',
      '',
      `- **Previous Run ID:** #${comparison.previousRunId}`,
      `- **Pass Rate Delta:** ${comparison.passRateDelta >= 0 ? '+' : ''}${comparison.passRateDelta}%`,
      `- **Passed Delta:** ${comparison.passedDelta >= 0 ? '+' : ''}${comparison.passedDelta}`,
      `- **Failed Delta:** ${comparison.failedDelta >= 0 ? '+' : ''}${comparison.failedDelta}`,
      `- **Blocked Delta:** ${comparison.blockedDelta >= 0 ? '+' : ''}${comparison.blockedDelta}`,
      `- **Regressions:** ${comparison.regressions.length > 0 ? comparison.regressions.join(', ') : 'None'}`,
      `- **Improvements:** ${comparison.improvements.length > 0 ? comparison.improvements.join(', ') : 'None'}`,
      ''
    );
  }

  lines.push(
    '## Detailed Test Results',
    '',
    '| Test Name | Category | Status | Duration | Summary / Notes |',
    '|---|---|---|---:|---|'
  );

  for (const r of results) {
    lines.push(
      `| \`${escapeMdCell(r.testName)}\` | \`${r.category}\` | **${r.status.toUpperCase()}** | ${formatDuration(r.durationMs)} | ${escapeMdCell(r.errorSummary || 'Passed')} |`
    );
  }

  const failures = results.filter((r) => r.status === 'failed');
  const blocked = results.filter((r) => r.status === 'blocked');

  lines.push('', '## Failures & Open Issues', '');
  if (failures.length === 0) {
    lines.push('No failed test cases in this run.');
  } else {
    for (const f of failures) {
      lines.push(`- **\`${f.testName}\`** (\`${f.category}\`): ${f.errorSummary || 'Failed without message.'}`);
    }
  }

  lines.push('', '## Blocked Checks & Environment Limitations', '');
  if (blocked.length === 0) {
    lines.push('No blocked checks in this run.');
  } else {
    for (const b of blocked) {
      lines.push(`- **\`${b.testName}\`** (\`${b.category}\`): ${b.errorSummary || 'Blocked by environment prerequisite.'}`);
    }
  }

  lines.push(
    '',
    '---',
    '_Generated strictly from actual automated execution against the live SkillGap M5 codebase. Contains zero real candidate PII, resumes, or secrets._',
    ''
  );

  return lines.join('\n');
}

export function generateTestReportJson(detail: QaRunDetailResponse): string {
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      privacyNotice:
        'Sanitized synthetic test telemetry only. Contains zero real user resumes, PII, or credentials.',
      ...detail,
    },
    null,
    2
  );
}

export function generateSecurityAuditMarkdown(detail: QaRunDetailResponse): string {
  const { run, securityAudit } = detail;
  const lines: string[] = [
    '# SkillGap M5 — Automated Security Audit Report',
    '',
    `- **Run ID:** ${run.id}`,
    `- **Audit Timestamp:** ${securityAudit?.createdAt || run.startedAt}`,
    `- **Audit Type:** \`${securityAudit?.auditType || 'none'}\``,
    `- **Overall Security Status:** \`${securityAudit?.overallStatus || 'not_executed'}\``,
    `- **Application Version:** \`${run.applicationVersion}\``,
    `- **Commit Hash:** \`${run.commitHash || 'unavailable'}\``,
    '',
  ];

  if (!securityAudit || securityAudit.findings.length === 0) {
    lines.push(
      'No security audit checks were executed during this run. Execute the `security` or `all` suite to generate security findings.',
      ''
    );
    return lines.join('\n');
  }

  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  let verifiedCount = 0;
  let blockedCount = 0;

  for (const f of securityAudit.findings) {
    if (f.status === 'open') {
      counts[f.severity] += 1;
    } else if (f.status === 'verified_secure' || f.status === 'mitigated') {
      verifiedCount += 1;
    } else if (f.status === 'blocked') {
      blockedCount += 1;
    }
  }

  lines.push(
    '## Severity Breakdown (Open Findings)',
    '',
    '| Severity | Open Count |',
    '|---|---:|',
    `| Critical | ${counts.critical} |`,
    `| High | ${counts.high} |`,
    `| Medium | ${counts.medium} |`,
    `| Low | ${counts.low} |`,
    `| Info | ${counts.info} |`,
    '',
    `- **Verified Secure Controls:** ${verifiedCount}`,
    `- **Blocked Security Checks:** ${blockedCount}`,
    '',
    '## Findings Ledger',
    '',
    '| Code | Title | Severity | Status | Verified At |',
    '|---|---|---|---|---|'
  );

  for (const f of securityAudit.findings) {
    lines.push(
      `| \`${f.findingCode}\` | ${escapeMdCell(f.title)} | **${f.severity.toUpperCase()}** | \`${f.status}\` | ${f.verifiedAt || '—'} |`
    );
  }

  lines.push('', '## Detailed Findings & Remediation Guidance', '');
  for (const f of securityAudit.findings) {
    lines.push(
      `### ${f.findingCode} — ${f.title}`,
      `- **Severity:** \`${f.severity}\` | **Status:** \`${f.status}\``,
      `- **Observed Behavior:** ${f.description}`,
      `- **Recommended Remediation:** ${f.remediation}`,
      ''
    );
  }

  lines.push(
    '---',
    '_All findings reflect actual runtime checks executed against SkillGap M5 using synthetic, non-destructive fixtures._',
    ''
  );

  return lines.join('\n');
}

export async function writeAuditReportsToDisk(
  detail: QaRunDetailResponse
): Promise<{
  testReportPath: string;
  testJsonPath: string;
  securityReportPath: string | null;
}> {
  const auditDir = path.resolve(process.cwd(), 'audit');
  await mkdir(auditDir, { recursive: true });

  const safeResolve = (filename: string): string => {
    const cleanName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const resolved = path.resolve(auditDir, cleanName);
    if (!resolved.startsWith(`${auditDir}${path.sep}`)) {
      throw new Error('Blocked path traversal attempt while writing audit report.');
    }
    return resolved;
  };

  const testReportPath = safeResolve('latest-test-report.md');
  const testJsonPath = safeResolve('latest-test-results.json');

  await Promise.all([
    writeFile(testReportPath, generateTestReportMarkdown(detail), 'utf8'),
    writeFile(testJsonPath, generateTestReportJson(detail), 'utf8'),
  ]);

  let securityReportPath: string | null = null;
  if (detail.securityAudit) {
    securityReportPath = safeResolve('latest-security-audit.md');
    await writeFile(securityReportPath, generateSecurityAuditMarkdown(detail), 'utf8');
  }

  return { testReportPath, testJsonPath, securityReportPath };
}
