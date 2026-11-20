# M5 – Complete Project Audit & Requirement Validation Report
## SkillGap M5 — Resume vs JD Gap Analyser

**Audit Date:** 2026-11-20  
**Audit Scope:** Full-repository static inspection, live API & unseen judge-input execution testing, database verification, security scan, and deployment readiness review.  
**Audit Policy:** Read-only inspection and execution testing; zero production files were modified during this audit.

---

## Section 1: Executive Summary

- **Overall Project Status:** **PARTIAL (Functional in Unified Node.js/TypeScript + Cloud SQL Stack; Non-Compliant with Specified Python/FastAPI/SQLite/Sentence-Transformers Stack)**
- **Summary Assessment:**  
  SkillGap M5 is a **working, live, full-stack AI web application** that dynamically processes unseen PDF resumes and job descriptions (text or PDF) in ~8–12 seconds, normalizes skills via a custom taxonomy, verifies verbatim JD evidence, computes a deterministic formula-audited compatibility score, renders interactive Recharts visualizations, and generates personalized 14-day learning roadmaps.  
  However, there are **two major audit gaps** relative to the original M5 specification:
  1. **Backend/ML/DB Stack Divergence:** Instead of the specification's Python + FastAPI + PyMuPDF/pdfplumber + Tesseract + spaCy + Sentence Transformers + SQLite/SQLAlchemy/Pydantic + Vercel/Render stack, the application is built as a unified **Node.js + Express + TypeScript + `unpdf`/Gemini OCR + Cloud SQL (PostgreSQL)/Drizzle + Firebase Auth** application.
  2. **Runtime Semantic Embedding Fallback:** During live execution testing, `gemini-embedding-2` silently fell back to `lexical_fallback` (`extractionMeta.semanticMatchingEngine: "lexical_fallback"`), reducing semantic recall on paraphrased skills (e.g., `Vendor Management` vs `Vendor Negotiation`, `SAP ERP` vs `SAP S/4HANA`).

### Requirement Scorecard

| Metric | Count | Notes |
|---|---:|---|
| **Total Audited Requirements** | 40 | 20 Tech Stack items + 10 Core Functional groups + 5 API endpoints + 5 Cross-cutting areas |
| **PASS** | 16 | Verified via code inspection and live execution/build/unit tests |
| **PARTIAL** | 11 | Implemented with functional equivalents, minor calibration bugs, or incomplete test coverage |
| **FAIL** | 11 | Missing specified Python/FastAPI/SQLite/Tesseract/spaCy/Sentence-Transformers/Vercel/Render/Git items |
| **BLOCKED** | 2 | Live authenticated Cloud SQL CRUD (requires interactive Google OAuth token) & live cloud deployment tests |
| **Failed Automated Tests** | 0 | 7/7 unit tests pass; `tsc --noEmit` & `vite build` pass; 9/9 live HTTP error & E2E scenarios returned expected status codes |
| **Blocked Automated Tests** | 2 | Authenticated `/api/analyses` CRUD roundtrip & live OCR/encrypted PDF binary execution |

---

## Section 2: Technology Stack Verification

*Note: Code inspection confirmed that the workspace contains **no `backend/` Python directory**, no `requirements.txt`, no `Dockerfile`, no `vercel.json`, and no `.git` repository. The app runs on Node.js + Express + Vite + TypeScript.*

