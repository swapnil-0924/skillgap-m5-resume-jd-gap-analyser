# SkillGap M5 — Permanent Testing, Quality Assurance & Security Audit System

## 1. System Overview & Preserved Architecture

Phase 5 introduces a permanent, database-backed Quality Assurance (QA) testing and automated security audit system directly inside **SkillGap M5 — Resume vs Job Description Gap Analyser** while preserving 100% of the existing architecture:

- **Frontend:** React 19 + Vite + Tailwind CSS v4 (lazy-loaded `QaDashboardView` integrated into `src/App.tsx`).
- **Backend:** Unified Node.js + Express + TypeScript server (`server.ts`) listening on `process.env.PORT || 3000`.
- **Database & ORM:** PostgreSQL / Cloud SQL via Drizzle ORM (`src/db/schema.ts`, `src/db/qaRepository.ts`, `drizzle/0001_qa_testing_audit_tables.sql`).
- **AI Engine:** Existing `@google/genai` integration (`gemini-3.1-flash-lite`, `gemini-4-hydrogen`, `gemini-embedding-2`).
- **Isolation & Privacy:** All automated suites run exclusively on programmatic synthetic fixtures (`tests/fixtures/dummyFixtures.ts`). Real candidate resumes, PII, API keys, and sensitive tokens are never stored in `test_results` or exported reports.

---

## 2. Database Schema & Migration

Five permanent PostgreSQL tables were added to `src/db/schema.ts`, documented in `drizzle/0001_qa_testing_audit_tables.sql`, and applied live to Cloud SQL:

| Table | Purpose | Key Constraints & Indexes |
|---|---|---|
| `test_runs` | Records every suite execution (type, timestamps, totals, pass/fail/blocked/skipped counts, overall status, app version, commit hash). | `idx_test_runs_started_at`, `idx_test_runs_run_type_status`, `chk_test_runs_counts_non_negative` |
| `test_cases` | Master catalog of all 34 registered automated test & security checks. | Unique `test_name`, `idx_test_cases_category` |
| `test_results` | Individual test case outcome, execution duration, sanitized error summary, and sanitized `jsonb` details per run. | Cascade FKs to `test_runs` & `test_cases`, `idx_test_results_run_id`, `idx_test_results_test_case_id`, `idx_test_results_status`, `chk_test_results_duration_non_negative` |
| `security_audits` | Audit execution header linked to a `test_runs` record. | Cascade FK to `test_runs`, `idx_security_audits_run_id`, `idx_security_audits_created_at` |
| `security_findings` | Individual security check findings (`SEC-001`–`SEC-012`), severity, status (`open`, `verified_secure`, `mitigated`, `blocked`), observed evidence, remediation, and verification timestamp. | Cascade FK to `security_audits`, `idx_security_findings_audit_id`, `idx_security_findings_severity_status` |

All database queries in `src/db/qaRepository.ts` are strictly parameterized via Drizzle ORM, and `sanitizeExecutionDetails()` scrubs any credential/PII-like fields before insertion.

---

## 3. Automated Test Suites (`tests/` & `src/qa/testCatalog.ts`)

All 34 automated checks execute against the **actual SkillGap M5 modules and live Express endpoints** using non-destructive synthetic documents:

| Suite | File | Checks | Coverage |
|---|---|---:|---|
| **Unit** | `tests/unit/m5.unit.test.ts` (+ existing `src/analysis/*.test.ts`) | 6 (+12 existing) | Valid PDF extraction, invalid/empty/corrupted PDF rejection, 25-page & 10 MB limits, exact & taxonomy synonym matching, deterministic compatibility scoring, verbatim JD evidence grounding. |
| **Integration** | `tests/integration/m5.integration.test.ts` | 5 | Multi-skill `embedSkillNames` batching & fallback, Gemini/OCR failure resilience, JD PDF extraction, isolated PostgreSQL CRUD lifecycle (synthetic `qa-isolated-*` user cleaned up in `finally`), full matching + scoring + evidence pipeline. |
| **API** | `tests/api/m5.api.test.ts` | 5 | `GET /api/health`, missing resume `400`, short JD `400` & corrupt PDF `422`, `POST /api/jd/quick-scan` & `POST /api/coach` input validation, unauthenticated `401` enforcement on `/api/analyses*` & `/api/qa/*`. |
| **End-to-End** | `tests/e2e/m5.e2e.test.ts` | 2 | Full live `POST /api/analyze` (synthetic resume PDF + JD -> skills, matching, score, evidence, 14-day roadmap) and live `POST /api/analyze-stream` (synthetic resume PDF + synthetic JD PDF -> NDJSON progress frames + final report). |
| **AI Accuracy & Regression** | `tests/ai-regression/m5.ai-regression.test.ts` | 4 | V-02 Java vs JavaScript separation, V-02 React vs React Native + semantic-only `reviewRequired` guard, V-12 relevant vs unrelated experience scaling, V-20 live prompt-injection resistance against `/api/analyze`. |
| **Security Audit** | `tests/security/m5.security.test.ts` | 12 | `SEC-001` through `SEC-012` covering active PDF content markers, polyglot headers, oversized requests, prompt injection, rate limiting, concurrency caps, untrusted client-supplied scores, unauthorized access & cross-user IDOR, info exposure, HTTP security headers, `bun audit` dependency vulnerabilities, and JSON/404 error handling. |

---

## 4. Admin-Protected API & Execution Controls (`/api/qa/*`)

All QA endpoints set `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`, and all sensitive endpoints enforce `requireAdmin` (`src/middleware/auth.ts`):

