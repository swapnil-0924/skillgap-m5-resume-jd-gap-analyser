# M5 Critical Accuracy Remediation Report — V-02, V-12 & V-20

**Project:** SkillGap M5 — Resume vs Job Description Gap Analyser  
**Remediation Scope:** Critical Accuracy Defects `V-02`, `V-12`, and `V-20` (from Part 4 Security & Reliability Audit)  
**Architecture Preserved:** React 19 + Vite 6 + Tailwind CSS v4 frontend, Node.js/Express (`server.ts`) backend, Drizzle ORM + Cloud SQL (PostgreSQL), Firebase Auth, `@google/genai` SDK (`gemini-4-hydrogen`, `gemini-3.1-flash-lite`, `gemini-embedding-2`). No rebuild, no breaking API/DB/UI schema changes.

---

## 1. Root Cause Analysis

### V-02 — Incorrect Technology Matching (`Java` ≈ `JavaScript`, `React` ≈ `React Native`, Dropped 1-Char Skills)
1. **Raw substring containment in `lexicalSemanticSimilarity`** (`src/analysis/matchingEngine.ts`):
   The previous implementation checked `(normA.length >= 4 && normB.includes(normA)) || (normB.length >= 4 && normA.includes(normB))` and immediately returned `0.84`. Because `"javascript".includes("java")` and `"react native".includes("react")` are both `true`, both pairs scored `0.84`, exceeding `SEMANTIC_MATCH_THRESHOLD = 0.78`, and were falsely marked **`MATCHED`**.
2. **Substring membership inside `RELATED_SKILL_CLUSTERS`**:
   Cluster matching used `cluster.some((c) => normA.includes(c) || c.includes(normA))`, which pulled `"java"` into the Node.js/Express.js/JavaScript cluster (`"javascript".includes("java")`), causing `Node.js` and `Express.js` to falsely register as **`PARTIAL`** matches (`0.70`) for a pure Java developer.
3. **Semantic similarity auto-promoting distinct skills to `matched` & lexical override**:
   `matchSkillsAgainstJd` previously computed `Math.max(vecSim, lexSim >= 0.8 ? lexSim : vecSim)` (allowing lexical `0.84` false positives to override neural embeddings while still labeling the result `semantic_embedding`), and promoted any pair with similarity `>= 0.78` to confirmed `status: 'matched'` without requiring canonical equivalence.
4. **Single-character language drop in `normalizeAndDeduplicateSkills`** (`src/analysis/skillTaxonomy.ts`):
   `if (!rawName || rawName.length < 2) continue;` silently discarded valid single-character programming languages **`C`** and **`R`** (despite `'r': 'R'` being listed in `SKILL_ALIASES`).

### V-12 — Embedding Fallback Problem (`gemini-embedding-2` Silently Falling Back to `lexical_fallback`)
1. **`@google/genai` multimodal `embedContent` payload mismatch** (`src/server/geminiService.ts`):
   Inspection of `node_modules/@google/genai/dist/node/index.mjs` confirmed that `tIsMultimodalEmbeddingModel('gemini-embedding-2')` evaluates to `true`. For multimodal embedding models, the SDK runs `tContents(params.contents)`. Because `embedSkillNames` passed a plain `string[]` (`['React', 'PostgreSQL', ...]`), `_isContent(origin[0])` evaluated to `false`, causing the SDK to collapse **all N skill strings into a single multi-part `Content` object** (`{ role: 'user', parts: [{ text: s1 }, { text: s2 }, ...] }`).
2. **Silent vector loss & misleading fallback reporting**:
   Because the API received 1 combined content item instead of N items, `embedRes.embeddings` returned at most 1 fused vector (`embeddings.length === 1`), leaving skills `1..N-1` unembedded. `matchOutput.usedEmbeddings` therefore remained `false`, silently reverting every run to `lexical_fallback`. Furthermore, `embedSkillNames` swallowed exceptions with a `console.warn` and returned an empty `Map` without diagnostics, while `ReportView.tsx` hardcoded the label `"(exact + semantic embeddings)"` even when `semanticMatchingEngine === 'lexical_fallback'`.