| Technology | Required | Actual | Status | Evidence |
|---|---|---|---|---|
| **Frontend** | React.js + Vite | React 19.0.1 + Vite 8.3.0 | **PASS** | `package.json`, `vite.config.ts`, `src/main.tsx`, `src/App.tsx`; `vite build` succeeds |
| **Styling** | Tailwind CSS | Tailwind CSS 4.3.3 (`@tailwindcss/vite`) | **PASS** | `package.json`, `src/index.css` (`@import "tailwindcss";`), `vite.config.ts` |
| **Icons** | Lucide React | `lucide-react` 0.546.0 | **PASS** | Imported and rendered across `src/App.tsx` and all `src/components/*.tsx` |
| **Charts** | Recharts | `recharts` (installed & active) | **PASS** | `src/components/ReportView.tsx` (`ResponsiveContainer`, `BarChart`, `Bar`, `XAxis`, `YAxis`, `Tooltip`, `Legend`, `Cell`) |
| **AI Skill Extraction** | Gemini API | `@google/genai` (server-side `gemini-3.1-flash-lite`) | **PASS** | `src/server/geminiService.ts` (`extractStructuredResume`, `extractStructuredJobDescription`); verified in 4 live API runs |
| **Learning Plan** | Gemini API | `@google/genai` (`gemini-3.1-flash-lite` primary, `gemini-4-hydrogen` fallback/refine) | **PASS** | `src/server/geminiService.ts` (`generatePersonalizedLearningPlan`); live runs produced 14 tailored days |
| **Skill Normalization** | Custom Skill Taxonomy | TypeScript alias taxonomy (180+ mappings) | **PASS** | `src/analysis/skillTaxonomy.ts` (`normalizeSkillName`, `normalizeAndDeduplicateSkills`); 3/3 unit tests pass |
| **Backend** | Python + FastAPI | Node.js + Express 4.21.2 + TypeScript | **FAIL** | `server.ts`; Express serves REST APIs + Vite middleware (no Python/FastAPI installed or used) |
| **PDF Extraction** | PyMuPDF + pdfplumber | `unpdf` (PDF.js ESM wrapper) | **FAIL** | `src/server/pdfProcessor.ts` (`getDocumentProxy`, `extractText`); works in Node.js, not PyMuPDF/pdfplumber |
| **PDF Layout Analysis** | PyMuPDF | Page-level text extraction via `unpdf` | **FAIL** | `src/server/pdfProcessor.ts` inspects page counts & char density, not PyMuPDF bounding-box coordinates |
| **OCR** | Tesseract OCR | Gemini Multimodal OCR (`inlineData: application/pdf`) | **FAIL** | `src/server/geminiService.ts` (`extractPdfTextViaGeminiOcr`); Tesseract is not installed |
| **Text Processing** | Python + spaCy | TypeScript regex/tokenization & Gemini NLP | **FAIL** | `src/analysis/evidenceEngine.ts`, `src/analysis/matchingEngine.ts` (no Python/spaCy) |
| **Semantic Matching** | Sentence Transformers | `@google/genai` `gemini-embedding-2` + lexical fallback | **FAIL** | `src/server/geminiService.ts` (`embedSkillNames`), `src/analysis/matchingEngine.ts`; live test showed fallback to `lexical_fallback` |
| **Missing Skill Analysis** | Python Matching Engine | TypeScript Matching & Scoring Engine | **FAIL** | `src/analysis/matchingEngine.ts`, `src/analysis/scoringEngine.ts`, `src/analysis/evidenceEngine.ts` (functional in TS, not Python) |
| **Database** | SQLite (`backend/database/app.db`) | Cloud SQL for PostgreSQL (`asia-south1`) | **FAIL** | `src/db/index.ts`, `src/db/schema.ts`; provisioned via AI Studio Cloud SQL (`users`, `analyses` verified live) |
| **ORM** | SQLAlchemy | Drizzle ORM (`drizzle-orm`, `drizzle-kit`, `pg`) | **FAIL** | `src/db/schema.ts`, `src/db/drizzle.config.ts`, `src/db/repository.ts` |
| **Validation** | Pydantic | TypeScript interfaces + manual runtime guards + Gemini `responseSchema` | **PARTIAL** | `src/types/analysis.ts`, `src/server/pdfProcessor.ts`, `server.ts` (no Pydantic; no runtime schema library like Zod on Express request bodies) |
| **Version Control** | Git + GitHub | Not initialized | **FAIL** | `git status` returned `fatal: not a git repository` |
| **Frontend Deployment** | Vercel | Unified Node/Vite build (`npm run build`) | **FAIL** | No `vercel.json` or separate `VITE_API_URL` production API configuration |
| **Backend Deployment** | Render | Unified Express `server.ts` (`npm start`) | **FAIL** | No `Dockerfile`, `render.yaml`, or standalone FastAPI deployment setup |

---

## Section 3: Functional Requirement Verification

