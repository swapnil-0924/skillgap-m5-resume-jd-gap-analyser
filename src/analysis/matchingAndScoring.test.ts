import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cosineSimilarity,
  lexicalSemanticSimilarity,
  matchSkillsAgainstJd,
} from './matchingEngine.ts';
import { calculateCompatibilityScore } from './scoringEngine.ts';
import { findVerifiedJdEvidence } from './evidenceEngine.ts';
import { normalizeAndDeduplicateSkills, normalizeSkillName } from './skillTaxonomy.ts';
import { embedSkillNames } from '../server/geminiService.ts';
import type { ExtractedSkillItem } from '../types/analysis.ts';

test('cosineSimilarity computes accurate vector similarity', () => {
  assert.equal(cosineSimilarity([1, 0, 0], [1, 0, 0]), 1);
  assert.equal(cosineSimilarity([1, 0, 0], [0, 1, 0]), 0);
  const sim = cosineSimilarity([1, 1], [1, 0]);
  assert.ok(Math.abs(sim - Math.SQRT1_2) < 1e-6);
});

test('evidence engine verifies verbatim JD sentences and never fabricates quotes', () => {
  const jdText = [
    'We are hiring a Backend Engineer.',
    'Required: Strong experience with PostgreSQL database design and query tuning.',
    'Must build scalable microservices using Kubernetes and Docker.',
  ].join('\n');

  const verified = findVerifiedJdEvidence(jdText, 'PostgreSQL', 'PostgreSQL database');
  assert.equal(verified.verified, true);
  assert.ok(verified.snippet.includes('PostgreSQL database design'));

  const unverified = findVerifiedJdEvidence(
    jdText,
    'Rust',
    'Rust',
    'Hallucinated quote that does not exist in JD'
  );
  assert.equal(unverified.verified, false);
  assert.ok(!unverified.snippet.includes('Hallucinated'));
});

test('V-02 pairwise regressions: rejects substring false positives and requires exact canonical match for matched status', () => {
  // 1. Java vs JavaScript (both directions) -> MUST NOT match
  assert.ok(lexicalSemanticSimilarity('Java', 'JavaScript') < 0.3);
  assert.ok(lexicalSemanticSimilarity('JavaScript', 'Java') < 0.3);

  const javaVsJs = matchSkillsAgainstJd({
    jdText: 'Required: JavaScript',
    resumeSkills: [{ rawName: 'Java', canonicalName: 'Java', category: 'programming_language' }],
    jdSkills: [{ rawName: 'JavaScript', canonicalName: 'JavaScript', category: 'programming_language', importance: 'required' }],
    // Even if embeddings place them close in vector space, distinct language guard blocks false match
    embeddingsBySkill: new Map([
      ['java', [0.9, 0.435]],
      ['javascript', [0.95, 0.312]],
    ]),
  });
  assert.equal(javaVsJs.matched.length, 0);
  assert.equal(javaVsJs.partial.length, 0);
  assert.equal(javaVsJs.missing.length, 1);

  const jsVsJava = matchSkillsAgainstJd({
    jdText: 'Required: Java',
    resumeSkills: [{ rawName: 'JavaScript', canonicalName: 'JavaScript', category: 'programming_language' }],
    jdSkills: [{ rawName: 'Java', canonicalName: 'Java', category: 'programming_language', importance: 'required' }],
  });
  assert.equal(jsVsJava.matched.length, 0);
  assert.equal(jsVsJava.missing.length, 1);

  // 2. React vs React Native -> distinct skills, MUST NOT match
  assert.ok(lexicalSemanticSimilarity('React', 'React Native') < 0.3);
  const reactVsNative = matchSkillsAgainstJd({
    jdText: 'Required: React Native',
    resumeSkills: [{ rawName: 'React', canonicalName: 'React', category: 'framework' }],
    jdSkills: [{ rawName: 'React Native', canonicalName: 'React Native', category: 'framework', importance: 'required' }],
    embeddingsBySkill: new Map([
      ['react', [0.92, 0.39]],
      ['react native', [0.94, 0.34]],
    ]),
  });
  assert.equal(reactVsNative.matched.length, 0);
  assert.equal(reactVsNative.partial.length, 0);
  assert.equal(reactVsNative.missing.length, 1);

  // 3. React.js vs React -> exact taxonomy synonym -> MATCHED
  const reactJsVsReact = matchSkillsAgainstJd({
    jdText: 'Required: React',
    resumeSkills: [{ rawName: 'React.js', canonicalName: normalizeSkillName('React.js'), category: 'framework' }],
    jdSkills: [{ rawName: 'React', canonicalName: normalizeSkillName('React'), category: 'framework', importance: 'required' }],
  });
  assert.equal(reactJsVsReact.matched.length, 1);
  assert.equal(reactJsVsReact.matched[0].matchMethod, 'exact_normalized');
  assert.equal(reactJsVsReact.matched[0].similarityScore, 1);

  // 4. PostgreSQL vs SQL -> transferable partial (reviewRequired), NOT confirmed exact matched
  const pgVsSql = matchSkillsAgainstJd({
    jdText: 'Required: SQL',
    resumeSkills: [{ rawName: 'PostgreSQL', canonicalName: 'PostgreSQL', category: 'database' }],
    jdSkills: [{ rawName: 'SQL', canonicalName: 'SQL', category: 'programming_language', importance: 'required' }],
  });
  assert.equal(pgVsSql.matched.length, 0);
  assert.equal(pgVsSql.partial.length, 1);
  assert.equal(pgVsSql.partial[0].reviewRequired, true);

  // 5. Python vs PyTorch -> NOT matched (general language != specialized ML library)
  const pythonVsPytorch = matchSkillsAgainstJd({
    jdText: 'Required: PyTorch',
    resumeSkills: [{ rawName: 'Python', canonicalName: 'Python', category: 'programming_language' }],
    jdSkills: [{ rawName: 'PyTorch', canonicalName: 'PyTorch', category: 'library', importance: 'required' }],
    embeddingsBySkill: new Map([
      ['python', [0.9, 0.435]],
      ['pytorch', [0.88, 0.475]],
    ]),
  });
  assert.equal(pythonVsPytorch.matched.length, 0);
  assert.equal(pythonVsPytorch.partial.length, 0);
  assert.equal(pythonVsPytorch.missing.length, 1);
});