### V-20 — Irrelevant Experience Inflates Compatibility Score
1. **Unconditional total-years and seniority credit** (`src/analysis/scoringEngine.ts`):
   `calculateCompatibilityScore` awarded `yearsScore = 100` whenever `resumeYears >= requiredYears` and `seniorityScore = 100` whenever `resumeSeniorityRank >= requiredSeniorityRank`, regardless of career domain or skill relevance. Combined as `100 * 0.55 + 0 * 0.30 + 100 * 0.15 = 70%`, a Head Pastry Chef with 8 years of culinary experience and **0/7 matched skills** and **0/2 matched domains** received `70%` on the Experience pillar (`+14.8` weighted points), inflating their overall compatibility score against an Embedded Rust Firmware Engineer JD to **`15%`**.
2. **Misleading narrative note**:
   `assessmentNote` reported `"Meets experience benchmark (8 years detected vs 5+ years requested)."` for completely unrelated backgrounds.

---

## 2. Files Modified

| File | Summary of Changes |
|---|---|
| `src/types/analysis.ts` | Added optional, backward-compatible fields: `reviewRequired` and `matchReason` on `SkillMatchResult`; `EmbeddingDiagnostics` on `DocumentExtractionMeta`; `relevanceFactor`, `relevantYearsEstimate`, and `ExperienceScoreBreakdown` on `ExperienceAlignment`. |
| `src/analysis/skillTaxonomy.ts` | Preserved single-character languages (`C`, `R`) via `ALLOWED_SINGLE_CHAR_SKILLS`; added unambiguous aliases (`c`, `c language`, `react-native`, `dbt`, `mlops`, `cuda`, `rtos`) and embedded/ML acronyms; exported `areCanonicalSynonyms()`. |
| `src/analysis/matchingEngine.ts` | Removed raw substring containment and substring cluster checks; replaced clusters with exact `ReadonlySet<string>` lookups; added `NON_SUBSTITUTABLE_PAIRS`, `TRANSFERABLE_LANGUAGE_PAIRS`, and symmetric category guards; restricted `status: 'matched'` strictly to `exact_normalized` matches; classified semantic/transferable matches as `status: 'partial'` with `reviewRequired: true` and `matchReason`; calibrated `EMBEDDING_PARTIAL_THRESHOLD = 0.72`; prevented lexical heuristics from overriding neural embeddings; added `embeddingComparisonCount` and `lexicalFallbackCount`. |
| `src/analysis/scoringEngine.ts` | Distinguished total career years from job-relevant experience via deterministic `relevanceFactor` (`0..1`) derived from weighted skill evidence, domain alignment (with quadratic high-match phrasing corroboration), and role-context alignment; scaled years and seniority subscores by `relevanceFactor`; emitted `ExperienceScoreBreakdown`, `relevantYearsEstimate`, and honest relevance-aware `assessmentNote`; tightened qualification degree-hierarchy matching to respect field of study. |
| `src/server/geminiService.ts` | Updated `embedSkillNames` to send explicit `Content[]` (`{ role: 'user', parts: [{ text: skill }] }`) per skill for `gemini-embedding-2`; added response count validation with bounded-concurrency single-item recovery; returned structured `EmbeddingBatchResult` (`status`, `requestedCount`, `embeddedCount`, `fallbackReason`, `latencyMs`); added structured `[embeddings]` logging and injectable `embedFn` for deterministic success/failure unit testing. |
| `src/server/analysisPipeline.ts` | Wired `EmbeddingBatchResult` into Stage 2/3 logging and `extractionMeta.embeddingDiagnostics`; set `semanticMatchingEngine` truthfully based on actual provider status; passed `resumeJobTitle` and `jdJobTitle` into `calculateCompatibilityScore`. |
| `src/services/responseValidators.ts` | Validated and preserved optional `embeddingDiagnostics`, `relevanceFactor`, `relevantYearsEstimate`, and `experienceBreakdown` fields cleanly for both live responses and legacy saved DB rows. |
| `src/components/ReportView.tsx` | Replaced hardcoded `"(exact + semantic embeddings)"` subtitle with truthful engine indicator (`gemini_embedding_2` vs `lexical_fallback`); labeled `semantic_embedding` vs `lexical fallback` per row; rendered `Partial · Review` badge + `matchReason`; displayed `~X relevant yrs (Y% role relevance)` alongside total resume years. |
| `src/analysis/skillTaxonomy.test.ts` | Expanded unit tests for alias separation (`Java`/`JavaScript`, `React`/`React Native`, `PostgreSQL`/`SQL`, `Python`/`PyTorch`) and `C`/`R` preservation. |
| `src/analysis/matchingAndScoring.test.ts` | Added pairwise `V-02` regression suite, `V-12` embedding success/mismatch-recovery/failure-fallback unit tests, and the full 7-case regression dataset (Cases A–G). |