| Feature | Status | Implementation Evidence | Issues |
|---|---|---|---|
| **A. Resume Upload** | **PARTIAL** | `src/components/AnalyzeView.tsx` (`validateClientPdf`, drag/drop & picker); `src/server/pdfProcessor.ts` (`validatePdfBuffer`, `extractPdfDocument`, `sanitizeFilename`); `server.ts` (`multer.memoryStorage()`, 10 MB limit). **Executed:** missing file (400), empty 0-byte PDF (400), corrupted non-PDF (422), valid text PDF (200). | Password-protected PDF binary and scanned image-only PDF binary OCR paths were code-inspected (`PasswordException`, `isMostlyScanned` -> `extractPdfTextViaGeminiOcr`) but **NOT TESTED** with real encrypted/scanned PDF binaries. |
| **B. Job Description Input** | **PASS** | `src/components/AnalyzeView.tsx` (Paste Text / Upload JD PDF segmented tabs, word/char counter, Quick Scan JD); `src/server/analysisPipeline.ts` (min 40 chars & 8 words). **Executed:** empty JD (400), short JD (400), pasted text JD (200), uploaded JD PDF `audit-jd-ops.pdf` (200). | None blocking. |
| **C. AI Skill Extraction** | **PASS** | `src/server/geminiService.ts` (`extractStructuredResume`, `extractStructuredJobDescription`, `DOCUMENT_EXTRACTION_SCHEMA`, `sanitizeExtractionPayload`, `safeJsonParse`). Extracts all 10 required categories (languages, frameworks, libraries, DBs, cloud, dev tools, technical, soft skills, qualifications, certifications, experience). **Executed:** 4 live runs returned valid structured JSON. | Uses `gemini-3.1-flash-lite` with 25s timeout & retry; malformed JSON throws clean handled error. |
| **D. Skill Normalization** | **PASS** | `src/analysis/skillTaxonomy.ts` (`SKILL_ALIASES`, `normalizeSkillName`, `normalizeAndDeduplicateSkills`). **Executed:** Unit tests verified `ReactJS`/`React.js` -> `React`, `JS` -> `JavaScript`, `Python3` -> `Python`, `PostgreSQL Database` -> `PostgreSQL`, `Node` -> `Node.js`, `RESTful Web Services` -> `REST API`, deduplication, and unseen skill preservation (`SAP S/4HANA`, `Clinical Trial Auditing`). | Taxonomy is static dictionary + casing normalizer; non-tech domain aliases (e.g., `SAP ERP` vs `SAP S/4HANA`, `Vendor Management` vs `Vendor Negotiation`) rely on semantic embeddings. |
| **E. Semantic Matching** | **PARTIAL** | `src/analysis/matchingEngine.ts` (`cosineSimilarity`, `lexicalSemanticSimilarity`, `matchSkillsAgainstJd`) + `src/server/geminiService.ts` (`embedSkillNames` calling `gemini-embedding-2`). **Executed:** Unit test passes with embeddings; **however**, live `/api/analyze` returned `"semanticMatchingEngine": "lexical_fallback"`. | **Critical/High:** Neural embeddings (`gemini-embedding-2`) failed silently at runtime and fell back to `lexical_fallback`. Consequently, paraphrased non-tech skills (`Vendor Management` vs `Vendor Negotiation`, `Team Leadership` vs `Cross-Functional Leadership`) were missed in Scenario B. Also does not use Sentence Transformers. |
| **F. Missing Skill Analysis & JD Evidence** | **PASS** | `src/analysis/matchingEngine.ts` classifies `matched`, `partial`, `missing`; `src/analysis/evidenceEngine.ts` (`findVerifiedJdEvidence`) verifies every quote verbatim against raw JD text and refuses fabricated quotes. **Executed:** Unit test + live Scenario A verified `evidenceVerified: true` for all missing skills (`AWS`, `Docker`, `Kubernetes`, `Terraform`). | When a JD uses very long bullets or abbreviations, `evidenceVerified` honestly falls back to `false` with a non-fabricated reference message. |
| **G. Compatibility Score** | **PARTIAL** | `src/analysis/scoringEngine.ts` (`calculateCompatibilityScore`). Deterministic, transparent weighted formula (`technical_skills`, `role_and_soft_skills`, `qualifications`, `experience`), zero LLM score invention, full formula audit string returned. **Executed:** Unit test & live runs confirmed exact reproducibility. | **Calibration Bug Found in Scenario C:** Completely unrelated candidate (Tech Resume A vs Ops JD B, 0/9 skills matched) still scored **13%** because `yearsScore` & `seniorityScore` awarded credit for 4 years of unrelated software experience toward 5 years of logistics experience. Also `isTechnicalRole` remained `true` for the Ops JD because `SAP S/4HANA` / `Power BI` were categorized as `technical_skill`. |
| **H. Personalized 14-Day Learning Plan** | **PASS** | `src/server/geminiService.ts` (`generatePersonalizedLearningPlan`, `LEARNING_PLAN_SCHEMA`). Generates 14 sequential days with `day`, `skill`, `priority`, `objective`, `activities`, `exercise`, `expectedOutcome`, `estimatedHours`. **Executed:** Live runs produced tailored plans (`Day 1: Docker` for Tech JD; `Day 1: Inventory Optimization` for Ops JD). | Default generation uses `gemini-3.1-flash-lite` (with `gemini-4-hydrogen` LOW fallback) for ~8s responsiveness; `deepThinking: true` (`ThinkingLevel.HIGH`) exists in `geminiService.ts` but is not yet exposed as a button/endpoint in the UI. |
| **I. Analysis Dashboard** | **PASS** | `src/components/ReportView.tsx`, `src/components/RoadmapView.tsx`, `src/components/OverviewView.tsx`. Displays compatibility score, 4-pillar formula audit table, Recharts stacked category bar chart & pillar score chart, filterable Matched/Partial/Missing skill matrix with verbatim JD evidence, experience alignment, and interactive 14-day roadmap. **Executed:** Verified in headless Chromium (1440×900 & 390×844) with 0 console errors. | Zero hardcoded/mock dashboard results. |
| **J. Analysis History** | **BLOCKED** | `src/db/repository.ts` (`createAnalysisRecord`, `listAnalysesByUser`, `getAnalysisByIdForUser`, `deleteAnalysisByIdForUser`, `updateCompletedDaysForUser`); `src/components/HistoryView.tsx`; `server.ts` routes. **Executed:** Cloud SQL tables verified live (`users`, `analyses` exist, 0 rows); unauthenticated calls return HTTP 401. | Full authenticated save -> list -> open -> update progress -> delete lifecycle could not be executed in automated tests without an interactive Google Sign-In ID token (**BLOCKED**). |

