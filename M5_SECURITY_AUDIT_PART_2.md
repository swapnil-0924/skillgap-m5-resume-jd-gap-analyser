# SkillGap M5 — Part 2 Security Audit Report
## Backend, REST API, Database, Access Control & Data Privacy Security Audit

- **Project Name:** SkillGap M5 — Resume vs JD Gap Analyser  
- **Problem ID:** M5  
- **Audit Scope:** Part 2 — Backend Architecture, REST API Security, Authentication & Authorization, IDOR, SQL Injection, Database Security, Analysis History Integrity, Resume Privacy, CORS & HTTP Security Headers, Rate Limiting, and Error Handling & Logging  
- **Audit Date:** 2026-11-20  
- **Audit Mode:** Strictly Read-Only (no existing files modified, no database records altered or deleted, no destructive queries executed)

---

## 1. Backend Security Summary

### Architecture Reality Check (Consistent with Part 1)
The codebase does **not** contain a Python FastAPI backend, Pydantic schemas, SQLAlchemy models, or an SQLite database file. All checks specific to FastAPI internals, SQLAlchemy sessions, and SQLite file locking are marked **BLOCKED (Not Present in Codebase)**.

The actual backend is a **Node.js + Express 4 + TypeScript (`server.ts`, 459 lines)** server hosting both the REST API (`/api/*`) and the React/Vite SPA, connected to **Cloud SQL PostgreSQL** via **Drizzle ORM** (`src/db/`) and **Firebase Authentication (Google Sign-In)** via `firebase-admin` (`src/middleware/auth.ts`).

### Overall Part 2 Risk Summary

| Severity | Confirmed (Code / Executed Test) | Theoretical / Defense-in-Depth | Total |
|---|---|---|---|
| **CRITICAL** | 0 | 0 | **0** |
| **HIGH** | 2 | 0 | **2** |
| **MEDIUM** | 9 | 1 | **10** |
| **LOW** | 5 | 2 | **7** |
| **INFORMATIONAL** | 2 | 0 | **2** |
| **Total** | **18** | **3** | **21** |

### Verified Backend Safeguards (Code Inspection + Live Probes)
1. **Zero SQL Injection Surface:** Every database operation in `src/db/repository.ts` uses Drizzle ORM parameterized query builders (`eq`, `and`, `desc`, `.values()`, `.set()`). No raw SQL or string concatenation exists anywhere in the repository.
2. **Real Server-Side Auth & Strict Ownership Scoping (Anti-IDOR):** All saved-history endpoints (`GET /api/analyses`, `GET /api/analyses/:id`, `DELETE /api/analyses/:id`, `PATCH /api/analyses/:id/progress`, `POST /api/analyses/save`) enforce Firebase ID token verification via `requireAuth` (live probes confirmed `HTTP 401` on missing and forged tokens) and scope every read/update/delete query with `and(eq(analyses.id, id), eq(analyses.userId, userId))` using the server-verified `req.dbUser.id`.
3. **No Public Database File or `.env` Exposure:** There is no local SQLite file on disk, and live probe `GET /.env` did not expose environment files.
4. **No Wildcard CORS:** Live `OPTIONS /api/analyses` with foreign `Origin: https://evil.example` returned no `Access-Control-Allow-Origin` header, preventing cross-origin browser reads by default.
5. **No Resume Text or Secret Logging:** Backend `console.log`/`console.error` statements log stage timings and error summaries—never API keys, DB passwords, or raw resume contents.

### Top Part 2 Priorities (Awaiting Approval Before Fixing)
1. **HIGH (`M5-P2-001`):** No rate limiting, request concurrency caps, or `trust proxy` configuration across unauthenticated AI/upload routes (`POST /api/analyze`, `/api/analyze-stream`, `/api/jd/quick-scan`, `/api/coach`).
2. **HIGH (`M5-P2-002`):** Client-forged report persistence / mass-assignment integrity bypass on `POST /api/analyses/save` (`server.ts:278–315`) — accepts unvalidated `compatibilityScore`, `completedDays`, `matchedSkills`, `extractionMeta!`, and `experienceAlignment!` directly from the HTTP body without schema validation or server-side verification.
3. **MEDIUM (`M5-P2-003`):** Vite dev middleware (`server.ts:436–441`) exposes backend TypeScript source files (`GET /server.ts` returned `HTTP 200` transpiled JavaScript in live probe!) in non-production environments.
4. **MEDIUM (`M5-P2-004`):** Missing HTTP security headers (`X-Content-Type-Options`, `Referrer-Policy`, `CSP`, `HSTS`, `Cache-Control: no-store` on `/api/analyses*`) and active `X-Powered-By: Express` header leakage (confirmed via live probes).
5. **MEDIUM (`M5-P2-005`):** Express `express.json()` parse/size errors return HTTP `500` with raw V8 parser strings instead of `400`/`413`, and unknown `/api/*` routes return HTTP `200 text/html` instead of `404` JSON (confirmed via live probes).

---

## 2. API Endpoint Security Table

### Required M5 Specification Endpoints

| Method & Endpoint | File:Lines | Auth | Ownership / IDOR Control | Input Validation | Rate Limit | Live Execution Result | Verdict |
|---|---|---|---|---|---|---|---|
| `GET /api/health` | `server.ts:90–96` | None (Public) | N/A | None needed | None | **PASS** (`HTTP 200`, leaks `X-Powered-By: Express`) | **PARTIAL** |
| `POST /api/analyze` | `server.ts:133–194` | `optionalAuth` | If auth, `userId = req.dbUser.id` | Manual PDF/JD checks; no Zod/Pydantic | None | **PASS** unauth (`200`/`400`/`422`); auth DB save **BLOCKED** | **PARTIAL** |
| `GET /api/analyses` | `server.ts:318–330` | `requireAuth` | `WHERE user_id = req.dbUser.id` | None (no pagination params) | None | Unauth/forged `401` **PASS**; auth `200` **BLOCKED** | **PARTIAL** |
| `GET /api/analyses/:id` | `server.ts:333–352` | `requireAuth` | `WHERE id = $1 AND user_id = $2` | `Number.isInteger(id) && id > 0` (`400`) | None | Unauth `401` **PASS**; auth `200`/`404` **BLOCKED** | **PARTIAL** |
| `DELETE /api/analyses/:id` | `server.ts:380–399` | `requireAuth` | `WHERE id = $1 AND user_id = $2` | `Number.isInteger(id) && id > 0` (`400`) | None | Unauth `401` **PASS**; auth `200`/`404` **BLOCKED** | **PARTIAL** |