---

## 3. Matching Logic Changes (`V-02`)

1. **Confirmed `matched` requires exact canonical equivalence:**
   Only skills whose normalized canonical taxonomy names are identical (`exact_normalized`, `similarityScore = 1.0`, `reviewRequired = false`) receive `status: 'matched'`. Explicit synonyms (e.g., `React.js` / `ReactJS` → `React`, `Postgres` → `PostgreSQL`, `K8s` → `Kubernetes`, `RESTful Web Services` → `REST API`) resolve deterministically in `skillTaxonomy.ts`.
2. **Zero raw substring matching:**
   Substring containment (`includes`) was removed from both `lexicalSemanticSimilarity` and `RELATED_SKILL_CLUSTERS`. Clusters now use exact canonical `Set` membership.
3. **Generalizable distinct-technology & category guards (applied to both embeddings and lexical fallback):**
   - `NON_SUBSTITUTABLE_PAIRS` blocks naming/platform collisions (`Java` ↔ `JavaScript`, `React` ↔ `React Native`, `C` ↔ `C#`, `C++` ↔ `C#`, `Python` ↔ `PyTorch`, `Python` ↔ `TensorFlow`, `JavaScript` ↔ `React Native`, `Go` ↔ `Google Cloud Platform`).
   - Distinct canonical `programming_language` items are not cross-matched unless in `TRANSFERABLE_LANGUAGE_PAIRS` (`TypeScript` ↔ `JavaScript`, `C` ↔ `C++`, `Kotlin` ↔ `Java`, `Sass` ↔ `CSS`).
   - Symmetric language-vs-specialized-tool guard prevents a base programming language from satisfying a specialized framework/library/cloud/dev-tool (and vice versa, e.g., `JUnit` ↔ `JavaScript`), with the explicit relational exception for `SQL` ↔ relational databases (`PostgreSQL`, `MySQL`, etc.).
4. **Ambiguous / semantic similarity classified as `partial` with `reviewRequired: true`:**
   Non-exact skills passing `EMBEDDING_PARTIAL_THRESHOLD = 0.72` (pure neural cosine similarity) or `LEXICAL_PARTIAL_THRESHOLD = 0.62` (exact-member domain cluster fallback) are classified as `status: 'partial'`, flagged `reviewRequired: true`, and annotated with `matchReason`. Semantic similarity alone never confirms `status: 'matched'`.

### Pairwise Unit Regression Results (Before vs After)

