# SkillGap M5 — Final Deployment Readiness Assessment

- **Project Name:** SkillGap M5 — Resume vs Job Description Gap Analyser  
- **Problem ID:** M5  
- **Assessment Date:** 2026-11-20  
- **Actual Runtime Stack:** Unified Node.js (`>=22.18.0`, verified on `v22.23.2`) + Express 4 + React 19 + Vite 8 + PostgreSQL (Cloud SQL via Drizzle ORM) + Firebase Auth (Google Sign-In) + `@google/genai`  
- **Companion Report:** [`M5_FINAL_REMEDIATION_REPORT.md`](./M5_FINAL_REMEDIATION_REPORT.md)

---

## 1. Go / No-Go Verdict by Deployment Target

| Deployment Target | Verdict | Summary Rationale |
|---|---|---|
| **Local Development (`npm run dev`)** | **READY (GO)** | Verified running on `http://localhost:3000`; `13/13` unit tests pass; TypeScript `"strict": true` (`0` errors); `bun audit` (`0` vulnerabilities); live streaming analysis (`POST /api/analyze-stream`) completes in ~`8.6s` with zero console/page errors. |
| **Local Production Simulation (`NODE_ENV=production node server.ts`)** | **READY (GO)** | Verified empirically on Node `v22.23.2` (`PORT=3099`): server boots cleanly, `GET /api/health` returns `200 OK`, `GET /` serves minified `dist/index.html` with `369.46 kB` initial JS (`113.87 kB` gzip) and lazy-only Recharts, `0` source maps, `0` leaked debug screenshots. |
| **Controlled Hackathon / Staging Demo (Unified Single-Origin Hosting)** | **CONDITIONALLY READY** | Frontend, streaming UX, bundle performance, dependency hygiene, and production Node startup are solid. Before live judge grading, fixing `V-02` (`Java`=`JavaScript` / `React`=`React Native`) and `V-20` (unrelated resume experience score inflation) is strongly recommended. |
| **Unified Public Production (Render Single Web Service / Cloud Run)** | **NOT READY (NO-GO)** | Production startup and frontend/dependency blockers are resolved, **but** backend abuse/security blockers remain (`V-01` unthrottled public AI endpoints, `V-03` post-extraction PDF page check, `V-05` unvalidated `/api/analyses/save`, `V-15`/`V-16` security headers & error sanitization, `V-18` PostgreSQL TLS/index/timeouts, `V-19` PII minimization). Also, no live cloud deployment has been executed yet (`BLOCKED`). |
| **Split Deployment (Vercel Frontend + Render Backend)** | **BLOCKED (NO-GO)** | `vercel.json`, `render.yaml`, and `VITE_API_BASE_URL` are in place and locally verified, **but** (1) `server.ts` lacks an explicit `ALLOWED_ORIGINS` CORS allowlist (`V-27`) required for cross-origin browser requests from Vercel to Render, (2) PostgreSQL external TLS (`ssl` in `src/db/index.ts`, `V-18`) is not yet configured, (3) backend security blockers above remain open, and (4) live cloud deployments have not been executed. |

---

## 2. Deployment Artifacts & Configuration Audit

| Artifact / Requirement | Present & Valid? | Verification Evidence |
|---|---|---|
| `package.json` `"engines": { "node": ">=22.18.0" }` | **PASS** | Verified in `package.json:6–8`; matches native TypeScript stripping required by `"start": "node server.ts"`. |
| `package.json` `"build": "NODE_ENV=production vite build"` | **PASS** | Verified produces minified production React (`218.74 kB` vs `425.65 kB` dev) even when host shell sets `NODE_ENV=development`. |
| `package.json` `"start": "node server.ts"` | **PASS** | Verified empirically with `NODE_ENV=production PORT=3099 node server.ts` (`HTTP 200` on `/api/health` and `/`). |
| `server.ts` dynamic `vite` import in dev-only branch | **PASS** | `vite` moved cleanly to `devDependencies`; production startup does not import `vite`. |
| `src/lib/firebase-admin.ts` JSON import attribute | **PASS** | Added `with { type: 'json' }`, resolving `ERR_IMPORT_ATTRIBUTE_MISSING` under native Node 22. |
| `render.yaml` | **PASS (Local)** / **BLOCKED (Live Deploy)** | Matches actual unified Node.js service (`runtime: node`, `NODE_VERSION: "22.18.0"`, `NODE_ENV: production`, `buildCommand: npm install --include=dev && npm run build`, `startCommand: npm start`, `healthCheckPath: /api/health`, secrets `sync: false`). |
| `vercel.json` | **PASS (Local)** / **BLOCKED (Live Deploy)** | Valid JSON (`framework: vite`, `outputDirectory: dist`, SPA rewrite `/((?!api/).*) -> /index.html`, immutable `/assets/*` caching). |
| `VITE_API_BASE_URL` frontend config | **PASS** | Verified inlined cleanly when set during `npm run build` and empty same-origin default when unset. |
| `.env.example` | **PASS** | All 12 environment variables documented (Required / Migrations / Optional); zero real secrets. |
| `.gitignore` & `dist/` hygiene | **PASS** | Excludes `.playwright-cli/`, `public/assets/aistudio/`, `*.pdf`, logs, `.env*`; `dist/` has `0` `.map` files, `0` debug screenshots, `0` leaked server secrets. |
| Dependency vulnerabilities (`bun audit`) | **PASS** | `0` vulnerabilities across 470 packages. |
| TypeScript strictness (`tsconfig.json`) | **PASS** | `"strict": true` enabled; `tsc --noEmit` passes with `0` errors across 35 files. |

