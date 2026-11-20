# SkillGap M5 — Final Remediation & Security Verification Report (Phase 4)

- **Project Name:** SkillGap M5 — Resume vs Job Description Gap Analyser  
- **Problem ID:** M5  
- **Verification Date:** 2026-11-20  
- **Role:** Independent QA Engineer & Security Auditor  
- **Audit Mode:** Strictly Read-Only Verification (no application source code modified during Phase 4)  
- **Remediations Audited:** Phase 1 (High-Severity Bundle, Dependencies, Render Config), Phase 2 (Frontend Reliability, API Config, Safe NDJSON Streaming, Timeouts, ErrorBoundary, Vercel Config), Phase 3 (`.gitignore` & Debug Assets, TypeScript Strict Mode, `.env.example` & `README.md`)

---

## 1. Executive Summary

Following Phases 1–3 remediation, the entire SkillGap M5 codebase was re-inspected and independently tested across all **18 verification dimensions** using live production server execution (`NODE_ENV=production node server.ts`), live streaming API testing with synthetic dummy documents, read-only Cloud SQL PostgreSQL inspection, automated unit tests (`node:test`), TypeScript strict typechecking (`tsc --noEmit`), dependency security scanning (`bun audit`), and headless Chromium browser verification.

### Headline Verification Outcomes
- **All 10 Phase 1–3 Target Findings (`M5-P3-001`, `M5-P3-002`, `M5-P3-003`, `M5-P3-004`, `M5-P3-006`, `M5-P3-007`, `M5-P3-008`, `M5-P3-009`, `M5-P3-012`, `M5-P3-013`)** were fixed and independently verified: **8 PASS**, **2 PARTIAL** (due to external Render/Vercel cloud deploy & split-origin CORS dependencies outside local scope).
- **Dependency Vulnerabilities (`bun audit`):** Reduced from **3 advisories (1 High, 1 Moderate, 1 Low)** to **0 vulnerabilities across 470 packages**.
- **Frontend Initial JS Bundle:** Reduced from **`2,154.84 kB`** (single monolithic chunk) to **`369.46 kB` raw / `113.87 kB` gzipped** (**-82.9%** initial JS reduction), with Recharts (`charts-vendor`, `430.14 kB`) strictly lazy-loaded only on `Analysis Report`.
- **TypeScript Strict Mode (`"strict": true`):** **0 errors** across all **35** workspace files (`server.ts`, `vite.config.ts`, `src/**`), **0 `any` usages**.
- **Automated Unit Tests:** **13 / 13 passed** (`0 failed`).
- **Production Startup Bug Caught & Verified Fixed:** Native Node.js `v22.23.2` startup (`NODE_ENV=production node server.ts`) previously crashed with `ERR_IMPORT_ATTRIBUTE_MISSING` on `firebase-applet-config.json` and now boots cleanly serving `/api/health` (`200`) and `/` (`200`).
- **Remaining Unremediated Risk Areas (Out of Phases 1–3 Scope):** Backend/AI security findings from Parts 1–2 (`V-01` through `V-05`, `V-09` through `V-20`, `V-23` partial, `V-24`–`V-27`) — notably unthrottled AI endpoints, `Java`=`JavaScript` / `React`=`React Native` semantic false positives, post-extraction PDF page check, missing HTTP security headers/CORS allowlist, `POST /api/analyses/save` deep schema validation, and PII retention — remain **FAIL** until a dedicated Backend & AI Security remediation phase is approved.

---

## 2. Independent Verification Matrix (18 Required Checks)

*(Status Legend: `PASS` = Fixed & verified; `PARTIAL` = Core behavior works with known/out-of-scope defect or limitation; `FAIL` = Unresolved; `BLOCKED` = Cannot be tested in workspace due to external cloud/OAuth/fixture constraints; `NOT TESTED` = Not executed.)*