| Resume Skill | JD Requirement | Before (Similarity / Status) | After (Lexical Sim / Status / Review) | Expected | Result |
|---|---|---|---|---|---|
| `Java` | `JavaScript` | `0.84` / `matched` | `0.15` (sim `0`) / `missing` / `false` | Different skills (`missing`) | **PASS** |
| `JavaScript` | `Java` | `0.84` / `matched` | `0.15` (sim `0`) / `missing` / `false` | Different skills (`missing`) | **PASS** |
| `React` | `React Native` | `0.84` / `matched` | `0.15` (sim `0`) / `missing` / `false` | Different skills (`missing`) | **PASS** |
| `React.js` | `React` | `1.00` / `matched` (`exact_normalized`) | `1.00` / `matched` (`exact_normalized`) / `false` | Exact synonym (`matched`) | **PASS** |
| `PostgreSQL` | `SQL` | `0.70` / `partial` | `0.70` / `partial` / `true` | Transferable (`partial` + review) | **PASS** |
| `Python` | `PyTorch` | `0.17` / `missing` | `0.15` (sim `0`) / `missing` / `false` | Distinct language vs ML lib (`missing`) | **PASS** |
| `PostgreSQL` | `Postgres` | `1.00` / `matched` | `1.00` / `matched` (`exact_normalized`) / `false` | Exact synonym (`matched`) | **PASS** |
| `Kubernetes` | `K8s` | `1.00` / `matched` | `1.00` / `matched` (`exact_normalized`) / `false` | Exact synonym (`matched`) | **PASS** |
| `RESTful Web Services` | `REST API` | `1.00` / `matched` | `1.00` / `matched` (`exact_normalized`) / `false` | Exact synonym (`matched`) | **PASS** |
| `C` & `R` (1-char skills) | `C`, `R` | **Dropped** (`kept: ['Python']`) | **Preserved** (`['C', 'R', 'Rust']`) | Preserved | **PASS** |

*(Note: `Java` vs `JavaScript`, `React` vs `React Native`, and `Python` vs `PyTorch` were also verified with simulated high-cosine embedding vectors `[0.9, 0.435]` vs `[0.95, 0.312]` in `matchingAndScoring.test.ts` and remained `missing`.)*

---

## 4. Embedding Provider Verification Evidence (`V-12`)

### A. Live End-to-End Verification (`POST http://localhost:3000/api/analyze` with real `GEMINI_API_KEY`)
All 7 live API analyses executed against the restarted server returned `semanticMatchingEngine: "gemini_embedding_2"` with `status: "succeeded"` and **100% vector coverage (`embeddedCount === requestedCount`)**:

| Live Case | Provider Model | Status | Embedded / Requested | Fallback Reason | Latency |
|---|---|---|---|---|---|
| Case A (Java vs JavaScript) | `gemini-embedding-2` | `succeeded` | `12 / 12` | `null` | `1,356 ms` |
| Case B (React vs React Native) | `gemini-embedding-2` | `succeeded` | `11 / 11` | `null` | `1,309 ms` |
| Case C (Python vs PyTorch ML) | `gemini-embedding-2` | `succeeded` | `11 / 11` | `null` | `1,322 ms` |
| Case D (Pastry Chef vs Embedded Rust) | `gemini-embedding-2` | `succeeded` | `12 / 12` | `null` | `1,326 ms` |
| Case E (High-Match Data Engineer) | `gemini-embedding-2` | `succeeded` | `8 / 8` | `null` | `1,282 ms` |
| Case F (QA Engineer vs QA Engineer) | `gemini-embedding-2` | `succeeded` | `8 / 8` | `null` | `1,297 ms` |
| Case G (Transferable Cloud Stack) | `gemini-embedding-2` | `succeeded` | `12 / 12` | `null` | `1,311 ms` |

Sample empirically measured live `gemini-embedding-2` cosine similarities observed during Case A, F, and G:
- `GitHub Actions` ↔ `GitLab CI/CD`: **`0.80`** (`partial · review`)
- `CI/CD` ↔ `GitHub Actions`: **`0.80`** (`partial · review`)
- `PostgreSQL` ↔ `MySQL`: **`0.77`** (`partial · review`)
- `Google Cloud Platform` ↔ `AWS`: **`0.75`** (`partial · review`)
- `MongoDB` ↔ `Oracle Database`: **`0.74`** (`partial · review`)
- `FastAPI` ↔ `REST API`: **`0.72`** (`partial · review`)

### B. Controlled Failure Fallback & Recovery Verification (`node:test`)
Executed in `src/analysis/matchingAndScoring.test.ts` (all 18/18 unit & regression tests passing):
1. **Explicit `Content[]` shape verification:** Asserted `contents.length === 3` and every element has `{ role: 'user', parts: [{ text }] }` → `status: 'succeeded'`, `embeddedCount: 3/3`, `fallbackReason: null`.
2. **Batch count-mismatch recovery:** Simulated legacy 1-vector batch response for 2 skills → automatically fell back to per-item embedding calls → `status: 'succeeded'`, `embeddedCount: 2/2`.
3. **Controlled provider outage (`503 Service Unavailable`):** Injected failing embedder → `status: 'fallback'`, `embeddedCount: 0/2`, `vectors.size: 0`, `fallbackReason: "503 Service Unavailable: embedding backend down"`; logged `[embeddings] model=gemini-embedding-2 status=fallback ...`; pipeline degrades cleanly to `lexical_fallback` without crashing and discloses fallback mode in `extractionMeta` and `ReportView`.