---

## 3. Environment Variables Checklist for Production

| Variable | Target Platform | Required? | Secret? | Notes |
|---|---|---|---|---|
| `GEMINI_API_KEY` | Render / Cloud Run (Backend) | **Yes** | **Yes** | Server-side only; never prefix with `VITE_`. |
| `SQL_HOST` | Render / Cloud Run (Backend) | **Yes** | No | Must be network-reachable from host (with TLS for external connections). |
| `SQL_USER` | Render / Cloud Run (Backend) | **Yes** | No | Least-privilege runtime DB user. |
| `SQL_PASSWORD` | Render / Cloud Run (Backend) | **Yes** | **Yes** | Runtime DB password. |
| `SQL_DB_NAME` | Render / Cloud Run (Backend) | **Yes** | No | PostgreSQL database name (`users`, `analyses` tables). |
| `SQL_ADMIN_USER` | CI / Migration Runner Only | Migrations only | No | Used only by `drizzle-kit` (`src/db/drizzle.config.ts`). |
| `SQL_ADMIN_PASSWORD` | CI / Migration Runner Only | Migrations only | **Yes** | Do not supply to runtime web container if avoidable. |
| `NODE_ENV` | Render / Cloud Run (Backend) | **Yes (`production`)** | No | Disables Vite dev middleware and serves static `dist/`. |
| `PORT` | Render / Cloud Run (Backend) | Auto-injected | No | Defaults to `3000`; server binds `0.0.0.0:${PORT}`. |
| `APP_URL` | Render / Cloud Run (Backend) | Optional | No | Public service URL. |
| `VITE_API_BASE_URL` | Vercel (Frontend Only) | **Split-origin only** | No | Leave empty for unified hosting; set to Render origin (e.g. `https://skillgap-m5.onrender.com`) for Vercel split hosting. |

---

## 4. Mandatory Blockers Before Public Production Launch

Before opening SkillGap M5 to public internet traffic (on Render, Cloud Run, or Vercel + Render), resolve the following remaining backend/AI items in order:

1. **Abuse & Cost Protection (`V-01` — HIGH):** Add `app.set('trust proxy', 1)`, per-IP/user rate limiting on `/api/analyze`, `/api/analyze-stream`, `/api/jd/quick-scan`, and `/api/coach`, a pipeline concurrency cap (e.g., max 4 concurrent analyses), `jdText <= 25 KB` cap, `question <= 800` cap, and `maxOutputTokens` on Gemini calls.
2. **Matching & Scoring Accuracy (`V-02` HIGH, `V-12` & `V-20` MEDIUM):** Fix `Java`=`JavaScript` / `React`=`React Native` substring false positives, allow 1-char languages (`C`, `R`), diagnose why `gemini-embedding-2` falls back to `lexical_fallback`, and gate unrelated experience credit on near-zero skill overlap.
3. **PDF DoS & Polyglot Defense (`V-03` HIGH, `V-09` MEDIUM):** Check `pageCount <= 15` *before* `extractText()`, add parse timeout + `pdfProxy.destroy()`, and enforce strict byte-0 `%PDF-` magic header.
4. **AI Prompt Isolation & Save Integrity (`V-04`, `V-05` — HIGH):** Add untrusted-document prompt delimiters + resume-side source grounding, and enforce full schema validation + server-signed session save tokens on `POST /api/analyses/save`.
5. **HTTP Security, CORS & Error Hygiene (`V-15`, `V-16`, `V-27` — MEDIUM/LOW):** Disable `X-Powered-By`, add security headers (`X-Content-Type-Options`, `Referrer-Policy`, `Cache-Control: no-store`), map malformed JSON/oversized body/Gemini `503` cleanly (`400`/`413`/`503`) with `/api/*` JSON `404`, and add explicit `ALLOWED_ORIGINS` CORS middleware if deploying frontend separately on Vercel.
6. **Database & Privacy Hardening (`V-17`, `V-18`, `V-19` — MEDIUM):** Enable `checkRevoked: true`, separate Auth `401` vs DB `503`, add `(user_id, created_at)` index + `pg.Pool` TLS (`ssl`) & timeouts + graceful `SIGTERM` drain, redact contact PII pre-LLM, remove unused `resumeTextExcerpt`, and add an upload AI privacy notice.
7. **Live Cloud Smoke Verification (`BLOCKED`):** After deploying to Render (and optionally Vercel), run a live production smoke test verifying:
   - `GET /api/health` (`200`),
   - HTTPS + Firebase Google Sign-In authorized domains configured for the deployed origin,
   - End-to-end authenticated `POST /api/analyze-stream` -> `GET /api/analyses` -> `PATCH /api/analyses/:id/progress` -> `DELETE /api/analyses/:id`,
   - Persistence across a service restart.

---

## 5. Final Deployment Recommendation

- **Recommended Hosting Architecture:** Deploy as a **Unified Single Node.js Web Service on Render** (using `render.yaml`) or **Google Cloud Run** rather than splitting Vercel + Render, unless split hosting is explicitly required. Unified hosting eliminates cross-origin CORS complexity, keeps auth/API traffic same-origin, and is already verified locally with `NODE_ENV=production node server.ts`.
- **Current Release Gate:**
  - **Local & Controlled Demo:** **GO** (with awareness of `V-02` and `V-20`).
  - **Public Production Release:** **HOLD** until the 6 backend/AI security items in Section 4 are implemented and verified against a live cloud deployment.
