import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import type {
  CompatibilityScoreBreakdown,
  DocumentExtractionMeta,
  ExperienceAlignment,
  ExtractedSkillItem,
  LearningDayPlan,
  SkillMatchResult,
} from '../types/analysis.ts';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const analyses = pgTable('analyses', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  resumeFilename: text('resume_filename').notNull(),
  jobTitle: text('job_title').notNull(),
  companyName: text('company_name'),
  jdSourceName: text('jd_source_name').notNull(),
  jdText: text('jd_text').notNull(),
  resumeTextExcerpt: text('resume_text_excerpt').notNull(),
  extractionMeta: jsonb('extraction_meta').$type<DocumentExtractionMeta>().notNull(),
  compatibilityScore: integer('compatibility_score').notNull(),
  scoreBreakdown: jsonb('score_breakdown').$type<CompatibilityScoreBreakdown>().notNull(),
  matchedSkills: jsonb('matched_skills').$type<SkillMatchResult[]>().notNull(),
  partialSkills: jsonb('partial_skills').$type<SkillMatchResult[]>().notNull(),
  missingSkills: jsonb('missing_skills').$type<SkillMatchResult[]>().notNull(),
  resumeSkills: jsonb('resume_skills').$type<ExtractedSkillItem[]>().notNull(),
  jdSkills: jsonb('jd_skills').$type<ExtractedSkillItem[]>().notNull(),
  experienceAlignment: jsonb('experience_alignment').$type<ExperienceAlignment>().notNull(),
  learningPlan: jsonb('learning_plan').$type<LearningDayPlan[]>().notNull(),
  completedDays: jsonb('completed_days').$type<number[]>().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============================================================================
// Permanent QA Testing & Security Audit Tables (Phase 5)
// Stores only sanitized test telemetry — NEVER real resumes, PII, or API keys.
// ============================================================================

export const testRuns = pgTable(
  'test_runs',
  {
    id: serial('id').primaryKey(),
    runType: text('run_type').notNull(),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
    totalTests: integer('total_tests').default(0).notNull(),
    passed: integer('passed').default(0).notNull(),
    failed: integer('failed').default(0).notNull(),
    blocked: integer('blocked').default(0).notNull(),
    skipped: integer('skipped').default(0).notNull(),
    overallStatus: text('overall_status').notNull(),
    applicationVersion: text('application_version').notNull(),
    commitHash: text('commit_hash'),
  },
  (table) => [
    index('idx_test_runs_started_at').on(table.startedAt),
    index('idx_test_runs_run_type_status').on(table.runType, table.overallStatus),
    check(
      'chk_test_runs_counts_non_negative',
      sql`${table.totalTests} >= 0 AND ${table.passed} >= 0 AND ${table.failed} >= 0 AND ${table.blocked} >= 0 AND ${table.skipped} >= 0`
    ),
  ]
);

export const testCases = pgTable(
  'test_cases',
  {
    id: serial('id').primaryKey(),
    testName: text('test_name').notNull().unique(),
    category: text('category').notNull(),
    description: text('description').notNull(),
    enabled: boolean('enabled').default(true).notNull(),
  },
  (table) => [index('idx_test_cases_category').on(table.category)]
);

export const testResults = pgTable(
  'test_results',
  {
    id: serial('id').primaryKey(),
    runId: integer('run_id')
      .references(() => testRuns.id, { onDelete: 'cascade' })
      .notNull(),
    testCaseId: integer('test_case_id')
      .references(() => testCases.id, { onDelete: 'cascade' })
      .notNull(),
    status: text('status').notNull(),
    durationMs: integer('duration_ms').default(0).notNull(),
    errorSummary: text('error_summary'),
    executionDetails: jsonb('execution_details').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_test_results_run_id').on(table.runId),
    index('idx_test_results_test_case_id').on(table.testCaseId),
    index('idx_test_results_status').on(table.status),
    check('chk_test_results_duration_non_negative', sql`${table.durationMs} >= 0`),
  ]
);

export const securityAudits = pgTable(
  'security_audits',
  {
    id: serial('id').primaryKey(),
    runId: integer('run_id')
      .references(() => testRuns.id, { onDelete: 'cascade' })
      .notNull(),
    auditType: text('audit_type').notNull(),
    overallStatus: text('overall_status').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_security_audits_run_id').on(table.runId),
    index('idx_security_audits_created_at').on(table.createdAt),
  ]
);

export const securityFindings = pgTable(
  'security_findings',
  {
    id: serial('id').primaryKey(),
    auditId: integer('audit_id')
      .references(() => securityAudits.id, { onDelete: 'cascade' })
      .notNull(),
    findingCode: text('finding_code').notNull(),
    title: text('title').notNull(),
    severity: text('severity').notNull(),
    status: text('status').notNull(),
    description: text('description').notNull(),
    remediation: text('remediation').notNull(),
    verifiedAt: timestamp('verified_at'),
  },
  (table) => [
    index('idx_security_findings_audit_id').on(table.auditId),
    index('idx_security_findings_severity_status').on(table.severity, table.status),
  ]
);

export const usersRelations = relations(users, ({ many }) => ({
  analyses: many(analyses),
}));

export const analysesRelations = relations(analyses, ({ one }) => ({
  user: one(users, {
    fields: [analyses.userId],
    references: [users.id],
  }),
}));

export const testRunsRelations = relations(testRuns, ({ many }) => ({
  results: many(testResults),
  securityAudits: many(securityAudits),
}));

export const testCasesRelations = relations(testCases, ({ many }) => ({
  results: many(testResults),
}));

export const testResultsRelations = relations(testResults, ({ one }) => ({
  run: one(testRuns, {
    fields: [testResults.runId],
    references: [testRuns.id],
  }),
  testCase: one(testCases, {
    fields: [testResults.testCaseId],
    references: [testCases.id],
  }),
}));

export const securityAuditsRelations = relations(securityAudits, ({ one, many }) => ({
  run: one(testRuns, {
    fields: [securityAudits.runId],
    references: [testRuns.id],
  }),
  findings: many(securityFindings),
}));

export const securityFindingsRelations = relations(securityFindings, ({ one }) => ({
  audit: one(securityAudits, {
    fields: [securityFindings.auditId],
    references: [securityAudits.id],
  }),
}));