| # | Verification Check | Method Executed | Observed Evidence | Status |
|---|---|---|---|---|
| 1 | **Frontend production build** | `npm run build` (`NODE_ENV=production vite build`) + `dist/` inspection | Built in `762ms`, `0` warnings, `0` `.map` source maps, `0` leaked server secrets in `dist/assets/*.js`, `dist/assets/aistudio` absent, initial JS `369.46 kB` raw (`113.87 kB` gzip), `charts-vendor` (`430.14 kB`) not preloaded in `dist/index.html`. | **PASS** |
| 2 | **Backend startup & health endpoint** | `NODE_ENV=production PORT=3099 node server.ts` + HTTP probes | Started cleanly on Node `v22.23.2` (`0.0.0.0:3099`); `GET /api/health` returned `HTTP 200 {"status":"ok","service":"resume-jd-gap-analyser",...}`; `GET /` returned `HTTP 200` serving `dist/index.html`. | **PASS** |
| 3 | **Resume PDF upload** | Live multipart `POST /api/analyze-stream` & `POST /api/analyze` with synthetic dummy PDF | Uploaded synthetic PDF (`synthetic-candidate.pdf`) accepted in RAM (`multer.memoryStorage()`) with zero disk writes. | **PASS** |
| 4 | **Job description input** | Live `POST /api/analyze` (short JD) & `POST /api/analyze-stream` (full synthetic JD) | Short JD (`"Need dev"`) rejected cleanly with `HTTP 400`; full 308-char synthetic JD processed cleanly. *(Note: Backend upper-bound `jdText` cap `V-01` remains deferred.)* | **PASS** |
| 5 | **Resume text extraction** | Live `POST /api/analyze-stream` with text-selectable synthetic PDF | Extracted `353` characters from 1-page PDF (`resumeExtractionMethod: "pdf_text"`). *(True raster-image scanned PDF OCR fixture remains `BLOCKED`; OCR unavailability without `GEMINI_API_KEY` returned clean `HTTP 503`.)* | **PARTIAL** |
| 6 | **AI skill extraction** | Live `POST /api/analyze-stream` (`gemini-3.1-flash-lite`) | Extracted `8` resume skills and `11` JD skills; taxonomy normalized `ReactJS -> React`, `Postgres -> PostgreSQL`, `RESTful Web Services -> REST API`. | **PASS** |
| 7 | **Semantic skill matching** | Live `POST /api/analyze-stream` + unit tests (`7/7` pass) | Classified partial matches (`GraphQL <- REST API`, `CI/CD <- Git`), **but** `semanticMatchingEngine` fell back to `"lexical_fallback"` live (`V-12`), and Part 1/4 substring false positives (`Java`=`JavaScript`, `React`=`React Native`, `V-02`) remain unfixed (out of Phases 1–3 scope). | **PARTIAL** |
| 8 | **Matched, partially matched & missing skills** | Live `POST /api/analyze-stream` | Accurately separated `5` matched (`TypeScript, Node.js, React, PostgreSQL, REST API`), `2` partial (`GraphQL, CI/CD`), and `4` missing (`AWS, Docker, Kubernetes, Redis Caching`). *(Same `V-02` caveat applies for substring-overlap skill pairs.)* | **PARTIAL** |
| 9 | **Compatibility score** | Live `POST /api/analyze-stream` + unit test | Deterministic weighted score **`70%`**: `technical_skills` `55 × 0.647 = 35.6` + `qualifications` `100 × 0.141 = 14.1` + `experience` `96 × 0.212 = 20.3`. *(Unrelated-resume experience inflation `V-20` remains out of Phases 1–3 scope.)* | **PARTIAL** |
| 10 | **Evidence-based skill gap analysis** | Live `POST /api/analyze-stream` + unit test | **`11/11`** JD skills had `evidenceVerified: true` with verbatim JD quotes. *(Resume-side source grounding `V-04` and excluding unverified JD skills `V-11` remain out of Phases 1–3 scope.)* | **PARTIAL** |
| 11 | **Personalized 14-day learning roadmap** | Live `POST /api/analyze-stream` | Generated exact **14 days** grounded in actual missing/partial skills (`Docker`, `Redis Caching`, `AWS`, `Kubernetes`, `GraphQL`, `CI/CD`, `Integrated Project`, `Interview Readiness`) in `8.56s`. *(Backend URL/skill sanitizer hardening `V-13` remains out of Phases 1–3 scope.)* | **PASS** |
| 12 | **Analysis history & database persistence** | Read-only Cloud SQL query + live unauthenticated API probes | Verified Cloud SQL PostgreSQL live connectivity (`users` and `analyses` tables present; read-only count `0/0`); verified `GET /api/analyses` (`401`) and `DELETE /api/analyses/1` (`401`) auth guards. Live authenticated `POST -> GET -> PATCH -> DELETE` write cycle is **BLOCKED** (requires interactive Google OAuth token). | **BLOCKED** *(Auth Write)* / **PASS** *(Schema & 401 Guards)* |
| 13 | **Streaming API behavior** | Live `POST /api/analyze-stream` + Phase 2 unit tests (`ndjsonStream.ts`) + Chromium interception | Returned `HTTP 200` (`application/x-ndjson; charset=utf-8`), streamed all `5` sequential `progress` events (`[0]`–`[4]`) plus final `result` in `8,564 ms`; client parser verified against split chunks, UTF-8 splits, malformed JSON, gateway HTML, network drops, idle timeouts, and cancellations. | **PASS** |
| 14 | **API errors & network timeouts** | `13/13` unit tests + Chromium 502 HTML & malformed NDJSON interception | Frontend `ApiError`, `fetchWithTimeout` (20s/35s/120s + 45s stream idle), `ErrorBoundary`, and Retry buttons all verified passing with 0 uncaught page errors. *(Backend raw JSON parse `500` & `/api/*` `404` HTML `V-16` remain out of Phases 1–3 scope.)* | **PARTIAL** *(Frontend PASS / Backend V-16 FAIL)* |
| 15 | **Invalid & oversized PDF handling** | Live probes against `NODE_ENV=production node server.ts` | Empty 0-byte PDF -> `400`; corrupt non-PDF -> `422`; oversized `10.5 MB` PDF -> `413`. *(Late `>25` page-count check `V-03` and loose `%PDF-` offset polyglot `V-09` remain out of Phases 1–3 scope.)* | **PARTIAL** |
| 16 | **Production environment configuration** | Inspection of `.env.example`, `.gitignore`, `tsconfig.json`, `README.md`, `package.json` | All 12 env vars documented (Required / Migrations / Optional, 0 secrets); `.gitignore` excludes `.playwright-cli/`, `public/assets/aistudio/`, `*.pdf`, logs, `.env*`; `tsconfig.json` `"strict": true` (`0` errors, `0` `any`); `README.md` matches actual stack & 10 endpoints. | **PASS** |
| 17 | **Dependency vulnerability audit** | Live `bun audit` | **`No vulnerabilities found (checked 470 packages)`** (`0` Critical, `0` High, `0` Moderate, `0` Low). | **PASS** |
| 18 | **Deployment startup configuration** | Local `NODE_ENV=production node server.ts` + `render.yaml` + `vercel.json` + `VITE_API_BASE_URL` build | Local production start & config manifests verified (`PASS`); actual live Render and Vercel cloud deployments are **BLOCKED** (no external cloud accounts/secrets in workspace), and split Vercel -> Render requires backend CORS (`ALLOWED_ORIGINS`, `V-27`). | **PARTIAL** *(Local PASS / Live Cloud BLOCKED)* |