### Additional Implemented Endpoints Audited

| Method & Endpoint | File:Lines | Auth | Key Security Findings | Live Execution Result |
|---|---|---|---|---|
| `POST /api/analyze-stream` | `server.ts:197–275` | `optionalAuth` | Same upload/rate-limit gaps as `/api/analyze`; does not abort pipeline on client disconnect (`req.on('close')`) | Prior live `200` NDJSON **PASS**; auth save **BLOCKED** |
| `POST /api/jd/quick-scan` | `server.ts:99–130` | None (Public) | Public unthrottled Gemini + PDF OCR endpoint | Code inspected |
| `POST /api/analyses/save` | `server.ts:278–315` | `requireAuth` | **HIGH (`M5-P2-002`):** Trusts client-supplied report JSON, unsafe `!` assertions on required JSONB fields, unsanitized `completedDays`, no duplicate/idempotency guard | Unauth `401` **PASS**; auth **BLOCKED** |
| `PATCH /api/analyses/:id/progress` | `server.ts:355–377` | `requireAuth` | Ownership scoped (`id` + `userId`); sanitizes `completedDays` to unique ints `1..14` (`repository.ts:189–191`); missing runtime check if body is non-array | Unauth `401` **PASS**; auth **BLOCKED** |
| `POST /api/coach` | `server.ts:402–420` | None (Public) | **HIGH (`M5-P2-001`):** Public unthrottled Gemini proxy accepting arbitrary 4 MB `report` + uncapped `question`; malformed JSON returned `500` with raw V8 syntax message | Live `200` (injection refused); malformed JSON `500` & 5 MB `500` **CONFIRMED** |

---

## 3. Authentication and Authorization Findings

### Current Implementation
Authentication **is implemented** using **Firebase Authentication (Google Sign-In)** rather than custom passwords:
- **Client (`src/context/AuthContext.tsx`, `src/services/api.ts`):** Signs in via `signInWithPopup(auth, googleAuthProvider)`, fetches short-lived Firebase ID tokens via `current.getIdToken()`, attaches `Authorization: Bearer <token>`, and clears client state via `firebaseSignOut(auth)`. No passwords are stored in PostgreSQL; no custom tokens are placed in URLs or custom `localStorage` keys.
- **Server (`src/middleware/auth.ts`):** `requireAuth` verifies the Bearer token via `adminAuth.verifyIdToken(token)` and upserts the user row in PostgreSQL (`getOrCreateUser`).

### Local Demo vs. Public Production Context
- Allowing unauthenticated live analysis (`optionalAuth` on `POST /api/analyze` / `/api/analyze-stream` and public `POST /api/jd/quick-scan` / `/api/coach`) is convenient for **local/hackathon evaluation** where judges test immediately without signing in.
- In a **public production deployment**, unauthenticated AI endpoints create direct quota/billing exposure and memory DoS risk unless protected by strict per-IP rate limiting, CAPTCHA/bot protection, or mandatory authentication.

### Identified Authentication & Authorization Defects
1. **`M5-P2-006` (MEDIUM — No Token Revocation Check):** `adminAuth.verifyIdToken(token)` (`src/middleware/auth.ts:32, 60`) omits `checkRevoked = true`. Revoked or signed-out sessions remain accepted by the backend until natural token expiration (~1 hour).
2. **`M5-P2-007` (MEDIUM — DB Errors Masked as `401` in `requireAuth`):** `src/middleware/auth.ts:31–41` wraps both `adminAuth.verifyIdToken(token)` and `await getOrCreateUser(...)` in one `try/catch` that always returns `401 Invalid or expired authentication token`. A Cloud SQL outage forces false sign-out / auth errors on valid users.
3. **`M5-P2-008` (LOW — Silent Invalid-Token Fallback in `optionalAuth`):** `src/middleware/auth.ts:65–67` catches verification failures on `POST /api/analyze` and `/api/analyze-stream` and silently proceeds in unsaved session mode (`saved: false`) instead of notifying a signed-in user whose token expired that saving failed.

---

## 4. IDOR & Broken Object Level Authorization Findings

- **Saved Analysis Retrieval, Update & Deletion (`GET /api/analyses/:id`, `PATCH /api/analyses/:id/progress`, `DELETE /api/analyses/:id`):**
  - **Code Inspection Verdict: PASS (No IDOR Confirmed).**
  - All three operations resolve `userId` exclusively from the verified Firebase token (`req.dbUser.id`) and filter using composite predicates `and(eq(analyses.id, id), eq(analyses.userId, userId))` (`src/db/repository.ts:153, 173, 196`).
  - Attempting to access or delete another user's analysis ID returns `null`/`false` → HTTP `404 Analysis report not found`, avoiding existence disclosure.
  - **Live Cross-User Test:** **BLOCKED** (requires two distinct live Google OAuth tokens in the headless runner).
- **Related Object-Integrity Risks:**
  - **`M5-P2-002` (HIGH — Client-Controlled Report Persistence / Mass Assignment on `POST /api/analyses/save`):** While a user cannot write into another user's `userId`, they can submit arbitrary fabricated scores (`compatibilityScore: 100` or `-500`), forged matched skills, or out-of-range `completedDays` to `POST /api/analyses/save` (`server.ts:283–307`) and persist them as "official" reports in PostgreSQL.
  - **`M5-P2-014` (LOW — Sequential Integer Primary Keys):** `analyses.id` uses `serial` (`src/db/schema.ts:21`), exposing sequential record counts across the platform (mitigated by strict ownership checks, though UUIDs are preferable in multi-tenant production).

---

## 5. SQL Injection Findings

