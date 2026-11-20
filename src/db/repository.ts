import { and, desc, eq } from 'drizzle-orm';
import { db } from './index.ts';
import { analyses, users } from './schema.ts';
import type { AnalysisHistoryItem, AnalysisReport } from '../types/analysis.ts';

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string | null
) {
  try {
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName: displayName ?? null,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          displayName: displayName ?? null,
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed in getOrCreateUser:', error);
    throw new Error('Unable to synchronize user account.', { cause: error });
  }
}

export interface CreateAnalysisInput {
  userId: number;
  resumeFilename: string;
  jobTitle: string;
  companyName: string | null;
  jdSourceName: string;
  jdText: string;
  resumeTextExcerpt: string;
  extractionMeta: AnalysisReport['extractionMeta'];
  compatibilityScore: number;
  scoreBreakdown: AnalysisReport['scoreBreakdown'];
  matchedSkills: AnalysisReport['matchedSkills'];
  partialSkills: AnalysisReport['partialSkills'];
  missingSkills: AnalysisReport['missingSkills'];
  resumeSkills: AnalysisReport['resumeSkills'];
  jdSkills: AnalysisReport['jdSkills'];
  experienceAlignment: AnalysisReport['experienceAlignment'];
  learningPlan: AnalysisReport['learningPlan'];
  completedDays?: number[];
}

function mapRowToReport(row: typeof analyses.$inferSelect): AnalysisReport {
  return {
    id: row.id,
    saved: true,
    resumeFilename: row.resumeFilename,
    jobTitle: row.jobTitle,
    companyName: row.companyName,
    jdSourceName: row.jdSourceName,
    jdText: row.jdText,
    resumeTextExcerpt: row.resumeTextExcerpt,
    extractionMeta: row.extractionMeta,
    compatibilityScore: row.compatibilityScore,
    scoreBreakdown: row.scoreBreakdown,
    matchedSkills: row.matchedSkills,
    partialSkills: row.partialSkills,
    missingSkills: row.missingSkills,
    resumeSkills: row.resumeSkills,
    jdSkills: row.jdSkills,
    experienceAlignment: row.experienceAlignment,
    learningPlan: row.learningPlan,
    completedDays: Array.isArray(row.completedDays) ? row.completedDays : [],
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createAnalysisRecord(
  input: CreateAnalysisInput
): Promise<AnalysisReport> {
  try {
    const inserted = await db
      .insert(analyses)
      .values({
        userId: input.userId,
        resumeFilename: input.resumeFilename,
        jobTitle: input.jobTitle,
        companyName: input.companyName,
        jdSourceName: input.jdSourceName,
        jdText: input.jdText,
        resumeTextExcerpt: input.resumeTextExcerpt,
        extractionMeta: input.extractionMeta,
        compatibilityScore: input.compatibilityScore,
        scoreBreakdown: input.scoreBreakdown,
        matchedSkills: input.matchedSkills,
        partialSkills: input.partialSkills,
        missingSkills: input.missingSkills,
        resumeSkills: input.resumeSkills,
        jdSkills: input.jdSkills,
        experienceAlignment: input.experienceAlignment,
        learningPlan: input.learningPlan,
        completedDays: input.completedDays ?? [],
      })
      .returning();

    return mapRowToReport(inserted[0]);
  } catch (error) {
    console.error('Database query failed in createAnalysisRecord:', error);
    throw new Error('Failed to save analysis report.', { cause: error });
  }
}

export async function listAnalysesByUser(
  userId: number
): Promise<AnalysisHistoryItem[]> {
  try {
    const rows = await db
      .select()
      .from(analyses)
      .where(eq(analyses.userId, userId))
      .orderBy(desc(analyses.createdAt));

    return rows.map((row) => ({
      id: row.id,
      resumeFilename: row.resumeFilename,
      jobTitle: row.jobTitle,
      companyName: row.companyName,
      jdSourceName: row.jdSourceName,
      compatibilityScore: row.compatibilityScore,
      matchedCount: Array.isArray(row.matchedSkills) ? row.matchedSkills.length : 0,
      partialCount: Array.isArray(row.partialSkills) ? row.partialSkills.length : 0,
      missingCount: Array.isArray(row.missingSkills) ? row.missingSkills.length : 0,
      completedDaysCount: Array.isArray(row.completedDays) ? row.completedDays.length : 0,
      createdAt: row.createdAt.toISOString(),
    }));
  } catch (error) {
    console.error('Database query failed in listAnalysesByUser:', error);
    throw new Error('Failed to retrieve analysis history.', { cause: error });
  }
}

export async function getAnalysisByIdForUser(
  id: number,
  userId: number
): Promise<AnalysisReport | null> {
  try {
    const rows = await db
      .select()
      .from(analyses)
      .where(and(eq(analyses.id, id), eq(analyses.userId, userId)))
      .limit(1);

    if (!rows.length) {
      return null;
    }
    return mapRowToReport(rows[0]);
  } catch (error) {
    console.error('Database query failed in getAnalysisByIdForUser:', error);
    throw new Error('Failed to load analysis report.', { cause: error });
  }
}

export async function deleteAnalysisByIdForUser(
  id: number,
  userId: number
): Promise<boolean> {
  try {
    const deleted = await db
      .delete(analyses)
      .where(and(eq(analyses.id, id), eq(analyses.userId, userId)))
      .returning({ id: analyses.id });

    return deleted.length > 0;
  } catch (error) {
    console.error('Database query failed in deleteAnalysisByIdForUser:', error);
    throw new Error('Failed to delete analysis report.', { cause: error });
  }
}

export async function updateCompletedDaysForUser(
  id: number,
  userId: number,
  completedDays: number[]
): Promise<AnalysisReport | null> {
  try {
    const sanitized = Array.from(
      new Set(completedDays.filter((d) => Number.isInteger(d) && d >= 1 && d <= 14))
    ).sort((a, b) => a - b);

    const updated = await db
      .update(analyses)
      .set({ completedDays: sanitized })
      .where(and(eq(analyses.id, id), eq(analyses.userId, userId)))
      .returning();

    if (!updated.length) {
      return null;
    }
    return mapRowToReport(updated[0]);
  } catch (error) {
    console.error('Database query failed in updateCompletedDaysForUser:', error);
    throw new Error('Failed to update learning roadmap progress.', { cause: error });
  }
}
