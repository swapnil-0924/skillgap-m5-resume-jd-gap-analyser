import test from 'node:test';
import assert from 'node:assert/strict';
import {
  areCanonicalSynonyms,
  normalizeAndDeduplicateSkills,
  normalizeSkillName,
} from './skillTaxonomy.ts';

test('normalizes equivalent technology aliases to canonical names', () => {
  assert.equal(normalizeSkillName('ReactJS'), 'React');
  assert.equal(normalizeSkillName('React.js'), 'React');
  assert.equal(normalizeSkillName('react'), 'React');
  assert.equal(normalizeSkillName('JS'), 'JavaScript');
  assert.equal(normalizeSkillName('Python3'), 'Python');
  assert.equal(normalizeSkillName('PostgreSQL Database'), 'PostgreSQL');
  assert.equal(normalizeSkillName('Postgres'), 'PostgreSQL');
  assert.equal(normalizeSkillName('Node'), 'Node.js');
  assert.equal(normalizeSkillName('RESTful Web Services'), 'REST API');
  assert.equal(normalizeSkillName('REST API Development'), 'REST API');
  assert.equal(normalizeSkillName('K8s'), 'Kubernetes');
  assert.equal(normalizeSkillName('dbt'), 'dbt');
});

test('keeps distinct similarly named technologies strictly separate', () => {
  assert.equal(normalizeSkillName('Java'), 'Java');
  assert.equal(normalizeSkillName('JavaScript'), 'JavaScript');
  assert.equal(areCanonicalSynonyms('Java', 'JavaScript'), false);

  assert.equal(normalizeSkillName('React'), 'React');
  assert.equal(normalizeSkillName('React Native'), 'React Native');
  assert.equal(areCanonicalSynonyms('React', 'React Native'), false);
  assert.equal(areCanonicalSynonyms('React.js', 'React'), true);

  assert.equal(areCanonicalSynonyms('PostgreSQL', 'SQL'), false);
  assert.equal(areCanonicalSynonyms('Python', 'PyTorch'), false);
  assert.equal(areCanonicalSynonyms('C', 'C++'), false);
  assert.equal(areCanonicalSynonyms('C', 'C#'), false);
});

test('preserves valid single-character languages (C, R) while rejecting stray single characters', () => {
  const result = normalizeAndDeduplicateSkills([
    { rawName: 'C', category: 'programming_language', importance: 'required' },
    { rawName: 'R', category: 'programming_language', importance: 'preferred' },
    { rawName: 'X', category: 'technical_skill', importance: 'preferred' },
    { rawName: 'Rust', category: 'programming_language', importance: 'required' },
  ]);

  const names = result.map((s) => s.canonicalName);
  assert.deepEqual(names, ['C', 'R', 'Rust']);
});

test('preserves unseen domain skills cleanly without dropping them', () => {
  assert.equal(normalizeSkillName('clinical trial auditing'), 'Clinical Trial Auditing');
  assert.equal(normalizeSkillName('SAP S/4HANA'), 'SAP S/4HANA');
});

test('deduplicates equivalent skills and preserves strongest importance & evidence', () => {
  const result = normalizeAndDeduplicateSkills([
    { rawName: 'ReactJS', category: 'framework', importance: 'preferred' },
    {
      rawName: 'React.js',
      category: 'framework',
      importance: 'required',
      evidenceQuote: '3+ years building UIs with React.js',
    },
    { rawName: 'JS', category: 'programming_language', importance: 'required' },
    { rawName: 'JavaScript', category: 'programming_language', importance: 'preferred' },
  ]);

  assert.equal(result.length, 2);
  const react = result.find((s) => s.canonicalName === 'React');
  assert.ok(react);
  assert.equal(react.importance, 'required');
  assert.equal(react.evidenceQuote, '3+ years building UIs with React.js');
});
