# SkillGap M5 — Part 3 Security, Performance, Dependency & Deployment Audit Report
## Frontend Security, XSS, Integration, Performance, Dependencies, Code Quality & Deployment Readiness

- **Project Name:** SkillGap M5 — Resume vs JD Gap Analyser  
- **Problem ID:** M5  
- **Audit Scope:** Part 3 — Frontend Security, XSS & UGC, Frontend-Backend Integration, Performance & Resource Management, Python & Node Dependencies, AI-Generated Code Quality, Vercel & Render Deployment Security, GitHub Secret Management, and Deployment Readiness  
- **Audit Date:** 2026-11-20  
- **Audit Mode:** Strictly Read-Only (no frontend/backend code modified, no dependencies updated, no config files deleted)

---

## Executive Summary

Part 3 completes the full-stack security, reliability, and deployment audit of SkillGap M5 using direct source inspection, production bundle (`dist/`) inspection, `bun audit`, static scans, and Parts 1–2 evidence.

### Overall Part 3 Findings Breakdown

| Severity | Confirmed (Code / Executed Scan) | Theoretical / Readiness Blocker | Total |
|---|---|---|---|
| **CRITICAL** | 0 | 0 | **0** |
| **HIGH** | 3 | 0 | **3** |
| **MEDIUM** | 8 | 2 | **10** |
| **LOW** | 6 | 1 | **7** |
| **INFORMATIONAL** | 3 | 0 | **3** |
| **Total** | **20** | **3** | **23** |

