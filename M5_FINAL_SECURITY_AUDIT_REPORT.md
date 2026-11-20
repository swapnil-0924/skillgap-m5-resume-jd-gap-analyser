# SkillGap M5 — Final Comprehensive Security, Reliability & Readiness Audit Report

- **Project Name:** SkillGap M5 — Resume vs Job Description Gap Analyser  
- **Problem ID:** M5  
- **Audit Scope:** Consolidated Final Audit (Parts 1–4) — Application Security, File Upload & PDF/OCR, Gemini AI & Prompt Injection, Semantic Matching, Backend & Database Security, Privacy, Frontend & Performance, Dependencies, Deployment Readiness, and Controlled Adversarial Testing  
- **Audit Date:** 2026-11-20  
- **Audit Mode:** Strictly Read-Only — zero source files modified, zero dependencies changed, zero database records altered or deleted

### Companion Detailed Audit Reports
- Part 1 (Application, File Upload, PDF/OCR, Gemini API, Prompt Injection, AI Validation & Semantic Matching): [`M5_SECURITY_AUDIT_PART_1.md`](./M5_SECURITY_AUDIT_PART_1.md)
- Part 2 (Backend, REST APIs, Auth/IDOR, SQLi, Database, Analysis History, Privacy, CORS, Rate Limiting & Logging): [`M5_SECURITY_AUDIT_PART_2.md`](./M5_SECURITY_AUDIT_PART_2.md)
- Part 3 (Frontend Security, XSS, Integration, Performance, Dependencies, Code Quality, Vercel/Render & GitHub Secrets): [`M5_SECURITY_AUDIT_PART_3.md`](./M5_SECURITY_AUDIT_PART_3.md)

---

## 1. Project Overview

SkillGap M5 is an AI-powered web application that analyzes candidate PDF resumes against job descriptions (pasted text or uploaded PDF), extracts and normalizes skills, performs semantic matching with verbatim JD evidence grounding, computes a deterministic weighted compatibility score, generates a personalized 14-day learning roadmap, and persists analysis history per authenticated user.

### Actual Implemented Stack vs. Original M5 Specification
| Layer | Original Spec | Actual Implemented Stack |
|---|---|---|
| Frontend | React + Vite + Tailwind + Lucide + Recharts | React 19 + Vite 8 + Tailwind CSS v4 + Lucide React + Recharts (**MATCH**) |
| Backend | Python + FastAPI + Pydantic | Node.js (v22.23.2) + Express 4 + TypeScript (`server.ts`) (**DIVERGED**) |
| PDF / OCR | PyMuPDF + pdfplumber + Tesseract OCR | `unpdf` (PDF.js) + Gemini Multimodal OCR fallback (**DIVERGED**) |
| NLP / Matching | spaCy + Sentence Transformers + Gemini API | `@google/genai` (`gemini-3.1-flash-lite`, `gemini-4-hydrogen`, `gemini-embedding-2`) + custom taxonomy & lexical fallback (**DIVERGED**) |
| Database / Auth | SQLite + SQLAlchemy | Cloud SQL PostgreSQL + Drizzle ORM + Firebase Google Sign-In (**DIVERGED**) |

---

## 2. Executive Summary

Across Parts 1–4, the complete codebase was inspected line by line and validated through **43 structured adversarial, functional, integration, and unseen-input test scenarios** (29 executed directly against the running local server and analysis modules; 14 honestly marked **BLOCKED** due to missing Python stack, missing scanner binaries, non-destructive DB constraints, or OAuth token requirements).

### Consolidated Deduplicated Vulnerability Count (28 Unique Findings)

| Severity | Confirmed (Code / Executed) | Theoretical / Readiness | Total Unique |
|---|---|---|---|
| **CRITICAL** | 0 | 0 | **0** |
| **HIGH** | 8 | 0 | **8** |
| **MEDIUM** | 12 | 2 | **14** |
| **LOW** | 4 | 1 | **5** |
| **INFORMATIONAL** | 1 (Stack/Blocked Scope) | 0 | **1** |
| **Total** | **25** | **3** | **28** |

### Verdict Snapshot
1. **Hackathon Mentoring & Local Evaluation:** **CONDITIONALLY READY** — Core end-to-end live analysis works smoothly (~7.5–12s latency), uses zero mock data, handles unseen resumes/JDs dynamically, validates empty/corrupt/encrypted/oversized PDFs cleanly, and resists overt prompt injection. However, **two high-visibility accuracy defects** (`Java`=`JavaScript` / `React`=`React Native` false matches and `15%` score for a completely unrelated Pastry Chef resume due to 70% unrelated experience credit) should be fixed before judge evaluation.
2. **Real-World Judge-Provided Resumes & JDs:** **PARTIALLY READY** — Verified across 6 diverse unseen resumes/JDs (QA, DevOps, Embedded Firmware, Pastry Chef, Systems/Elixir/Zig/ClickHouse, Data Engineering) with zero cross-contamination and zero hardcoded results; however, semantic matching (`lexical_fallback` + substring bug), silent drop of 1-char languages (`C`, `R`), and unverified scanned-image OCR reliability remain gaps.
3. **Public Production Deployment:** **NOT READY** — Blocked by 8 HIGH and 14 MEDIUM security, abuse-prevention, privacy, performance, and dependency findings (unthrottled public AI endpoints, client-forged `/api/analyses/save`, post-extraction PDF page limit, missing HTTP security headers, unredacted PII retention, vulnerable `@grpc/grpc-js`/`esbuild` transitive deps, and 2.15 MB monolithic JS bundle).

---

## 3. Part 1 Findings Summary (File Upload, PDF/OCR, Gemini & AI Security)

Full details in [`M5_SECURITY_AUDIT_PART_1.md`](./M5_SECURITY_AUDIT_PART_1.md).
- **Verified Safeguards:** `GEMINI_API_KEY` stays strictly on the server; `multer.memoryStorage()` prevents disk writes, path traversal, and symlink risks; deterministic scoring (`scoringEngine.ts`) prevented score-inflation prompt injections in live testing.
- **Key Confirmed Issues:**
  - Unauthenticated, unthrottled Gemini endpoints + arbitrary 4 MB `report` context accepted by `POST /api/coach` (`M5-SEC-001`).
  - Confirmed semantic false positives: `Java` vs `JavaScript` (`0.84` → `MATCHED`) and `React` vs `React Native` (`0.84` → `MATCHED`), plus lexical override of embeddings and silent `gemini-embedding-2` fallback (`M5-SEC-002`, `M5-SEC-014`).
  - `extractText()` parses all pages *before* checking `pageCount > 25` with no timeout or `pdfProxy.destroy()` cleanup (`M5-SEC-003`), and loose `%PDF-` offset check allows HTML-prefix polyglots (`M5-SEC-006`).
  - Missing untrusted-data prompt delimiters, zero resume-side source-text evidence verification (`M5-SEC-004`), unverified JD skills retained in scoring (`M5-SEC-012`), and ungrounded roadmap skills/URL filtering (`M5-SEC-015`).

---

## 4. Part 2 Findings Summary (Backend, REST API, Auth, Database & Privacy)