---

## 5. Before-and-After Regression Test Results (Cases A–G)

Both deterministic offline runs (comparing exact identical extracted inputs Before vs After) and full Live End-to-End API runs (PDF upload → Gemini extraction → live `gemini-embedding-2` → matching → deterministic scoring) were executed:

| Case | Scenario | Before Score (Deterministic) | After Score (Deterministic) | After Score (Live API + `gemini-embedding-2`) | Key Accuracy Improvement |
|---|---|---:|---:|---:|---|
| **A** | Java developer vs JavaScript developer | `52%` | **`14%`** | **`18%`** | Eliminated false `JavaScript <- Java (0.84)` match and false `Node.js`/`Express.js <- Java` partials; exp dropped `70% → 0–4%`. Live API surfaced only legitimate `MongoDB <- Oracle Database (0.74)` partial. |
| **B** | React developer vs React Native developer | `59%` | **`36%`** | **`42%`** | Eliminated false `React Native <- React (0.84)` match; exp relevance scaled `70% → 32–36%` (`~1.8 relevant yrs`). Live API marked `React Native` only as `partial · review` via `Next.js (0.75)`, never `matched`. |
| **C** | Python developer vs PyTorch ML engineer | `45%` | **`35%`** | **`34%`** | `PyTorch`, `Deep Learning`, `CUDA`, `MLOps`, `Transformers` remain `missing`; unrelated web-backend exp scaled `70% → 18–21%` (`~1.0 relevant yr`). |
| **D** | Culinary Pastry Chef vs Embedded Rust Firmware | `15%` | **`0%`** | **`0%`** | `C` is no longer dropped (`7/7` missing); 8 yrs culinary experience receives `0%` relevance (`0 relevant yrs`), dropping overall score `15% → 0%`. |
| **E** | High-match Data Engineer vs Data Engineer | `100%` | **`100%`** | **`100%`** | Preserved `100%` exact alignment (`8/8` matched, `relevanceFactor = 1.0`, `dbt` casing preserved). |
| **F** | QA Engineer vs QA Engineer | `94%` | **`94%`** | **`93%`** | Preserved high-match QA scoring (`6` exact + `CI/CD <- GitHub Actions (0.80)` partial; `relevanceFactor = 0.94–1.0`). |
| **G** | Transferable stack (no exact match) | `62%` | **`60%`** | **`50%`** | `0` fake exact matches; transferable cloud/DB/CI skills credited fairly as `partial · review` (`0.5x`) with `0.73–0.85` experience relevance (`~3.7–4.3 relevant yrs`). |

---

## 6. Detailed Score Breakdown per Test Case (A–G)

### Case A — Java Developer vs JavaScript Developer
- **Deterministic After (`14%`):**
  - Matched: `0` | Partial: `0` | Missing: `Express.js`, `JavaScript`, `Node.js`, `React`, `TypeScript`, `MongoDB`
  - Technical Skills (`64.7%` wt): `0%` → `+0.0`
  - Qualifications (`14.1%` wt): `100%` (`B.S. CS`) → `+14.1`
  - Relevant Experience (`21.2%` wt): `0%` (`5 total yrs`, `relevanceFactor = 0.0`, `~0 relevant yrs`) → `+0.0`
- **Live API (`18%`, `gemini_embedding_2` `12/12`):**
  - Matched: `0` | Partial: `MongoDB <- Oracle Database (0.74)` | Missing: `Express.js`, `JavaScript`, `Node.js`, `React`, `TypeScript`
  - Technical (`64.7%`): `5%` (`+3.2`) · Qualifications (`14.1%`): `100%` (`+14.1`) · Experience (`21.2%`): `4%` (`+0.8`, `relevanceFactor = 0.05`, `~0.3 relevant yrs`).

