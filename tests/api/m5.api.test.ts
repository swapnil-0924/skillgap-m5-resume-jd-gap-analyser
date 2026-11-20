import test from 'node:test';
import assert from 'node:assert/strict';
import { getTestDefinitionsForRunType, type QaExecutionContext } from '../../src/qa/testCatalog.ts';
import { isDatabaseConfigured } from '../../src/db/qaRepository.ts';

const baseUrl = (process.env.QA_BASE_URL || `http://127.0.0.1:${Number(process.env.PORT) || 3000}`).replace(/\/+$/, '');

async function isReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

const defs = getTestDefinitionsForRunType('api');

for (const def of defs) {
  test(`[api] ${def.testName} — ${def.description}`, async (t) => {
    const ctx: QaExecutionContext = {
      baseUrl,
      serverReachable: await isReachable(),
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      dbConfigured: isDatabaseConfigured(),
    };
    const outcome = await def.execute(ctx);
    if (outcome.status === 'blocked') {
      t.skip(outcome.errorSummary || 'Blocked because M5 Express server is not running.');
      return;
    }
    assert.equal(
      outcome.status,
      'passed',
      outcome.errorSummary || `Expected passed, received ${outcome.status}`
    );
  });
}
