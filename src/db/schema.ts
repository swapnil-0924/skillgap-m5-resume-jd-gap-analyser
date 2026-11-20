import { relations } from 'drizzle-orm';
import { integer, jsonb, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
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

export const usersRelations = relations(users, ({ many }) => ({
  analyses: many(analyses),
}));

export const analysesRelations = relations(analyses, ({ one }) => ({
  user: one(users, {
    fields: [analyses.userId],
    references: [users.id],
  }),
}));