### Case B — React Developer vs React Native Developer
- **Deterministic After (`36%`):**
  - Matched: `TypeScript`, `Redux` | Partial: `0` | Missing: `React Native`, `Android`, `iOS`, `Xcode`
  - Technical Skills (`75.3%` wt): `36%` → `+27.1`
  - Relevant Experience (`24.7%` wt): `36%` (`4 total yrs`, `relevanceFactor = 0.46`, `~1.8 relevant yrs`) → `+8.9`
- **Live API (`42%`, `gemini_embedding_2` `11/11`):**
  - Matched: `TypeScript`, `Redux` | Partial: `React Native <- Next.js (0.75, reviewRequired)` | Missing: `Android`, `iOS`, `Xcode`
  - Technical (`75.3%`): `45%` (`+33.9`) · Experience (`24.7%`): `32%` (`+7.9`, `relevanceFactor = 0.45`, `~1.8 relevant yrs`).

### Case C — Python Developer vs PyTorch ML Engineer
- **Deterministic After (`35%`) / Live API (`34%`, `gemini_embedding_2` `11/11`):**
  - Matched: `Python` (req), `Docker` (pref) | Partial: `0` | Missing: `CUDA`, `Deep Learning`, `MLOps`, `PyTorch`, `Transformers`
  - Technical Skills (`64.7%` wt): `25%` → `+16.2`
  - Qualifications (`14.1%` wt): `100%` (`B.S. CS`) → `+14.1`
  - Relevant Experience (`21.2%` wt): `18%` live / `21%` det (`4 total yrs`, `relevanceFactor = 0.25–0.27`, `~1.0–1.1 relevant yrs`) → `+3.8` / `+4.4`.

### Case D — Culinary Pastry Chef vs Embedded Rust Firmware Engineer
- **Deterministic After (`0%`) / Live API (`0%`, `gemini_embedding_2` `12/12`):**
  - Matched: `0` | Partial: `0` | Missing: `ARM Cortex-M`, `C`, `I2C`, `RTOS`, `Rust`, `SPI`, `JTAG` (`7/7` preserved)
  - Technical Skills (`64.7%` wt): `0%` → `+0.0`
  - Qualifications (`14.1%` wt): `0%` (`Diploma in Culinary Arts` ≠ `B.S. Electrical Engineering`) → `+0.0`
  - Relevant Experience (`21.2%` wt): `0%` (`8 total yrs`, `relevanceFactor = 0.0`, `0 relevant yrs`) → `+0.0`
  - Assessment Note: *"No job-relevant experience detected (8 total years appear to be in unrelated domains/skills vs 5+ relevant years)."*

### Case E — High-Match Data Engineer vs Data Engineer
- **Deterministic After (`100%`) / Live API (`100%`, `gemini_embedding_2` `8/8`):**
  - Matched: `Python`, `SQL`, `Apache Spark`, `Apache Airflow`, `Snowflake`, `AWS`, `dbt`, `Communication` (`8/8`) | Partial: `0` | Missing: `0`
  - Technical Skills (`55%` wt): `100%` → `+55.0`
  - Soft Skills (`15%` wt): `100%` → `+15.0`
  - Qualifications (`12%` wt): `100%` → `+12.0`
  - Relevant Experience (`18%` wt): `100%` (`6 total yrs`, `relevanceFactor = 1.0`, `~6 relevant yrs`) → `+18.0`.

### Case F — QA Engineer vs QA Engineer
- **Deterministic After (`94%`):**
  - Matched: `Playwright`, `Selenium`, `TypeScript`, `Jira`, `REST API`, `Agile Methodology` (`6`) | Partial: `CI/CD <- GitHub Actions (0.70)` (`1`) | Missing: `0`
  - Technical Skills (`75.3%` wt): `92%` → `+69.3`
  - Relevant Experience (`24.7%` wt): `100%` (`4 total yrs`, `relevanceFactor = 1.0`, `~4 relevant yrs`) → `+24.7`