test('matching engine classifies exact as matched and semantic embedding similarity strictly as partial/review', () => {
  const jdText =
    'Required skills: React, RESTful Web Services, PostgreSQL, Kubernetes, Terraform.';
  const resumeSkills: ExtractedSkillItem[] = [
    { rawName: 'ReactJS', canonicalName: 'React', category: 'framework' },
    { rawName: 'API Design', canonicalName: 'API Design', category: 'technical_skill' },
    { rawName: 'MySQL', canonicalName: 'MySQL', category: 'database' },
  ];
  const jdSkills: ExtractedSkillItem[] = [
    { rawName: 'React', canonicalName: 'React', category: 'framework', importance: 'required' },
    { rawName: 'RESTful Web Services', canonicalName: 'REST API', category: 'technical_skill', importance: 'required' },
    { rawName: 'PostgreSQL', canonicalName: 'PostgreSQL', category: 'database', importance: 'required' },
    { rawName: 'Kubernetes', canonicalName: 'Kubernetes', category: 'cloud', importance: 'required' },
  ];

  // Deterministic 5D embeddings calibrated to observed gemini-embedding-2 cosine ranges:
  // REST API <-> API Design = ~0.96 (high semantic similarity -> partial + reviewRequired, NEVER auto-matched)
  // PostgreSQL <-> MySQL = 0.77 (matches live gemini-embedding-2 cosine -> partial semantic)
  // Kubernetes <-> all = 0.0 (missing)
  const embeddings = new Map<string, number[]>([
    ['react', [1, 0, 0, 0, 0]],
    ['rest api', [0, 0.9, 0.435, 0, 0]],
    ['api design', [0, 0.98, 0.19, 0, 0]],
    ['postgresql', [0, 0, 1, 0, 0]],
    ['mysql', [0, 0, 0.77, 0.638, 0]],
    ['kubernetes', [0, 0, 0, 0, 1]],
  ]);

  const result = matchSkillsAgainstJd({
    jdText,
    resumeSkills,
    jdSkills,
    embeddingsBySkill: embeddings,
  });

  assert.equal(result.usedEmbeddings, true);
  assert.equal(result.matched.length, 1);
  assert.equal(result.matched[0].jdSkill, 'React');
  assert.equal(result.matched[0].matchMethod, 'exact_normalized');

  assert.equal(result.partial.length, 2);
  assert.equal(result.partial[0].jdSkill, 'REST API');
  assert.equal(result.partial[0].matchedResumeSkill, 'API Design');
  assert.equal(result.partial[0].matchMethod, 'semantic_embedding');
  assert.equal(result.partial[0].reviewRequired, true);
  assert.equal(result.partial[1].jdSkill, 'PostgreSQL');
  assert.equal(result.partial[1].matchedResumeSkill, 'MySQL');

  assert.equal(result.missing.length, 1);
  assert.equal(result.missing[0].jdSkill, 'Kubernetes');
});