- **Audit Verdict: PASS (Zero SQL Injection Vulnerabilities Found).**
- Every query in `src/db/repository.ts` was inspected line by line:
  - `getOrCreateUser` (`lines 12–26`): `db.insert(users).values({...}).onConflictDoUpdate({...}).returning()` — parameterized.
  - `createAnalysisRecord` (`lines 85–107`): `db.insert(analyses).values({...}).returning()` — parameterized.
  - `listAnalysesByUser` (`lines 120–124`): `db.select().from(analyses).where(eq(analyses.userId, userId)).orderBy(desc(analyses.createdAt))` — parameterized; static sort order (no user-controlled `ORDER BY` column).
  - `getAnalysisByIdForUser` (`lines 150–154`): `where(and(eq(analyses.id, id), eq(analyses.userId, userId))).limit(1)` — parameterized; `id` validated as positive integer (`server.ts:339`).
  - `deleteAnalysisByIdForUser` (`lines 171–174`): `where(and(eq(analyses.id, id), eq(analyses.userId, userId))).returning({ id: analyses.id })` — parameterized.
  - `updateCompletedDaysForUser` (`lines 193–197`): `set({ completedDays: sanitized }).where(and(eq(analyses.id, id), eq(analyses.userId, userId))).returning()` — parameterized.
- No `sql.raw()`, template-interpolated SQL, or dynamic table/column identifiers exist anywhere in the codebase.

---

## 6. Database Security Findings

- **Engine Status:** SQLite and SQLAlchemy are **not used** (**BLOCKED / N/A**). The application uses **Cloud SQL PostgreSQL** (`pg.Pool` + Drizzle ORM in `src/db/index.ts`, `src/db/schema.ts`, `src/db/repository.ts`, `src/db/drizzle.config.ts`).
- **Live Persistence Status:** Schema existence (`users`, `analyses`) was verified in prior inspection (`0` rows each); authenticated end-to-end persistence testing (write → reload → delete) remains **BLOCKED** pending an interactive Google Sign-In token.

### Database Security & Reliability Findings
1. **`M5-P2-009` (MEDIUM — Missing Foreign-Key Index, Unbounded Over-Fetching & No Pagination):**
   - `analyses.userId` (`src/db/schema.ts:22–24`) has no index. PostgreSQL does not auto-index foreign keys, causing full table scans on `listAnalysesByUser` and cascading deletes.
   - `listAnalysesByUser` (`src/db/repository.ts:120–124`) executes `SELECT *` (pulling full `jd_text`, `learning_plan`, `resume_skills`, `jd_skills`, `score_breakdown` JSONB blobs for every row) with no `LIMIT`/`OFFSET`, creating memory and bandwidth DoS potential for active accounts.
2. **`M5-P2-010` (MEDIUM — Missing Query/Idle Timeouts, Graceful Shutdown & Explicit DB TLS Config):**
   - `createPool` (`src/db/index.ts:9–25`) sets `max: 10` and `connectionTimeoutMillis: 15000`, but omits `idleTimeoutMillis`, `statement_timeout`, and `query_timeout` (allowing stalled queries to exhaust the 10-connection pool) and omits `ssl` configuration (`src/db/drizzle.config.ts:34` explicitly sets `ssl: false`).
   - `server.ts` has no `SIGTERM`/`SIGINT` handler to close `pool.end()` gracefully on shutdown.
3. **`M5-P2-011` (LOW — Missing DB Constraints & `updated_at` Audit Trail):**
   - No `CHECK (compatibility_score >= 0 AND compatibility_score <= 100)` constraint on `analyses.compatibility_score` (`src/db/schema.ts:32`).
   - No `updated_at` column on `analyses` despite in-place updates via `PATCH /api/analyses/:id/progress`.
   - No unique/idempotency constraint preventing duplicate inserts when saving the same session report twice.
   - `getOrCreateUser` uses atomic `INSERT ... ON CONFLICT (uid) DO UPDATE` (`repository.ts:19–25`), which **is** safe against concurrent first-login race conditions (**PASS**).

---

## 7. Analysis History Security Findings

| Capability | Implementation (`File:Line`) | Code Inspection Findings | Live Test Status |
|---|---|---|---|
| Save analysis (auto on auth) | `server.ts:172–178, 250–254` → `createAnalysisRecord` | Scoped to `req.dbUser.id`; atomic `INSERT ... RETURNING`; server-computed result | **BLOCKED** (requires OAuth) |
| Save session analysis (manual) | `server.ts:278–315` → `createAnalysisRecord` | **HIGH (`M5-P2-002`):** Client supplies entire JSON report; unsanitized `completedDays`; missing `!` field checks; duplicate saves allowed | Unauth `401` **PASS**; auth **BLOCKED** |
| Retrieve history list | `server.ts:318–330` → `listAnalysesByUser` | Strictly user-scoped (`eq(userId)`); ordered `DESC createdAt`; **over-fetches all JSONB columns & unpaginated (`M5-P2-009`)** | Unauth `401` **PASS**; auth **BLOCKED** |
| Open individual analysis | `server.ts:333–352` → `getAnalysisByIdForUser` | Strictly user-scoped (`id` + `userId`); returns `404` on mismatch | Unauth `401` **PASS**; auth **BLOCKED** |
| Update roadmap progress | `server.ts:355–377` → `updateCompletedDaysForUser` | Strictly user-scoped; deduplicates/clamps days `1..14` | Unauth `401` **PASS**; auth **BLOCKED** |
| Delete analysis | `server.ts:380–399` → `deleteAnalysisByIdForUser` | Strictly user-scoped hard `DELETE ... RETURNING`; removes DB row completely (no binary PDF files exist on disk to clean up) | Unauth `401` **PASS**; auth **BLOCKED** |
| Stale client state on sign-out | `src/App.tsx:45, 54–59` | **LOW (`M5-P2-015`):** Signing out clears `history` (`setHistory([])`), **but does NOT clear `activeReport` in React state!** On a shared computer, the previous user's active resume report remains visible on screen after clicking Sign Out. | Code Inspection |

---

## 8. Data Privacy and Resume Confidentiality Findings

