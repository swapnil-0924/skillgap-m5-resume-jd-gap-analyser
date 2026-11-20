# SkillGap M5 — Automated Test Execution Report

- **Run ID:** 1
- **Suite Type:** `all`
- **Overall Status:** `failed`
- **Application Version:** `1.0.0-m5`
- **Commit Hash:** `unavailable`
- **Started At:** 2026-11-20T22:02:42.763Z
- **Completed At:** 2026-11-20T22:03:11.319Z
- **Duration:** 28.56 s

## Execution Summary

| Metric | Value |
|---|---:|
| Total Tests | 34 |
| Passed | 26 |
| Failed | 8 |
| Blocked | 0 |
| Skipped | 0 |
| Pass Rate (Executed) | 76.5% |

## Detailed Test Results

| Test Name | Category | Status | Duration | Summary / Notes |
|---|---|---|---:|---|
| `ai_regression.v02.java_vs_javascript` | `ai_regression` | **PASSED** | 1 ms | Passed |
| `ai_regression.v02.react_vs_react_native` | `ai_regression` | **PASSED** | 1 ms | Passed |
| `ai_regression.v12.relevant_vs_unrelated_experience` | `ai_regression` | **PASSED** | 2 ms | Passed |
| `ai_regression.v20.prompt_injection_resistance` | `ai_regression` | **PASSED** | 7.97 s | Passed |
| `api.auth.protected_endpoints` | `api` | **PASSED** | 12 ms | Passed |
| `api.health.endpoint` | `api` | **PASSED** | 10 ms | Passed |
| `api.validation.missing_resume` | `api` | **PASSED** | 15 ms | Passed |
| `api.validation.quick_scan_and_coach` | `api` | **PASSED** | 23 ms | Passed |
| `api.validation.short_jd_and_corrupt_pdf` | `api` | **PASSED** | 209 ms | Passed |
| `e2e.analyze.full_live_pipeline` | `e2e` | **PASSED** | 9.25 s | Passed |
| `e2e.analyze_stream.ndjson_lifecycle` | `e2e` | **PASSED** | 8.88 s | Passed |
| `integration.db.isolated_save_and_retrieval` | `integration` | **PASSED** | 463 ms | Passed |
| `integration.embeddings.generation_and_fallback` | `integration` | **PASSED** | 1 ms | Passed |
| `integration.gemini.error_resilience` | `integration` | **PASSED** | 13 ms | Passed |
| `integration.jd.pdf_extraction` | `integration` | **PASSED** | 13 ms | Passed |
| `integration.pipeline.matching_scoring_evidence` | `integration` | **PASSED** | 3 ms | Passed |
| `sec.ai.prompt_injection_guard` | `security` | **PASSED** | 2 ms | Passed |
| `sec.api.concurrency_limits` | `security` | **FAILED** | 2 ms | SEC-006 OPEN (medium): /api/analyze and /api/analyze-stream do not enforce a maximum concurrent execution cap. |
| `sec.api.error_handling` | `security` | **FAILED** | 50 ms | SEC-012 OPEN (medium): malformed JSON returned HTTP 500 (expected 400); unknown /api/* path returned HTTP 200 (text/html) instead of 404 JSON. |
| `sec.api.rate_limiting` | `security` | **FAILED** | 4 ms | SEC-005 OPEN (high): No HTTP rate-limiting headers or middleware detected on Express API routes. |
| `sec.api.untrusted_client_score` | `security` | **FAILED** | 2 ms | SEC-007 OPEN (high): POST /api/analyses/save persists client-supplied compatibilityScore directly without server-side recomputation or 0..100 bounds validation. |
| `sec.auth.idor_and_unauthorized_access` | `security` | **PASSED** | 707 ms | Passed |
| `sec.deps.vulnerability_audit` | `security` | **PASSED** | 266 ms | Passed |
| `sec.headers.http_security_headers` | `security` | **FAILED** | 4 ms | SEC-010 OPEN (medium): Missing HTTP security headers on /api/health: X-Content-Type-Options: nosniff, Referrer-Policy, Permissions-Policy, Cache-Control: no-store. |
| `sec.info.sensitive_exposure` | `security` | **FAILED** | 6 ms | SEC-009 OPEN (low): X-Powered-By header ("Express") is exposed on API responses (no secrets or stack traces leaked). |
| `sec.pdf.malicious_active_content` | `security` | **FAILED** | 0 ms | SEC-001 OPEN (medium): validatePdfBuffer accepted a PDF containing /JavaScript and /OpenAction markers. |
| `sec.pdf.polyglot_header` | `security` | **FAILED** | 1 ms | SEC-002 OPEN (medium): validatePdfBuffer accepted a GIF89a/%PDF-1.4 polyglot because %PDF- is checked anywhere in the first 1024 bytes. |
| `sec.request.oversized_payloads` | `security` | **PASSED** | 122 ms | Passed |
| `unit.evidence.verbatim_grounding` | `unit` | **PASSED** | 0 ms | Passed |
| `unit.matching.exact_and_synonym` | `unit` | **PASSED** | 3 ms | Passed |
| `unit.pdf.invalid_and_corrupted` | `unit` | **PASSED** | 3 ms | Passed |
| `unit.pdf.page_and_size_limits` | `unit` | **PASSED** | 54 ms | Passed |
| `unit.pdf.valid_extraction` | `unit` | **PASSED** | 221 ms | Passed |
| `unit.scoring.compatibility_and_experience` | `unit` | **PASSED** | 4 ms | Passed |

## Failures & Open Issues

- **`sec.api.concurrency_limits`** (`security`): SEC-006 OPEN (medium): /api/analyze and /api/analyze-stream do not enforce a maximum concurrent execution cap.
- **`sec.api.error_handling`** (`security`): SEC-012 OPEN (medium): malformed JSON returned HTTP 500 (expected 400); unknown /api/* path returned HTTP 200 (text/html) instead of 404 JSON.
- **`sec.api.rate_limiting`** (`security`): SEC-005 OPEN (high): No HTTP rate-limiting headers or middleware detected on Express API routes.
- **`sec.api.untrusted_client_score`** (`security`): SEC-007 OPEN (high): POST /api/analyses/save persists client-supplied compatibilityScore directly without server-side recomputation or 0..100 bounds validation.
- **`sec.headers.http_security_headers`** (`security`): SEC-010 OPEN (medium): Missing HTTP security headers on /api/health: X-Content-Type-Options: nosniff, Referrer-Policy, Permissions-Policy, Cache-Control: no-store.
- **`sec.info.sensitive_exposure`** (`security`): SEC-009 OPEN (low): X-Powered-By header ("Express") is exposed on API responses (no secrets or stack traces leaked).
- **`sec.pdf.malicious_active_content`** (`security`): SEC-001 OPEN (medium): validatePdfBuffer accepted a PDF containing /JavaScript and /OpenAction markers.
- **`sec.pdf.polyglot_header`** (`security`): SEC-002 OPEN (medium): validatePdfBuffer accepted a GIF89a/%PDF-1.4 polyglot because %PDF- is checked anywhere in the first 1024 bytes.

## Blocked Checks & Environment Limitations

No blocked checks in this run.

---
_Generated strictly from actual automated execution against the live SkillGap M5 codebase. Contains zero real candidate PII, resumes, or secrets._