---

## Section 4: Architecture Verification

| Spec Layer | Proposed Architecture | Actual Implementation | Status | Comparison Notes |
|---|---|---|---|---|
| **Layer 1: Frontend** | React + Vite + Tailwind CSS + Lucide + Recharts | React 19 + Vite 8 + Tailwind v4 + Lucide + Recharts (`src/App.tsx`, `src/components/*`) | **PASS** | Fully matches spec with modular 5-view workspace (`Overview`, `New Analysis`, `Report`, `14-Day Roadmap`, `History`). |
| **Layer 2: Backend** | Python + FastAPI + Pydantic | Node.js + Express + TypeScript (`server.ts`, `src/middleware/auth.ts`) | **FAIL** | Same REST orchestration responsibility, different runtime/framework. |
| **Layer 3: Document Processing** | PyMuPDF + pdfplumber + Tesseract OCR | `unpdf` (PDF.js) + Gemini Multimodal PDF OCR (`src/server/pdfProcessor.ts`, `src/server/geminiService.ts`) | **PARTIAL** | Handles text PDFs and has OCR fallback code, but lacks PyMuPDF coordinate/block layout parser, pdfplumber table extractor, and local Tesseract OCR. |
| **Layer 4: AI & NLP Layer** | Gemini API + Sentence Transformers + Custom Taxonomy + Python Matching/Scoring | Gemini API + `gemini-embedding-2` (with lexical fallback) + TS Taxonomy (`skillTaxonomy.ts`) + TS Matching/Evidence/Scoring engines | **PARTIAL** | Modular separation is clean, but Sentence Transformers is absent and `gemini-embedding-2` fell back to lexical matching at runtime. |
| **Layer 5: Final Dashboard** | Compatibility score, matched/partial/missing skills, JD evidence, Recharts, 14-day roadmap | Implemented in `ReportView.tsx` & `RoadmapView.tsx` + low-latency Quick Scan & Gap Advisor | **PASS** | Connected end-to-end to live backend APIs. |
| **Layer 6: Database** | SQLite (`backend/database/app.db`) + SQLAlchemy | Cloud SQL for PostgreSQL (`asia-south1`) + Drizzle ORM (`src/db/*`) + Firebase Auth user scoping | **PARTIAL** | Production-grade hosted PostgreSQL database provisioned and verified, replacing local SQLite per Cloud SQL integration setup. |

---

## Section 5: Database Verification

- **Engine & ORM:** Cloud SQL for PostgreSQL via `pg.Pool` Object Method (`src/db/index.ts`) and Drizzle ORM (`src/db/schema.ts`, `src/db/drizzle.config.ts`). SQLite/SQLAlchemy are **not** used.
- **Schema Inspection (`src/db/schema.ts`):**
  - `users`: `id` (serial PK), `uid` (text unique, Firebase Auth UID), `email` (text), `display_name` (text), `created_at` (timestamp).
  - `analyses`: `id` (serial PK), `user_id` (FK -> `users.id` with `ON DELETE CASCADE`), `resume_filename`, `job_title`, `company_name`, `jd_source_name`, `jd_text`, `resume_text_excerpt`, `extraction_meta` (jsonb), `compatibility_score` (integer), `score_breakdown` (jsonb), `matched_skills` (jsonb), `partial_skills` (jsonb), `missing_skills` (jsonb), `resume_skills` (jsonb), `jd_skills` (jsonb), `experience_alignment` (jsonb), `learning_plan` (jsonb), `completed_days` (jsonb), `created_at` (timestamp).
- **Live DB Execution Verification (`cloudsql.ExecuteSql`):**
  - Executed `SELECT 'users' AS tbl, COUNT(*)::int AS row_count FROM users UNION ALL SELECT 'analyses' AS tbl, COUNT(*)::int AS row_count FROM analyses;` -> succeeded in `10.1ms`; both tables exist and currently have `0` rows.
  - All columns previously verified against `information_schema.columns`.
- **Connection & Error Handling Inspection:**
  - `src/db/index.ts` uses lazy `pg.Pool` (max 10, 15s connect timeout, idle error listener, no startup probes or reconnect loops).
  - `src/db/repository.ts` uses two-layer error handling (sanitizes raw DB errors before bubbling up to Express routes) and Drizzle type-safe parameterized queries (zero raw SQL).
  - Upsert concurrency safety implemented via `onConflictDoUpdate` in `getOrCreateUser`.