### Verified Strengths
- **Zero XSS Sinks & Zero Secret Leakage in Frontend Bundle:** Static scans of `src/`, `index.html`, and the compiled `dist/assets/index-D7kMrqAR.js` confirmed zero occurrences of `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `document.write`, `eval`, `GEMINI_API_KEY`, `SQL_PASSWORD`, `SQL_ADMIN_PASSWORD`, or `firebase-admin`.
- **Zero Production Source Maps:** Verified `dist/assets/` contains zero `.map` files (`build.sourcemap` defaults to `false`).
- **Zero `localStorage` / `sessionStorage` / Custom Cookie Token Storage:** Confirmed via static scan; Firebase Auth manages short-lived ID tokens in SDK memory/IndexedDB and transmits them via `Authorization: Bearer` headers.
- **Zero Mock Data or Fake Dashboard Results:** Every chart, score, matched/missing skill row, JD quote, and 14-day roadmap item renders live backend responses.

### Deployment Readiness Verdict
- **Local Execution:** **READY** (verified running on port `3000`, `7/7` unit tests passing, live `/api/analyze` working).
- **Staging / AI Studio Unified Preview:** **CONDITIONAL — FIX HIGH FINDINGS FIRST** (blocked by Part 1–2 security gaps: unthrottled AI endpoints, `Java`=`JavaScript` / `React`=`React Native` semantic false positives, post-extraction PDF page check, `POST /api/analyses/save` mass-assignment, and dev-mode `/server.ts` exposure).
- **Public Production (Unified Cloud Run):** **NOT READY** (multiple HIGH blockers from Parts 1–3).
- **Split Vercel + Render Deployment (per Original Spec):** **BLOCKED / NOT CONFIGURED** (no `vercel.json`, no `render.yaml`, no `Dockerfile`, no `VITE_API_BASE_URL`, no CORS allowlist, and no Python/FastAPI/SQLite backend).

---

## 1. Frontend Security Findings

| Check | Result | Evidence (`File:Line`) | Verdict |
|---|---|---|---|
| Unsafe HTML / XSS sinks | Zero `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function` across `src/` & `index.html` | Static `grep` scan | **PASS** |
| Exposed API keys / `VITE_` secrets | Zero `VITE_*` vars in `src/`; zero backend secrets in `dist/assets/index-D7kMrqAR.js`; only public Firebase Web SDK config imported (`src/lib/firebase.ts:3`) | Static `grep` on `src/` & `dist/assets/*.js` | **PASS** |
| `localStorage` / `sessionStorage` PII or tokens | Zero uses of `localStorage` or `sessionStorage` in `src/` | Static `grep` scan | **PASS** |
| Unsafe URL / `window.open` handling | Zero `window.open`; only `URL.createObjectURL` blob download (`RoadmapView.tsx:69–77`) using sanitized filename; no dynamic external `href` from AI text | `RoadmapView.tsx:66–78`, static `grep` | **PASS** |
| Backend vs. client file validation | Client checks `.pdf`/MIME/size (`AnalyzeView.tsx:52–65`); backend re-validates size/MIME/magic header/PDF structure (`pdfProcessor.ts:27–136`), though backend has loose `%PDF-` offset & late page check (Part 1 `M5-SEC-003`, `M5-SEC-006`) | `AnalyzeView.tsx:52–65`, `pdfProcessor.ts` | **PARTIAL** |
| Auth token handling & sign-out hygiene | Short-lived Bearer tokens fetched via `current.getIdToken()` (`AuthContext.tsx:55–63`); **BUG:** `activeReport` is NOT cleared on Sign Out (`App.tsx:45, 54–59`) | `AuthContext.tsx:55–63`, `App.tsx:45–59` | **PARTIAL** (`M5-P2-015`) |
| API response validation on client | `parseResponse<T>` (`src/services/api.ts:22`) casts `data as T` blindly with no runtime shape check; no React Error Boundary wraps the app (`src/main.tsx`, `src/App.tsx`) | `src/services/api.ts:7–23`, `src/App.tsx` | **FAIL** (`M5-P3-004`) |
| Frontend TypeScript strictness | `tsconfig.json` omits `"strict": true` (`strictNullChecks`, `noImplicitAny` disabled) | `tsconfig.json:2–26` | **FAIL** (`M5-P3-012`) |
| External Google Fonts without SRI | `index.html:18–23` loads Google Fonts CSS over HTTPS without CSP rules (minor; SRI unsupported for dynamic Google Fonts UA CSS) | `index.html:18–23` | **INFO** |

---

## 2. XSS and User-Generated Content Findings

- **Audit Verdict: PASS (No Confirmed DOM XSS Vulnerabilities).**
- Every untrusted input and AI-generated field was traced to its exact React render site:
  - **Resume filename & JD source name:** Rendered as React text children in `ReportView.tsx:147–149`, `RoadmapView.tsx:86`, `HistoryView.tsx:216`, `OverviewView.tsx:139, 261`.
  - **Job title, company name, extracted skills, matched/missing skill names, JD evidence snippets:** Rendered as React text children in `ReportView.tsx:161–164, 498–544, 590–610`.
  - **Gemini Gap Advisor answer:** Rendered inside `<div className="... whitespace-pre-line">{coachAnswer}</div>` (`ReportView.tsx:664–666`) — plain text, never parsed as HTML or Markdown.
  - **14-day learning roadmap (`skill`, `objective`, `activities`, `exercise`, `expectedOutcome`):** Rendered as plain React text nodes in `RoadmapView.tsx:232–275`; external URLs (if ever emitted by Gemini) are NOT converted into clickable `<a>` links, preventing phishing/XSS clicks in the browser.
  - **Error messages (`submitError`, `resumeError`, `jdError`, `coachError`, `historyError`, `authError`):** Rendered strictly as React text nodes.
- **Residual Risk (`M5-P3-014` — LOW):** `buildRoadmapMarkdown` (`src/utils/formatters.ts:118–146`) writes unescaped AI-generated text into a downloadable `.md` file (`14-day-roadmap-*.md`), which could contain raw Markdown links or HTML tags if opened in a permissive third-party Markdown viewer.

---

## 3. Frontend-Backend Integration Findings

- **Data Authenticity Verdict: PASS (Zero Mock Data / Zero Hardcoded Scores / Zero Static Plans).**
  - All KPIs (`OverviewView.tsx:35–55`), charts (`ReportView.tsx:82–98`), skill tables (`ReportView.tsx:58–80`), and 14-day schedules (`RoadmapView.tsx:26–35`) are derived exclusively from real API responses.
- **Confirmed Integration & Error-Handling Defects:**
  1. **`M5-P3-002` (MEDIUM — Hardcoded Relative `/api/*` Base URLs):** All 8 fetch calls in `src/services/api.ts:49, 125, 136, 147, 159, 171, 183, 194` hardcode relative `/api/...` paths with no `VITE_API_BASE_URL` configuration, blocking split-origin deployments (e.g., Vercel frontend + Render backend).
  2. **`M5-P3-003` (MEDIUM — Fragile NDJSON Stream Parsing & Missing Client Fetch Timeouts):**
     - `runGapAnalysis` (`src/services/api.ts:79, 96`) calls `JSON.parse(line)` **without `try/catch`**; a truncated proxy chunk or gateway HTML timeout error mid-stream throws a raw `SyntaxError` to the UI.
     - None of the 7 non-streaming API helpers (`quickScanJd`, `saveSessionAnalysis`, `fetchAnalysisHistory`, `fetchAnalysisById`, `updateRoadmapProgress`, `deleteAnalysisById`, `askGapCoach`) attach an `AbortController` timeout—stalled responses leave loading spinners stuck indefinitely.
  3. **`M5-P3-004` (MEDIUM — No React Error Boundary & Unvalidated Client API Shapes):** `parseResponse<T>` (`src/services/api.ts:22`) performs an unchecked `as T` cast, and `src/App.tsx` / `src/main.tsx` wrap the UI in no React Error Boundary—any unexpected backend shape mismatch (or corrupted DB JSONB row) white-screens the entire app.
  4. **`M5-P3-005` (LOW — Silent Optimistic State Desync on Roadmap Toggle):** `handleToggleDayComplete` (`src/App.tsx:166–192`) updates `activeReport.completedDays` optimistically, but if `updateRoadmapProgress` fails (`catch` at line 188), it only calls `console.error` without reverting the checkbox or showing an error banner.
  5. **`M5-P3-011` (LOW — Unused REST Endpoint by UI / Split Contract):** UI exclusively calls `POST /api/analyze-stream`, while `POST /api/analyze` is unused by the React client (still useful as a REST API, but duplicates ~60 lines of handler code in `server.ts`).

---

## 4. Performance Findings

| Area | Measurement / Code Evidence | Risk Level | Finding |
|---|---|---|---|
| **Monolithic Frontend Bundle** | `dist/assets/index-D7kMrqAR.js` is **`2,154,838` bytes (2.15 MB uncompressed)** single chunk! `App.tsx` eagerly imports Recharts (`ReportView`), Firebase (`AuthContext`), and all 5 views with zero `React.lazy()` code splitting or Rollup `manualChunks` (`vite.config.ts`) | **HIGH** | `M5-P3-001` |
| **PDF Parsing Latency & Event Loop** | `unpdf` runs synchronously on the main Node.js process with no timeout and extracts all pages before checking `pageCount > 25` (`pdfProcessor.ts:98–143`) | **HIGH** | Cross-ref Part 1 `M5-SEC-003` |
| **Whole-PDF OCR Overhead** | Mixed PDFs with 1 low-density page re-OCR the entire PDF buffer (up to 10 MB → 13.3 MB base64) via Gemini (`pdfProcessor.ts:150–155`) | **MEDIUM** | Cross-ref Part 1 `M5-SEC-008` |
| **History Over-Fetching** | `listAnalysesByUser` (`src/db/repository.ts:120–124`) executes `SELECT *` including large JSONB columns with no `LIMIT` and no index on `analyses.user_id` | **MEDIUM** | Cross-ref Part 2 `M5-P2-009` |
| **Gemini End-to-End Latency** | Live analyses complete in ~8–12s (`gemini-3.1-flash-lite` primary); however, client-side `AbortSignal` cancellation does not abort server-side Gemini stages (`server.ts:197–275`) | **LOW** | Cross-ref Part 1 `M5-SEC-017` |
| **Sentence Transformer Model Loading** | **BLOCKED / N/A** — Sentence Transformers is not used; embeddings call remote `gemini-embedding-2` (which currently falls back to lexical mode in live tests) | **INFO** | Cross-ref Part 1 `M5-SEC-014` |
| **Frontend Re-Renders** | `ReportView.tsx` and `HistoryView.tsx` properly memoize filtered lists and Recharts data via `useMemo` | **PASS** | — |

---

## 5. Resource Consumption Findings & Recommended Operational Limits

- **RAM Risk (`server.ts:33–39`, `geminiService.ts:115`):** `multer.memoryStorage()` allows 2 × 10 MB = 20 MB per request in RAM. During OCR fallback, `pdfBuffer.toString('base64')` allocates an additional ~13.3 MB string per file, plus `unpdf` internal buffers (never explicitly freed via `pdfProxy.destroy()`). Without a concurrency cap, 15 simultaneous uploads can spike Node.js heap memory by >500 MB and trigger container OOM kills.
- **Database Pool Exhaustion (`src/db/index.ts:11–18`):** `pg.Pool` has `max: 10` connections with no `idleTimeoutMillis` or `statement_timeout`.

### Recommended Production Limits

| Resource Dimension | Current Limit | Recommended Limit |
|---|---|---|
| Upload file size | 10 MB per file (2 files) | **5 MB per PDF** (sufficient for resumes/JDs; cuts RAM & OCR payload in half) |
| PDF page count | 25 pages (checked *after* extraction) | **15 pages** checked *before* `extractText` |
| PDF parse timeout | None | **10 seconds** (in isolated worker or bounded promise) |
| Concurrent analyses | Unbounded | **Max 4 concurrent pipelines** per instance (`503` retry-after when full) |
| Total pipeline duration | ~100s cumulative per-stage timeouts | **45 seconds** overall `AbortController` budget (aborted on client disconnect) |
| Pasted JD text length | Unbounded in HTTP/DB; sliced to 20k in LLM | **Max 25,000 characters** validated at route entry |
| Gemini output tokens | Unbounded (`maxOutputTokens` unset) | Extraction: `4,096`, Quick Scan: `512`, Roadmap: `4,096`, Coach: `768`, OCR: `8,192` |
| API request frequency | None | `/api/analyze*`: **10 req / 15 min per IP/user**; `/api/coach` & `/api/jd/quick-scan`: **30 req / 15 min** |

---

## 6. Python Dependency Security Findings

- **Status: BLOCKED (Not Applicable to Current Codebase).**
- `requirements.txt`, `pyproject.toml`, and Python backend source files do **not** exist in the workspace.
- Automated Python scanners (`pip-audit`, `bandit`, `semgrep`) were checked via `which`: **none are installed** (`NOT_INSTALLED`).
- **Advisory:** If a Python/FastAPI port is created later, pin exact hashes/versions in `requirements.txt` and run `pip-audit` + `bandit` in CI before deploying to Render.

---

## 7. Node and Frontend Dependency Security Findings

- **Lockfile Reality:** `bun.lock` is present; `package-lock.json` is absent (so `bun audit` was executed instead of `npm audit`).
- **Executed `bun audit` Results (3 Advisories Confirmed):**
  1. **`@grpc/grpc-js` (`1.9.16`, transitive via `firebase` & `firebase-admin`) — HIGH (`GHSA-m9gg-hp2v-232j`) & LOW (`GHSA-f596-whhp-79r4`):** Certificate authorization edge case in `getAuthContext` and status error leakage (`< 1.13.6`).
  2. **`esbuild` (`0.18.20`, transitive via `drizzle-kit`, alongside `0.25.12`/`0.28.2`) — MODERATE (`GHSA-67mh-4wv8-2f99`):** Dev server cross-origin read exposure (`<= 0.24.2`).
- **Dependency Hygiene Defects (`M5-P3-006` — MEDIUM):**
  - **Unused packages installed:** `motion` (`^12.23.24` in `dependencies` — **0 imports** anywhere) and `autoprefixer` (`^10.4.21` in `devDependencies` — **0 imports**, redundant with Tailwind CSS v4 `@tailwindcss/vite`).
  - **Build/dev tools misplaced in runtime `dependencies`:** `@types/multer`, `@types/pg`, `drizzle-kit` (which pulls vulnerable `esbuild@0.18.20`), `vite`, `@vitejs/plugin-react`, and `@tailwindcss/vite` are listed under `dependencies` instead of `devDependencies`, bloating production installs and enlarging the production attack surface.
  - **Upgrade Compatibility Note:** Upgrading `firebase` (`^13.4.0`) / `firebase-admin` (`^14.5.1`) and `drizzle-kit` (`^0.31.11`) should be tested against existing Auth and Drizzle push workflows rather than blindly running `--latest` across major versions.

---

## 8. AI-Generated Code Quality Audit Findings

| Pattern Audited | Finding | Exact File & Line Evidence | Severity |
|---|---|---|---|
| **Duplicate route logic** | `POST /api/analyze` and `POST /api/analyze-stream` duplicate ~60 lines of multipart extraction, DB save, and session-report fallback logic | `server.ts:133–194` vs `server.ts:197–275` | **LOW** (`M5-P3-011`) |
| **Dead / unreachable code** | `deepThinking?: boolean` (`ThinkingLevel.HIGH`) branch in `generatePersonalizedLearningPlan` is never called by any route or UI control | `src/server/geminiService.ts:515, 554–579` | **LOW** (`M5-P3-010`) |
| **Unused persisted field** | `resumeTextExcerpt` is computed, saved in PostgreSQL, and returned over HTTP, yet never displayed in any React view (and stores candidate PII) | `src/server/analysisPipeline.ts:170`, `src/db/schema.ts:30` | **MEDIUM** (`M5-P2-012`) |
| **Stale documentation** | `README.md:14` claims roadmaps use `gemini-4-hydrogen` (`ThinkingLevel.HIGH`) and omits `POST /api/analyze-stream`; `.env.example` omits all 6 required `SQL_*` env vars | `README.md:14, 21–31`, `.env.example:1–10` | **LOW** (`M5-P3-013`) |
| **Unused packages** | `motion` (0 imports) and `autoprefixer` (0 imports) remain in `package.json` | `package.json:27, 40` | **MEDIUM** (`M5-P3-006`) |
| **Non-strict TypeScript** | `"strict": true` missing in `tsconfig.json`; unsafe `!` assertions used in `server.ts:296, 304` | `tsconfig.json:2–26`, `server.ts:296, 304` | **MEDIUM** (`M5-P3-012`) |
| **Unprotected NDJSON parse & silent catch** | `JSON.parse` without `try/catch` in `runGapAnalysis`; silent failure in `handleToggleDayComplete` | `src/services/api.ts:79, 96`, `src/App.tsx:188–190` | **MEDIUM** (`M5-P3-003`) |
| **Debug asset leaked into `public/` & `dist/`** | Earlier conversation screenshot `public/assets/aistudio/image_64dbb954.png` is copied into `dist/assets/aistudio/` during `vite build` | `public/assets/aistudio/image_64dbb954.png`, `dist/assets/aistudio/` | **LOW** (`M5-P3-009`) |
| **Mock data / fake scores / circular deps** | Zero mock data, zero hardcoded scores, zero circular module imports | Verified across `src/` | **PASS** |

---

## 9. Deployment Security — Vercel Findings

- **Status: NOT CONFIGURED / BLOCKED FOR SPLIT DEPLOYMENT (`M5-P3-007` — HIGH for Vercel target).**
- **Inspection Findings:**
  1. **No `vercel.json` or SPA rewrite rule:** Deploying the React SPA to Vercel without rewrites will break direct URL refreshes if client routing is added, and `/api/*` requests will 404 unless proxied or pointed at an external backend URL.
  2. **No `VITE_API_BASE_URL` support (`M5-P3-002`):** `src/services/api.ts` hardcodes relative `/api/...` URLs; pointing to a separate Render backend requires `VITE_API_BASE_URL` + CORS allowlisting on the backend.
  3. **Production Build & Secret Hygiene (PASS):** `vite build` succeeds cleanly, emits zero `.map` source maps, and bundles zero server secrets (`GEMINI_API_KEY` verified absent from `dist/assets/index-D7kMrqAR.js`).
  4. **Bundle Bloat (`M5-P3-001`):** Single 2.15 MB JS bundle degrades mobile LCP/TTI on public deployments.
  5. **Debug Artifact in `public/` (`M5-P3-009`):** `public/assets/aistudio/image_64dbb954.png` will be publicly served at `/assets/aistudio/image_64dbb954.png` unless removed.

---

## 10. Deployment Security — Render Findings

- **Status: NOT CONFIGURED / STACK MISMATCH (`M5-P3-008` — HIGH for Render target).**
- **Inspection Findings:**
  1. **No `Dockerfile`, `render.yaml`, FastAPI startup command, Tesseract binary install, or Sentence Transformers cache configuration exists** because the backend is Node.js/Express (`server.ts`), not Python/FastAPI.
  2. **Database Persistence Advantage (vs. Ephemeral SQLite):** Because the current app uses managed **Cloud SQL PostgreSQL** rather than a local SQLite file on ephemeral disk, **database records WILL survive container restarts and redeployments**—solving the classic Render ephemeral-disk SQLite wipeout problem. (However, deploying on Render outside GCP would require Cloud SQL public IP + SSL/TLS client certificates or Cloud SQL Auth Proxy, whereas `src/db/index.ts` currently omits SSL config — Part 2 `M5-P2-010`.)
  3. **Production Start Script Compatibility Check (`package.json:8`):** `"start": "node server.ts"` relies on Node.js native TypeScript type-stripping (`v22.23.2` in this container). On Render, the default Node runtime must be pinned (`"engines": { "node": ">=22.18.0" }`) or built/started with `tsx`—otherwise older Node 20/22 defaults will crash on `node server.ts`! *(Actual `NODE_ENV=production node server.ts` execution was NOT tested to avoid conflicting with port 3000 → marked **NOT TESTED**.)*
  4. **CORS & Proxy Trust Missing:** Split Vercel → Render requests will fail without explicit `ALLOWED_ORIGINS` CORS middleware and `app.set('trust proxy', 1)`.

---

## 11. GitHub and Secret Management Findings

| Check | Status | Evidence |
|---|---|---|
| Git repository & history scan | **BLOCKED (No `.git` directory)** | `ls -a` / `[ -d .git ]` confirmed workspace is not currently a Git repository; commit history secret scan cannot run until Git is initialized |
| `.gitignore` coverage | **PARTIAL (`M5-P3-009` — MEDIUM)** | Properly ignores `.env*` (`!.env.example`), `node_modules/`, `dist/`, `*.log`; **MISSING `.playwright-cli/`** — 6 temporary test PDFs (`test-resume.pdf`, `audit-*.pdf`), logs, and PNG screenshots currently in `.playwright-cli/` would be committed on `git add .`! |
| `.env.example` completeness | **FAIL (`M5-P3-013` — LOW)** | Documents `GEMINI_API_KEY` and `APP_URL`, but omits all 6 PostgreSQL env vars (`SQL_HOST`, `SQL_USER`, `SQL_PASSWORD`, `SQL_DB_NAME`, `SQL_ADMIN_USER`, `SQL_ADMIN_PASSWORD`) |
| `firebase-applet-config.json` | **INFO (Acceptable)** | Contains public Firebase Web SDK identifiers (intended to be public in browser apps; Firebase security relies on server-side `verifyIdToken` + Firestore/SQL rules, not hiding web config). Never add Firebase Admin service-account private keys to the repo. |
| Uploaded resumes / DB files on disk | **PARTIAL** | No SQLite `.db` files exist; no user-uploaded resumes exist in `src/` or `public/`; however, synthetic test PDFs exist in unignored `.playwright-cli/` and a user screenshot exists in `public/assets/aistudio/image_64dbb954.png`. |

---

## 12. Deployment Readiness Assessment

| Environment | Verdict | Blocking Issues |
|---|---|---|
| **Local Development** | **READY** | Works on `http://localhost:3000`; `7/7` unit tests pass; live `/api/analyze` operational. |
| **Staging / Controlled Demo** | **CONDITIONAL (Not Recommended Until P1 Fixes Land)** | Fix semantic false positives (`Java`=`JavaScript`, `React`=`React Native`), post-extraction PDF page limit, dev-mode `/server.ts` exposure, and `POST /api/analyses/save` validation. |
| **Public Production (Unified Cloud Run)** | **NOT READY** | Blockers: (1) No rate limiting/concurrency caps (`M5-SEC-001`, `M5-P2-001`), (2) `POST /api/analyses/save` mass-assignment (`M5-P2-002`), (3) Semantic matching false positives & embedding fallback (`M5-SEC-002`, `M5-SEC-014`), (4) PDF parser timeout/late page limit (`M5-SEC-003`), (5) Missing resume evidence verification & prompt delimiters (`M5-SEC-004`), (6) Missing HTTP security headers & body-parser error sanitization (`M5-P2-004`, `M5-P2-005`), (7) High dependency advisory in `@grpc/grpc-js` (`M5-SEC-005`), (8) 2.15 MB unsplit JS bundle (`M5-P3-001`), (9) PII minimization & AI disclosure (`M5-P2-012`). |
| **Split Vercel + Render Deployment** | **BLOCKED** | All Production blockers above PLUS: no `vercel.json`/`render.yaml`, no `VITE_API_BASE_URL`, no CORS allowlist, no Node engine pinning for `node server.ts`, and no Python/FastAPI stack if mandated by spec. |

---

## 13. Vulnerability & Reliability Register (Part 3)

| Finding ID | Title | Severity | Status | Affected File & Function / Component |
|---|---|---|---|---|
| `M5-P3-001` | Monolithic 2.15 MB Frontend JS Bundle (No Code Splitting) | **HIGH** | Confirmed (Executed) | `vite.config.ts`; `src/App.tsx` |
| `M5-P3-002` | Hardcoded Relative `/api/*` Base URLs Block Split-Origin Deployment | **MEDIUM** | Confirmed (Code) | `src/services/api.ts` (lines 49–194) |
| `M5-P3-003` | Unguarded `JSON.parse` in NDJSON Stream & Missing Client Fetch Timeouts | **MEDIUM** | Confirmed (Code) | `src/services/api.ts` (`runGapAnalysis`, `parseResponse`, all fetch helpers) |
| `M5-P3-004` | Missing React Error Boundary & Unchecked Client Response Type Casts | **MEDIUM** | Confirmed (Code) | `src/main.tsx`; `src/App.tsx`; `src/services/api.ts` (`parseResponse`) |
| `M5-P3-005` | Silent Optimistic Checkbox Desync When `PATCH /progress` Fails | **LOW** | Confirmed (Code) | `src/App.tsx` (`handleToggleDayComplete`, lines 166–192) |
| `M5-P3-006` | Vulnerable Transitive Deps (`@grpc/grpc-js`, `esbuild`), Unused & Misclassified Packages | **HIGH** | Confirmed (Executed) | `package.json`; `bun.lock` (`motion`, `autoprefixer`, `drizzle-kit`, `vite`, `@types/*`) |
| `M5-P3-007` | Missing Vercel Production Deployment Configuration (`vercel.json`, API Base URL) | **MEDIUM** | Confirmed (Code) | Repository root; `src/services/api.ts` |
| `M5-P3-008` | Missing Render Deployment Config, Node Engine Pin & Production Startup Verification | **HIGH** | Confirmed (Code) | `package.json` (`start` script); Repository root (no `Dockerfile`/`render.yaml`) |
| `M5-P3-009` | Unignored `.playwright-cli/` Test PDFs/Logs & Debug Screenshot Bundled into `dist/` | **MEDIUM** | Confirmed (Executed) | `.gitignore`; `.playwright-cli/*`; `public/assets/aistudio/image_64dbb954.png` |
| `M5-P3-010` | Dead / Unreachable `deepThinking` Code Path in Roadmap Generator | **LOW** | Confirmed (Code) | `src/server/geminiService.ts` (`generatePersonalizedLearningPlan`, lines 554–579) |
| `M5-P3-011` | Duplicated Analysis Handler Logic Between `/api/analyze` and `/api/analyze-stream` | **LOW** | Confirmed (Code) | `server.ts` (lines 133–194 vs 197–275) |
| `M5-P3-012` | TypeScript Strict Mode Disabled (`strict: true` Missing) | **MEDIUM** | Confirmed (Code) | `tsconfig.json` (lines 2–26) |
| `M5-P3-013` | Incomplete `.env.example` (Missing `SQL_*` Vars) & Stale `README.md` Architecture Claims | **LOW** | Confirmed (Code) | `.env.example`; `README.md` (lines 14, 21–31) |
| `M5-P3-014` | Unescaped AI Text in Exported Markdown File | **LOW** | Theoretical (Code) | `src/utils/formatters.ts` (`buildRoadmapMarkdown`, lines 118–146) |
| `M5-P3-015` | Python Dependency & Static Scans (`pip-audit`, `bandit`, `semgrep`) Not Applicable | **INFORMATIONAL** | BLOCKED | No Python backend or scanners installed |
| `M5-P3-016` | Git Commit History Secret Audit Not Possible (No `.git` Repo) | **INFORMATIONAL** | BLOCKED | Workspace root (not a Git repo) |
| `M5-P3-017` | Production `NODE_ENV=production node server.ts` Startup Not Executed | **INFORMATIONAL** | NOT TESTED | `package.json` (`start`), `server.ts:442–448` |

---

### Detailed Finding Specifications (Key Part 3 Issues)

#### `M5-P3-001` — Monolithic 2.15 MB Frontend JS Bundle (No Code Splitting)
- **Severity:** HIGH (Confirmed — Executed Inspection)
- **Affected File:** `vite.config.ts`, `src/App.tsx`
- **Affected Function / Component:** `WorkspaceApp` (`App.tsx:22–26`), Vite build config
- **Evidence:** `dist/assets/index-D7kMrqAR.js` is `2,154,838` bytes (2.15 MB). `App.tsx` statically imports `ReportView` (pulling in Recharts + D3), `AnalyzeView`, `RoadmapView`, `HistoryView`, and Firebase Auth in the initial bundle.
- **Potential Impact:** Slow initial page load, high bandwidth usage, and degraded mobile responsiveness.
- **Recommended Fix:** Lazy-load `ReportView`, `RoadmapView`, `HistoryView`, and `AnalyzeView` with `React.lazy()` + `<Suspense>`, and configure `build.rollupOptions.output.manualChunks` in `vite.config.ts` to separate `firebase` and `recharts` vendor chunks.
- **Verification Method:** Run `npm run build` and verify initial entry chunk drops below `500 KB` uncompressed.

#### `M5-P3-002` — Hardcoded Relative `/api/*` Base URLs
- **Severity:** MEDIUM (Confirmed — Code Inspection)
- **Affected File:** `src/services/api.ts`
- **Affected Function / Component:** All exported API client functions (`lines 49, 125, 136, 147, 159, 171, 183, 194`)
- **Evidence:** Calls `fetch('/api/...')` directly with no `import.meta.env.VITE_API_BASE_URL` prefix.
- **Potential Impact:** Prevents deploying the frontend independently on Vercel against a separate backend host.
- **Recommended Fix:** Introduce `const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');` and prefix all API requests (`${API_BASE}/api/...`), keeping empty default for unified hosting.
- **Verification Method:** Build with `VITE_API_BASE_URL=https://api.example.com` and verify compiled fetch targets.

#### `M5-P3-003` — Unguarded `JSON.parse` in NDJSON Stream & Missing Client Fetch Timeouts
- **Severity:** MEDIUM (Confirmed — Code Inspection)
- **Affected File:** `src/services/api.ts`
- **Affected Function / Component:** `runGapAnalysis` (lines 79, 96), `quickScanJd`, `askGapCoach`, `fetchAnalysisHistory`, `fetchAnalysisById`, `saveSessionAnalysis`, `updateRoadmapProgress`, `deleteAnalysisById`
- **Evidence:** `JSON.parse(line)` is unguarded inside the stream loop; only `runGapAnalysis` supports an `AbortSignal`, and none of the fetch helpers enforce a timeout.
- **Potential Impact:** Mid-stream proxy errors surface cryptic `SyntaxError` messages; hung requests leave UI controls stuck in infinite loading states.
- **Recommended Fix:** Wrap NDJSON `JSON.parse` in `try/catch` throwing a clean recoverable message, and create a `fetchWithTimeout` helper (e.g., `25s` for standard CRUD/coach/quick-scan, `75s` for full streaming analysis).
- **Verification Method:** Unit-test `runGapAnalysis` with a mocked malformed NDJSON chunk and a stalled response to confirm graceful error surfacing.

#### `M5-P3-004` — Missing React Error Boundary & Unchecked Client Response Type Casts
- **Severity:** MEDIUM (Confirmed — Code Inspection)
- **Affected File:** `src/main.tsx`, `src/App.tsx`, `src/services/api.ts`
- **Affected Function / Component:** Root React tree & `parseResponse` (`api.ts:7–23`)
- **Evidence:** No Error Boundary component exists; `parseResponse` casts arbitrary parsed JSON directly to `T`.
- **Potential Impact:** Any malformed saved report or unexpected backend error crashes the entire React tree to a blank screen.
- **Recommended Fix:** Add a root React `ErrorBoundary` with a recovery reset button and validate critical report fields (`scoreBreakdown`, `learningPlan`, `extractionMeta`) defensively before rendering.
- **Verification Method:** Trigger a simulated malformed report in a component test and verify the fallback UI renders cleanly.

#### `M5-P3-006` — Vulnerable Transitive Dependencies, Unused Packages & Misclassified `dependencies`
- **Severity:** HIGH (Confirmed — Executed `bun audit` + Import Scan)
- **Affected File:** `package.json`, `bun.lock`
- **Affected Function / Component:** Package manifest
- **Evidence:** `bun audit` flagged `@grpc/grpc-js` (1 High, 1 Low) and `esbuild` (1 Moderate); `motion` and `autoprefixer` have 0 imports; `drizzle-kit`, `vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`, `@types/multer`, `@types/pg` are in runtime `dependencies`.
- **Potential Impact:** Known vulnerabilities in transitive packages and unnecessarily large production installs.
- **Recommended Fix:** Remove unused `motion` and `autoprefixer`, move build/type/migration packages to `devDependencies`, and upgrade `firebase`, `firebase-admin`, and `drizzle-kit` to resolve `@grpc/grpc-js` and `esbuild` advisories.
- **Verification Method:** Run `bun audit`, `npm run lint`, `npm run build`, and unit tests after updating.

#### `M5-P3-008` — Missing Render Deployment Config, Node Engine Pin & Production Startup Verification
- **Severity:** HIGH (Confirmed — Code Inspection)
- **Affected File:** `package.json` (`"start": "node server.ts"`), workspace root
- **Affected Function / Component:** Production server entrypoint
- **Evidence:** No `Dockerfile` or `render.yaml` exists; `package.json` lacks `"engines": { "node": ">=22.18.0" }` even though `"start": "node server.ts"` requires modern Node TypeScript type-stripping (and `server.ts` has no `ssl` DB option for external Render-to-Cloud-SQL TCP links).
- **Potential Impact:** Production startup failure on hosts defaulting to Node 20 or unencrypted external DB connections.
- **Recommended Fix:** Pin Node engine `>=22.18.0` (or compile server with `esbuild`/`tsx` for portable execution), test `NODE_ENV=production npm start` explicitly, and document/add `render.yaml` + TLS DB config if deploying to Render.
- **Verification Method:** Run `NODE_ENV=production node server.ts` against a test port and verify `GET /api/health` (`200`) and `GET /` (`200` serving `dist/index.html`).

#### `M5-P3-009` — Unignored `.playwright-cli/` Test Artifacts & Debug Screenshot Bundled into `dist/`
- **Severity:** MEDIUM (Confirmed — Executed Inspection)
- **Affected File:** `.gitignore`, `.playwright-cli/`, `public/assets/aistudio/image_64dbb954.png`
- **Affected Function / Component:** Repository hygiene & Vite public asset copy
- **Evidence:** `.playwright-cli/` contains 6 test PDFs, console logs, and screenshots and is missing from `.gitignore`; `public/assets/aistudio/image_64dbb954.png` is copied into `dist/assets/aistudio/`.
- **Potential Impact:** Accidental leakage of test artifacts and user debug screenshots into GitHub and public production URLs.
- **Recommended Fix:** Add `.playwright-cli/` to `.gitignore`, clean temporary audit artifacts before committing, and remove unused debug screenshots from `public/assets/aistudio/`.
- **Verification Method:** Run `git status` (after `git init`) and `npm run build` and verify neither `.playwright-cli/` nor unused screenshots appear in tracked files or `dist/`.

#### `M5-P3-012` — TypeScript Strict Mode Disabled
- **Severity:** MEDIUM (Confirmed — Code Inspection)
- **Affected File:** `tsconfig.json`
- **Affected Function / Component:** `compilerOptions` (lines 2–26)
- **Evidence:** `"strict": true` is absent, masking potential null-dereference bugs across frontend and backend.
- **Potential Impact:** Silent runtime `TypeError` crashes on missing optional properties.
- **Recommended Fix:** Enable `"strict": true` in `tsconfig.json` and fix any surfaced nullability checks cleanly.
- **Verification Method:** Run `npm run lint` (`tsc --noEmit`) with zero errors.

---

## 14. Master Prioritized Improvement Roadmap (Consolidated Parts 1–3, Awaiting Approval)

No files have been modified across Parts 1, 2, or 3. Once you approve remediation, the recommended execution order across all three audit reports is:

1. **Wave 1 — Critical Security & Correctness Fixes (HIGH Severity):**
   - **Backend Abuse & Integrity:** Add `app.set('trust proxy', 1)`, per-IP/user rate limiting, concurrency semaphore, `jdText` 25 KB cap, `zod` runtime validation on all routes (including `POST /api/analyses/save`, `PATCH /api/analyses/:id/progress`, `POST /api/coach`), and server-signed session save tokens (`M5-SEC-001`, `M5-P2-001`, `M5-P2-002`, `M5-P2-008`).
   - **Semantic Matching & AI Grounding:** Fix `Java`=`JavaScript` & `React`=`React Native` substring false positives, stop lexical heuristics from overriding embeddings, allow `C`/`R` skills, diagnose/fix `gemini-embedding-2` fallback, add untrusted-document prompt delimiters + anti-injection system instructions, and add resume-side source-text evidence verification (`M5-SEC-002`, `M5-SEC-004`, `M5-SEC-012`, `M5-SEC-014`).
   - **PDF Parser Hardening:** Enforce byte-0 `%PDF-` magic header, check `pageCount <= 15` *before* `extractText`, add parser timeout & `pdfProxy.destroy()` cleanup (`M5-SEC-003`, `M5-SEC-006`).
2. **Wave 2 — HTTP, Auth, Privacy & Database Hardening (MEDIUM Severity):**
   - Disable `X-Powered-By`, add HTTP security headers + `Cache-Control: no-store` on `/api/analyses*`, block `/server.ts` & `/src/db/**` in Vite dev mode (`server.fs.deny`), fix Express JSON/size/503 error sanitization (`400`/`413`/`503`), and add `/api/*` `404` JSON handler (`M5-SEC-010`, `M5-P2-003`, `M5-P2-004`, `M5-P2-005`).
   - Enable `checkRevoked: true`, separate auth `401` vs DB `503` in `requireAuth`, return `401` on invalid explicit Bearer headers in `optionalAuth`, and clear `activeReport` on sign-out (`M5-P2-006`, `M5-P2-007`, `M5-P2-015`, `M5-P2-017`).
   - Redact candidate contact PII before Gemini/DB storage, drop unused `resumeTextExcerpt`, add upload AI privacy notice, and add `DELETE /api/analyses` bulk wipe (`M5-P2-012`).
   - Add `(user_id, created_at)` index + score `CHECK` constraint + summary projection/pagination in `listAnalysesByUser`, pool timeouts, and graceful `SIGTERM` shutdown (`M5-P2-009`, `M5-P2-010`, `M5-P2-011`).
3. **Wave 3 — Frontend Performance, Dependencies & Deployment Hygiene:**
   - Split the 2.15 MB bundle with `React.lazy()` + Rollup `manualChunks`, add a React `ErrorBoundary`, guard NDJSON `JSON.parse`, add client fetch timeouts, roll back failed optimistic checkbox toggles, and support `VITE_API_BASE_URL` (`M5-P3-001`–`M5-P3-005`).
   - Clean up unused/misclassified dependencies and update vulnerable `@grpc/grpc-js`/`esbuild` trees (`M5-SEC-005`, `M5-P3-006`).
   - Clean `.playwright-cli/` & unused `public/assets/aistudio/` debug image, update `.gitignore`, `.env.example`, `README.md`, enable `strict: true`, and verify `NODE_ENV=production node server.ts` (`M5-P3-008`, `M5-P3-009`, `M5-P3-012`, `M5-P3-013`).
