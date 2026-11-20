import test from 'node:test';
import assert from 'node:assert/strict';
import { cosineSimilarity, matchSkillsAgainstJd } from './matchingEngine.ts';
import { calculateCompatibilityScore } from './scoringEngine.ts';
import { findVerifiedJdEvidence } from './evidenceEngine.ts';
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

test('matching engine classifies exact, semantic embedding, partial, and missing skills', () => {
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

  // Provide deterministic 5D unit-test embeddings:
  // REST API <-> API Design = ~0.96 (matched semantic)
  // PostgreSQL <-> MySQL = 0.70 (partial semantic)
  // Kubernetes <-> all = 0.0 (missing)
  const embeddings = new Map<string, number[]>([
    ['react', [1, 0, 0, 0, 0]],
    ['rest api', [0, 0.9, 0.435, 0, 0]],
    ['api design', [0, 0.98, 0.19, 0, 0]],
    ['postgresql', [0, 0, 1, 0, 0]],
    ['mysql', [0, 0, 0.7, 0.714, 0]],
    ['kubernetes', [0, 0, 0, 0, 1]],
  ]);

  const result = matchSkillsAgainstJd({
    jdText,
    resumeSkills,
    jdSkills,
    embeddingsBySkill: embeddings,
  });

  assert.equal(result.usedEmbeddings, true);
  assert.equal(result.matched.length, 2);
  assert.equal(result.partial.length, 1);
  assert.equal(result.missing.length, 1);
  assert.equal(result.partial[0].jdSkill, 'PostgreSQL');
  assert.equal(result.partial[0].matchedResumeSkill, 'MySQL');
  assert.equal(result.missing[0].jdSkill, 'Kubernetes');
});

test('scoring engine calculates transparent weighted compatibility score without LLM invention', () => {
  const jdText = 'Seeking Senior Engineer with React, TypeScript, Docker, and AWS. 5+ years experience. BS in Computer Science.';
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
  // Experience: 100% (weight 0.18) -> 18.0
  // Total = 72.5 -> 73%
  assert.equal(scoreBreakdown.overallScore, 73);
  assert.equal(scoreBreakdown.pillars.length, 4);
  assert.equal(experienceAlignment.matchedQualifications.length, 1);
  assert.ok(scoreBreakdown.summaryFormula.includes('= 73%'));
});