test('V-12 embeddings: sends explicit Content[] per skill, recovers from batch mismatch, and reports controlled failure fallback cleanly', async () => {
  // 1. Successful batch call with explicit Content[] shape
  let capturedContentsLength = 0;
  let capturedHasParts = false;
  const successRes = await embedSkillNames(['React', 'PostgreSQL', 'Docker'], {
    embedFn: async ({ contents }) => {
      capturedContentsLength = contents.length;
      capturedHasParts = contents.every(
        (c) => c.role === 'user' && Array.isArray(c.parts) && typeof c.parts[0]?.text === 'string'
      );
      return {
        embeddings: contents.map((_, idx) => ({ values: [idx + 1, 0.5, 0.25] })),
      };
    },
  });

  assert.equal(capturedContentsLength, 3);
  assert.equal(capturedHasParts, true);
  assert.equal(successRes.status, 'succeeded');
  assert.equal(successRes.embeddedCount, 3);
  assert.equal(successRes.requestedCount, 3);
  assert.equal(successRes.fallbackReason, null);
  assert.equal(successRes.vectors.size, 3);

  // 2. Batch returns only 1 merged vector -> recovers via per-item embedding calls
  const recoveryRes = await embedSkillNames(['React', 'Docker'], {
    embedFn: async ({ contents }) => {
      if (contents.length > 1) {
        return { embeddings: [{ values: [0.1, 0.2] }] }; // mismatch!
      }
      const label = contents[0].parts[0].text;
      return {
        embeddings: [{ values: label === 'React' ? [1, 0] : [0, 1] }],
      };
    },
  });
  assert.equal(recoveryRes.status, 'succeeded');
  assert.equal(recoveryRes.embeddedCount, 2);

  // 3. Controlled provider failure -> returns explicit fallback status & reason without crashing
  const failureRes = await embedSkillNames(['React', 'Docker'], {
    embedFn: async () => {
      throw new Error('503 Service Unavailable: embedding backend down');
    },
  });
  assert.equal(failureRes.status, 'fallback');
  assert.equal(failureRes.embeddedCount, 0);
  assert.equal(failureRes.vectors.size, 0);
  assert.ok(failureRes.fallbackReason?.includes('503 Service Unavailable'));
});

test('scoring engine calculates transparent weighted compatibility score without LLM invention', () => {
  const jdText =
    'Seeking Senior Engineer with React, TypeScript, Docker, and AWS. 5+ years experience. BS in Computer Science.';
  const resumeSkills: ExtractedSkillItem[] = [
    { rawName: 'React', canonicalName: 'React', category: 'framework' },
    { rawName: 'TypeScript', canonicalName: 'TypeScript', category: 'programming_language' },
    { rawName: 'Communication', canonicalName: 'Communication', category: 'soft_skill' },
  ];
  const jdSkills: ExtractedSkillItem[] = [
    { rawName: 'React', canonicalName: 'React', category: 'framework', importance: 'required' },
    { rawName: 'TypeScript', canonicalName: 'TypeScript', category: 'programming_language', importance: 'required' },
    { rawName: 'Docker', canonicalName: 'Docker', category: 'cloud', importance: 'required' },
    { rawName: 'AWS', canonicalName: 'AWS', category: 'cloud', importance: 'required' },
    { rawName: 'Communication', canonicalName: 'Communication', category: 'soft_skill', importance: 'required' },
  ];

  const matchResult = matchSkillsAgainstJd({ jdText, resumeSkills, jdSkills });
  const allMatches = [...matchResult.matched, ...matchResult.partial, ...matchResult.missing];

  const { scoreBreakdown, experienceAlignment } = calculateCompatibilityScore({
    allSkillMatches: allMatches,
    resumeExperience: {
      estimatedYears: 5,
      seniorityLevel: 'Senior',
      domains: ['Web Development'],
      summary: '5 years web engineering',
    },
    jdExperience: {
      estimatedYears: 5,
      seniorityLevel: 'Senior',
      domains: ['Web Development'],
      summary: '5+ years senior web engineer',
    },
    resumeQualifications: ['B.S. Computer Science'],
    jdQualifications: ['Bachelor of Science in Computer Science'],
    resumeCertifications: [],
    jdCertifications: [],
  });

  // Technical: 2/4 = 50% (weight 0.55) -> 27.5
  // Soft: 1/1 = 100% (weight 0.15) -> 15.0
  // Qualifications: 1/1 = 100% (weight 0.12) -> 12.0
  // Experience: 97% (in-domain + 50% technical skill overlap -> relevanceFactor 0.95) (weight 0.18) -> 17.5
  // Total = 72.0 -> 72%
  assert.equal(scoreBreakdown.overallScore, 72);
  assert.equal(scoreBreakdown.pillars.length, 4);
  assert.equal(experienceAlignment.matchedQualifications.length, 1);
  assert.equal(experienceAlignment.relevanceFactor, 0.95);
  assert.ok(scoreBreakdown.summaryFormula.includes('= 72%'));
});