| Privacy Control | Current Behavior (`File:Line`) | Verdict |
|---|---|---|
| 1. Sensitive data not unnecessarily logged | No raw resume text, JD text, or secrets are logged in `server.ts` or `src/server/` | **PASS** |
| 2. Gemini receives only necessary info | **Full unredacted resume text** (and raw PDF bytes in OCR) including name, email, phone, and residential address is sent to Gemini (`geminiService.ts:124–127, 359`) | **FAIL** (`M5-P2-012`) |
| 3. API keys & secrets never exposed | Confirmed backend-only via static scan & `.gitignore` | **PASS** |
| 4. Defined retention policy for uploads/records | Original PDFs are not stored (RAM-only); however, saved PostgreSQL reports have **no automatic expiry/TTL** and **no bulk account/data deletion endpoint** | **PARTIAL** (`M5-P2-012`) |
| 5. Temporary files deleted | No temporary files written to disk (`multer.memoryStorage()`) | **PASS** |
| 6. History access restrictions | Enforced via Firebase Auth + `userId` scoping; lacks `Cache-Control: no-store` header (`M5-P2-004`) and fails to clear `activeReport` on sign-out (`M5-P2-015`) | **PARTIAL** |
| 7. Error messages don't reveal resume contents | Validation errors are static messages; however `formatApiError` echoes raw unknown `err.message` strings (`M5-P2-005`) | **PARTIAL** |
| 8. Database files not publicly accessible | Cloud SQL PostgreSQL (no local SQLite file in web root); `.env` blocked | **PASS** |
| 9. External AI processing disclosed to users | **Missing:** `AnalyzeView.tsx` does not inform users that uploaded resumes are transmitted to Google Gemini for extraction/OCR | **FAIL** (`M5-P2-012`) |
| 10. Sensitive info not unnecessarily retained | **`resumeTextExcerpt` (first 1,200 chars — typically candidate contact PII) is stored in PostgreSQL (`analysisPipeline.ts:170`, `schema.ts:30`) even though no frontend view ever displays it** | **FAIL** (`M5-P2-012`) |

---

## 9. CORS and HTTP Security Findings

### Live Executed HTTP Probe Results (`http://localhost:3000`)
- **`X-Powered-By: Express`** was returned on **100% of responses** (`M5-P2-004`).
- **Missing security headers on all API & HTML responses:** `X-Content-Type-Options`, `Content-Security-Policy`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`, and `Cache-Control: no-store` on `/api/analyses*` (`M5-P2-004`).
- **CORS (`OPTIONS /api/analyses` with `Origin: https://evil.example`):** Returned `204` with **no** `Access-Control-Allow-Origin` header — safe for unified same-origin deployment, no wildcard `*` present; explicit allowlist CORS middleware is required only if frontend and backend are split across origins (e.g., Vercel + Render).
- **Exposed API Docs (`/docs`, `/openapi.json`):** Not exposed (fell through to SPA HTML — no Swagger/OpenAPI info disclosure).
- **Dev-Mode Source Code Exposure (`M5-P2-003` — CONFIRMED EXECUTED):** `GET /server.ts` returned **`HTTP 200` `text/javascript`** containing transpiled backend Express code because `vite.middlewares` (`server.ts:436–441`) runs without `server.fs.deny` blocking backend files in non-production environments (production `NODE_ENV=production` serves only `dist/` and is unaffected).
- **Unmatched API Routes (`M5-P2-005` — CONFIRMED EXECUTED):** `GET /api/nonexistent` returned **`HTTP 200 text/html`** (SPA `index.html`) instead of `HTTP 404 application/json`.

---

## 10. Rate Limiting and API Abuse Findings

- **Audit Verdict: FAIL (`M5-P2-001` — HIGH).**
- **Confirmed Gaps (`server.ts`):**
  1. **Zero rate limiting** on any endpoint (`POST /api/analyze`, `POST /api/analyze-stream`, `POST /api/jd/quick-scan`, `POST /api/coach`, `POST /api/analyses/save`).
  2. **No `app.set('trust proxy', 1)`** configured, so IP-based rate limiting behind Cloud Run / reverse proxies would incorrectly group all users under the proxy IP unless configured.
  3. **No concurrent-analysis cap:** Simultaneous uploads of two 10 MB PDFs hold up to 20 MB per request in RAM (`multer.memoryStorage()`), plus ~13.3 MB base64 string allocation during OCR.
  4. **No upper character limit on pasted `jdText`** prior to pipeline entry (only capped at 20,000 chars inside `geminiService.ts`, while the full unbounded `jdText` is stored in PostgreSQL `analyses.jd_text`!).
  5. **No request-level timeout** configured on Express/Node HTTP server (`server.requestTimeout` / route timeout).

---

## 11. Error Handling and Logging Findings

1. **`M5-P2-005` (MEDIUM — Body-Parser Error Mishandling & Raw Error Disclosure, CONFIRMED EXECUTED):**
   - `POST /api/coach` with `{bad json` returned **`HTTP 500`** with raw V8 JSON parser details (`"Expected property name or '}' in JSON at position 1 (line 1 column 2)"`) instead of `HTTP 400`.
   - `POST /api/coach` with a 5 MB payload returned **`HTTP 500`** (`"request entity too large"`) instead of `HTTP 413`.
   - `formatApiError` (`server.ts:79–82`) echoes unknown `errMsg` verbatim in `500` responses (confirmed in Part 1 leaking raw Gemini `503` JSON).
2. **`M5-P2-013` (MEDIUM — Inconsistent DB Error Status Mapping):**
   - `formatApiError` (`server.ts:75–77`) only maps errors containing `'database'` or `'failed to save'` to `503`, so DB failures in `listAnalysesByUser`, `getAnalysisByIdForUser`, `deleteAnalysisByIdForUser`, `updateCompletedDaysForUser`, and `getOrCreateUser` return `500` (or `401` inside `requireAuth`).
3. **`M5-P2-016` (LOW — Missing Structured Security Audit Logging & Unhandled Process Handlers):**
   - No structured security audit events logged for failed token verifications (with client IP/route), analysis deletions, or rate-limit triggers.
   - `server.ts` has no `process.on('unhandledRejection')` or `process.on('uncaughtException')` handler for controlled shutdown.

---

## 12. Vulnerability Register (Part 2)