- **Authorization Rules:**
  1. Verified Firebase ID token (`Bearer <idToken>`) where either custom claim `admin === true` or the verified email is listed in `QA_ADMIN_EMAILS` (comma-separated env var; defaults to application owner).
  2. Optional automation header `X-QA-Admin-Key` verified with `crypto.timingSafeEqual` **only** if `QA_ADMIN_API_KEY` (minimum 16 characters) is configured on the server.
- **Endpoints:**
  - `GET /api/qa/access` — Returns `{ authenticated, isAdmin, email }` (never exposes QA telemetry).
  - `GET /api/qa/overview` — Admin only; returns aggregate metrics, latest vs previous run comparison, open findings by severity, and recent runs.
  - `GET /api/qa/runs` — Admin only; filterable by `runType`, `status`, `from`, `to`, `limit`.
  - `GET /api/qa/runs/:id` — Admin only; returns full test case results, linked security audit, and previous-run delta.
  - `GET /api/qa/findings` — Admin only; filterable by `severity`, `status`, `auditId`.
  - `POST /api/qa/run` — Admin only; validates `runType` against strict allowlist, enforces a single-flight concurrency mutex (`409 Conflict` if a run is already active), persists results to PostgreSQL, marks crashed runs as `crashed`, and exports reports to `audit/`.
  - `GET /api/qa/runs/:id/export?format=test-md|test-json|security-md` — Admin only; downloads sanitized Markdown or JSON reports as file attachments.

---

## 5. QA & Security Dashboard UI

Accessible via **QA & Security** in the left navigation (`src/components/QaDashboardView.tsx`, lazy-loaded via `React.lazy`):

- Displays an **Administrator Access Required** gate to unauthenticated or non-admin users without leaking any internal data.
- Provides one-click controlled execution buttons (**Run All Tests**, **Unit**, **Integration**, **API**, **E2E**, **Security Audit**, **AI Regression**).
- Displays KPI summary cards (Total Runs/Cases, Pass Rate with delta vs previous run, Duration, Open Findings by Severity), Previous vs Latest Run comparison (regressions & improvements), Latest Security Audit card, filterable Recent Runs table, per-run Test Case Result inspector, Security Findings ledger + remediation detail panel, and direct `.md` / `.json` report export buttons.

---

## 6. How to Run Tests & Security Audits

```bash
# Run the full 34-check QA + Security Audit suite (persists to PostgreSQL when SQL_* env vars are active & exports to audit/)
npm test

# Run individual automated suites
npm run test:unit          # 18 unit tests (6 QA unit + 12 existing analysis/taxonomy tests)
npm run test:integration   # 5 integration tests (embeddings, OCR fallback, JD PDF, isolated DB CRUD, pipeline)
npm run test:api           # 5 live HTTP API validation & auth tests
npm run test:e2e           # 2 full live /api/analyze & /api/analyze-stream E2E tests
npm run test:ai            # 4 AI accuracy & regression tests (V-02, V-12, V-20)
npm run test:security      # 12 automated security audit checks (SEC-001..SEC-012)

# Run security audit with report export to audit/
npm run audit:run

# Run CLI runner with --strict (exits non-zero if any check or open security finding fails)
npx tsx tests/cli-runner.ts --suite=all --strict
```

Generated reports are written automatically to:
- `audit/latest-test-report.md`
- `audit/latest-test-results.json`
- `audit/latest-security-audit.md`

---

## 7. Actual Baseline Execution Results (Run #1 — Persisted to Cloud SQL)

Executed live against the running M5 Express server and Cloud SQL PostgreSQL database:

- **Total Checks:** 34 (`0` blocked, `0` skipped)
- **Passed:** **26** (`100%` of all 22 functional, integration, API, E2E, and AI accuracy/regression checks + `4` verified-secure security controls)
- **Failed (Open Security Findings):** **8** (truthfully reported without fabrication or silent auto-patching)
- **Overall Pass Rate (Executed):** **76.5%**
- **Verified Secure Controls (4):**
  - `SEC-003` (`high`): Oversized file (>10 MB) and JSON (>4 MB) payload limits enforced.
  - `SEC-004` (`high`): Deterministic matching & scoring isolates prompt-injection score overrides.
  - `SEC-008` (`critical`): Unauthorized access returns `401`; cross-user DB IDOR isolation verified live.
  - `SEC-011` (`high`): `bun audit` verified `0` dependency vulnerabilities.
- **Open Security Findings Recorded for Remediation (8):**
  - **High (2):** `SEC-005` (missing API rate limiting), `SEC-007` (untrusted client-supplied `compatibilityScore` persisted by `POST /api/analyses/save`).
  - **Medium (5):** `SEC-001` (PDF `/JavaScript` & `/OpenAction` markers not rejected), `SEC-002` (GIF/HTML polyglot PDF magic offset allowed), `SEC-006` (no concurrent analysis cap on `/api/analyze*`), `SEC-010` (missing baseline HTTP security headers on `/api/health`), `SEC-012` (malformed JSON returns `500` & unknown `/api/*` falls through to SPA HTML `200`).
  - **Low (1):** `SEC-009` (`X-Powered-By: Express` header exposed; zero secrets or stack traces leaked).
- **Remaining Blocked Checks / Limitations:**
  - `0` checks blocked when executed against the running unified M5 server with Cloud SQL and Gemini credentials configured.
  - If executed offline or in a shell without `SQL_HOST` / `GEMINI_API_KEY`, DB integration tests and live Gemini E2E tests explicitly report `blocked` rather than fabricating passes.
  - Browser-interactive Google OAuth sign-in for the admin dashboard requires an interactive user session; unauthenticated access protection (`401` on `/api/qa/*`, `isAdmin: false` on `/api/qa/access`, and the UI Administrator Access Gate) is verified automatically.
