# SkillGap M5 — Resume vs Job Description Gap Analyser

An AI-powered full-stack web application that analyzes a candidate's PDF resume against any Job Description (pasted text or uploaded PDF), extracts and normalizes skills, verifies verbatim JD evidence, computes a transparent deterministic compatibility score, generates a personalized 14-day learning roadmap, and persists analysis history in PostgreSQL (Cloud SQL) with Firebase Authentication.

---

## Architecture Overview

- **Frontend**: React 19, Vite 8, Tailwind CSS v4, Lucide React, Recharts (lazy-loaded strictly on the Analysis Report view)
- **Backend**: Express + TypeScript (`server.ts`, unified Node.js server supporting native TypeScript execution on Node `>=22.18.0`)
- **Document Processing**: `unpdf` (PDF text extraction, page density detection, password/corruption validation) with automatic Gemini Multimodal OCR fallback for scanned, image-based, or mixed PDFs
- **AI & Semantic NLP (`@google/genai`, server-side only — `src/server/geminiService.ts`)**:
  - **Structured Extraction (`gemini-3.1-flash-lite`)**: Extracts skills, qualifications, certifications, and experience profiles from resumes and JDs
  - **Multimodal PDF OCR (`gemini-3.1-flash-lite`)**: Automatic fallback for scanned/image-heavy PDFs
  - **Low-Latency JD Quick Scan & Skill Gap Advisor (`gemini-3.1-flash-lite`)**: Fast JD previews and report-grounded Q&A coaching
  - **Semantic Skill Embeddings (`gemini-embedding-2`)**: Vector embeddings with cosine similarity for semantic skill matching (with automatic lexical fallback if embedding calls are unavailable)
  - **Personalized 14-Day Learning Roadmap (`gemini-3.1-flash-lite` primary, `gemini-4-hydrogen` fallback)**: Primary generation uses `gemini-3.1-flash-lite` for fast, reliable output, with automatic fallback to `gemini-4-hydrogen` (`ThinkingLevel.LOW`) if the primary call fails (and an optional `deepThinking` `ThinkingLevel.HIGH` code path in `generatePersonalizedLearningPlan`)
- **Custom Skill Taxonomy & Deterministic Scoring Engine (`src/analysis/`)**:
  - `skillTaxonomy.ts`: 180+ canonical alias mappings (e.g. `ReactJS` -> `React`, `Postgres` -> `PostgreSQL`, `RESTful Web Services` -> `REST API`)
  - `evidenceEngine.ts`: Verifies verbatim JD evidence quotes directly against the source job description text
  - `matchingEngine.ts`: Exact normalized, semantic embedding, and partial/missing skill classification
  - `scoringEngine.ts`: Transparent weighted compatibility score calculated mathematically from verified evidence
- **Database & Auth**: PostgreSQL (Cloud SQL) via Drizzle ORM (`src/db/`) + Firebase Authentication (Google Sign-In via `firebase` Web SDK and `firebase-admin` token verification)

---

## API Endpoints

All routes are served from `server.ts` (and consumed by the frontend via `VITE_API_BASE_URL` or same-origin `/api/*`):

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | Public | Backend service health check (`200 OK` JSON) |
| `POST` | `/api/jd/quick-scan` | Public | Low-latency JD requirement preview (pasted `jdText` or uploaded `jdFile` PDF) |
| `POST` | `/api/analyze` | Optional | Multipart upload (`resume` PDF + `jdText` or `jdFile` PDF) returning full JSON analysis report (auto-saves when authenticated) |
| `POST` | `/api/analyze-stream` | Optional | Streaming NDJSON (`application/x-ndjson`) version of full gap analysis emitting live `progress`, `result`, and `error` events (used by the React UI) |
| `POST` | `/api/analyses/save` | Required | Save an unauthenticated session report to PostgreSQL after signing in |
| `GET` | `/api/analyses` | Required | List saved analysis history for the signed-in user |
| `GET` | `/api/analyses/:id` | Required | Retrieve a single saved analysis report owned by the signed-in user |
| `PATCH` | `/api/analyses/:id/progress` | Required | Persist completed days (`completedDays`) on a saved 14-day learning roadmap |
| `DELETE` | `/api/analyses/:id` | Required | Delete a saved analysis report owned by the signed-in user |
| `POST` | `/api/coach` | Public | Low-latency Skill Gap Advisor Q&A grounded in the active analysis report |