| ID | Vulnerability Name | Severity | Status | Affected File & Function |
|---|---|---|---|---|
| `M5-P2-001` | Missing Rate Limiting, Concurrency Caps, Proxy Trust & Unbounded JD Storage | **HIGH** | Confirmed (Code) | `server.ts` (`startServer`, `/api/analyze`, `/api/analyze-stream`, `/api/jd/quick-scan`, `/api/coach`) |
| `M5-P2-002` | Client-Forged Analysis Persistence / Mass-Assignment Integrity Bypass | **HIGH** | Confirmed (Code) | `server.ts` (`POST /api/analyses/save`); `src/db/repository.ts` (`createAnalysisRecord`) |
| `M5-P2-003` | Non-Production Dev Middleware Exposes Backend Source Files (`GET /server.ts`) | **MEDIUM** | Confirmed (Executed) | `server.ts` (`startServer` Vite middleware); `vite.config.ts` |
| `M5-P2-004` | Missing HTTP Security Headers, `X-Powered-By` Disclosure & Missing `no-store` Cache Control | **MEDIUM** | Confirmed (Executed) | `server.ts` (`startServer`) |
| `M5-P2-005` | Express Body-Parser Errors Return `500` with Raw Details & Missing `/api/*` `404` Handler | **MEDIUM** | Confirmed (Executed) | `server.ts` (`formatApiError`, error middleware, SPA fallback) |
| `M5-P2-006` | Firebase Token Verification Does Not Check Session Revocation | **MEDIUM** | Confirmed (Code) | `src/middleware/auth.ts` (`requireAuth`, `optionalAuth`) |
| `M5-P2-007` | Database Outages Masked as `401` Authentication Failures | **MEDIUM** | Confirmed (Code) | `src/middleware/auth.ts` (`requireAuth`) |
| `M5-P2-008` | Unchecked `POST /api/coach` Arbitrary Report Context & Uncapped Question Size | **MEDIUM** | Confirmed (Code) | `server.ts` (`POST /api/coach`) |
| `M5-P2-009` | Missing Foreign-Key Index on `analyses.user_id`, Full-Row Over-Fetching & No Pagination | **MEDIUM** | Confirmed (Code) | `src/db/schema.ts` (`analyses`); `src/db/repository.ts` (`listAnalysesByUser`) |
| `M5-P2-010` | Missing Pool Idle/Statement Timeouts, Graceful Shutdown & Explicit DB TLS Config | **MEDIUM** | Confirmed (Code) | `src/db/index.ts` (`createPool`); `src/db/drizzle.config.ts`; `server.ts` |
| `M5-P2-011` | Missing `CHECK` Constraint on Score, `updated_at` Column & Duplicate-Save Protection | **MEDIUM** | Confirmed (Code) | `src/db/schema.ts` (`analyses`); `server.ts` (`POST /api/analyses/save`) |
| `M5-P2-012` | Unnecessary Resume PII Storage (`resumeTextExcerpt`), Unredacted LLM Transfer & Missing Privacy Notice | **MEDIUM** | Confirmed (Code) | `src/server/analysisPipeline.ts`; `src/db/schema.ts`; `src/components/AnalyzeView.tsx` |
| `M5-P2-013` | Inconsistent Database Error HTTP Status Mapping (`500` vs `503`) | **LOW** | Confirmed (Code) | `server.ts` (`formatApiError`); `src/db/repository.ts` |
| `M5-P2-014` | Predictable Sequential Integer Analysis IDs (`serial`) | **LOW** | Theoretical (Code) | `src/db/schema.ts` (`analyses.id`) |
| `M5-P2-015` | Active Resume Report Persists in Browser State After Sign-Out | **LOW** | Confirmed (Code) | `src/App.tsx` (`WorkspaceApp` / `loadHistory`) |
| `M5-P2-016` | Missing Structured Security Audit Logging & Process Exception Handlers | **LOW** | Confirmed (Code) | `server.ts`; `src/middleware/auth.ts` |
| `M5-P2-017` | Silent Invalid-Token Fallback in `optionalAuth` Drops Save Without User Notice | **LOW** | Confirmed (Code) | `src/middleware/auth.ts` (`optionalAuth`) |
| `M5-P2-018` | Missing Explicit CORS Allowlist for Split Frontend/Backend Deployments | **LOW** | Theoretical (Code) | `server.ts` (`startServer`) |
| `M5-P2-019` | `PATCH /api/analyses/:id/progress` Silently Coerces Non-Array `completedDays` to `[]` (Wiping Progress) | **LOW** | Confirmed (Code) | `server.ts` (`PATCH /api/analyses/:id/progress`, lines 364–366) |
| `M5-P2-020` | FastAPI / SQLAlchemy / SQLite Stack Not Present (Node.js/Express/Drizzle/Cloud SQL Used) | **INFORMATIONAL** | Confirmed (Code) | Repository-wide |
| `M5-P2-021` | Authenticated End-to-End DB Write/Read/Delete & Cross-User IDOR Tests Require Live OAuth | **INFORMATIONAL** | BLOCKED | `server.ts`; `src/db/repository.ts` |

---

### Detailed Finding Specifications

#### `M5-P2-001` — Missing Rate Limiting, Concurrency Caps, Proxy Trust & Unbounded JD Storage
- **Severity:** HIGH (Confirmed — Code Inspection)
- **Affected File & Function:** `server.ts` (`startServer`, `POST /api/analyze`, `POST /api/analyze-stream`, `POST /api/jd/quick-scan`, `POST /api/coach`), `src/server/analysisPipeline.ts` (`runFullGapAnalysisPipeline`)
- **Evidence:** No rate-limiter middleware or `app.set('trust proxy', 1)` exists in `server.ts`; `jdText` is stored verbatim in `analyses.jd_text` without an upper length bound (`analysisPipeline.ts:169`).
- **Potential Impact:** API quota exhaustion, RAM exhaustion from concurrent 20 MB uploads, and oversized DB row writes.
- **Recommended Fix:** Set `app.set('trust proxy', 1)`, add tiered rate limiting (e.g., 10 analyses / 15 min per IP/user, 30 quick-scans/coach calls / 15 min), enforce a max concurrency semaphore (e.g., 4 active analyses), and cap `jdText` at 30,000 characters.
- **Verification Procedure:** Fire 12 rapid requests to `/api/analyze` and verify HTTP `429`; submit a 50,000-character `jdText` and verify HTTP `400`.

