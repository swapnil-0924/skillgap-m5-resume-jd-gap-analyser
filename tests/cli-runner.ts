import 'dotenv/config';
import { runQaSuite } from '../src/qa/qaRunner.ts';
import type { QaRunType } from '../src/types/qa.ts';

const ALLOWED_SUITES = new Set<QaRunType>([
  'all',
  'unit',
  'integration',
  'api',
  'e2e',
  'security',
  'ai_regression',
]);

function parseSuiteArg(): QaRunType {
  const arg = process.argv.find((a) => a.startsWith('--suite='));
  const value = (arg ? arg.slice('--suite='.length) : 'all').trim() as QaRunType;
  if (!ALLOWED_SUITES.has(value)) {
    console.error(
      `Invalid --suite value "${value}". Allowed: ${Array.from(ALLOWED_SUITES).join(', ')}`
    );
    process.exit(2);
  }
  return value;
}

async function main() {
  const runType = parseSuiteArg();
  const baseUrl = process.env.QA_BASE_URL || `http://127.0.0.1:${Number(process.env.PORT) || 3000}`;

  console.log(`\n=== SkillGap M5 QA & Security Runner (suite=${runType}, target=${baseUrl}) ===`);

  const output = await runQaSuite({
    runType,
    baseUrl,
    persistToDatabase: true,
    writeAuditFiles: true,
  });

  const { run, results, securityAudit } = output.detail;

  for (const r of results) {
    const tag = r.status.toUpperCase().padEnd(7);
    console.log(`  [${tag}] ${r.testName} (${r.durationMs}ms)${r.errorSummary ? ` — ${r.errorSummary}` : ''}`);
  }

  console.log('\n--- Summary ---');
  console.log(
    `Total: ${run.totalTests} | Passed: ${run.passed} | Failed: ${run.failed} | Blocked: ${run.blocked} | Skipped: ${run.skipped} | Pass Rate (Executed): ${run.passPercentage}% | Overall: ${run.overallStatus}`
  );
  console.log(`PostgreSQL Persistence: ${output.persistedToDatabase ? `Saved (run #${run.id})` : 'Skipped (SQL_HOST not set in current shell; runs triggered from server persist automatically)'}`);

  if (securityAudit) {
    const openCount = securityAudit.findings.filter((f) => f.status === 'open').length;
    const verifiedCount = securityAudit.findings.filter((f) => f.status === 'verified_secure').length;
    const blockedCount = securityAudit.findings.filter((f) => f.status === 'blocked').length;
    console.log(
      `Security Audit (${securityAudit.overallStatus}): ${verifiedCount} verified secure, ${openCount} open findings, ${blockedCount} blocked`
    );
  }

  if (output.auditFilesWritten) {
    console.log(`Reports exported:`);
    console.log(`  - ${output.auditFilesWritten.testReportPath}`);
    console.log(`  - ${output.auditFilesWritten.testJsonPath}`);
    if (output.auditFilesWritten.securityReportPath) {
      console.log(`  - ${output.auditFilesWritten.securityReportPath}`);
    }
  }

  // Exit non-zero only if --strict flag is passed and failures exist
  if (process.argv.includes('--strict') && run.failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('QA runner failed fatally:', err);
  process.exit(1);
});
