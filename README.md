# SkillGap M5 — Resume vs Job Description Gap Analyser

An AI-powered full-stack web application that analyzes any candidate's PDF resume against any Job Description (pasted text or uploaded PDF), identifies matched, partially matched, and missing skills with verbatim JD evidence, computes a transparent deterministic compatibility score, generates a personalized 14-day learning roadmap, and persists analysis history in Cloud SQL (PostgreSQL).

## Architecture Overview

- **Frontend**: React 19, Vite, Tailwind CSS v4, Lucide React, Recharts
- **Backend**: Express + TypeScript (`server.ts`)
- **Document Processing**: `unpdf` (PDF.js text extraction, page density detection, password/corruption validation) + automatic Gemini Multimodal OCR fallback for scanned, image-based, or mixed PDFs
- **AI & Semantic NLP (`@google/genai`, server-side only)**:
  - Structured skill, qualification, certification & experience extraction (`gemini-3.1-flash-lite`)
  - Low-latency JD Quick Scan & Skill Gap Advisor (`gemini-3.1-flash-lite`)
  - Neural semantic skill matching via vector embeddings (`gemini-embedding-2` + cosine similarity)
  - Personalized 14-day learning roadmap using high-thinking mode (`gemini-4-hydrogen`, `ThinkingLevel.HIGH`)
- **Custom Skill Taxonomy & Deterministic Scoring Engine**:
  - `src/analysis/skillTaxonomy.ts`: 180+ canonical alias mappings (`ReactJS` -> `React`, `PostgreSQL Database` -> `PostgreSQL`, `RESTful Web Services` -> `REST API`, etc.)
  - `src/analysis/evidenceEngine.ts`: Verifies verbatim JD evidence quotes directly against the raw JD text
  - `src/analysis/scoringEngine.ts`: Transparent weighted compatibility score calculated mathematically from evidence
- **Database & Auth**: Cloud SQL (PostgreSQL) via Drizzle ORM (`src/db/`) + Firebase Authentication (Google Sign-In)

## API Endpoints

- `GET /api/health` — Backend health check
- `POST /api/jd/quick-scan` — Low-latency JD requirement preview (text or PDF)
- `POST /api/analyze` — Multipart upload (`resume` PDF + `jdText` or `jdFile` PDF) for full gap analysis
- `POST /api/analyses/save` — Save a session report to Cloud SQL (Auth required)
- `GET /api/analyses` — List saved analyses for the signed-in user (Auth required)
- `GET /api/analyses/:id` — Retrieve individual saved analysis report (Auth required)
- `PATCH /api/analyses/:id/progress` — Persist 14-day roadmap completion checkboxes (Auth required)
- `DELETE /api/analyses/:id` — Delete a saved analysis report (Auth required)
- `POST /api/coach` — Low-latency skill gap Q&A advisor grounded in the active report

## Local Development & Verification

```bash
# Install dependencies
npm install

# Run unit tests for taxonomy, semantic matching, evidence verification, and scoring
npx --yes tsx --test src/analysis/skillTaxonomy.test.ts src/analysis/matchingAndScoring.test.ts

# Start full-stack dev server on port 3000
npm run dev

# Build for production
npm run build
```