- **Live API (`93%`, `gemini_embedding_2` `8/8`):**
  - Matched: `6` | Partial: `CI/CD <- GitHub Actions (0.80, semantic_embedding)` | Missing: `0`
  - Technical (`62.5%`): `92%` (`+57.5`) · Soft/Methodology (`17%`): `100%` (`+17.0`) · Experience (`20.5%`): `91%` (`+18.6`, `relevanceFactor = 0.94`, `~3.8 relevant yrs`).

### Case G — Transferable Cloud Stack (No Exact Technology Match)
- **Deterministic After (`60%`):**
  - Matched: `0` | Partial: `Google Cloud Platform <- AWS`, `PostgreSQL <- MySQL`, `GitHub Actions <- GitLab CI/CD`, `FastAPI <- Django`, `Kubernetes <- Docker`, `GraphQL <- REST API` (`6/6`, all `reviewRequired = true`) | Missing: `0`
  - Technical Skills (`75.3%` wt): `50%` → `+37.7`
  - Relevant Experience (`24.7%` wt): `90%` (`5 total yrs`, `relevanceFactor = 0.85` capped for zero-exact stack, `~4.3 relevant yrs`) → `+22.2`
- **Live API (`50%`, `gemini_embedding_2` `12/12`):**
  - Matched: `0` | Partial (`5/6`): `GitHub Actions <- GitLab CI/CD (0.80)`, `PostgreSQL <- MySQL (0.77)`, `Kubernetes <- GitLab CI/CD (0.76)`, `Google Cloud Platform <- AWS (0.75)`, `FastAPI <- REST API (0.72)` | Missing: `GraphQL` (`0.71 < 0.72`)
  - Technical (`75.3%`): `45%` (`+33.9`) · Experience (`24.7%`): `66%` (`+16.3`, `relevanceFactor = 0.73`, `~3.7 relevant yrs`).

---

## 7. Verification Checks Executed & Remaining Limitations

### Verification Summary
- **Unit & Regression Suite (`npx tsx --test`):** `18 / 18` passed (`skillTaxonomy.test.ts`, `matchingAndScoring.test.ts`, `apiReliability.test.ts`).
- **TypeScript Strict Check (`tsc --noEmit` with `"strict": true`):** `0` errors.
- **Production Build (`npm run build` / `compile_applet`):** Passed cleanly.
- **Live End-to-End API Verification (`POST /api/analyze`):** All 7 cases (A–G) succeeded live with `gemini-embedding-2` returning `100%` of requested vectors (`8/8` to `12/12`) and `0` fallbacks.

### Remaining Limitations
1. **Embedding cosine nuances on broad adjacent tools:** In dense vector space (`gemini-embedding-2`), cross-framework pairs within the same broad category (e.g., `Next.js` ↔ `React Native` at `0.75`, or `GitLab CI/CD` ↔ `Kubernetes` at `0.76`) can still cross `0.72` and surface as **`partial · review`**. Because semantic similarity is strictly capped at `partial` with `reviewRequired: true` (never `matched`), this cannot produce false confirmed matches, and the UI instructs reviewers to verify hands-on depth. Future work could add per-role contextual embedding prompts (e.g., `"Skill in context: React Native (mobile framework)"`) to sharpen separation further.
2. **Per-job timeline parsing for multi-career resumes:** Structured extraction currently returns aggregate `estimatedYears` plus domains/summary rather than per-role date ranges. `relevantYearsEstimate` is therefore a deterministic, evidence-weighted estimate (`totalYears × relevanceFactor`) rather than a sum of individually dated job tenures.
3. **Taxonomy maintenance:** Unseen non-English or niche proprietary acronyms not in `SKILL_ALIASES` rely on normalized exact match or `gemini-embedding-2` partial similarity (`reviewRequired: true`) until added to the taxonomy.
4. **Prior audit items outside V-02/V-12/V-20 scope:** This remediation specifically targeted `V-02`, `V-12`, and `V-20`; unrelated security findings from the Part 4 audit (such as `V-01` prompt injection hardening or `V-13` learning-plan grounding) remain tracked separately.