- **Issues Identified:**
  - No duplicate-submission deduplication check (submitting the exact same resume + JD twice while signed in creates two history records, which may be desirable for re-runs, though spec notes preventing duplicate/inconsistent records).
  - Authenticated CRUD persistence across restarts is **BLOCKED** for automated testing without a Firebase user ID token.

---

## Section 6: API Verification

| Method | Endpoint | Code Inspection | Live Execution Result | Status | Notes |
|---|---|---|---|---|---|
| `GET` | `/api/health` | `server.ts:91` | **HTTP 200** (`{"status":"ok","service":"resume-jd-gap-analyser",...}`) | **PASS** | Fast, clean JSON health check. |
| `POST` | `/api/analyze` | `server.ts:138`, `optionalAuth`, `multer` fields (`resume`, `jdFile`) | **HTTP 200** on 4 live scenarios; **400** on missing resume/empty PDF/empty JD/short JD; **422** on corrupted PDF | **PASS** | Works without auth (returns unsaved session report) and auto-saves when valid Bearer token is sent. |
| `POST` | `/api/analyze-stream` | `server.ts:197`, NDJSON real-time stage stream | **HTTP 200** streaming 5 real progress events + final result (~8.3s) | **PASS** | Additional endpoint used by `src/services/api.ts` for real progress updates. |
| `GET` | `/api/analyses` | `server.ts:313`, `requireAuth` -> `listAnalysesByUser` | **HTTP 401** without Bearer token | **BLOCKED** | Auth guard verified (PASS); authenticated 200 list response blocked on OAuth token. |
| `GET` | `/api/analyses/:id` | `server.ts:329`, `requireAuth` -> `getAnalysisByIdForUser` | **HTTP 401** without Bearer token | **BLOCKED** | Validates positive integer ID, scopes by `userId`, returns 404 when missing. |
| `DELETE` | `/api/analyses/:id` | `server.ts:375`, `requireAuth` -> `deleteAnalysisByIdForUser` | **HTTP 401** without Bearer token | **BLOCKED** | Scopes delete by `userId` (`and(eq(id), eq(userId))`). |
| `POST` | `/api/analyses/save` | `server.ts:278`, `requireAuth` -> `createAnalysisRecord` | Not executed (auth required) | **BLOCKED** | Allows saving an unsaved session report after signing in. |
| `PATCH` | `/api/analyses/:id/progress` | `server.ts:352`, `requireAuth` -> `updateCompletedDaysForUser` | Not executed (auth required) | **BLOCKED** | Persists 14-day roadmap checkboxes (`1..14` sanitized). |
| `POST` | `/api/jd/quick-scan` | `server.ts:100`, `quickScanJobDescription` | **HTTP 200** in `3.0s` | **PASS** | Low-latency JD preview via `gemini-3.1-flash-lite`. |
| `POST` | `/api/coach` | `server.ts:398`, `answerGapCoachingQuestion` | Code-inspected only | **NOT TESTED** | Low-latency follow-up advisor in `ReportView.tsx`. |

---

## Section 7: Real-World Judge Input Compatibility

**Code Inspection Finding:** Zero hardcoded sample resumes, zero hardcoded JDs, zero mock fallback reports, and zero static learning plans exist anywhere in `src/` or `server.ts`.

### Live Execution Test Matrix (Executed Against `http://localhost:3000/api/analyze`)

| # | Scenario | Status | Execution Evidence & Observations |
|---|---|---|---|
| 1 | Technical Resume A + Technical JD A (`test-resume.pdf` + CloudScale JD) | **PASS** | **HTTP 200 (`11.9s`)**, Score: **64%**. Matched: `React`, `TypeScript`, `Node.js`, `REST API` (normalized from `ReactJS` & `REST API Development`). Partial: `PostgreSQL <- MySQL (0.7)`. Missing: `AWS`, `Docker`, `Kubernetes`, `Terraform` (all `ev:true`). 14-day plan started with `Day 1: Docker`. **Issue:** `engine: "lexical_fallback"`. |
| 2 | Non-Technical Ops Resume B + Non-Technical JD B uploaded as **JD PDF** (`audit-resume-ops.pdf` + `audit-jd-ops.pdf`) | **PARTIAL** | **HTTP 200 (`12.1s`)**, `jdInputType: "pdf"`, `jdExtractionMethod: "pdf_text"`, Title: `Senior Supply Chain Operations Manager`, 14-day plan started with `Day 1: Inventory Optimization` (zero leakage from Scenario A). **Issue:** Score was only **35%** because `lexical_fallback` missed semantic equivalents (`Vendor Management` vs `Vendor Negotiation`, `SAP ERP` vs `SAP S/4HANA`, `Team Leadership` vs `Cross-Functional Leadership`), and `isTechnicalRole` stayed `true`. |
| 3 | Completely Unrelated Resume A (SWE) vs Ops JD B PDF | **PARTIAL** | **HTTP 200 (`12.4s`)**, Matched: `0`, Missing: `9`, Score dropped sharply to **13%**. **Issue:** Unrelated experience years/seniority still contributed 13% instead of near 0% when domain & skill overlap is zero. |
| 4 | Minimal Resume (missing sections) + Unfamiliar Niche Skills (`Clinical Trial Auditing`, `Veeva Vault`, `Pharmacovigilance`) | **PASS** | **HTTP 200 (`21.1s`)**, Score: **75%**, `resumeYears: null` (did NOT hallucinate years or degrees), Matched all 3 unseen niche skills, identified `FDA 21 CFR Part 11 Compliance` as Missing. |
| 5 | Corrupted / Empty PDF & Empty / Short JD Error Handling | **PASS** | Corrupted PDF -> `422`, Empty 0-byte PDF -> `400`, Missing Resume -> `400`, Empty JD -> `400`, Short JD -> `400`, all with clear human-readable messages. |
| 6 | Multi-page, two-column, table-heavy, scanned/image PDF, encrypted PDF | **NOT TESTED** | Code paths exist in `src/server/pdfProcessor.ts`, but no real multi-column, table-heavy, raster-scanned, or password-encrypted PDF binaries were executed during this audit. |

