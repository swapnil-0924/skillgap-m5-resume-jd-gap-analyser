-- Migration: 0001_qa_testing_audit_tables.sql
-- Permanent QA Testing & Security Audit Storage for SkillGap M5 (PostgreSQL / Drizzle ORM)

CREATE TABLE IF NOT EXISTS "test_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "run_type" text NOT NULL,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp,
  "total_tests" integer DEFAULT 0 NOT NULL,
  "passed" integer DEFAULT 0 NOT NULL,
  "failed" integer DEFAULT 0 NOT NULL,
  "blocked" integer DEFAULT 0 NOT NULL,
  "skipped" integer DEFAULT 0 NOT NULL,
  "overall_status" text NOT NULL,
  "application_version" text NOT NULL,
  "commit_hash" text,
  CONSTRAINT "chk_test_runs_counts_non_negative" CHECK ("total_tests" >= 0 AND "passed" >= 0 AND "failed" >= 0 AND "blocked" >= 0 AND "skipped" >= 0)
);

CREATE TABLE IF NOT EXISTS "test_cases" (
  "id" serial PRIMARY KEY NOT NULL,
  "test_name" text NOT NULL UNIQUE,
  "category" text NOT NULL,
  "description" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL
);

CREATE TABLE IF NOT EXISTS "test_results" (
  "id" serial PRIMARY KEY NOT NULL,
  "run_id" integer NOT NULL REFERENCES "test_runs"("id") ON DELETE CASCADE,
  "test_case_id" integer NOT NULL REFERENCES "test_cases"("id") ON DELETE CASCADE,
  "status" text NOT NULL,
  "duration_ms" integer DEFAULT 0 NOT NULL,
  "error_summary" text,
  "execution_details" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "chk_test_results_duration_non_negative" CHECK ("duration_ms" >= 0)
);

CREATE TABLE IF NOT EXISTS "security_audits" (
  "id" serial PRIMARY KEY NOT NULL,
  "run_id" integer NOT NULL REFERENCES "test_runs"("id") ON DELETE CASCADE,
  "audit_type" text NOT NULL,
  "overall_status" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "security_findings" (
  "id" serial PRIMARY KEY NOT NULL,
  "audit_id" integer NOT NULL REFERENCES "security_audits"("id") ON DELETE CASCADE,
  "finding_code" text NOT NULL,
  "title" text NOT NULL,
  "severity" text NOT NULL,
  "status" text NOT NULL,
  "description" text NOT NULL,
  "remediation" text NOT NULL,
  "verified_at" timestamp
);

CREATE INDEX IF NOT EXISTS "idx_test_runs_started_at" ON "test_runs" ("started_at");
CREATE INDEX IF NOT EXISTS "idx_test_runs_run_type_status" ON "test_runs" ("run_type", "overall_status");
CREATE INDEX IF NOT EXISTS "idx_test_cases_category" ON "test_cases" ("category");
CREATE INDEX IF NOT EXISTS "idx_test_results_run_id" ON "test_results" ("run_id");
CREATE INDEX IF NOT EXISTS "idx_test_results_test_case_id" ON "test_results" ("test_case_id");
CREATE INDEX IF NOT EXISTS "idx_test_results_status" ON "test_results" ("status");
CREATE INDEX IF NOT EXISTS "idx_security_audits_run_id" ON "security_audits" ("run_id");
CREATE INDEX IF NOT EXISTS "idx_security_audits_created_at" ON "security_audits" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_security_findings_audit_id" ON "security_findings" ("audit_id");
CREATE INDEX IF NOT EXISTS "idx_security_findings_severity_status" ON "security_findings" ("severity", "status");