---

## Prerequisites & Dependencies

- **Node.js**: `>=22.18.0` (required for native TypeScript execution in `npm start` -> `node server.ts`)
- **Package Manager**: Bun (`bun.lock`) or npm (`package.json` supports both)
- **PostgreSQL Database**: Cloud SQL PostgreSQL or any standard PostgreSQL 15+ instance
- **Firebase Project**: Web config in `firebase-applet-config.json` with Google Sign-In enabled
- **Google Gemini API Key**: Required server-side via `GEMINI_API_KEY`

---

## Environment Configuration

Copy `.env.example` to `.env` and populate the required values (never commit `.env` or real credentials):

### Required (Server Runtime)
- `GEMINI_API_KEY` — Server-side Gemini API key (`src/server/geminiService.ts`)
- `SQL_HOST` — PostgreSQL host (`src/db/index.ts`, `src/db/drizzle.config.ts`)
- `SQL_USER` — PostgreSQL runtime user (`src/db/index.ts`)
- `SQL_PASSWORD` — PostgreSQL runtime password (`src/db/index.ts`)
- `SQL_DB_NAME` — PostgreSQL database name (`src/db/index.ts`, `src/db/drizzle.config.ts`)

### Required for Schema Migrations Only (`drizzle-kit`)
- `SQL_ADMIN_USER` — PostgreSQL admin user (`src/db/drizzle.config.ts`)
- `SQL_ADMIN_PASSWORD` — PostgreSQL admin password (`src/db/drizzle.config.ts`)

### Optional (Runtime / Frontend / Deployment)
- `NODE_ENV` — `development` or `production` (defaults to `development`)
- `PORT` — HTTP server port (defaults to `3000`; injected automatically by Render/Cloud Run)
- `APP_URL` — Public hosted URL of the app
- `VITE_API_BASE_URL` — Frontend API origin for split deployments (leave empty for unified hosting; set to e.g. `https://skillgap-m5.onrender.com` when deploying the frontend separately on Vercel)
- `DISABLE_HMR` — Set to `true` to disable Vite HMR file watching during development

---

## Local Development & Verification

```bash
# 1. Install dependencies
bun install
# or: npm install

# 2. Configure environment variables
cp .env.example .env

# 3. Typecheck (TypeScript strict mode)
npm run lint

# 4. Run unit tests (taxonomy, semantic matching, scoring, API & NDJSON stream reliability)
npx tsx --test src/analysis/skillTaxonomy.test.ts src/analysis/matchingAndScoring.test.ts src/services/apiReliability.test.ts

# 5. Start full-stack dev server on http://localhost:3000
npm run dev

# 6. Build production frontend bundle (NODE_ENV=production vite build)
npm run build

# 7. Run production server locally
NODE_ENV=production npm start
```

---

## Deployment

### Option A: Unified Full-Stack Deployment on Render (Recommended)
A blueprint is provided in `render.yaml`:
- **Runtime**: Node.js `22.18.0` (`package.json` pins `"engines": { "node": ">=22.18.0" }`)
- **Build Command**: `npm install --include=dev && npm run build`
- **Start Command**: `npm start` (`NODE_ENV=production node server.ts`)
- **Health Check Path**: `/api/health`
- Configure the `sync: false` secret environment variables (`GEMINI_API_KEY`, `APP_URL`, `SQL_HOST`, `SQL_USER`, `SQL_PASSWORD`, `SQL_DB_NAME`) in the Render dashboard.

### Option B: Frontend Static SPA on Vercel + Backend on Render
A Vercel SPA configuration is provided in `vercel.json`:
- **Framework**: `vite` (`npm run build` -> `dist/`)
- **Rewrites**: Routes client paths `/((?!api/).*)` to `/index.html` while keeping `/api/*` excluded from SPA fallback.
- **Environment Variable on Vercel**: Set `VITE_API_BASE_URL` to your deployed Render backend origin (e.g., `https://skillgap-m5.onrender.com`).
- **Note**: Cross-origin Vercel -> Render browser requests require configuring an explicit CORS origin allowlist on the backend before going live in split-origin mode.