---

## 3. Phase 1–3 Remediated Findings Status Table

| Audit ID | Original Issue | Fix Implemented | Files Changed | Verification Evidence | Final Status |
|---|---|---|---|---|---|
| `M5-P3-001` (`V-07`) | Monolithic `2.15 MB` frontend JS bundle eagerly loading Recharts & all views | Implemented `React.lazy()` + `<Suspense>` for `AnalyzeView`, `ReportView`, `RoadmapView`, `HistoryView`; configured prioritized Vite 8 `rolldownOptions.output.codeSplitting.groups`; enforced `NODE_ENV=production vite build`. | `src/App.tsx`, `vite.config.ts`, `package.json` | `npm run build` initial JS dropped from `2,154.84 kB` to `369.46 kB` raw (`113.87 kB` gzip); Chromium `performance.getEntriesByType('resource')` proved `charts-vendor` (`430.14 kB`) loads strictly on `Analysis Report`. | **PASS** |
| `M5-P3-002` (`V-21`) | Hardcoded relative `/api/*` paths blocking split-origin deployment | Created `src/services/apiConfig.ts` (`normalizeApiBaseUrl`, `buildApiUrl`) reading `VITE_API_BASE_URL` with safe `http/https` validation and empty same-origin default; updated all 8 API helpers. | `src/services/apiConfig.ts`, `src/services/api.ts`, `.env.example` | Unit test passed (`apiReliability.test.ts`); `VITE_API_BASE_URL="https://skillgap-m5.onrender.com/" npm run build` inlined normalized origin cleanly. | **PASS** |
| `M5-P3-003` (`V-21`) | Unguarded NDJSON `JSON.parse` & missing client fetch timeouts | Created `src/services/ndjsonStream.ts` buffering split/UTF-8 chunks, guarding `JSON.parse`, detecting gateway HTML, handling drops/aborts/idle stalls; added `fetchWithTimeout` (20s/35s/120s) + `ApiError`. | `src/services/ndjsonStream.ts`, `src/services/api.ts`, `src/components/AnalyzeView.tsx` | 6 new unit tests + live Chromium test intercepting `/api/analyze-stream` with broken NDJSON and `/api/jd/quick-scan` with 502 HTML verified clean errors + Retry UX (`0` page errors). | **PASS** |
| `M5-P3-004` (`V-21`) | Missing React `ErrorBoundary` & unchecked client response casts | Created `ErrorBoundary.tsx` wrapping root (`main.tsx`) and view slot (`App.tsx`) with Try Again & Reload controls; created `responseValidators.ts` runtime payload guards; added Retry UI in `OverviewView`/`HistoryView`/`AnalyzeView`. | `src/components/ErrorBoundary.tsx`, `src/main.tsx`, `src/App.tsx`, `src/services/responseValidators.ts`, `src/components/OverviewView.tsx`, `src/components/HistoryView.tsx`, `src/components/AnalyzeView.tsx` | `tsc --noEmit` (`0` errors), unit tests on malformed payloads (`PASS`), Chromium verification across all 5 views (`0` page errors). | **PASS** |
| `M5-P3-005` (`V-23` part) | Silent optimistic state desync when `PATCH /progress` fails | Added rollback to `previousDays` and user-facing `notice` banner on error in `handleToggleDayComplete`. | `src/App.tsx` | Code inspection & strict TypeScript compile verified (`PASS`). | **PASS** |
| `M5-P3-006` (`V-06`) | Vulnerable `@grpc/grpc-js` (High/Low) & `esbuild` (Mod), unused `motion`/`autoprefixer`, misclassified dev tools | Added `"overrides"` (`@grpc/grpc-js: ^1.14.7`, scoped `@esbuild-kit/core-utils > esbuild: ^0.25.12`), removed `motion` & `autoprefixer`, moved 6 build/dev tools to `devDependencies`, made `vite` import dynamic in `server.ts`. | `package.json`, `bun.lock`, `server.ts` | Live `bun audit`: **`No vulnerabilities found (checked 470 packages)`**; `drizzle-kit --version` (`v0.31.11`) and `npm run build` verified working. | **PASS** |
| `M5-P3-007` (`V-08` part) | Missing Vercel SPA deployment configuration | Created `vercel.json` (`framework: vite`, `outputDirectory: dist`, SPA rewrite `/((?!api/).*) -> /index.html`, immutable `/assets/*` cache headers) + `VITE_API_BASE_URL` support. | `vercel.json`, `src/services/apiConfig.ts`, `.env.example` | Validated `vercel.json` schema and `VITE_API_BASE_URL` build locally; **live Vercel cloud deploy not executed & split-origin CORS (`V-27`) still needed on backend**. | **PARTIAL** |
| `M5-P3-008` (`V-08` part) | Missing Render config, unpinned Node engine, unverified `node server.ts` prod startup | Added `"engines": { "node": ">=22.18.0" }`, created `render.yaml`, dynamically imported `vite` only in non-prod, fixed Node 22 `ERR_IMPORT_ATTRIBUTE_MISSING` (`with { type: 'json' }`) in `src/lib/firebase-admin.ts`. | `package.json`, `render.yaml`, `server.ts`, `src/lib/firebase-admin.ts` | Live local `NODE_ENV=production PORT=3099 node server.ts` passed (`GET /api/health` `200`, `GET /` `200`); **live Render cloud deploy not executed from workspace**. | **PARTIAL** |
| `M5-P3-009` (`V-22`) | Unignored `.playwright-cli/` test files & debug screenshot copied into `dist/` | Expanded `.gitignore` (`.playwright-cli/`, `public/assets/aistudio/`, `*.pdf`, logs, `.env*`); cleaned `.playwright-cli/`; stripped `dist/assets/aistudio/` in `vite.config.ts` `closeBundle` while preserving original source asset. | `.gitignore`, `vite.config.ts` (+ removed `.playwright-cli/`) | `npm run build` verified `AISTUDIO_IN_DIST: NO` and `PUBLIC_ORIGINAL_PRESERVED: OK`. | **PASS** |
| `M5-P3-012` (`V-21` part) | TypeScript `"strict": true` disabled & unsafe `!` assertions in `server.ts` | Enabled `"strict": true` in `tsconfig.json`; replaced `body.extractionMeta!` and `body.experienceAlignment!` in `POST /api/analyses/save` with explicit `400` payload guards. | `tsconfig.json`, `server.ts` | `tsc --noEmit` checked all 35 project files with **0 errors** and **0 `any` usages**. | **PASS** |
| `M5-P3-013` (`V-26` part) | Incomplete `.env.example` & outdated `README.md` | Documented all 12 real env vars (Required / Migrations / Optional, 0 secrets) in `.env.example`; updated `README.md` with actual Gemini model routing, all 10 API routes (including `POST /api/analyze-stream`), local setup, and Render/Vercel deployment. | `.env.example`, `README.md` | Cross-checked against `grep` of every `process.env.*`, `import.meta.env.*`, `app.*('/api/...')`, and `gemini-*` model reference in codebase. | **PASS** |