#### `M5-P2-002` — Client-Forged Analysis Persistence / Mass-Assignment Integrity Bypass
- **Severity:** HIGH (Confirmed — Code Inspection)
- **Affected File & Function:** `server.ts` (`POST /api/analyses/save`, lines 278–315); `src/db/repository.ts` (`createAnalysisRecord`, lines 81–114)
- **Evidence:** `POST /api/analyses/save` accepts `compatibilityScore`, `scoreBreakdown`, `matchedSkills`, `missingSkills`, `completedDays`, `extractionMeta!`, and `experienceAlignment!` straight from `req.body` without runtime schema validation, bounds checking (`0..100`), or `completedDays` sanitization (`1..14`).
- **Potential Impact:** Authenticated users can store forged scores (`compatibilityScore: 999`), malformed JSONB objects that crash the UI when reopened, or duplicate saved rows.
- **Recommended Fix:** Validate the full payload strictly with `zod` (enforcing `0 <= compatibilityScore <= 100`, integer `completedDays` in `1..14`, required `extractionMeta`/`experienceAlignment`), or better yet issue a short-lived server-signed HMAC token (or temporary server cache key) for unsaved session reports so `/api/analyses/save` only persists server-generated reports.
- **Verification Procedure:** Send malformed JSON (missing `extractionMeta`, `compatibilityScore: 500`, `completedDays: [99]`) to `POST /api/analyses/save` and confirm HTTP `400`.

#### `M5-P2-003` — Non-Production Dev Middleware Exposes Backend Source Files
- **Severity:** MEDIUM (Confirmed — Executed Probe)
- **Affected File & Function:** `server.ts` (`startServer`, lines 436–441); `vite.config.ts`
- **Evidence:** Live probe `GET /server.ts` returned `HTTP 200 text/javascript` containing transpiled Express server source code.
- **Potential Impact:** Exposes backend logic, routes, and internal architecture on dev preview URLs (`ais-dev-*`). (Production `NODE_ENV=production` is unaffected.)
- **Recommended Fix:** Configure `server.fs.deny` in `vite.config.ts` (and/or add an Express guard before `vite.middlewares`) to block direct HTTP access to `/server.ts`, `/src/server/**`, `/src/db/**`, `/src/middleware/**`, and `/M5_*.md`.
- **Verification Procedure:** Request `GET /server.ts` and `GET /src/db/repository.ts` against the dev server and confirm HTTP `403` or `404`.

#### `M5-P2-004` — Missing HTTP Security Headers, `X-Powered-By` Disclosure & Missing `no-store` Cache Control
- **Severity:** MEDIUM (Confirmed — Executed Probe)
- **Affected File & Function:** `server.ts` (`startServer`, line 86)
- **Evidence:** Live probes showed `X-Powered-By: Express` on every response and absence of `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`, and `Cache-Control: no-store` on `/api/analyses*`.
- **Potential Impact:** Framework fingerprinting, MIME-sniffing risks, and browser/proxy caching of confidential resume analysis data.
- **Recommended Fix:** Call `app.disable('x-powered-by')`; add header middleware setting `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Strict-Transport-Security` (in production HTTPS), and `Cache-Control: no-store` on `/api/analyses*` (avoid `X-Frame-Options: DENY` so iframe preview continues working).
- **Verification Procedure:** Inspect response headers on `GET /api/health` and `GET /api/analyses` and confirm `X-Powered-By` is absent and all required headers are present.

#### `M5-P2-005` — Express Body-Parser Errors Return `500` with Raw Details & Missing `/api/*` `404` Handler
- **Severity:** MEDIUM (Confirmed — Executed Probe)
- **Affected File & Function:** `server.ts` (`formatApiError`, lines 41–83; error handler lines 423–433; SPA fallback lines 436–448)
- **Evidence:** Live probes returned `HTTP 500` with `"Expected property name or '}' in JSON at position 1"` on malformed JSON, `HTTP 500` on a 5 MB payload, and `HTTP 200 text/html` on `GET /api/nonexistent`.
- **Potential Impact:** Internal error leakage, incorrect HTTP semantics for API consumers, and confusing HTML responses on mistyped API routes.
- **Recommended Fix:** In `formatApiError`, map `err.type === 'entity.parse.failed'` to `400 ('Invalid JSON request body.')` and `err.type === 'entity.too.large'` to `413 ('Request payload exceeds size limit.')`, never echo arbitrary unknown `errMsg` in `500` responses, and register `app.all('/api/*', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }))` before Vite/static middleware.
- **Verification Procedure:** Re-run malformed JSON (`400`), 5 MB payload (`413`), and `GET /api/nonexistent` (`404` JSON) probes.

#### `M5-P2-006` — Firebase Token Verification Does Not Check Session Revocation
- **Severity:** MEDIUM (Confirmed — Code Inspection)
- **Affected File & Function:** `src/middleware/auth.ts` (`requireAuth`, line 32; `optionalAuth`, line 60)
- **Evidence:** Calls `adminAuth.verifyIdToken(token)` without passing `true` for `checkRevoked`.
- **Potential Impact:** A compromised token remains accepted up to 1 hour after account revocation.
- **Recommended Fix:** Pass `true` (`adminAuth.verifyIdToken(token, true)`) on `requireAuth` for sensitive history reads/deletes.
- **Verification Procedure:** Revoke a test user's refresh tokens via Firebase Admin and verify subsequent requests with the prior token return `401`.

#### `M5-P2-007` — Database Outages Masked as `401` Authentication Failures
- **Severity:** MEDIUM (Confirmed — Code Inspection)
- **Affected File & Function:** `src/middleware/auth.ts` (`requireAuth`, lines 31–41)
- **Evidence:** `await getOrCreateUser(...)` executes inside the same `try/catch` block as `adminAuth.verifyIdToken(token)` and returns `401`.
- **Potential Impact:** Transient Cloud SQL outages falsely report invalid credentials to authenticated users.
- **Recommended Fix:** Separate `verifyIdToken` (`try/catch` → `401`) from `getOrCreateUser` (`try/catch` → `503`).
- **Verification Procedure:** Mock `getOrCreateUser` to throw in a unit test and confirm `requireAuth` returns `503` rather than `401`.

#### `M5-P2-008` — Unchecked `POST /api/coach` Arbitrary Report Context & Uncapped Question Size
- **Severity:** MEDIUM (Confirmed — Code Inspection)
- **Affected File & Function:** `server.ts` (`POST /api/coach`, lines 402–420)
- **Evidence:** Accepts arbitrary client JSON in `req.body.report` and uncapped `question` length (up to 4 MB JSON limit) without authentication.
- **Potential Impact:** Unauthenticated Gemini prompt proxy abuse and token exhaustion.
- **Recommended Fix:** Validate `question` (`4..800` chars) and `report` via `zod` with strict string/array length limits, apply rate limiting, and set `maxOutputTokens`.
- **Verification Procedure:** Submit an oversized `question` (2,000 chars) or invalid `report` shape and confirm `400`.

