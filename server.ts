import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  isRequestAdmin,
  optionalAuth,
  requireAdmin,
  requireAuth,
  type AuthRequest,
} from './src/middleware/auth.ts';
import {
  createAnalysisRecord,
  deleteAnalysisByIdForUser,
  getAnalysisByIdForUser,
  listAnalysesByUser,
  updateCompletedDaysForUser,
} from './src/db/repository.ts';
import {
  getQaOverview,
  getTestRunDetail,
  listSecurityFindings,
  listTestRuns,
} from './src/db/qaRepository.ts';
import {
  getActiveRunState,
  QaRunInProgressError,
  runQaSuite,
} from './src/qa/qaRunner.ts';
import {
  generateSecurityAuditMarkdown,
  generateTestReportJson,
  generateTestReportMarkdown,
} from './src/qa/reportGenerator.ts';
import { runFullGapAnalysisPipeline } from './src/server/analysisPipeline.ts';
import {
  DocumentValidationError,
  extractPdfDocument,
  sanitizeFilename,
} from './src/server/pdfProcessor.ts';
import {
  answerGapCoachingQuestion,
  extractPdfTextViaGeminiOcr,
  quickScanJobDescription,
} from './src/server/geminiService.ts';
import type { AnalysisReport } from './src/types/analysis.ts';
import type {
  QaRunOverallStatus,
  QaRunType,
  SecurityFindingStatus,
  SecuritySeverity,
} from './src/types/qa.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB per file
    files: 2,
  },
});