---

## 4. Complete Consolidated Audit Status Table (All 28 Unique Findings `V-01`–`V-28`)

| Consolidated ID | Severity | Finding Summary | Phase Scope | Post-Phase-3 Status | Notes |
|---|---|---|---|---|---|
| `V-01` | **HIGH** | Unauthenticated, unthrottled AI endpoints, missing concurrency cap & unbounded `jdText` / `/api/coach` | Out of Phases 1–3 | **FAIL** | Needs rate limiting, concurrency semaphore, `jdText <= 25 KB`, `zod` schemas, `maxOutputTokens`. |
| `V-02` | **HIGH** | Semantic false positives (`Java`=`JavaScript`, `React`=`React Native`) & lexical override of embeddings | Out of Phases 1–3 | **FAIL** | High visibility for live demos; fix `src/analysis/matchingEngine.ts`. |
| `V-03` | **HIGH** | Post-extraction PDF page check, missing parse timeout & `pdfProxy.destroy()` | Out of Phases 1–3 | **FAIL** | Check `pageCount` before `extractText` in `src/server/pdfProcessor.ts`. |
| `V-04` | **HIGH** | Missing resume evidence verification & undelimited untrusted prompts | Out of Phases 1–3 | **FAIL** | Add XML/nonce prompt delimiters & resume-side source grounding. |
| `V-05` | **HIGH** | Client-forged report persistence / mass assignment on `POST /api/analyses/save` | Partial (Phase 3 removed `!` assertions) | **PARTIAL** | `extractionMeta`/`experienceAlignment` now required (`400`), but full schema validation & server-signed session save tokens still needed. |
| `V-06` | **HIGH** | Vulnerable transitive deps (`@grpc/grpc-js`, `esbuild`), unused & misclassified packages | **Phase 1** | **PASS** | `bun audit` reports `0` vulnerabilities across 470 packages. |
| `V-07` | **HIGH** | Monolithic `2.15 MB` frontend JS bundle | **Phase 1** | **PASS** | Initial JS reduced to `369.46 kB` raw / `113.87 kB` gzip; Recharts strictly lazy. |
| `V-08` | **HIGH** | Missing Render/Vercel deployment config, Node engine pin & unverified prod startup | **Phase 1 & 2** | **PARTIAL** | `render.yaml`, `vercel.json`, `engines >=22.18.0`, and local `NODE_ENV=production node server.ts` verified **PASS**; live cloud deploy **BLOCKED** & split-origin CORS pending. |
| `V-09` | **MEDIUM** | Loose `%PDF-` magic header offset allows HTML-prefix polyglot | Out of Phases 1–3 | **FAIL** | Require strict byte-0 `%PDF-` in `pdfProcessor.ts`. |
| `V-10` | **MEDIUM** | Whole-PDF OCR on mixed docs & silent OCR skip on 11–25 pages | Out of Phases 1–3 | **FAIL** | Needs hardened OCR `systemInstruction` & explicit page handling. |
| `V-11` | **MEDIUM** | Unverified JD skills retained in score & no mention-vs-experience check | Out of Phases 1–3 | **FAIL** | Filter `verified: false` JD skills from score in `matchingEngine.ts`. |
| `V-12` | **MEDIUM** | Silent drop of 1-char skills (`C`, `R`) & `gemini-embedding-2` live fallback | Out of Phases 1–3 | **FAIL** | Confirmed live in Phase 4 (`semanticMatchingEngine: "lexical_fallback"`). |
| `V-13` | **MEDIUM** | Learning plan lacks backend missing-skill grounding & URL stripping | Out of Phases 1–3 | **FAIL** | Add URL stripping & skill allowlist check in `sanitizeLearningPlan`. |
| `V-14` | **MEDIUM** | Dev-mode Vite middleware serves `/server.ts` | Out of Phases 1–3 | **FAIL** | Add `server.fs.deny` in `vite.config.ts` (dev-mode only; production serves `dist/` only). |
| `V-15` | **MEDIUM** | Missing HTTP security headers (`X-Content-Type-Options`, `Referrer-Policy`, `no-store`) & `X-Powered-By` | Out of Phases 1–3 | **FAIL** | Add security headers & `app.disable('x-powered-by')` in `server.ts`. |
| `V-16` | **MEDIUM** | Raw body-parser/Gemini `500` errors & missing `/api/*` `404` JSON handler | Out of Phases 1–3 | **FAIL** | Map `400`/`413`/`503` cleanly and add `/api/*` JSON `404` handler. |
| `V-17` | **MEDIUM** | Missing `checkRevoked: true` & DB outage masked as `401` in `requireAuth` | Out of Phases 1–3 | **FAIL** | Separate Firebase token check (`401`) from DB upsert (`503`). |
| `V-18` | **MEDIUM** | Missing `(user_id, created_at)` index, full-JSONB history over-fetch, missing pool timeouts/TLS/constraints | Out of Phases 1–3 | **FAIL** | Requires Drizzle schema index + `pg.Pool` SSL/timeout configuration. |
| `V-19` | **MEDIUM** | Unnecessary resume PII retention (`resumeTextExcerpt`), unredacted LLM transfer & no privacy notice | Out of Phases 1–3 | **FAIL** | Redact contact PII pre-LLM, drop unused excerpt, add upload privacy notice & bulk wipe. |
| `V-20` | **MEDIUM** | Uncapped unrelated experience credit inflates zero-match scores | Out of Phases 1–3 | **FAIL** | Gate experience pillar by domain/skill relevance in `scoringEngine.ts`. |
| `V-21` | **MEDIUM** | Hardcoded `/api/*`, unguarded NDJSON parse, missing timeouts, no `ErrorBoundary`, non-strict TS | **Phase 2 & 3** | **PASS** | Fully fixed & verified across unit tests, strict `tsc`, and Chromium. |
| `V-22` | **MEDIUM** | Unignored `.playwright-cli/` test files & debug PNG in `dist/` | **Phase 3** | **PASS** | `.gitignore` updated, `.playwright-cli/` removed, `dist/assets/aistudio/` stripped. |
| `V-23` | **LOW** | Active report persists after sign-out (`M5-P2-015`) & silent checkbox failure (`M5-P3-005`) | Partial (Phase 2 fixed checkbox rollback) | **PARTIAL** | Roadmap toggle rollback fixed (`PASS`); clearing `activeReport` on sign-out still pending. |
| `V-24` | **LOW** | Non-abortable server Gemini calls, silent `optionalAuth` failure & `PATCH` array coercion | Out of Phases 1–3 | **FAIL** | Backend signal propagation & strict `PATCH` array check pending. |
| `V-25` | **LOW** | Inconsistent DB `500`/`503` mapping & missing structured audit logs / shutdown handlers | Out of Phases 1–3 | **FAIL** | Pending backend observability hardening. |
| `V-26` | **LOW** | Code hygiene (`.env.example`, `README.md`, duplicate route code, dead `deepThinking`, Markdown escape) | Partial (Phase 3 fixed `.env.example` & `README.md`) | **PARTIAL** | Docs & env templates fixed (`PASS`); minor code deduplication & Markdown escaping deferred. |
| `V-27` | **LOW** | Sequential IDs & missing explicit `ALLOWED_ORIGINS` CORS middleware | Out of Phases 1–3 | **FAIL** | Required before split-origin Vercel -> Render production traffic. |
| `V-28` | **INFO** | Stack divergence (Node.js/Express/PostgreSQL vs. Python/FastAPI/SQLite) & missing `.git` / OAuth test token | Informational | **BLOCKED** | Project runs unified Node.js/Express on port `3000` with Cloud SQL PostgreSQL; no `.git` repo initialized in workspace. |