---

## Section 8: Frontend and UI Verification

- **Build & Type Safety:** `vite build` (**PASS**) and `tsc --noEmit` (**PASS**, 0 errors).
- **Browser Inspection (Headless Chromium, Desktop `1440×900` & Mobile `390×844`):**
  - Zero runtime JavaScript errors and zero React warnings in console (`Errors: 0, Warnings: 0`).
  - Note: In AI Studio preview iframe, Vite emits an expected HMR WebSocket warning because `DISABLE_HMR=true`.
  - Clean empty states exist across Overview, Report, Roadmap, and History (no mock/placeholder analysis data).
  - Form validation displays inline accessible `[role="alert"]` errors without `window.alert`/`window.confirm`.
  - Live streaming progress checklist in `AnalyzeView.tsx` reflects real backend stages and includes a functional **Cancel** button (`AbortController`).
  - `ReportView.tsx` renders Recharts charts, transparent formula breakdown table, filterable skill matrix (`All`/`Missing`/`Partial`/`Matched` + search), and verbatim JD quotes.
  - `RoadmapView.tsx` renders all 14 days, interactive completion toggles, priority filters, and Markdown export.
  - Mobile `390×844` layout has responsive slide-over drawer navigation and zero horizontal overflow.
- **Minor UI Gaps Identified:**
  - `AnalyzeView.tsx` drag-and-drop handler is implemented for Resume PDF, while JD PDF upload uses click-to-select only (no drag-and-drop dropzone parity on JD PDF tab).
  - No UI button yet to trigger the `deepThinking: true` (`gemini-4-hydrogen` `ThinkingLevel.HIGH`) roadmap refinement function that already exists in `src/server/geminiService.ts`.

---

## Section 9: Security Verification

| Check | Status | Evidence & Findings |
|---|---|---|
| **API Keys Kept Server-Side** | **PASS** | Static scan confirmed zero references to `GEMINI_API_KEY`, `@google/genai`, or `SQL_*` credentials in `src/components`, `src/services`, `src/context`, `src/App.tsx`, `src/main.tsx`, or `vite.config.ts`. |
| **SQL Injection Prevention** | **PASS** | `src/db/repository.ts` uses Drizzle ORM parameterized builders exclusively; static scan confirmed zero `db.execute` or string-concatenated SQL. |
| **XSS & Command Injection Prevention** | **PASS** | Static scan confirmed zero `dangerouslySetInnerHTML`, `innerHTML`, `eval`, or `child_process`/`exec`/`spawn`. |
| **File Upload Validation & Temp Cleanup** | **PASS** | `multer.memoryStorage()` holds files strictly in memory (zero temp files left on disk); enforces 10 MB limit, `.pdf` MIME/extension check, `%PDF-` magic header check, 25-page cap, and `sanitizeFilename()`. Uploaded files are never executed. |
| **Authentication & Ownership Enforcement** | **PASS** | All database-accessing endpoints (`/api/analyses*`) enforce `requireAuth` (`adminAuth.verifyIdToken`) and filter every query/mutation by `eq(analyses.userId, req.dbUser.id)`. Tokens are kept in memory (`auth.currentUser.getIdToken()`), never `localStorage`. |
| **Error Sanitization & Logging** | **PASS** | `src/db/repository.ts` sanitizes DB errors; `server.ts` (`formatApiError`) hides internal stack traces; resume content is not logged. |
| **Timeouts & Retry Guards** | **PASS** | `src/server/geminiService.ts` wraps AI calls with explicit timeouts (`12s`–`35s`) and bounded retries (`maxAttempts = 2`). |
| **`.gitignore` & `.env.example`** | **PASS** | `.gitignore` ignores `.env*` while keeping `!.env.example`; `.env.example` contains placeholder values only (no real secrets). |
| **CORS Configuration** | **PARTIAL** | `server.ts` does not register CORS middleware. Safe for same-origin unified hosting, but requires explicit origin-allowlist CORS if frontend and backend are ever deployed on separate domains (e.g., Vercel + Render). |
| **Dependency Vulnerability Audit (`bun audit`)** | **PARTIAL** | `bun audit` flagged 3 transitive advisories: `@grpc/grpc-js` (1 high, 1 low via `firebase`/`firebase-admin`) and `esbuild <=0.24.2` (1 moderate via `drizzle-kit`). |

