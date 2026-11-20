# SkillGap M5 — Automated Security Audit Report

- **Run ID:** 1
- **Audit Timestamp:** 2026-11-20T22:03:11.214Z
- **Audit Type:** `full_suite_security_audit`
- **Overall Security Status:** `findings_open`
- **Application Version:** `1.0.0-m5`
- **Commit Hash:** `unavailable`

## Severity Breakdown (Open Findings)

| Severity | Open Count |
|---|---:|
| Critical | 0 |
| High | 2 |
| Medium | 5 |
| Low | 1 |
| Info | 0 |

- **Verified Secure Controls:** 4
- **Blocked Security Checks:** 0

## Findings Ledger

| Code | Title | Severity | Status | Verified At |
|---|---|---|---|---|
| `SEC-001` | PDF active content markers (/JavaScript, /OpenAction) not rejected on upload | **MEDIUM** | `open` | — |
| `SEC-002` | PDF magic header allows leading polyglot bytes (GIF/HTML prefix) | **MEDIUM** | `open` | — |
| `SEC-003` | Oversized file (>10 MB) and JSON body (>4 MB) limits | **HIGH** | `verified_secure` | 2026-11-20T22:03:10.071Z |
| `SEC-004` | Prompt injection isolation in deterministic matching & scoring | **HIGH** | `verified_secure` | 2026-11-20T22:03:10.073Z |
| `SEC-005` | Missing API rate limiting on AI analysis and coaching endpoints | **HIGH** | `open` | — |
| `SEC-006` | No server-side concurrency cap on /api/analyze and /api/analyze-stream | **MEDIUM** | `open` | — |
| `SEC-007` | Untrusted client-supplied compatibilityScore persisted by POST /api/analyses/save | **HIGH** | `open` | — |
| `SEC-008` | Unauthorized access & cross-user IDOR isolation | **CRITICAL** | `verified_secure` | 2026-11-20T22:03:10.788Z |
| `SEC-009` | Server technology fingerprinting header (X-Powered-By: Express) exposed | **LOW** | `open` | — |
| `SEC-010` | Missing baseline HTTP security headers on core API responses | **MEDIUM** | `open` | — |
| `SEC-011` | Dependency vulnerability audit (0 known vulnerabilities) | **HIGH** | `verified_secure` | 2026-11-20T22:03:11.064Z |
| `SEC-012` | Malformed JSON status mapping and /api/* 404 JSON boundary | **MEDIUM** | `open` | — |

## Detailed Findings & Remediation Guidance

### SEC-001 — PDF active content markers (/JavaScript, /OpenAction) not rejected on upload
- **Severity:** `medium` | **Status:** `open`
- **Observed Behavior:** validatePdfBuffer in src/server/pdfProcessor.ts accepted a synthetic PDF containing /JavaScript and /OpenAction dictionary entries without rejecting or stripping active content.
- **Recommended Remediation:** Scan uploaded PDF buffers in validatePdfBuffer() for active-content tokens (/JavaScript, /JS, /OpenAction, /Launch, /AA) and reject with HTTP 422 before parsing.

### SEC-002 — PDF magic header allows leading polyglot bytes (GIF/HTML prefix)
- **Severity:** `medium` | **Status:** `open`
- **Observed Behavior:** validatePdfBuffer checks `headerSlice.includes("%PDF-")` across the first 1024 bytes rather than requiring `%PDF-` at byte offset 0, permitting GIF89a/HTML polyglot files.
- **Recommended Remediation:** Require `buffer.subarray(0, 5).toString("latin1") === "%PDF-"` (allowing only optional UTF-8 BOM if needed) and reject non-zero magic offsets with HTTP 422.

### SEC-003 — Oversized file (>10 MB) and JSON body (>4 MB) limits
- **Severity:** `high` | **Status:** `verified_secure`
- **Observed Behavior:** Oversized PDF (>10 MB) rejected with 413; oversized JSON body (>4 MB) rejected with HTTP 500.
- **Recommended Remediation:** Keep Multer 10 MB limit and Express JSON 4 MB cap enforced; optionally map PayloadTooLargeError explicitly to HTTP 413.

### SEC-004 — Prompt injection isolation in deterministic matching & scoring
- **Severity:** `high` | **Status:** `verified_secure`
- **Observed Behavior:** Deterministic scoring engine and verbatim JD evidence verification prevented injected resume instructions from overriding scores or injecting unverified quotes.
- **Recommended Remediation:** Maintain deterministic server-side scoring and consider adding explicit delimiter framing around untrusted resume text in LLM extraction prompts.

### SEC-005 — Missing API rate limiting on AI analysis and coaching endpoints
- **Severity:** `high` | **Status:** `open`
- **Observed Behavior:** No rate-limiting headers (RateLimit-Limit / X-RateLimit-Limit) or throttling middleware were detected on /api/analyze, /api/analyze-stream, /api/jd/quick-scan, or /api/coach.
- **Recommended Remediation:** Add express-rate-limit (e.g., 10 analyses/15min per IP on /api/analyze* and 30 req/15min on /api/coach and /api/jd/quick-scan) with standard RateLimit-* headers and HTTP 429 responses.

### SEC-006 — No server-side concurrency cap on /api/analyze and /api/analyze-stream
- **Severity:** `medium` | **Status:** `open`
- **Observed Behavior:** While the QA test runner enforces a single-flight execution mutex, the primary /api/analyze and /api/analyze-stream routes do not cap simultaneous in-flight PDF parsing and Gemini API pipelines.
- **Recommended Remediation:** Introduce a bounded concurrency counter (e.g. max 4–6 simultaneous analyses) on /api/analyze* returning HTTP 503 with Retry-After when saturated.

### SEC-007 — Untrusted client-supplied compatibilityScore persisted by POST /api/analyses/save
- **Severity:** `high` | **Status:** `open`
- **Observed Behavior:** In server.ts, POST /api/analyses/save stores `Number(body.compatibilityScore) || 0` directly from the request payload without recomputing from skill matches or clamping to [0, 100], allowing authenticated users to forge saved scores.
- **Recommended Remediation:** Recompute compatibilityScore and scoreBreakdown server-side using calculateCompatibilityScore() before inserting into PostgreSQL, or sign session analysis payloads with a server HMAC.

### SEC-008 — Unauthorized access & cross-user IDOR isolation
- **Severity:** `critical` | **Status:** `verified_secure`
- **Observed Behavior:** Unauthenticated requests to /api/analyses/* and /api/qa/* consistently returned HTTP 401, and repository queries strictly scope read/update/delete by authenticated userId.
- **Recommended Remediation:** Maintain requireAuth/requireAdmin middleware and userId-scoped Drizzle predicates on all resource endpoints.

### SEC-009 — Server technology fingerprinting header (X-Powered-By: Express) exposed
- **Severity:** `low` | **Status:** `open`
- **Observed Behavior:** API responses include the "X-Powered-By: Express" header. No API keys, credentials, or stack traces were exposed.
- **Recommended Remediation:** Call `app.disable("x-powered-by")` in server.ts during Express initialization.

### SEC-010 — Missing baseline HTTP security headers on core API responses
- **Severity:** `medium` | **Status:** `open`
- **Observed Behavior:** Live probe of GET /api/health observed missing headers: X-Content-Type-Options: nosniff, Referrer-Policy, Permissions-Policy, Cache-Control: no-store.
- **Recommended Remediation:** Add a global Express security-headers middleware (or helmet configured for iframe compatibility) setting X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin, Permissions-Policy, and Cache-Control: no-store on /api/*.

### SEC-011 — Dependency vulnerability audit (0 known vulnerabilities)
- **Severity:** `high` | **Status:** `verified_secure`
- **Observed Behavior:** Live `bun audit` scan reported 0 known vulnerabilities across installed dependencies.
- **Recommended Remediation:** Continue running dependency audits on every release and PR.

### SEC-012 — Malformed JSON status mapping and /api/* 404 JSON boundary
- **Severity:** `medium` | **Status:** `open`
- **Observed Behavior:** Observed error-handling gaps: malformed JSON returned HTTP 500 (expected 400); unknown /api/* path returned HTTP 200 (text/html) instead of 404 JSON.
- **Recommended Remediation:** Add a `/api/*` 404 JSON catch-all route before Vite/static SPA fallback, and map `SyntaxError` / `entity.parse.failed` in formatApiError() to HTTP 400.

---
_All findings reflect actual runtime checks executed against SkillGap M5 using synthetic, non-destructive fixtures._