function formatApiError(error: unknown): { status: number; message: string } {
  if (error instanceof DocumentValidationError) {
    return { status: error.statusCode, message: error.message };
  }
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return { status: 413, message: 'Uploaded file exceeds the 10 MB limit.' };
    }
    return { status: 400, message: `File upload error: ${error.message}` };
  }

  const errMsg = String((error as { message?: string })?.message || '');
  const lower = errMsg.toLowerCase();

  if (lower.includes('api_key_invalid') || lower.includes('permission_denied')) {
    return {
      status: 502,
      message:
        'AI service authentication failed. Please verify the Gemini API key in Settings > Secrets.',
    };
  }
  if (lower.includes('resource_exhausted') || lower.includes('429')) {
    return {
      status: 429,
      message:
        'AI service rate limit reached. Please wait a few seconds and try again.',
    };
  }
  if (lower.includes('not_found') || lower.includes('404')) {
    return {
      status: 502,
      message: 'Requested AI model is temporarily unavailable. Please try again.',
    };
  }
  if (lower.includes('database') || lower.includes('failed to save')) {
    return { status: 503, message: errMsg || 'Database operation failed. Please try again.' };
  }

  return {
    status: 500,
    message: errMsg || 'An unexpected error occurred while processing the request.',
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  // 1. Health Check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'resume-jd-gap-analyser',
      timestamp: new Date().toISOString(),
    });
  });

  // 2. Low-latency JD Quick Scan (gemini-3.1-flash-lite)
  app.post(
    '/api/jd/quick-scan',
    upload.single('jdFile'),
    async (req, res) => {
      try {
        let jdText = typeof req.body?.jdText === 'string' ? req.body.jdText.trim() : '';

        if (req.file) {
          const doc = await extractPdfDocument(
            req.file.buffer,
            sanitizeFilename(req.file.originalname),
            req.file.mimetype,
            extractPdfTextViaGeminiOcr
          );
          jdText = doc.text;
        }

        if (jdText.length < 40) {
          return res.status(400).json({
            error: 'Please enter or upload at least 40 characters of Job Description text to quick-scan.',
          });
        }

        const result = await quickScanJobDescription(jdText);
        return res.json(result);
      } catch (error) {
        console.error('Error in POST /api/jd/quick-scan:', error);
        const formatted = formatApiError(error);
        return res.status(formatted.status).json({ error: formatted.message });
      }
    }
  );

  // 3. Full Resume vs Job Description Gap Analysis
  app.post(
    '/api/analyze',
    optionalAuth,
    upload.fields([
      { name: 'resume', maxCount: 1 },
      { name: 'jdFile', maxCount: 1 },
    ]),
    async (req: AuthRequest, res) => {
      try {
        const files = req.files as
          | { [fieldname: string]: Express.Multer.File[] }
          | undefined;
        const resumeFile = files?.resume?.[0];
        const jdFile = files?.jdFile?.[0];
        const jdText = typeof req.body?.jdText === 'string' ? req.body.jdText : '';

        if (!resumeFile) {
          return res.status(400).json({
            error: 'Please upload a Resume in PDF format before running the analysis.',
          });
        }

        const result = await runFullGapAnalysisPipeline({
          resumeFile: {
            buffer: resumeFile.buffer,
            originalname: resumeFile.originalname,
            mimetype: resumeFile.mimetype,
          },
          jdText,
          jdFile: jdFile
            ? {
                buffer: jdFile.buffer,
                originalname: jdFile.originalname,
                mimetype: jdFile.mimetype,
              }
            : undefined,
        });

        // If authenticated, persist directly to Cloud SQL PostgreSQL
        if (req.dbUser) {
          const savedReport = await createAnalysisRecord({
            userId: req.dbUser.id,
            ...result,
          });
          return res.status(201).json(savedReport);
        }

        // Unauthenticated live analysis session (no DB write)
        const sessionReport: AnalysisReport = {
          id: `session-${Date.now()}`,
          saved: false,
          createdAt: new Date().toISOString(),
          ...result,
        };
        return res.status(200).json(sessionReport);
      } catch (error) {
        console.error('Error in POST /api/analyze:', error);
        const formatted = formatApiError(error);
        return res.status(formatted.status).json({ error: formatted.message });
      }
    }
  );

  // 3b. Streaming Progress Gap Analysis (NDJSON real-time stage updates for UI)
  app.post(
    '/api/analyze-stream',
    optionalAuth,
    upload.fields([
      { name: 'resume', maxCount: 1 },
      { name: 'jdFile', maxCount: 1 },
    ]),
    async (req: AuthRequest, res) => {
      const files = req.files as
        | { [fieldname: string]: Express.Multer.File[] }
        | undefined;
      const resumeFile = files?.resume?.[0];
      const jdFile = files?.jdFile?.[0];
      const jdText = typeof req.body?.jdText === 'string' ? req.body.jdText : '';

      if (!resumeFile) {
        return res.status(400).json({
          error: 'Please upload a Resume in PDF format before running the analysis.',
        });
      }

      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const writeEvent = (payload: Record<string, unknown>) => {
        if (!res.writableEnded) {
          res.write(`${JSON.stringify(payload)}\n`);
        }
      };

      try {
        const result = await runFullGapAnalysisPipeline({
          resumeFile: {
            buffer: resumeFile.buffer,
            originalname: resumeFile.originalname,
            mimetype: resumeFile.mimetype,
          },
          jdText,
          jdFile: jdFile
            ? {
                buffer: jdFile.buffer,
                originalname: jdFile.originalname,
                mimetype: jdFile.mimetype,
              }
            : undefined,
          onProgress: (step, message) => {
            writeEvent({ type: 'progress', step, message });
          },
        });

        let finalReport: AnalysisReport;
        if (req.dbUser) {
          finalReport = await createAnalysisRecord({
            userId: req.dbUser.id,
            ...result,
          });
        } else {
          finalReport = {
            id: `session-${Date.now()}`,
            saved: false,
            createdAt: new Date().toISOString(),
            ...result,
          };
        }

        writeEvent({ type: 'result', data: finalReport });
      } catch (error) {
        console.error('Error in POST /api/analyze-stream:', error);
        const formatted = formatApiError(error);
        writeEvent({ type: 'error', error: formatted.message });
      } finally {
        if (!res.writableEnded) {
          res.end();
        }
      }
    }
  );

  // 4. Save an existing session analysis report into Cloud SQL (requires auth)
  app.post('/api/analyses/save', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.dbUser) {
        return res.status(401).json({ error: 'Authentication required.' });
      }
      const body = req.body as Partial<AnalysisReport>;
      if (
        !body.resumeFilename ||
        !body.jdText ||
        !body.scoreBreakdown ||
        !body.extractionMeta ||
        !body.experienceAlignment
      ) {
        return res.status(400).json({ error: 'Incomplete analysis payload.' });
      }

      const saved = await createAnalysisRecord({
        userId: req.dbUser.id,
        resumeFilename: sanitizeFilename(body.resumeFilename),
        jobTitle: body.jobTitle || 'Target Role',
        companyName: body.companyName ?? null,
        jdSourceName: body.jdSourceName || 'Pasted Job Description',
        jdText: body.jdText,
        resumeTextExcerpt: body.resumeTextExcerpt || '',
        extractionMeta: body.extractionMeta,
        compatibilityScore: Number(body.compatibilityScore) || 0,
        scoreBreakdown: body.scoreBreakdown,
        matchedSkills: Array.isArray(body.matchedSkills) ? body.matchedSkills : [],
        partialSkills: Array.isArray(body.partialSkills) ? body.partialSkills : [],
        missingSkills: Array.isArray(body.missingSkills) ? body.missingSkills : [],
        resumeSkills: Array.isArray(body.resumeSkills) ? body.resumeSkills : [],
        jdSkills: Array.isArray(body.jdSkills) ? body.jdSkills : [],
        experienceAlignment: body.experienceAlignment,
        learningPlan: Array.isArray(body.learningPlan) ? body.learningPlan : [],
        completedDays: Array.isArray(body.completedDays) ? body.completedDays : [],
      });

      return res.status(201).json(saved);
    } catch (error) {
      console.error('Error in POST /api/analyses/save:', error);
      const formatted = formatApiError(error);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 5. Retrieve Analysis History (Cloud SQL, protected)
  app.get('/api/analyses', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.dbUser) {
        return res.status(401).json({ error: 'Authentication required.' });
      }
      const items = await listAnalysesByUser(req.dbUser.id);
      return res.json({ analyses: items });
    } catch (error) {
      console.error('Error in GET /api/analyses:', error);
      const formatted = formatApiError(error);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 6. Retrieve Individual Saved Analysis (Cloud SQL, protected)
  app.get('/api/analyses/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.dbUser) {
        return res.status(401).json({ error: 'Authentication required.' });
      }
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid analysis ID.' });
      }
      const report = await getAnalysisByIdForUser(id, req.dbUser.id);
      if (!report) {
        return res.status(404).json({ error: 'Analysis report not found.' });
      }
      return res.json(report);
    } catch (error) {
      console.error('Error in GET /api/analyses/:id:', error);
      const formatted = formatApiError(error);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 7. Update 14-Day Roadmap Completion Progress (Cloud SQL, protected)
  app.patch('/api/analyses/:id/progress', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.dbUser) {
        return res.status(401).json({ error: 'Authentication required.' });
      }
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid analysis ID.' });
      }
      const completedDays = Array.isArray(req.body?.completedDays)
        ? req.body.completedDays
        : [];
      const updated = await updateCompletedDaysForUser(id, req.dbUser.id, completedDays);
      if (!updated) {
        return res.status(404).json({ error: 'Analysis report not found.' });
      }
      return res.json(updated);
    } catch (error) {
      console.error('Error in PATCH /api/analyses/:id/progress:', error);
      const formatted = formatApiError(error);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 8. Delete Saved Analysis (Cloud SQL, protected)
  app.delete('/api/analyses/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.dbUser) {
        return res.status(401).json({ error: 'Authentication required.' });
      }
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid analysis ID.' });
      }
      const deleted = await deleteAnalysisByIdForUser(id, req.dbUser.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Analysis report not found.' });
      }
      return res.json({ deleted: true, id });
    } catch (error) {
      console.error('Error in DELETE /api/analyses/:id:', error);
      const formatted = formatApiError(error);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 9. Low-latency Skill Gap Coach (gemini-3.1-flash-lite)
  app.post('/api/coach', async (req, res) => {
    try {
      const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
      const report = req.body?.report;
      if (!question || question.length < 4) {
        return res.status(400).json({ error: 'Please enter a question about your skill gaps.' });
      }
      if (!report || !report.jobTitle) {
        return res.status(400).json({ error: 'Active analysis report context is required.' });
      }

      const result = await answerGapCoachingQuestion({ question, report });
      return res.json(result);
    } catch (error) {
      console.error('Error in POST /api/coach:', error);
      const formatted = formatApiError(error);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // ============================================================================
  // 10. Permanent QA Testing & Security Audit API (Strictly Admin-Protected)
  // ============================================================================
  const ALLOWED_QA_RUN_TYPES = new Set<QaRunType>([
    'all',
    'unit',
    'integration',
    'api',
    'e2e',
    'security',
    'ai_regression',
  ]);
  const ALLOWED_QA_STATUSES = new Set<QaRunOverallStatus>([
    'running',
    'passed',
    'failed',
    'partial',
    'crashed',
  ]);
  const ALLOWED_SEVERITIES = new Set<SecuritySeverity>([
    'critical',
    'high',
    'medium',
    'low',
    'info',
  ]);
  const ALLOWED_FINDING_STATUSES = new Set<SecurityFindingStatus>([
    'open',
    'verified_secure',
    'mitigated',
    'blocked',
  ]);

  app.use('/api/qa', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  // 10a. Check whether the current session holds QA Admin access
  app.get('/api/qa/access', optionalAuth, (req: AuthRequest, res) => {
    const admin = isRequestAdmin(req);
    return res.json({
      authenticated: Boolean(req.user) || admin,
      isAdmin: admin,
      email: req.user?.email || req.dbUser?.email || null,
    });
  });

  // 10b. QA Dashboard Overview metrics & latest security audit
  app.get('/api/qa/overview', requireAdmin, async (_req, res) => {
    try {
      const overview = await getQaOverview(getActiveRunState());
      return res.json(overview);
    } catch (error) {
      console.error('Error in GET /api/qa/overview:', error);
      const formatted = formatApiError(error);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 10c. Filtered list of test runs
  app.get('/api/qa/runs', requireAdmin, async (req, res) => {
    try {
      const rawRunType = typeof req.query.runType === 'string' ? req.query.runType.trim() : '';
      const rawStatus = typeof req.query.status === 'string' ? req.query.status.trim() : '';
      const rawFrom = typeof req.query.from === 'string' ? req.query.from.trim() : '';
      const rawTo = typeof req.query.to === 'string' ? req.query.to.trim() : '';
      const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;

      const runType =
        rawRunType && ALLOWED_QA_RUN_TYPES.has(rawRunType as QaRunType)
          ? (rawRunType as QaRunType)
          : undefined;
      const status =
        rawStatus && ALLOWED_QA_STATUSES.has(rawStatus as QaRunOverallStatus)
          ? (rawStatus as QaRunOverallStatus)
          : undefined;

      const from = rawFrom ? new Date(rawFrom) : undefined;
      const to = rawTo ? new Date(rawTo) : undefined;
      if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
        return res.status(400).json({ error: 'Invalid date filter format.' });
      }

      const runs = await listTestRuns({
        runType,
        status,
        from,
        to,
        limit: Number.isFinite(rawLimit) ? rawLimit : 50,
      });
      return res.json({ runs });
    } catch (error) {
      console.error('Error in GET /api/qa/runs:', error);
      const formatted = formatApiError(error);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 10d. Full detail for a single test run
  app.get('/api/qa/runs/:id', requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid test run ID.' });
      }
      const detail = await getTestRunDetail(id);
      if (!detail) {
        return res.status(404).json({ error: 'Test run not found.' });
      }
      return res.json(detail);
    } catch (error) {
      console.error('Error in GET /api/qa/runs/:id:', error);
      const formatted = formatApiError(error);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 10e. Filtered security findings ledger
  app.get('/api/qa/findings', requireAdmin, async (req, res) => {
    try {
      const rawSeverity = typeof req.query.severity === 'string' ? req.query.severity.trim() : '';
      const rawStatus = typeof req.query.status === 'string' ? req.query.status.trim() : '';
      const rawAuditId = typeof req.query.auditId === 'string' ? Number(req.query.auditId) : undefined;

      const severity =
        rawSeverity && ALLOWED_SEVERITIES.has(rawSeverity as SecuritySeverity)
          ? (rawSeverity as SecuritySeverity)
          : undefined;
      const status =
        rawStatus && ALLOWED_FINDING_STATUSES.has(rawStatus as SecurityFindingStatus)
          ? (rawStatus as SecurityFindingStatus)
          : undefined;
      const auditId =
        rawAuditId !== undefined && Number.isInteger(rawAuditId) && rawAuditId > 0
          ? rawAuditId
          : undefined;

      const findings = await listSecurityFindings({ severity, status, auditId });
      return res.json({ findings });
    } catch (error) {
      console.error('Error in GET /api/qa/findings:', error);
      const formatted = formatApiError(error);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 10f. Controlled single-flight execution of QA test suites & security audit
  app.post('/api/qa/run', requireAdmin, async (req, res) => {
    try {
      const rawType = typeof req.body?.runType === 'string' ? req.body.runType.trim() : 'all';
      if (!ALLOWED_QA_RUN_TYPES.has(rawType as QaRunType)) {
        return res.status(400).json({
          error: `Invalid runType "${rawType}". Allowed values: ${Array.from(ALLOWED_QA_RUN_TYPES).join(', ')}.`,
        });
      }

      const output = await runQaSuite({
        runType: rawType as QaRunType,
        baseUrl: `http://127.0.0.1:${PORT}`,
        persistToDatabase: true,
        writeAuditFiles: true,
      });

      return res.status(201).json(output.detail);
    } catch (error) {
      if (error instanceof QaRunInProgressError) {
        return res.status(409).json({ error: error.message });
      }
      console.error('Error in POST /api/qa/run:', error);
      const formatted = formatApiError(error);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 10g. Export Test Execution Report (MD/JSON) or Security Audit Report (MD)
  app.get('/api/qa/runs/:id/export', requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid test run ID.' });
      }
      const format = typeof req.query.format === 'string' ? req.query.format.trim() : 'test-md';
      if (format !== 'test-md' && format !== 'test-json' && format !== 'security-md') {
        return res.status(400).json({
          error: 'Invalid export format. Use format=test-md, test-json, or security-md.',
        });
      }

      const detail = await getTestRunDetail(id);
      if (!detail) {
        return res.status(404).json({ error: 'Test run not found.' });
      }

      if (format === 'test-json') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="m5-test-results-run-${id}.json"`
        );
        return res.send(generateTestReportJson(detail));
      }

      if (format === 'security-md') {
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="m5-security-audit-run-${id}.md"`
        );
        return res.send(generateSecurityAuditMarkdown(detail));
      }

      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="m5-test-report-run-${id}.md"`
      );
      return res.send(generateTestReportMarkdown(detail));
    } catch (error) {
      console.error('Error in GET /api/qa/runs/:id/export:', error);
      const formatted = formatApiError(error);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Multer & Express JSON error handler
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      const formatted = formatApiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  );

  // Vite Dev Middleware or Production Static Files
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
