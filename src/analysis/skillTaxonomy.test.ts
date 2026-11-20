import test from 'node:test';
import assert from 'node:assert/strict';
import {
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
  assert.equal(normalizeSkillName('Node'), 'Node.js');
  assert.equal(normalizeSkillName('RESTful Web Services'), 'REST API');
  assert.equal(normalizeSkillName('REST API Development'), 'REST API');
  assert.equal(normalizeSkillName('K8s'), 'Kubernetes');
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