Full details in [`M5_SECURITY_AUDIT_PART_2.md`](./M5_SECURITY_AUDIT_PART_2.md).
- **Verified Safeguards:** Zero SQL injection surface (100% Drizzle parameterized queries); real Firebase Google Sign-In with `401` guards on all 5 protected endpoints; strict ownership scoping (`and(eq(id), eq(userId))`) preventing cross-user IDOR on saved reports; no wildcard CORS; no `.env` or local SQLite file exposure.
- **Key Confirmed Issues:**
  - Client-forged report persistence / mass-assignment on `POST /api/analyses/save` (`M5-P2-002`) and silent progress wipe on non-array `PATCH /progress` (`M5-P2-019`).
  - Non-production Vite dev middleware serves backend source (`GET /server.ts` → `HTTP 200`, `M5-P2-003`).
  - Missing HTTP security headers (`X-Content-Type-Options`, `Referrer-Policy`, `CSP`, `HSTS`, `Cache-Control: no-store`) and active `X-Powered-By: Express` (`M5-P2-004`).
  - Body-parser syntax/size errors return `500` with raw V8 messages instead of `400`/`413`, and unknown `/api/*` routes return `200 text/html` (`M5-P2-005`).
  - Firebase `verifyIdToken` omits `checkRevoked: true` (`M5-P2-006`), `requireAuth` masks DB outages as `401` (`M5-P2-007`), and `activeReport` persists after sign-out (`M5-P2-015`).
  - Missing `(user_id, created_at)` index, full-JSONB over-fetching in `listAnalysesByUser`, missing pool timeouts/TLS/shutdown (`M5-P2-009`, `M5-P2-010`), and unnecessary PII retention in unused `resumeTextExcerpt` without AI privacy notice (`M5-P2-012`).

---

## 5. Part 3 Findings Summary (Frontend, Performance, Dependencies & Deployment)

Full details in [`M5_SECURITY_AUDIT_PART_3.md`](./M5_SECURITY_AUDIT_PART_3.md).
- **Verified Safeguards:** Zero XSS sinks (`dangerouslySetInnerHTML`/`innerHTML`/`eval`); zero `localStorage`/`sessionStorage` token storage; zero production `.map` source maps; zero secrets in compiled `dist/assets/index-D7kMrqAR.js`; zero mock data.
- **Key Confirmed Issues:**
  - Monolithic **2.15 MB** frontend bundle (`dist/assets/index-D7kMrqAR.js`) with zero lazy loading or chunk splitting (`M5-P3-001`).
  - Vulnerable transitive dependencies (`@grpc/grpc-js` High/Low, `esbuild` Moderate), unused packages (`motion`, `autoprefixer`), and build tools (`drizzle-kit`, `vite`, `@types/*`) misplaced in runtime `dependencies` (`M5-P3-006`).
  - Hardcoded relative `/api/*` paths (`M5-P3-002`), unguarded NDJSON `JSON.parse` + missing client fetch timeouts (`M5-P3-003`), missing React Error Boundary (`M5-P3-004`), disabled TypeScript `strict: true` (`M5-P3-012`), and unignored `.playwright-cli/` test files + debug screenshot copied into `dist/` (`M5-P3-009`).
  - Missing Vercel/Render deployment configs, unpinned Node `>=22.18.0` engine for `"start": "node server.ts"`, and unverified production start (`M5-P3-007`, `M5-P3-008`).

---

## 6. Consolidated Deduplicated Vulnerability Register

*(Deduplicated across Parts 1, 2, and 3; original report IDs preserved in brackets.)*

