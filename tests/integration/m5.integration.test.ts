import test from 'node:test';
import assert from 'node:assert/strict';
import { getTestDefinitionsForRunType, type QaExecutionContext } from '../../src/qa/testCatalog.ts';
import { isDatabaseConfigured } from '../../src/db/qaRepository.ts';

const defs = getTestDefinitionsForRunType('integration');
const ctx: QaExecutionContext = {
  baseUrl: `http://127.0.0.1:${Number(process.env.PORT) || 3000}`,
  serverReachable: false,
  hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
  dbConfigured: isDatabaseConfigured(),
};

for (const def of defs) {
  test(`[integration] ${def.testName} — ${def.description}`, async (t) => {
    const outcome = await def.execute(ctx);
    if (outcome.status === 'blocked') {
      t.skip(outcome.errorSummary || 'Blocked by runtime environment prerequisite.');
      return;
    }
    assert.equal(
      outcome.status,
      'passed',
      outcome.errorSummary || `Expected passed, received ${outcome.status}`
    );
  });
}