---

## 5. Remaining Risks Summary

1. **AI & Matching Accuracy Risks (Highest Impact for Evaluators):**
   - `V-02`: `Java` vs `JavaScript` and `React` vs `React Native` substring false positives.
   - `V-12`: `gemini-embedding-2` fell back to `lexical_fallback` in live execution (and 1-char skills `C`/`R` are dropped).
   - `V-20`: Unrelated resumes receive ~15% score from unrelated years of experience.
2. **Backend Security & Abuse Risks (Blockers for Open Public Launch):**
   - `V-01`: Unthrottled public Gemini endpoints (`/api/analyze`, `/api/analyze-stream`, `/api/jd/quick-scan`, `/api/coach`) and unbounded `jdText` / `/api/coach` payload.
   - `V-03` & `V-09`: Post-extraction PDF page check (memory/CPU DoS risk on huge PDFs) and loose `%PDF-` offset check.
   - `V-04`, `V-05`: Missing resume-side grounding & prompt delimiters; client-trusted fields in `POST /api/analyses/save`.
   - `V-15`, `V-16`, `V-17`, `V-18`, `V-19`, `V-27`: Missing HTTP security headers, raw Express error messages, missing DB SSL config & index, PII in `resumeTextExcerpt`, and missing CORS allowlist for split-origin hosting.