---

## Section 10: Deployment Readiness

| Target | Status | Findings & Blockers |
|---|---|---|
| **Unified Full-Stack Hosting (Cloud Run / AI Studio)** | **PASS** | `npm run build` compiles frontend to `dist/`; `server.ts` serves `dist/` + SPA fallback on `PORT || 3000` when `NODE_ENV=production`; Cloud SQL & Firebase Auth are provisioned. |
| **Frontend – Vercel (Spec Target)** | **FAIL** | No `vercel.json` SPA rewrite config, no `VITE_API_BASE_URL` environment variable in `src/services/api.ts` (all fetches use relative `/api/...`). |
| **Backend – Render (Spec Target)** | **FAIL** | No Python FastAPI app, no `Dockerfile`, no `render.yaml`, no Tesseract system dependency config, no Sentence Transformers startup loader, and no explicit CORS allowlist in `server.ts`. |
| **External Services (Gemini API)** | **PARTIAL** | `gemini-3.1-flash-lite` is verified live (`HTTP 200`), **but `gemini-embedding-2` silently fell back to `lexical_fallback`** during live execution — must be diagnosed before judge demo. |
| **Version Control (Git / GitHub)** | **FAIL** | Workspace is not initialized as a Git repository (`git status` fails). |

---

## Section 11: Testing Results

### Code Inspection vs Execution Summary

| Test Suite / Check | Type | Result | Details |
|---|---|---|---|
| `npx --yes tsx --test src/analysis/skillTaxonomy.test.ts src/analysis/matchingAndScoring.test.ts` | Execution (Unit) | **PASS (7/7)** | 284ms total; covers aliases, deduplication, unseen skills, cosine similarity, verbatim evidence, and weighted scoring. |
| `npm run build` (`compile_applet`) | Execution (Build) | **PASS** | Clean Vite production bundle. |
| `tsc --noEmit` (`lint_applet`) | Execution (Static) | **PASS** | 0 TypeScript errors. |
| `GET /api/health` | Execution (API) | **PASS** | HTTP 200 JSON. |
| Unauthenticated `/api/analyses` (GET, GET/:id, DELETE/:id) | Execution (Security) | **PASS** | All returned HTTP 401. |
| Negative Validation (missing resume, empty PDF, corrupt PDF, empty JD, short JD) | Execution (API) | **PASS (5/5)** | Accurate HTTP 400 / 422 status codes & clear error messages. |
| Live E2E Unseen Scenarios A, B, C, D (`POST /api/analyze`) | Execution (Integration) | **PARTIAL (2 PASS, 2 PARTIAL)** | All 4 returned HTTP 200 in 11.9–21.1s with dynamic reports & 14-day plans; revealed `lexical_fallback` on embeddings & 13% unrelated score floor. |
| Live Streaming (`POST /api/analyze-stream`) + Chromium E2E | Execution (E2E) | **PASS** | Completed in 8.3s; 0 console errors; desktop & mobile layouts verified. |
| Cloud SQL Schema & Table Connectivity | Execution (DB) | **PASS** | `users` and `analyses` verified live via `ExecuteSql` (`10ms`). |
| Authenticated Cloud SQL History CRUD | Execution (E2E) | **BLOCKED** | Requires interactive Google OAuth login token unavailable in headless runner. |
| Encrypted PDF & Raster-Scanned PDF OCR | Execution (PDF/OCR) | **NOT TESTED** | Code-inspected only; needs real encrypted & image-only PDF fixtures. |
| `POST /api/coach` | Execution (API) | **NOT TESTED** | Code-inspected only. |

---

## Section 12: Missing Features and Bugs