#### `M5-P2-009` — Missing Foreign-Key Index on `analyses.user_id`, Full-Row Over-Fetching & No Pagination
- **Severity:** MEDIUM (Confirmed — Code Inspection)
- **Affected File & Function:** `src/db/schema.ts` (`analyses`, lines 20–43); `src/db/repository.ts` (`listAnalysesByUser`, lines 116–143)
- **Evidence:** No index defined on `(user_id, created_at)` in `schema.ts`; `listAnalysesByUser` selects `*` (including full JSONB columns) with no `LIMIT`/`OFFSET`.
- **Potential Impact:** Sequential scans and high memory/network overhead as saved history grows.
- **Recommended Fix:** Add a composite index on `(user_id, created_at)` in `src/db/schema.ts`, project only summary columns + `jsonb_array_length(...)` counts in `listAnalysesByUser`, and add validated `limit` (default `25`, max `100`) and `offset` query params.
- **Verification Procedure:** Run `EXPLAIN` on the history query after schema update to confirm index scan; test `?limit=10&offset=0`.

#### `M5-P2-010` — Missing Pool Idle/Statement Timeouts, Graceful Shutdown & Explicit DB TLS Config
- **Severity:** MEDIUM (Confirmed — Code Inspection)
- **Affected File & Function:** `src/db/index.ts` (`createPool`, lines 9–25); `src/db/drizzle.config.ts` (line 34); `server.ts`
- **Evidence:** `new Pool({...})` omits `idleTimeoutMillis`, `statement_timeout`, `query_timeout`, and explicit SSL configuration; `server.ts` has no `SIGTERM`/`SIGINT` `pool.end()` hook.
- **Potential Impact:** Connection pool exhaustion on hung queries and ungraceful drops during container restarts.
- **Recommended Fix:** Add `idleTimeoutMillis: 30000`, `statement_timeout: 15000`, `query_timeout: 15000`, configurable TLS (`ssl` when connecting over non-loopback TCP), and graceful `SIGTERM`/`SIGINT` shutdown calling `server.close()` and `pool.end()`.
- **Verification Procedure:** Send `SIGTERM` to a test instance and verify clean pool drain and exit code `0`.

#### `M5-P2-011` — Missing `CHECK` Constraint on Score, `updated_at` Column & Duplicate-Save Protection
- **Severity:** MEDIUM (Confirmed — Code Inspection)
- **Affected File & Function:** `src/db/schema.ts` (`analyses`, lines 20–43); `server.ts` (`POST /api/analyses/save`)
- **Evidence:** `compatibilityScore` has no `0..100` check constraint; `analyses` has no `updatedAt` timestamp; repeated `POST /api/analyses/save` calls create duplicate rows.
- **Potential Impact:** Data integrity drift and duplicate user history entries.
- **Recommended Fix:** Add `CHECK (compatibility_score BETWEEN 0 AND 100)`, add `updatedAt` updated on `PATCH`, and support an idempotency key or client-disabled save button + server dedupe window.
- **Verification Procedure:** Attempt out-of-range insert in test DB and verify PostgreSQL rejects it.

#### `M5-P2-012` — Unnecessary Resume PII Storage, Unredacted LLM Transfer & Missing Privacy Notice
- **Severity:** MEDIUM (Confirmed — Code Inspection)
- **Affected File & Function:** `src/server/analysisPipeline.ts` (line 170), `src/db/schema.ts` (line 30), `src/components/AnalyzeView.tsx`
- **Evidence:** First 1,200 characters of every resume (contact PII) are persisted in `analyses.resume_text_excerpt` despite never being displayed in the UI; raw resumes are sent to Gemini without PII redaction or user-facing AI privacy disclosure; no retention TTL or bulk account-deletion endpoint exists.
- **Potential Impact:** Unnecessary candidate PII exposure and privacy compliance gaps (GDPR/CCPA data minimization & transparency).
- **Recommended Fix:** Redact emails, phone numbers, and physical addresses before Gemini extraction and before storing excerpts (or drop `resumeTextExcerpt` storage), add a concise external-AI processing notice in `AnalyzeView.tsx`, and add a "Delete All My Saved Reports" (`DELETE /api/analyses`) endpoint plus documented retention policy.
- **Verification Procedure:** Analyze a resume containing synthetic email/phone and confirm neither appears in Gemini request payloads or DB rows.

#### `M5-P2-013` — Inconsistent Database Error HTTP Status Mapping (`500` vs `503`)
- **Severity:** LOW (Confirmed — Code Inspection)
- **Affected File & Function:** `server.ts` (`formatApiError`, lines 75–77); `src/db/repository.ts` (lines 31, 141, 162, 179, 205)
- **Evidence:** `formatApiError` checks `lower.includes('database') || lower.includes('failed to save')`, returning `500` for read/update/delete DB errors.
- **Potential Impact:** Inconsistent client retry behavior on transient DB outages.
- **Recommended Fix:** Introduce a typed `DatabaseError` class in `src/db/repository.ts` and map `instanceof DatabaseError` to `503` in `formatApiError`.
- **Verification Procedure:** Unit-test `formatApiError(new DatabaseError('...'))` → `{ status: 503 }`.

#### `M5-P2-014` — Predictable Sequential Integer Analysis IDs
- **Severity:** LOW (Theoretical — Code Inspection)
- **Affected File & Function:** `src/db/schema.ts` (`analyses.id`, line 21)
- **Evidence:** `id: serial('id').primaryKey()`.
- **Potential Impact:** Exposes platform usage volume; does not enable IDOR due to `userId` scoping.
- **Recommended Fix:** Optional defense-in-depth: add a public UUID column for external API routes while keeping integer PK internally.
- **Verification Procedure:** Verify `/api/analyses/:uuid` rejects non-UUID paths with `400`.