3. **Blocked / Untested Checks:**
   - Live authenticated Firebase Google Sign-In write -> read -> update -> delete cycle (`BLOCKED` — requires interactive OAuth session).
   - True scanned raster-image PDF OCR test (`BLOCKED` — no raster-image fixture).
   - Actual live cloud deployment execution on Render and Vercel (`BLOCKED` — requires external cloud accounts/secrets).
   - Git commit history secret scan (`BLOCKED` — workspace is not yet a Git repository).

---

## 6. Final Recommendation

- **Phases 1–3 Verification Verdict:** **APPROVED / COMPLETE.** Frontend reliability, bundle optimization, dependency security (`0` vulnerabilities), strict TypeScript hygiene, documentation accuracy, and local production Node.js 22 startup (`NODE_ENV=production node server.ts`) are all verified working cleanly.
- **Next Recommended Action Before Public Launch:** Approve a **Backend & AI Security Remediation Phase** targeting `V-01`–`V-05`, `V-12`, `V-15`–`V-20`, and `V-27` (CORS + DB TLS) prior to exposing the application to untrusted public internet traffic. See [`M5_FINAL_DEPLOYMENT_READINESS.md`](./M5_FINAL_DEPLOYMENT_READINESS.md) for environment-specific go/no-go verdicts.