1. **Bug — `gemini-embedding-2` Silently Falling Back to `lexical_fallback` (`src/server/geminiService.ts:346`)**: Live execution showed `"semanticMatchingEngine": "lexical_fallback"`, causing paraphrased skills (`Vendor Management` vs `Vendor Negotiation`, `SAP ERP` vs `SAP S/4HANA`) to be missed.
2. **Bug — Experience Scoring Over-Credits Unrelated Backgrounds (`src/analysis/scoringEngine.ts:154`)**: When a candidate has 0 matched skills and 0 matched domains (Scenario C), total years & seniority still yield ~13% compatibility instead of scaling down when domain/skill alignment is zero.
3. **Bug — Non-Technical Role Classification (`src/analysis/scoringEngine.ts:127`)**: Business software tools (`SAP S/4HANA`, `Power BI`, `Microsoft Excel`) are categorized as `technical_skill`, causing a Supply Chain Operations Manager JD to set `isTechnicalRole: true` and weight technical skills at 55%.
4. **Spec Gap — Entire Python/FastAPI/SQLite/Sentence-Transformers/Tesseract Stack Replaced**: Project uses Node.js/Express + Drizzle/Cloud SQL PostgreSQL + `unpdf`/Gemini OCR instead of the spec's Python/FastAPI/SQLite/SQLAlchemy/PyMuPDF/pdfplumber/Tesseract/spaCy/Sentence Transformers stack.
5. **Spec Gap — Missing Deployment & VCS Artifacts**: No `.git` repo, no `vercel.json`, no `Dockerfile`/`render.yaml`, no CORS middleware in `server.ts`, and no configurable `VITE_API_BASE_URL`.
6. **Gap — Unexposed High-Thinking Roadmap Refinement**: `generatePersonalizedLearningPlan({ deepThinking: true })` exists in `src/server/geminiService.ts` using `gemini-4-hydrogen` + `ThinkingLevel.HIGH`, but has no API route or UI button to invoke it.
7. **Gap — Missing Test Coverage for Edge PDFs & Coach API**: No automated tests yet for password-protected PDFs, raster-scanned OCR PDFs, multi-column/table PDFs, or `/api/coach`.
8. **Security/Maintenance — Transitive `bun audit` Advisories**: 3 transitive advisories (`@grpc/grpc-js`, `esbuild` via `drizzle-kit`).

---

## Section 13: Prioritized Improvement Plan

### Critical (Must Fix Before Hackathon Evaluation)
1. **Fix Live Semantic Embeddings (`src/server/geminiService.ts` -> `embedSkillNames`)**: Inspect the exact error logged by `ai.models.embedContent({ model: 'gemini-embedding-2', ... })`, verify supported embedding model/payload format with the active runtime key, and confirm live `/api/analyze` returns `"semanticMatchingEngine": "gemini_embedding_2"` with real vector cosine similarity on paraphrased skills.
2. **Confirm Stack Acceptance with Hackathon Rules**: Decide whether judges strictly require the Python/FastAPI/SQLite/Vercel/Render stack OR accept the functional Node.js/Express + Cloud SQL PostgreSQL + Gemini architecture (currently deployed cleanly as a single full-stack service).
3. **Calibrate Unrelated Experience Scoring (`src/analysis/scoringEngine.ts`)**: Gate or scale `yearsScore` and `seniorityScore` by domain/skill alignment so a completely unrelated candidate (0 matched skills, 0 matched domains) scores near `0%–5%` rather than `13%`.

### High (Important for Functionality & Judge Confidence)
4. **Verify Real Scanned OCR & Password-Protected PDFs**: Add automated integration tests with a real raster-image scanned PDF (confirming `extractionMethod: "gemini_ocr"`) and an encrypted PDF (confirming HTTP `422` password error), plus a multi-column/table PDF.
5. **Verify Authenticated Cloud SQL CRUD End-to-End**: Perform a real Google Sign-In session test covering Save -> History List -> Open Report -> Toggle 14-Day Progress -> Reload Persistence -> Delete Report.
6. **Refine Non-Technical vs Engineering Skill Weighting**: Ensure business/operations tools (`Microsoft Excel`, `Power BI`, `SAP`) don't trigger software-engineering technical weighting on non-technical management JDs.

### Medium (Quality, Security & Deployment Reliability)
7. **Expose Optional "Deep-Think Refine Roadmap" Action**: Wire a dedicated `POST /api/roadmap/refine` route and UI button on `RoadmapView.tsx` invoking `gemini-4-hydrogen` (`ThinkingLevel.HIGH`) on demand.
8. **Add Explicit CORS Allowlist & Configurable API Base URL**: Add origin-restricted CORS middleware in `server.ts` and `VITE_API_BASE_URL` support in `src/services/api.ts` if split frontend/backend hosting is ever needed.
9. **Initialize Git & Audit Transitive Dependencies**: Initialize Git repository for clean submission and review upgrades for `firebase`/`drizzle-kit` to clear `bun audit` warnings.

### Low (Optional Polish)
10. **Add Drag-and-Drop Parity to JD PDF Upload** in `src/components/AnalyzeView.tsx` to match the Resume PDF dropzone.
11. **Add Automated API Tests for `/api/coach` & `/api/jd/quick-scan`** to broaden automated regression coverage.