| ID | Vulnerability | Category | Severity | Affected File | Evidence | Recommended Fix |
|---|---|---|---|---|---|---|
| `V-01` | Unauthenticated, unthrottled AI & upload endpoints, missing concurrency cap & unbounded `jdText` (`M5-SEC-001`, `M5-P2-001`, `M5-P2-008`) | API Abuse / DoS | **HIGH** | `server.ts`, `src/server/analysisPipeline.ts` | Code + Live: 4 Gemini endpoints lack rate limits/concurrency caps; 42 KB JD accepted; `/api/coach` accepts arbitrary 4 MB `report` | Add `trust proxy`, tiered rate limits, concurrency semaphore (max 4), `jdText <= 25 KB`, `question <= 800`, `zod` schema & `maxOutputTokens` |
| `V-02` | Semantic matching false positives (`Java`=`JavaScript`, `React`=`React Native`) & neural override (`M5-SEC-002`) | AI / Matching Integrity | **HIGH** | `src/analysis/matchingEngine.ts` | Executed: `lexicalSemanticSimilarity` returned `0.84` (`MATCHED`) for both pairs via raw substring check (`lines 90–95`) and overrides embeddings (`line 194`) | Replace substring rule with whole-token matching + explicit non-equivalence rules; use exact set membership for clusters; never let lexical heuristics override embeddings |
| `V-03` | Post-extraction PDF page check, missing parser timeout & memory cleanup (`M5-SEC-003`) | File Upload / DoS | **HIGH** | `src/server/pdfProcessor.ts` | Code: `extractText` runs before `if (pageCount > 25)` (`lines 100–143`); no timeout; `pdfProxy.destroy()` never called | Check `pageCount > 15` immediately after `getDocumentProxy`; wrap parse in 10s timeout; call `pdfProxy.destroy()` in `finally` |
| `V-04` | Missing resume evidence verification & undelimited untrusted prompts (`M5-SEC-004`, `M5-SEC-011`) | Prompt Injection / AI Validation | **HIGH** | `src/server/geminiService.ts`, `src/server/analysisPipeline.ts` | Code: Raw resume/JD text concatenated without delimiters or anti-injection rules; zero source-text grounding check on extracted resume skills/certs/quals | Wrap untrusted text in explicit XML/nonce delimiters with anti-injection `systemInstruction`; verify all resume skills/certs/quals against `resumeDoc.text` |
| `V-05` | Client-forged report persistence / mass assignment & unsafe `!` assertions (`M5-P2-002`, `M5-SEC-013`) | Access / Data Integrity | **HIGH** | `server.ts` (`POST /api/analyses/save`), `src/db/repository.ts` | Code: Trusts client-supplied `compatibilityScore`, `completedDays`, `matchedSkills`; passes `extractionMeta!` & `experienceAlignment!` unchecked | Validate full body with `zod` (`0..100` score, `1..14` days) and sign server-generated session reports with HMAC before persisting |
| `V-06` | Known vulnerable transitive deps (`@grpc/grpc-js` High, `esbuild` Mod) & misclassified packages (`M5-SEC-005`, `M5-P3-006`) | Dependencies | **HIGH** | `package.json`, `bun.lock` | Executed `bun audit`: 1 High (`GHSA-m9gg-hp2v-232j`), 1 Mod (`GHSA-67mh-4wv8-2f99`), 1 Low; `motion`/`autoprefixer` unused; dev tools in `dependencies` | Remove unused `motion`/`autoprefixer`, move dev/build tools to `devDependencies`, upgrade `firebase`/`firebase-admin`/`drizzle-kit` |
| `V-07` | Monolithic 2.15 MB frontend JS bundle with zero code splitting (`M5-P3-001`) | Performance | **HIGH** | `vite.config.ts`, `src/App.tsx` | Executed `ls -la dist/assets`: single `2,154,838`-byte JS chunk eagerly bundling Recharts & Firebase | Lazy-load views via `React.lazy()` + `<Suspense>` and add Vite Rollup `manualChunks` |
| `V-08` | Unconfigured split Vercel/Render deployment & unpinned Node engine for `node server.ts` (`M5-P3-007`, `M5-P3-008`) | Deployment | **HIGH** | `package.json`, workspace root | Code: No `vercel.json`/`render.yaml`/`Dockerfile`; `"start": "node server.ts"` lacks `"engines": { "node": ">=22.18.0" }` | Pin Node engine or compile server bundle; test `NODE_ENV=production npm start`; add deployment manifests if deploying outside AI Studio |
| `V-09` | Loose `%PDF-` magic header allows HTML-prefix polyglot bypass (`M5-SEC-006`) | File Upload | **MEDIUM** | `src/server/pdfProcessor.ts` | Executed: `<html><script>...%PDF-1.4` passed `validatePdfBuffer` (`lines 58–59`) | Require strict byte-0 `%PDF-` prefix and validate MIME strictly |
| `V-10` | Whole-PDF OCR on mixed docs & silent OCR skip on 11–25 page mixed PDFs (`M5-SEC-007`, `M5-SEC-008`) | PDF / OCR | **MEDIUM** | `src/server/pdfProcessor.ts`, `src/server/geminiService.ts` | Code: Mixed PDF sends entire raw PDF to Gemini OCR without `systemInstruction`; 11–25 page mixed PDFs skip OCR silently | Add hardened `systemInstruction` to OCR, cap/track scanned pages cleanly, and surface partial-OCR warnings |
| `V-11` | Unverified JD skills retained in scoring & no mention-vs-experience check (`M5-SEC-012`) | AI Accuracy | **MEDIUM** | `src/analysis/evidenceEngine.ts`, `src/analysis/matchingEngine.ts` | Code: `verified: false` JD skills remain in gap list and affect score; negated/aspirational resume mentions not excluded | Exclude `verified: false` JD skills from score calculation; add evidence-type & negation rules to extraction |
| `V-12` | Silent drop of 1-char skills (`C`, `R`) & silent `gemini-embedding-2` fallback (`M5-SEC-014`) | NLP / Matching | **MEDIUM** | `src/analysis/skillTaxonomy.ts`, `src/server/geminiService.ts` | Executed: `rawName.length < 2` drops `C`/`R` (`line 440`); every live run fell back to `lexical_fallback` | Allow `C`/`R` explicitly; fix `gemini-embedding-2` call/response handling and surface fallback telemetry |
| `V-13` | Learning plan lacks missing-skill grounding & URL stripping (`M5-SEC-015`) | AI Output Safety | **MEDIUM** | `src/server/geminiService.ts` | Executed: Day 12 introduced unrequested `CI/CD`; `sanitizeLearningPlan` does not verify skills or strip unverified URLs | Ground days 1–12 strictly to actual missing/partial skills; forbid & strip unverified URLs/fabricated courses |
| `V-14` | Non-production dev middleware exposes backend source files (`M5-P2-003`) | Information Disclosure | **MEDIUM** | `server.ts`, `vite.config.ts` | Executed: `GET /server.ts` returned `HTTP 200 text/javascript` in dev mode | Add `server.fs.deny` in `vite.config.ts` and block `/server.ts`, `/src/db/**`, `/src/server/**`, `/src/middleware/**` |
| `V-15` | Missing HTTP security headers, `X-Powered-By` disclosure & missing `no-store` (`M5-P2-004`) | HTTP Security | **MEDIUM** | `server.ts` | Executed: `X-Powered-By: Express` present; no `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `HSTS`, `Cache-Control: no-store` | Call `app.disable('x-powered-by')` and attach security header middleware (keeping iframe compatibility) |
| `V-16` | Raw upstream/parser error leakage (`500` instead of `400`/`413`/`503`) & missing `/api/*` `404` (`M5-SEC-010`, `M5-P2-005`) | Error Handling | **MEDIUM** | `server.ts` (`formatApiError`, SPA fallback) | Executed: Malformed JSON → `500` raw V8 msg; 5 MB → `500`; Gemini `503` → `500` raw JSON; `/api/nonexistent` → `200` HTML | Map `entity.parse.failed` (`400`), `entity.too.large` (`413`), Gemini `503` (`503`), sanitize unknown `500`s, add `/api/*` `404` JSON |
| `V-17` | Missing Firebase token revocation check & DB outage masked as `401` (`M5-P2-006`, `M5-P2-007`) | Auth | **MEDIUM** | `src/middleware/auth.ts` | Code: `verifyIdToken(token)` omits `checkRevoked: true`; `getOrCreateUser` inside `401` catch block | Pass `true` to `verifyIdToken` in `requireAuth`; separate token verification (`401`) from DB upsert (`503`) |
| `V-18` | Missing DB FK index, full-JSONB history over-fetch, missing pool timeouts/TLS/constraints (`M5-P2-009`, `M5-P2-010`, `M5-P2-011`) | Database | **MEDIUM** | `src/db/schema.ts`, `src/db/repository.ts`, `src/db/index.ts` | Code: No index on `analyses(user_id, created_at)`; `SELECT *` unbounded; no pool `statement_timeout`/TLS/`SIGTERM` shutdown; no score `CHECK` | Add composite index, score `CHECK (0..100)`, `updated_at`, summary projection + pagination, pool timeouts, TLS & `SIGTERM` drain |
| `V-19` | Unnecessary resume PII retention (`resumeTextExcerpt`), unredacted LLM transfer & no privacy notice (`M5-SEC-016`, `M5-P2-012`) | Data Privacy | **MEDIUM** | `src/server/analysisPipeline.ts`, `src/db/schema.ts`, `src/components/AnalyzeView.tsx` | Code: First 1,200 chars (contact PII) stored in DB despite never being rendered; no upload AI disclosure or bulk delete | Redact email/phone/address pre-LLM, stop storing unused excerpt, add upload privacy notice & `DELETE /api/analyses` |
| `V-20` | Uncapped unrelated experience credit inflates zero-match scores (`M5-SEC-018`) | Scoring Accuracy | **MEDIUM** | `src/analysis/scoringEngine.ts` | Executed (T24): Pastry Chef (0/7 skills matched vs Firmware JD) scored `15%` due to `experience: 70%` | Gate/scale experience pillar by technical & domain alignment when skill match is near zero |
| `V-21` | Unguarded NDJSON `JSON.parse`, missing client timeouts, missing Error Boundary & non-strict TS (`M5-P3-002`–`004`, `M5-P3-012`) | Frontend Reliability | **MEDIUM** | `src/services/api.ts`, `src/App.tsx`, `tsconfig.json` | Code: Uncaught `JSON.parse` in stream loop; no fetch timeouts; no `ErrorBoundary`; hardcoded `/api/*`; `strict: true` absent | Add `try/catch`, `fetchWithTimeout`, root `ErrorBoundary`, `VITE_API_BASE_URL` support, and enable `strict: true` |
| `V-22` | Unignored `.playwright-cli/` test artifacts & debug PNG copied into `dist/` (`M5-P3-009`) | Secret / Repo Hygiene | **MEDIUM** | `.gitignore`, `.playwright-cli/`, `public/assets/aistudio/` | Executed: 6 test PDFs/logs in `.playwright-cli/` unignored; `image_64dbb954.png` bundled into `dist/assets/aistudio/` | Add `.playwright-cli/` to `.gitignore`, clean temp audit files, and remove unused debug image from `public/` |
| `V-23` | Active resume report persists after sign-out & silent checkbox failure (`M5-P2-015`, `M5-P3-005`) | Client Privacy / UX | **LOW** | `src/App.tsx` | Code: Sign-out clears `history` only, leaving `activeReport` on screen; failed `PATCH /progress` does not roll back UI | Clear `activeReport` on sign-out and roll back + alert user on failed `PATCH /progress` |
| `V-24` | Non-abortable timeouts, silent `optionalAuth` token failure & silent `PATCH` wipe (`M5-SEC-017`, `M5-P2-017`, `M5-P2-019`) | Reliability | **LOW** | `src/server/geminiService.ts`, `src/middleware/auth.ts`, `server.ts` | Code: Stream cancel does not abort Gemini; invalid explicit Bearer silently downgraded; non-array `completedDays` coerced to `[]` | Propagate `AbortSignal`, return `401` on invalid explicit Bearer, return `400` on non-array `completedDays` |
| `V-25` | Inconsistent DB `500`/`503` mapping, missing audit logs & process handlers (`M5-P2-013`, `M5-P2-016`) | Observability | **LOW** | `server.ts`, `src/db/repository.ts` | Code: Only `'failed to save'` maps to `503`; no structured security audit logs or `unhandledRejection` handler | Add typed `DatabaseError` → `503`, structured JSON security logs, and process shutdown handlers |
| `V-26` | Code hygiene: duplicated route logic, dead `deepThinking` path, leading-dot filenames, unescaped Markdown export, incomplete `.env.example` & stale `README.md` (`M5-SEC-019`, `M5-P3-010`, `011`, `013`, `014`) | Maintainability | **LOW** | `server.ts`, `geminiService.ts`, `pdfProcessor.ts`, `formatters.ts`, `.env.example`, `README.md` | Code: ~60 duplicated lines; unreachable `ThinkingLevel.HIGH` block; `.env.example` lacks `SQL_*`; `README.md` stale | Deduplicate handler helper, prune or wire `deepThinking`, sanitize leading dots & Markdown, sync `.env.example` & `README.md` |
| `V-27` | Predictable sequential IDs & missing explicit split-origin CORS (`M5-P2-014`, `M5-P2-018`) | Defense-in-Depth | **LOW** | `src/db/schema.ts`, `server.ts` | Code: `serial` PK; no `ALLOWED_ORIGINS` CORS middleware | Optional public UUIDs; add `ALLOWED_ORIGINS` CORS if splitting frontend/backend |
| `V-28` | Stack divergence (Node.js/PostgreSQL vs. Python/FastAPI/SQLite) & blocked OAuth/Git/Python scanner checks (`M5-SEC-020`, `M5-P2-021`, `M5-P3-015`–`017`) | Compliance / Audit Scope | **INFORMATIONAL** | Repository-wide | Code + Env: No Python/FastAPI/SQLite, no `.git`, no live OAuth token in headless audit | Decide whether to stay on hardened Node.js/PostgreSQL or port to Python/FastAPI for external submission |

---

## 7. Adversarial Testing Results (43 Scenarios)

*(Legend: `PASS` = verified working; `PARTIAL` = works with documented defect/weakness; `FAIL` = demonstrably broken; `BLOCKED` = unavailable infra/credentials/non-existent stack; `NOT TESTED` = exists, not executed.)*

### Document Tests (T01–T10)
| Test ID | Scenario | Expected Result | Actual Result | Method | Status | Evidence / Failure Reason |
|---|---|---|---|---|---|---|
| `T01` | Empty PDF (0 bytes) | `400` clear error | `HTTP 400` (`58 ms`): *"The uploaded PDF file is empty (0 bytes)."* | Executed | **PASS** | Live `POST /api/analyze` |
| `T02` | Corrupted PDF | `422` clear error | `HTTP 422` (`155 ms`): *"This PDF file appears to be corrupted or unreadable..."* | Executed | **PASS** | Live `POST /api/analyze` |
| `T03` | Password-protected PDF (`/Encrypt`) | `422` clear error | `HTTP 422` (`13 ms`): *"This PDF is password-protected or encrypted..."* | Executed | **PASS** | Live `POST /api/analyze` |
| `T04` | Oversized PDF (`10.5 MB`) | `413` size limit error | `HTTP 413` (`146 ms`): *"Uploaded file exceeds the 10 MB limit."* | Executed | **PASS** | Live `POST /api/analyze` |
| `T05` | Extremely long resume (26-page PDF) | Reject `>25` pages *before* parsing | `HTTP 422` (`73 ms`): *"This PDF has 26 pages..."*; **but code parsed all pages before rejecting (`V-03`)** | Executed + Code | **PARTIAL** | Rejection works, but late page check exposes DoS on huge-page PDFs |
| `T06` | Multi-column PDF | Accurate reading order | Not tested with dedicated multi-column layout fixture in Part 4 | Code Inspection | **NOT TESTED** | `unpdf` + Gemini OCR fallback present |
| `T07` | Scanned image-only PDF | Trigger OCR fallback & extract text | No raster-image PDF fixture generator available | Code Inspection | **BLOCKED** | `isMostlyScanned` → `extractPdfTextViaGeminiOcr` inspected |
| `T08` | Unusual embedded content (`/OpenAction /JavaScript` & HTML polyglot) | Reject polyglots; never execute JS | Embedded `/JavaScript` PDF did not execute JS (`200`); **HTML-prefix `%PDF-1.4` polyglot bypassed `validatePdfBuffer` (`V-09`)** | Executed | **PARTIAL** | Loose `headerSlice.includes('%PDF-')` check across 1,024 bytes |
| `T09` | PDF containing prompt injection | Ignore injected instructions; fair score | `HTTP 200`, score `39%` (not `100%`), matched only real `Python, Selenium, Postman`; **lacks delimiters & resume evidence check (`V-04`)** | Executed + Code | **PARTIAL** | Model + deterministic scoring resisted overt attack; architectural defense incomplete |
| `T10` | Mixed text + scanned-image PDF | OCR scanned pages cleanly | Not executed; code sends entire PDF to OCR (`<=10` pages) and silently skips OCR on 11–25 pages (`V-10`) | Code Inspection | **BLOCKED** | Architectural defect confirmed in `pdfProcessor.ts:150–155` |

### Job Description Tests (T11–T16)
| Test ID | Scenario | Expected Result | Actual Result | Method | Status | Evidence / Failure Reason |
|---|---|---|---|---|---|---|
| `T11` | Empty JD | `400` fast validation error | `HTTP 400` (`1614 ms`): *"Job Description content is too short..."* (ran PDF extraction first before checking empty JD) | Executed | **PASS** | Functional pass; minor ordering inefficiency in `analysisPipeline.ts:44–80` |
| `T12` | Very short JD (`"Need Python dev"`) | `400` validation error | `HTTP 400` (`656 ms`): *"Job Description content is too short..."* | Executed | **PASS** | Live `POST /api/analyze` |
| `T13` | Extremely long JD (`42,132` chars) | Enforce upper bound or warn truncation | `HTTP 200` (`7991 ms`), `jdCharCount: 42132` accepted unbounded and silently truncated at 20,000 chars for Gemini (`V-01`) | Executed | **PARTIAL** | No max JD length cap at API/DB boundary |
| `T14` | JD containing prompt injection | Ignore injected override; fair score | `HTTP 200`, score `27%` (not `100%`); matched only `Elixir`; **lacks prompt delimiters (`V-04`)** | Executed + Code | **PARTIAL** | Resisted overt attack; needs structural isolation |
| `T15` | JD with unfamiliar niche skills (`Elixir`, `Zig`, `ClickHouse`, `NATS JetStream`) | Extract & evaluate dynamically | `HTTP 200`: matched `Elixir`, missing `ClickHouse, NATS JetStream, Zig` | Executed | **PASS** | Zero dependence on hardcoded skill list |
| `T16` | JD with contradictory requirements (`1+ yrs` AND `12+ yrs`) | Handle safely without crash | `HTTP 200`, did not crash, **but Gemini summed `1 + 12 = 13` (`reqYears: 13`) silently** | Executed | **PARTIAL** | Contradiction not surfaced to user |

### AI Reliability & Failure Tests (T17–T23)
| Test ID | Scenario | Expected Result | Actual Result | Method | Status | Evidence / Failure Reason |
|---|---|---|---|---|---|---|
| `T17` | Malformed Gemini response shape | Graceful validation error | `safeJsonParse` casts blindly (`as T`) with no Zod schema (`V-05`) | Code Inspection | **BLOCKED** | Fault-injecting live Gemini requires code edit |
| `T18` | Gemini API unavailable (`503`) | Clean `503` user-friendly error | **Observed live in Part 1 Test B run 1:** returned `HTTP 500` leaking raw upstream JSON error (`V-16`) | Executed (Observed) | **FAIL** | `formatApiError` fell through to raw `500` |
| `T19` | Missing `GEMINI_API_KEY` | Clean server config error | Executed in Part 1 CLI (`tsx`): threw `"Gemini API key is not configured on the server..."` | Executed | **PASS** | Clean explicit error; never falls back to fake data |
| `T20` | Gemini response with unsupported/hallucinated skills | Reject ungrounded skills | Clean QA test did not hallucinate; **code has zero resume-side grounding check (`V-04`) and retains `verified: false` JD skills (`V-11`)** | Executed + Code | **PARTIAL** | Relies on model obedience rather than deterministic backend verification |
| `T21` | Gemini response with invalid JSON | Clean error handling | `safeJsonParse` calls `JSON.parse` without catching `SyntaxError` cleanly | Code Inspection | **BLOCKED** | Cannot inject raw invalid LLM JSON without modifying code |
| `T22` | AI learning plan with unverified links / off-topic skills | Only actual missing skills; no unverified links | Clean test emitted `0` URLs, **but Day 12 added unrequested `CI/CD`** and `sanitizeLearningPlan` lacks skill grounding & URL stripping (`V-13`) | Executed + Code | **PARTIAL** | Needs prompt prohibition + post-filter |
| `T23` | Excessive token consumption | Bounded input & output tokens | No `maxOutputTokens` on any Gemini call; uncapped `/api/coach` `question`/`report` (`V-01`) | Code Inspection | **FAIL** | Missing token caps |

### Matching & Scoring Tests (T24–T32)
| Test ID | Scenario | Expected Result | Actual Result | Method | Status | Evidence / Failure Reason |
|---|---|---|---|---|---|---|
| `T24` | Completely unrelated resume (8-yr Pastry Chef vs Embedded Rust Firmware JD) | Near-`0%` score, `0` matched skills | `matched: []`, `partial: []`, 7 real missing firmware skills — **BUT `score: 15%` due to `experience: 70%` (`V-20`)** | Executed | **PARTIAL** | Unrelated years of baking earned 70% experience credit |
| `T25` | Resume with very few matching skills (QA 3/6 vs DevOps/QA JD) | Low-moderate proportional score | `HTTP 200`, `score: 42%`, matched `Python, Selenium, Postman`, missing `AWS, Docker, Kubernetes` | Executed | **PASS** | Proportional, explainable scoring |
| `T26` | Resume with many matching skills (Data Eng vs Data Eng JD) | High score, accurate normalization | `HTTP 200`, `score: 92%`, matched 7/8 (`PySpark` → `Apache Spark`), 14-day plan generated | Executed | **PASS** | Accurate high-match behavior |
| `T27` | `Java` vs `JavaScript` | `MISSING` (distinct languages) | **`lexicalSim: 0.84` → `MATCHED` (`V-02`)** | Executed | **FAIL** | Raw substring check (`"javascript".includes("java")`) |
| `T28` | `React` vs `React Native` | `PARTIAL` or `MISSING` (not identical) | **`lexicalSim: 0.84` → `MATCHED` (`V-02`)** | Executed | **FAIL** | Raw substring check (`"react native".includes("react")`) |
| `T29` | `SQL` vs `MySQL` | `PARTIAL` | `lexicalSim: 0.70` → `PARTIAL` | Executed | **PASS** | Cluster match behaves appropriately |
| `T30` | `AWS` vs `Azure` | `PARTIAL` | `lexicalSim: 0.70` → `PARTIAL` | Executed | **PASS** | Cluster match behaves appropriately |
| `T31` | `Manual Testing` vs `Automation Testing` | `MISSING` | `lexicalSim: 0.30` → `MISSING` | Executed | **PASS** | Distinct disciplines separated |
| `T32` | `REST API Development` vs `RESTful Web Services` | `MATCHED` | Both normalized to `REST API` (`1.00` → `MATCHED`) | Executed | **PASS** | Custom skill taxonomy works cleanly |

### Backend & Database Tests (T33–T43)
| Test ID | Scenario | Expected Result | Actual Result | Method | Status | Evidence / Failure Reason |
|---|---|---|---|---|---|---|
| `T33` | Invalid API requests (bad JSON, 5 MB body, bad path) | `400`, `413`, `404` JSON | Bad JSON → `500` raw V8 error; 5 MB → `500`; `/api/nonexistent` → `200` HTML (`V-16`) | Executed | **FAIL** | Missing Express error mapping & `/api/*` `404` catch-all |
| `T34` | Repeated sequential analysis requests | No result mixing; throttled if abused | 3 sequential unseen analyses returned distinct, unmixed results; **no rate limit triggered (`V-01`)** | Executed | **PARTIAL** | Clean isolation; missing rate limiting |
| `T35` | Excessive concurrent requests | Controlled queue / `429` or `503` | Not stress-tested (non-destructive rule); code confirms no concurrency cap or rate limiter (`V-01`) | Code Inspection | **BLOCKED** | Unbounded RAM & Gemini fan-out |
| `T36` | Missing database / outage | Clean `503` error | Not simulated (non-destructive rule); code shows `requireAuth` misreports DB outage as `401` (`V-17`) and reads return `500` (`V-25`) | Code Inspection | **BLOCKED** | Error status mapping defect confirmed |
| `T37` | Database locking (SQLite concurrency) | Safe concurrent writes | **N/A — Cloud SQL PostgreSQL** (`pg.Pool` MVCC + atomic `ON CONFLICT` upsert); SQLite not present | Code Inspection | **BLOCKED** | PostgreSQL eliminates SQLite write-lock risk |
| `T38` | Database persistence after restart | Saved rows survive restart | Cloud SQL tables verified live (`users`, `analyses`), but authenticated write→restart→read cycle requires OAuth token | Schema Check | **BLOCKED** | Managed Cloud SQL persists across restarts by design, end-to-end auth write blocked |
| `T39` | Unauthorized analysis access (`GET /api/analyses`, `/api/analyses/1`) | `401` | Live probes returned `HTTP 401` on missing and forged Bearer tokens | Executed | **PASS** | `requireAuth` verified live |
| `T40` | Cross-user data access (IDOR) | `404` / blocked | Code scopes all queries by `and(eq(id), eq(userId))`; live two-account test requires two live Google OAuth tokens | Code Inspection | **BLOCKED** | Strong code-level isolation; live multi-user test blocked |
| `T41` | Unauthorized deletion (`DELETE /api/analyses/1`) | `401` | Live probe returned `HTTP 401` | Executed | **PASS** | `requireAuth` verified live |
| `T42` | Missing OCR engine (Tesseract) | Graceful fallback / error | Tesseract not used; if Gemini OCR fails on scanned PDF with `<60` chars text, `pdfProcessor.ts:165–170` throws clean `503` | Code Inspection | **BLOCKED** | Clean error handling in code; live OCR failure fault not injected |
| `T43` | Missing semantic model (Sentence Transformers / Embeddings) | Graceful fallback without fabricated results | Sentence Transformers absent; **live runs confirmed `gemini-embedding-2` silently failed and fell back to `lexical_fallback` (`V-12`)** | Executed | **PARTIAL** | Non-crashing fallback works, but neural matching is effectively offline |

---

## 8. Security Tool Scan Results

| Tool | Target Stack | Installed? | Executed? | Result / Findings |
|---|---|---|---|---|
| `bun audit` | Node.js / Frontend (`bun.lock`) | **YES** (`/usr/local/bin/bun`) | **YES** | **3 advisories:** `@grpc/grpc-js` (1 HIGH `GHSA-m9gg-hp2v-232j`, 1 LOW `GHSA-f596-whhp-79r4`), `esbuild` (1 MODERATE `GHSA-67mh-4wv8-2f99`) |
| `npm audit` | Node.js (`package-lock.json`) | **YES** (`/usr/local/bin/npm`) | **NO — BLOCKED** | No `package-lock.json` exists (project uses `bun.lock`) |
| `bandit` | Python static security | **NO** | **NO — BLOCKED** | Not installed; no Python codebase present |
| `pip-audit` | Python dependencies | **NO** | **NO — BLOCKED** | Not installed; no `requirements.txt` present |
| `semgrep` | Multi-language SAST | **NO** | **NO — BLOCKED** | Not installed (manual static regex & full line-by-line review completed instead) |
| `OWASP ZAP` | Web DAST | **NO** | **NO — BLOCKED** | Not installed (targeted non-destructive HTTP security probes executed instead) |
| `Trivy` | Container / FS scanner | **NO** | **NO — BLOCKED** | Not installed; no `Dockerfile` present |

---

## 9. AI Reliability Assessment
- **Strengths:** Fast end-to-end execution (`7.5–12.4s`), deterministic weighted scoring (immune to LLM score fabrication), structured Gemini `responseSchema` extraction, and dynamic handling of unseen technical and non-technical domains.
- **Weaknesses:** Neural embeddings (`gemini-embedding-2`) silently fell back to `lexical_fallback` in all live runs (`V-12`); `lexicalSemanticSimilarity` falsely equates `Java`=`JavaScript` and `React`=`React Native` (`V-02`); 1-char languages (`C`, `R`) are silently dropped (`V-12`); resume extractions lack backend source-text verification (`V-04`); unverified JD skills still affect scores (`V-11`); unrelated experience inflates zero-match resumes (`V-20`); contradictory JD years were summed (`T16`).

## 10. File Upload & PDF Security Assessment
- **Strengths:** Strict RAM-only processing (`multer.memoryStorage()`), zero disk/temp-file/symlink exposure, 10 MB `multer` cap (`413`), and empirically verified detection of empty (`400`), corrupted (`422`), encrypted (`422`), and `>25`-page (`422`) PDFs without executing embedded PDF JavaScript.
- **Weaknesses:** Page limit checked *after* full `extractText()` with no parser timeout or `pdfProxy.destroy()` (`V-03`); loose `%PDF-` offset check allows HTML-prefix polyglots (`V-09`); mixed PDFs re-OCR the entire file (`<=10` pages) and silently skip OCR on 11–25 page mixed documents (`V-10`).

## 11. Backend & Database Assessment
- **Strengths:** 100% parameterized Drizzle ORM queries (zero SQL injection); verified `401` Firebase Auth guards and ownership-scoped (`id` + `userId`) queries across all saved-history CRUD routes; Cloud SQL PostgreSQL survives restarts (unlike ephemeral SQLite).
- **Weaknesses:** Unthrottled public AI routes (`V-01`), client-forged `/api/analyses/save` persistence (`V-05`), dev-mode `/server.ts` exposure (`V-14`), missing HTTP security headers (`V-15`), `500` raw errors on bad JSON / oversized body / Gemini `503` and `200` HTML on `/api/nonexistent` (`V-16`), missing `checkRevoked` & auth/DB `401` masking (`V-17`), missing `(user_id, created_at)` index + full-JSONB history over-fetch + missing pool timeouts/TLS (`V-18`).

## 12. Privacy Assessment
- **Strengths:** Original PDF binaries are never persisted on disk or DB; no resume text or secrets appear in server logs; signed-in users can hard-delete individual saved reports.
- **Weaknesses:** First 1,200 characters of every resume (typically candidate name, email, phone, address) are persisted in unused `analyses.resume_text_excerpt` (`V-19`); full unredacted resume text/PDFs are sent to Gemini without a user-facing AI privacy disclosure; no retention TTL or bulk "Delete All Data" endpoint exists; `activeReport` remains visible in React state after sign-out (`V-23`).

## 13. Performance Assessment
- **Backend:** Live analyses consistently completed in `7.5–8.0s` (Part 4 tests), eliminating the earlier Stage 5 hang. Primary scalability bottlenecks are unbounded concurrent RAM uploads (20 MB/req), post-extraction PDF page checks, missing `analyses.user_id` DB index, and full-JSONB `SELECT *` on history lists.
- **Frontend:** Monolithic **2.15 MB** JS bundle (`dist/assets/index-D7kMrqAR.js`) with zero route lazy-loading or vendor chunking (`V-07`).

## 14. Dependency Assessment
- **Executed `bun audit`:** Flagged 1 High + 1 Low in `@grpc/grpc-js` (`firebase`/`firebase-admin`) and 1 Moderate in `esbuild` (`drizzle-kit`).
- **Package Hygiene:** `motion` and `autoprefixer` have 0 imports; `drizzle-kit`, `vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`, `@types/multer`, and `@types/pg` belong in `devDependencies`.

## 15. Deployment Readiness
- **AI Studio / Unified Cloud Run:** Technically runnable in dev/preview, but **NOT READY for public production** until Priority 2 HIGH security, abuse, privacy, and bundle blockers (`V-01`–`V-08`, `V-14`–`V-19`) are resolved and `NODE_ENV=production node server.ts` is explicitly tested.
- **Split Vercel + Render:** **BLOCKED** — lacks `vercel.json`, `render.yaml`/`Dockerfile`, `VITE_API_BASE_URL`, `ALLOWED_ORIGINS` CORS, Node engine pin, and (if required by spec) a Python/FastAPI backend.

## 16. Unseen Judge Input Validation
Verified empirically across **6 distinct unseen resume/JD combinations** (Parts 1 & 4):
1. Clean QA (`Python/Selenium/Postman`) vs. Senior DevOps/QA JD → **`42%`** (`3` matched, `3` missing).
2. Prompt-Injected QA Resume vs. Senior DevOps/QA JD → **`39%`** (`3` matched, `3` missing; rejected injected `Docker/AWS/Kubernetes` and `100%` override).
3. Systems Backend (`Elixir/PostgreSQL`) vs. 42 KB Injected/Niche/Contradictory JD (`Elixir/Zig/ClickHouse/NATS`) → **`27%`** (matched `Elixir`, missing `ClickHouse, NATS JetStream, Zig`).
4. Completely Unrelated Culinary Pastry Chef (`8 yrs`) vs. Embedded Rust Firmware JD → **`15%`** (`0` matched, `7` real firmware skills missing; flagged unrelated experience credit bug `V-20`).
5. High-Match Senior Data Engineer (`Python/SQL/PostgreSQL/Airflow/PySpark/AWS/Docker`) vs. Data Engineer JD → **`92%`** (`PySpark` normalized to `Apache Spark`, 14-day plan tailored, zero mixing with prior runs).
- **Verified Formats:** Text-selectable single-page and multi-page PDFs, encrypted PDFs, corrupt PDFs, empty PDFs, oversized PDFs, and pasted JDs up to 42 KB.
- **Not Yet Empirically Verified:** True scanned-image raster PDFs (`T07`), mixed text+image PDFs (`T10`), and complex multi-column tables (`T06`).

---

## 17. Critical and High-Priority Issues

- **CRITICAL:** None (`0`).
- **HIGH (`8` Unique Issues):**
  1. `V-01`: Unauthenticated, unthrottled AI & upload endpoints + arbitrary 4 MB `/api/coach` proxy + unbounded `jdText`.
  2. `V-02`: Confirmed semantic matching false positives (`Java`=`JavaScript`, `React`=`React Native`) + lexical override of embeddings.
  3. `V-03`: PDF text extraction executes on all pages *before* checking `pageCount > 25`, with no timeout or `pdfProxy.destroy()`.
  4. `V-04`: Missing resume-side source-text evidence verification and undelimited untrusted document prompts.
  5. `V-05`: Client-forged report persistence / mass assignment & unsafe `!` assertions on `POST /api/analyses/save`.
  6. `V-06`: Known vulnerable transitive deps (`@grpc/grpc-js` High, `esbuild` Mod) & misclassified dev packages in runtime `dependencies`.
  7. `V-07`: Monolithic 2.15 MB frontend bundle with zero code splitting.
  8. `V-08`: Unconfigured split Vercel/Render deployment & unpinned Node engine for `"start": "node server.ts"`.

---

## 18. Prioritized Remediation Roadmap (Awaiting Approval)

### Priority 1 — Critical
*None identified.*

### Priority 2 — High (Fix Before Judge Evaluation & Public Deployment)
| Issue ID | Affected File(s) | Required Change | Reason | Dependencies / Scope | Verification Method |
|---|---|---|---|---|---|
| `V-02` | `src/analysis/matchingEngine.ts` | Remove raw substring `0.84` promotion; add whole-token boundary matching + non-equivalence pairs (`Java`≠`JavaScript`, `React`≠`React Native`, `C`≠`C++`); exact cluster set checks; never let lexical heuristics override embeddings | Fixes confirmed false matches visible during live judge tests | **Independent** (pure logic) | Unit tests in `matchingAndScoring.test.ts` covering all 6 spec pairs |
| `V-20` *(elevated for judge accuracy)* | `src/analysis/scoringEngine.ts` | Gate/scale experience pillar by technical/domain relevance when skill & domain overlap are near zero | Fixes unrelated Pastry Chef scoring `15%` instead of `0–3%` | **Independent** (pure logic) | Unit test unrelated 10-yr resume → `overallScore <= 5%` |
| `V-03` + `V-09` | `src/server/pdfProcessor.ts` | Enforce strict byte-0 `%PDF-`, check `pageCount > 15` *before* `extractText`, wrap parse in 10s timeout, call `pdfProxy.destroy()` in `finally` | Prevents PDF CPU/memory DoS and polyglot bypass | **Independent** | Test 20-page PDF, HTML polyglot (`422` immediately), and memory stability |
| `V-01` + `V-05` | `server.ts`, `src/db/repository.ts`, `package.json` | Add `zod` + `express-rate-limit`, `trust proxy`, concurrency cap (max 4), `jdText <= 25 KB`, `question <= 800`, strict `zod` schemas on `/api/coach` & `/api/analyses/save`, HMAC-signed session save tokens | Blocks AI quota abuse, RAM DoS, and forged saved scores | **Independent** (adds `zod`, `express-rate-limit`) | Burst request `429` test; malformed `/save` & `/coach` `400` tests |
| `V-04` + `V-11` | `src/server/geminiService.ts`, `src/server/analysisPipeline.ts`, `src/analysis/matchingEngine.ts` | Add explicit untrusted-data XML/nonce delimiters + anti-injection `systemInstruction`; add `verifyResumeEvidence` grounding filter; exclude `verified: false` JD skills from score | Defense-in-depth against prompt injection and AI hallucinations | **Independent** | Unit tests with hallucinated skills & live subtle prompt-injection test |
| `V-06` | `package.json`, `bun.lock` | Remove unused `motion`/`autoprefixer`, move dev tools to `devDependencies`, upgrade `firebase`/`firebase-admin`/`drizzle-kit` | Clears `bun audit` HIGH/MOD advisories | **Independent** (re-verify Auth & Drizzle) | `bun audit` clean + `npm run build` + unit tests |
| `V-07` | `vite.config.ts`, `src/App.tsx` | Lazy-load views (`React.lazy` + `Suspense`) and configure Rollup `manualChunks` (`recharts`, `firebase`) | Reduces initial JS payload from 2.15 MB to `<500 KB` | **Independent** | `npm run build` inspect `dist/assets/*.js` sizes |
| `V-08` | `package.json` (and optional `vercel.json`/`render.yaml`) | Pin `"engines": { "node": ">=22.18.0" }`, verify `NODE_ENV=production node server.ts`, add `VITE_API_BASE_URL` + `ALLOWED_ORIGINS` if splitting hosts | Prevents production startup failure | **Architectural** if targeting split Vercel/Render | Run `NODE_ENV=production node server.ts` & verify `/api/health` + `/` |

### Priority 3 — Medium (Important Security, Privacy & Reliability Hardening)
| Issue ID | Affected File(s) | Required Change | Reason | Dependencies / Scope | Verification Method |
|---|---|---|---|---|---|
| `V-12` | `src/analysis/skillTaxonomy.ts`, `src/server/geminiService.ts` | Allow 1-char allowlisted skills (`C`, `R`); diagnose & fix `gemini-embedding-2` API call so neural embeddings succeed live | Restores real semantic matching & fixes silent `C`/`R` loss | **Independent** | Unit test `C`/`R`; live `/api/analyze` verifies `gemini_embedding_2` |
| `V-13` | `src/server/geminiService.ts` | Forbid unverified URLs/fabricated courses in roadmap prompt; validate day skills against missing/partial skills & strip `https?://` links in `sanitizeLearningPlan` | Keeps 14-day plans strictly grounded and link-safe | **Independent** | Unit tests on `sanitizeLearningPlan` |
| `V-14` + `V-15` + `V-16` | `server.ts`, `vite.config.ts` | Add `server.fs.deny` blocking backend files in dev; disable `X-Powered-By`; add HTTP security headers + `Cache-Control: no-store` on `/api/analyses*`; map JSON/size/503 errors cleanly (`400`/`413`/`503`) + sanitize `500`s; add `/api/*` `404` JSON handler | Eliminates dev source leak, fingerprinting, and raw error disclosure | **Independent** | Re-run Part 2 HTTP probe script |
| `V-17` | `src/middleware/auth.ts` | Pass `checkRevoked: true` in `requireAuth`; separate `verifyIdToken` (`401`) from `getOrCreateUser` (`503`) | Enforces revoked sessions & accurate outage status codes | **Independent** | Unit test mocked DB failure → `503` |
| `V-18` | `src/db/schema.ts`, `src/db/repository.ts`, `src/db/index.ts`, `server.ts` | Add `(user_id, created_at)` index, score `CHECK (0..100)`, `updated_at`; project summary columns + pagination; add pool `idleTimeoutMillis`/`statement_timeout`/TLS & `SIGTERM` drain | Prevents table scans, memory bloat, and pool exhaustion | **Schema Migration** (`drizzle-kit push`) | Verify index via `EXPLAIN` & test `?limit=10` |
| `V-19` | `src/server/analysisPipeline.ts`, `src/components/AnalyzeView.tsx`, `server.ts` | Redact contact PII pre-LLM; stop persisting unused `resumeTextExcerpt`; add upload AI privacy disclosure & `DELETE /api/analyses` bulk wipe | Minimizes PII exposure & improves privacy compliance | **Independent** | Analyze synthetic PII resume; inspect DB row & UI notice |
| `V-21` + `V-22` | `src/services/api.ts`, `src/App.tsx`, `tsconfig.json`, `.gitignore`, `public/` | Guard NDJSON `JSON.parse`, add `fetchWithTimeout`, add `ErrorBoundary`, enable `strict: true`, add `.playwright-cli/` to `.gitignore`, remove debug PNG from `public/` | Prevents UI crashes, hangs, and accidental artifact leaks | **Independent** | `tsc --noEmit`, `npm run build`, stream-error test |
| `V-10` | `src/server/pdfProcessor.ts`, `src/server/geminiService.ts` | Add anti-injection `systemInstruction` to Gemini OCR; handle 11–25 page mixed docs transparently | Hardens OCR against visual injection & silent page loss | **Independent** | Test mixed PDF & scanned instruction image |

### Priority 4 — Low (Additional Hardening & Hygiene)
- `V-23`: Clear `activeReport` on sign-out and roll back failed optimistic roadmap toggles (`src/App.tsx`).
- `V-24`: Propagate `AbortSignal` on stream cancel (`server.ts`, `geminiService.ts`), reject invalid explicit Bearer tokens in `optionalAuth` (`401`), and return `400` on non-array `completedDays` in `PATCH /progress`.
- `V-25`: Typed `DatabaseError` → `503`, structured JSON security audit logging, and `unhandledRejection`/`SIGTERM` process handlers.
- `V-26` + `V-27`: Deduplicate `/api/analyze` & `/api/analyze-stream`, prune/wire dead `deepThinking` code, strip leading dots in `sanitizeFilename`, escape Markdown export, update `.env.example` & `README.md`, and optionally add public UUIDs for analyses.

---

## 19. Final Project Readiness Assessment

### Evaluation Scorecard
| Dimension | Rating | Notes |
|---|---|---|
| Application & Frontend Security | **GOOD** | Zero XSS sinks, zero exposed secrets, zero `localStorage` tokens; needs Error Boundary & `strict: true` |
| File Upload & PDF Reliability | **MODERATE** | Verified `400`/`413`/`422` validation & RAM-only handling; needs pre-parse page limit, timeout, byte-0 `%PDF-` |
| Gemini API & Prompt Injection | **MODERATE** | Server-side key isolation & overt injection resisted; needs rate limits, token caps, delimiters & resume verification |
| AI Accuracy, Matching & Scoring | **NEEDS FIX** | Deterministic scoring & niche skill extraction work well, but `Java`=`JavaScript` / `React`=`React Native`, `15%` unrelated score, and `lexical_fallback` must be fixed |
| Backend API & Database Security | **MODERATE** | Zero SQLi, real Firebase Auth & anti-IDOR ownership checks; needs `/save` validation, HTTP headers, error mapping & DB index |
| Resume Privacy | **NEEDS FIX** | No binary PDF persistence, but stores unused contact PII excerpt and lacks AI processing disclosure |
| Performance & Dependencies | **NEEDS FIX** | Fast 8s backend pipeline, but 2.15 MB unsplit JS bundle and 3 `bun audit` advisories |
| Unseen Judge Input Compatibility | **STRONG (Text PDFs)** | Verified dynamically across 6 diverse unseen inputs with zero mock data; scanned/multi-column PDFs not yet empirically tested |

### Separate Final Verdicts

#### A. Local Hackathon Demonstration & Mentoring Readiness: **CONDITIONALLY READY**
- The app runs reliably on `http://localhost:3000`, uses real Gemini analysis and deterministic scoring with zero mock data, handles unseen judge resumes/JDs dynamically in ~8 seconds, and validates bad PDFs/JDs cleanly.
- **Recommended quick pre-demo fixes (fast, low-risk):** Fix `V-02` (`Java`=`JavaScript` / `React`=`React Native`), `V-20` (unrelated experience score cap), and `V-12` (`C`/`R` + `gemini-embedding-2` fallback) before live judge grading.

#### B. Public Production Deployment Readiness: **NOT READY**
- **Must resolve all 8 HIGH issues (`V-01`–`V-08`) and key MEDIUM hardening/privacy issues (`V-09`, `V-14`–`V-19`)** before exposing the application to untrusted public internet traffic.
- Additionally, if external **Vercel + Render** deployment or **Python/FastAPI/SQLite** compliance is mandated by your submission rubric, that requires explicit architectural configuration/porting decisions.

---

*All four audit reports (`M5_SECURITY_AUDIT_PART_1.md`, `M5_SECURITY_AUDIT_PART_2.md`, `M5_SECURITY_AUDIT_PART_3.md`, and `M5_FINAL_SECURITY_AUDIT_REPORT.md`) are preserved in the project root. No project code has been modified. Awaiting your explicit approval to begin remediation.*