test('V-02 + V-20 7-case regression dataset (Cases A–G)', () => {
  // Case A: Java developer vs JavaScript developer
  {
    const resumeSkills = normalizeAndDeduplicateSkills([
      { rawName: 'Java', category: 'programming_language' },
      { rawName: 'Spring Boot', category: 'framework' },
      { rawName: 'Hibernate', category: 'library' },
      { rawName: 'Oracle', category: 'database' },
      { rawName: 'Maven', category: 'dev_tool' },
      { rawName: 'JUnit', category: 'dev_tool' },
    ]);
    const jdSkills = normalizeAndDeduplicateSkills([
      { rawName: 'JavaScript', category: 'programming_language', importance: 'required' },
      { rawName: 'TypeScript', category: 'programming_language', importance: 'required' },
      { rawName: 'Node.js', category: 'framework', importance: 'required' },
      { rawName: 'React', category: 'framework', importance: 'required' },
      { rawName: 'Express.js', category: 'framework', importance: 'required' },
      { rawName: 'MongoDB', category: 'database', importance: 'preferred' },
    ]);
    const m = matchSkillsAgainstJd({
      jdText: 'Seeking Senior JavaScript Developer with JavaScript, TypeScript, Node.js, React, Express.js, MongoDB.',
      resumeSkills,
      jdSkills,
    });
    const s = calculateCompatibilityScore({
      allSkillMatches: [...m.matched, ...m.partial, ...m.missing],
      resumeExperience: { estimatedYears: 5, seniorityLevel: 'Senior', domains: ['Enterprise Java Backend'], summary: '5 years Java Spring Boot backend systems' },
      jdExperience: { estimatedYears: 4, seniorityLevel: 'Senior', domains: ['Frontend & Full-Stack Web Development'], summary: '4+ years JavaScript web application engineering' },
      resumeQualifications: ['B.S. Computer Science'],
      jdQualifications: ['Bachelor of Science in Computer Science'],
      resumeCertifications: [],
      jdCertifications: [],
    });
    assert.equal(m.matched.length, 0);
    assert.equal(m.partial.length, 0);
    assert.equal(s.experienceAlignment.relevanceFactor, 0);
    assert.ok(s.scoreBreakdown.overallScore <= 20);
  }

  // Case B: React developer vs React Native developer
  {
    const resumeSkills = normalizeAndDeduplicateSkills([
      { rawName: 'React', category: 'framework' },
      { rawName: 'TypeScript', category: 'programming_language' },
      { rawName: 'Tailwind CSS', category: 'framework' },
      { rawName: 'Next.js', category: 'framework' },
      { rawName: 'Redux', category: 'library' },
    ]);
    const jdSkills = normalizeAndDeduplicateSkills([
      { rawName: 'React Native', category: 'framework', importance: 'required' },
      { rawName: 'TypeScript', category: 'programming_language', importance: 'required' },
      { rawName: 'iOS', category: 'technical_skill', importance: 'required' },
      { rawName: 'Android', category: 'technical_skill', importance: 'required' },
      { rawName: 'Redux', category: 'library', importance: 'required' },
      { rawName: 'Xcode', category: 'dev_tool', importance: 'preferred' },
    ]);
    const m = matchSkillsAgainstJd({
      jdText: 'Hiring Mobile Engineer: React Native, TypeScript, iOS, Android, Redux, Xcode.',
      resumeSkills,
      jdSkills,
    });
    const s = calculateCompatibilityScore({
      allSkillMatches: [...m.matched, ...m.partial, ...m.missing],
      resumeExperience: { estimatedYears: 4, seniorityLevel: 'Mid-Level', domains: ['Web Frontend'], summary: '4 years React web SPA development' },
      jdExperience: { estimatedYears: 3, seniorityLevel: 'Mid-Level', domains: ['Mobile App Development'], summary: '3+ years cross-platform mobile engineering' },
      resumeQualifications: [],
      jdQualifications: [],
      resumeCertifications: [],
      jdCertifications: [],
    });
    assert.ok(!m.matched.some((x) => x.jdSkill === 'React Native'));
    assert.ok(m.missing.some((x) => x.jdSkill === 'React Native'));
    assert.ok((s.experienceAlignment.relevanceFactor ?? 1) < 0.5);
    assert.ok(s.scoreBreakdown.overallScore < 40);
  }

  // Case C: Python developer vs PyTorch ML engineer
  {
    const resumeSkills = normalizeAndDeduplicateSkills([
      { rawName: 'Python', category: 'programming_language' },
      { rawName: 'Django', category: 'framework' },
      { rawName: 'PostgreSQL', category: 'database' },
      { rawName: 'Docker', category: 'cloud' },
    ]);
    const jdSkills = normalizeAndDeduplicateSkills([
      { rawName: 'PyTorch', category: 'library', importance: 'required' },
      { rawName: 'Deep Learning', category: 'technical_skill', importance: 'required' },
      { rawName: 'CUDA', category: 'technical_skill', importance: 'required' },
      { rawName: 'Python', category: 'programming_language', importance: 'required' },
      { rawName: 'MLOps', category: 'technical_skill', importance: 'required' },
      { rawName: 'Transformers', category: 'library', importance: 'preferred' },
      { rawName: 'Docker', category: 'cloud', importance: 'preferred' },
    ]);
    const m = matchSkillsAgainstJd({
      jdText: 'ML Engineer needed: PyTorch, Deep Learning, CUDA, Python, MLOps, Transformers, Docker.',
      resumeSkills,
      jdSkills,
    });
    const s = calculateCompatibilityScore({
      allSkillMatches: [...m.matched, ...m.partial, ...m.missing],
      resumeExperience: { estimatedYears: 4, seniorityLevel: 'Mid-Level', domains: ['Web Backend'], summary: '4 years Python Django web APIs' },
      jdExperience: { estimatedYears: 3, seniorityLevel: 'Mid-Level', domains: ['Machine Learning Engineering'], summary: '3+ years deep learning model training and inference' },
      resumeQualifications: ['B.S. Computer Science'],
      jdQualifications: ['B.S. Computer Science or related field'],
      resumeCertifications: [],
      jdCertifications: [],
    });
    assert.ok(m.missing.some((x) => x.jdSkill === 'PyTorch'));
    assert.ok((s.experienceAlignment.relevanceFactor ?? 1) <= 0.35);
    assert.ok(s.scoreBreakdown.overallScore <= 38);
  }

  // Case D: Culinary Pastry Chef vs Embedded Rust Firmware -> MUST score 0%
  {
    const resumeSkills = normalizeAndDeduplicateSkills([
      { rawName: 'Pastry Arts', category: 'technical_skill' },
      { rawName: 'Menu Planning', category: 'technical_skill' },
      { rawName: 'Food Safety', category: 'technical_skill' },
    ]);
    const jdSkills = normalizeAndDeduplicateSkills([
      { rawName: 'Rust', category: 'programming_language', importance: 'required' },
      { rawName: 'C', category: 'programming_language', importance: 'required' },
      { rawName: 'RTOS', category: 'technical_skill', importance: 'required' },
      { rawName: 'ARM Cortex-M', category: 'technical_skill', importance: 'required' },
      { rawName: 'SPI', category: 'technical_skill', importance: 'required' },
      { rawName: 'I2C', category: 'technical_skill', importance: 'required' },
      { rawName: 'JTAG', category: 'dev_tool', importance: 'preferred' },
    ]);
    const m = matchSkillsAgainstJd({
      jdText: 'Senior Embedded Rust Firmware Engineer: Rust, C, RTOS, ARM Cortex-M, SPI, I2C, JTAG.',
      resumeSkills,
      jdSkills,
    });
    const s = calculateCompatibilityScore({
      allSkillMatches: [...m.matched, ...m.partial, ...m.missing],
      resumeExperience: { estimatedYears: 8, seniorityLevel: 'Senior', domains: ['Culinary Arts', 'Hospitality'], summary: '8 years head pastry chef managing bakery operations' },
      jdExperience: { estimatedYears: 5, seniorityLevel: 'Senior', domains: ['Embedded Systems', 'Firmware Engineering'], summary: '5+ years bare-metal and RTOS firmware development' },
      resumeQualifications: ['Diploma in Culinary Arts'],
      jdQualifications: ['Bachelor of Science in Electrical Engineering'],
      resumeCertifications: [],
      jdCertifications: [],
      resumeJobTitle: 'Head Pastry Chef',
      jdJobTitle: 'Senior Embedded Rust Firmware Engineer',
    });
    assert.equal(jdSkills.length, 7); // C is preserved!
    assert.equal(m.matched.length, 0);
    assert.equal(m.partial.length, 0);
    assert.equal(m.missing.length, 7);
    assert.equal(s.experienceAlignment.relevanceFactor, 0);
    assert.equal(s.experienceAlignment.relevantYearsEstimate, 0);
    assert.equal(s.scoreBreakdown.overallScore, 0);
  }

  // Case E: High-match Data Engineer vs Data Engineer JD
  {
    const resumeSkills = normalizeAndDeduplicateSkills([
      { rawName: 'Python3', category: 'programming_language' },
      { rawName: 'SQL', category: 'programming_language' },
      { rawName: 'PySpark', category: 'library' },
      { rawName: 'Airflow', category: 'dev_tool' },
      { rawName: 'Snowflake', category: 'database' },
      { rawName: 'Amazon Web Services', category: 'cloud' },
      { rawName: 'dbt', category: 'dev_tool' },
      { rawName: 'Communication', category: 'soft_skill' },
    ]);
    const jdSkills = normalizeAndDeduplicateSkills([
      { rawName: 'Python', category: 'programming_language', importance: 'required' },
      { rawName: 'SQL', category: 'programming_language', importance: 'required' },
      { rawName: 'Apache Spark', category: 'library', importance: 'required' },
      { rawName: 'Apache Airflow', category: 'dev_tool', importance: 'required' },
      { rawName: 'Snowflake', category: 'database', importance: 'required' },
      { rawName: 'AWS', category: 'cloud', importance: 'required' },
      { rawName: 'dbt', category: 'dev_tool', importance: 'preferred' },
      { rawName: 'Communication', category: 'soft_skill', importance: 'required' },
    ]);
    const m = matchSkillsAgainstJd({
      jdText: 'Senior Data Engineer: Python, SQL, Apache Spark, Apache Airflow, Snowflake, AWS, dbt, Communication.',
      resumeSkills,
      jdSkills,
    });
    const s = calculateCompatibilityScore({
      allSkillMatches: [...m.matched, ...m.partial, ...m.missing],
      resumeExperience: { estimatedYears: 6, seniorityLevel: 'Senior', domains: ['Data Engineering', 'Cloud Data Warehousing'], summary: '6 years ETL pipelines with Spark, Airflow, Snowflake on AWS' },
      jdExperience: { estimatedYears: 5, seniorityLevel: 'Senior', domains: ['Data Engineering', 'Cloud Data Warehousing'], summary: '5+ years scalable data pipelines and cloud data warehouses' },
      resumeQualifications: ['B.S. Computer Science'],
      jdQualifications: ['Bachelor of Science in Computer Science'],
      resumeCertifications: [],
      jdCertifications: [],
    });
    assert.equal(m.matched.length, 8);
    assert.equal(s.scoreBreakdown.overallScore, 100);
  }

  // Case F: QA Engineer vs QA Engineer JD
  {
    const resumeSkills = normalizeAndDeduplicateSkills([
      { rawName: 'Playwright', category: 'dev_tool' },
      { rawName: 'Selenium', category: 'dev_tool' },
      { rawName: 'TS', category: 'programming_language' },
      { rawName: 'GitHub Actions', category: 'cloud' },
      { rawName: 'Jira', category: 'dev_tool' },
      { rawName: 'RESTful API', category: 'technical_skill' },
      { rawName: 'Agile/Scrum', category: 'technical_skill' },
    ]);
    const jdSkills = normalizeAndDeduplicateSkills([
      { rawName: 'Playwright', category: 'dev_tool', importance: 'required' },
      { rawName: 'Selenium', category: 'dev_tool', importance: 'required' },
      { rawName: 'TypeScript', category: 'programming_language', importance: 'required' },
      { rawName: 'CI/CD', category: 'cloud', importance: 'required' },
      { rawName: 'Jira', category: 'dev_tool', importance: 'required' },
      { rawName: 'REST API', category: 'technical_skill', importance: 'required' },
      { rawName: 'Agile Methodology', category: 'technical_skill', importance: 'preferred' },
    ]);
    const m = matchSkillsAgainstJd({
      jdText: 'QA Automation Engineer: Playwright, Selenium, TypeScript, CI/CD, Jira, REST API, Agile Methodology.',
      resumeSkills,
      jdSkills,
    });
    const s = calculateCompatibilityScore({
      allSkillMatches: [...m.matched, ...m.partial, ...m.missing],
      resumeExperience: { estimatedYears: 4, seniorityLevel: 'Mid-Level', domains: ['Quality Assurance', 'Test Automation'], summary: '4 years end-to-end and API test automation' },
      jdExperience: { estimatedYears: 3, seniorityLevel: 'Mid-Level', domains: ['Quality Assurance', 'Test Automation'], summary: '3+ years software QA automation engineering' },
      resumeQualifications: [],
      jdQualifications: [],
      resumeCertifications: [],
      jdCertifications: [],
    });
    assert.equal(m.matched.length, 6);
    assert.equal(m.partial.length, 1);
    assert.ok(s.scoreBreakdown.overallScore >= 90);
  }

  // Case G: Transferable stack with no exact technology match -> fair moderate credit, no fake exact matches
  {
    const resumeSkills = normalizeAndDeduplicateSkills([
      { rawName: 'AWS', category: 'cloud' },
      { rawName: 'MySQL', category: 'database' },
      { rawName: 'GitLab CI/CD', category: 'cloud' },
      { rawName: 'Django', category: 'framework' },
      { rawName: 'Docker', category: 'cloud' },
      { rawName: 'REST API', category: 'technical_skill' },
    ]);
    const jdSkills = normalizeAndDeduplicateSkills([
      { rawName: 'Google Cloud Platform', category: 'cloud', importance: 'required' },
      { rawName: 'PostgreSQL', category: 'database', importance: 'required' },
      { rawName: 'GitHub Actions', category: 'cloud', importance: 'required' },
      { rawName: 'FastAPI', category: 'framework', importance: 'required' },
      { rawName: 'Kubernetes', category: 'cloud', importance: 'required' },
      { rawName: 'GraphQL', category: 'technical_skill', importance: 'preferred' },
    ]);
    const m = matchSkillsAgainstJd({
      jdText: 'Backend Platform Engineer: Google Cloud Platform, PostgreSQL, GitHub Actions, FastAPI, Kubernetes, GraphQL.',
      resumeSkills,
      jdSkills,
    });
    const s = calculateCompatibilityScore({
      allSkillMatches: [...m.matched, ...m.partial, ...m.missing],
      resumeExperience: { estimatedYears: 5, seniorityLevel: 'Senior', domains: ['Cloud Backend Systems'], summary: '5 years building containerized backend services on AWS and MySQL' },
      jdExperience: { estimatedYears: 4, seniorityLevel: 'Mid-Level', domains: ['Cloud Backend Systems'], summary: '4+ years designing cloud backend platforms' },
      resumeQualifications: [],
      jdQualifications: [],
      resumeCertifications: [],
      jdCertifications: [],
    });
    assert.equal(m.matched.length, 0);
    assert.equal(m.partial.length, 6);
    assert.ok(m.partial.every((p) => p.reviewRequired === true));
    assert.ok((s.experienceAlignment.relevanceFactor ?? 0) >= 0.75);
    assert.ok((s.experienceAlignment.relevanceFactor ?? 1) <= 0.85);
    assert.ok(s.scoreBreakdown.overallScore >= 55 && s.scoreBreakdown.overallScore <= 65);
  }
});