#### `M5-P2-015` — Active Resume Report Persists in Browser State After Sign-Out
- **Severity:** LOW (Confirmed — Code Inspection)
- **Affected File & Function:** `src/App.tsx` (`WorkspaceApp`, lines 45, 54–59)
- **Evidence:** Signing out triggers `loadHistory()` which clears `history`, but `activeReport` is never reset to `null`.
- **Potential Impact:** On shared/public kiosks or demo laptops, a signed-out candidate's report remains visible to the next user.
- **Recommended Fix:** Reset `activeReport`, `notice`, and navigate back to `overview` when `signOut` is invoked (or when `user` transitions from signed-in to `null`).
- **Verification Procedure:** Open a saved report, click Sign Out, and verify `activeReport` clears immediately.

#### `M5-P2-016` — Missing Structured Security Audit Logging & Process Exception Handlers
- **Severity:** LOW (Confirmed — Code Inspection)
- **Affected File & Function:** `server.ts`, `src/middleware/auth.ts`
- **Evidence:** Only `console.log`/`console.error` used; no structured audit logs for auth failures or deletions; no `unhandledRejection` handler.
- **Potential Impact:** Poor incident forensics and potential uncaught crash on unexpected async failures.
- **Recommended Fix:** Emit structured JSON audit logs (route, user UID, action, status, latency — zero PII/tokens) and add process-level error/shutdown handlers.
- **Verification Procedure:** Trigger a `401` and a `DELETE /api/analyses/:id` and inspect structured log lines.

#### `M5-P2-017` — Silent Invalid-Token Fallback in `optionalAuth`
- **Severity:** LOW (Confirmed — Code Inspection)
- **Affected File & Function:** `src/middleware/auth.ts` (`optionalAuth`, lines 65–67)
- **Evidence:** Invalid Bearer tokens on `/api/analyze` are swallowed with `console.warn` instead of returning `401`.
- **Potential Impact:** Signed-in users with expired tokens silently lose auto-save without realizing their session expired.
- **Recommended Fix:** Return `401` when an `Authorization: Bearer` header *is explicitly provided* but invalid/expired, while still allowing requests with *no* `Authorization` header to run in anonymous session mode.
- **Verification Procedure:** Call `POST /api/analyze` with `Authorization: Bearer invalid` and confirm `401`, and without any `Authorization` header and confirm `200`.

#### `M5-P2-018` — Missing Explicit CORS Allowlist for Split Deployments
- **Severity:** LOW (Theoretical — Code Inspection)
- **Affected File & Function:** `server.ts` (`startServer`)
- **Evidence:** No CORS middleware configured. Safe for current unified Cloud Run hosting; blocks split Vercel/Render hosting unless configured.
- **Potential Impact:** Deployment friction or risk of developers adding an unsafe `*` wildcard later.
- **Recommended Fix:** Add explicit allowlist CORS middleware driven by `ALLOWED_ORIGINS` env var (never `*` with credentials/auth headers) if split hosting is adopted.
- **Verification Procedure:** Verify allowed origin receives matching `Access-Control-Allow-Origin` and foreign origin receives none.

#### `M5-P2-019` — `PATCH /api/analyses/:id/progress` Silently Coerces Non-Array `completedDays` to `[]`
- **Severity:** LOW (Confirmed — Code Inspection)
- **Affected File & Function:** `server.ts` (`PATCH /api/analyses/:id/progress`, lines 364–366)
- **Evidence:** `const completedDays = Array.isArray(req.body?.completedDays) ? req.body.completedDays : [];`
- **Potential Impact:** A buggy client sending `{}` or `{ completedDays: "1,2" }` silently wipes all saved roadmap progress to `[]` instead of receiving a `400` validation error.
- **Recommended Fix:** Return `400` if `!Array.isArray(req.body?.completedDays)` or if any element is not an integer in `1..14`.
- **Verification Procedure:** Send `{}` to `PATCH /api/analyses/:id/progress` and confirm HTTP `400`.

#### `M5-P2-020` & `M5-P2-021` — Stack Divergence & Blocked OAuth Persistence Tests (INFORMATIONAL)
- **Evidence:** FastAPI/SQLAlchemy/SQLite are absent (`M5-P2-020`); live authenticated DB round-trip and two-user IDOR tests remain **BLOCKED** pending interactive Google OAuth tokens (`M5-P2-021`).

---

## 13. Prioritized Recommendations (Awaiting Approval)

No project files or database rows were modified during Part 2. Recommended remediation sequence once approved:

1. **Immediate (High Priority):**
   - **`M5-P2-001` & `M5-P2-008`:** Add `app.set('trust proxy', 1)`, per-IP/user rate limiting, concurrency cap on PDF/Gemini pipelines, max `jdText` cap (30 KB), and strict `zod` validation + caps on `POST /api/coach`.
   - **`M5-P2-002` & `M5-P2-019`:** Add `zod` validation on `POST /api/analyses/save` (and server-signed session report integrity) and strict array validation on `PATCH /api/analyses/:id/progress`.
2. **Short-Term (Hardening & Privacy):**
   - **`M5-P2-003`, `M5-P2-004`, `M5-P2-005`:** Block backend source exposure in Vite dev mode (`server.fs.deny`), disable `X-Powered-By`, add HTTP security headers + `Cache-Control: no-store` on `/api/analyses*`, fix `formatApiError` (`400`/`413`/`503` + sanitized `500`), and add `/api/*` `404` JSON catch-all.
   - **`M5-P2-006`, `M5-P2-007`, `M5-P2-017`:** Enable `checkRevoked: true`, separate token auth (`401`) from DB sync (`503`) in `requireAuth`, and reject malformed Bearer headers in `optionalAuth`.
   - **`M5-P2-012` & `M5-P2-015`:** Redact candidate contact PII before LLM calls & stop persisting unused `resumeTextExcerpt`, add an AI processing privacy disclosure in `AnalyzeView.tsx`, add bulk delete (`DELETE /api/analyses`), and clear `activeReport` on sign-out.
3. **Database & Operational Maturity:**
   - **`M5-P2-009`, `M5-P2-010`, `M5-P2-011`, `M5-P2-013`, `M5-P2-016`:** Add `(user_id, created_at)` index + score `CHECK` constraint + `updated_at` column, project summary columns with pagination in `listAnalysesByUser`, add pool idle/statement timeouts & graceful `SIGTERM` shutdown, add typed `DatabaseError` → `503`, and add structured security audit logging.
