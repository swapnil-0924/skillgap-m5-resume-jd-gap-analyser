import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileUp,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react';
import type { AnalysisReport, QuickScanResult } from '../types/analysis';
import { quickScanJd, runGapAnalysis } from '../services/api';
import { formatFileSize } from '../utils/formatters';

interface AnalyzeViewProps {
  getIdToken: () => Promise<string | null>;
  onAnalysisComplete: (report: AnalysisReport) => void;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const PIPELINE_STEPS = [
  'Validating PDF integrity & extracting text / OCR',
  'Extracting structured skills, qualifications & experience',
  'Normalizing taxonomy & computing semantic skill embeddings',
  'Verifying JD evidence & calculating weighted compatibility score',
  'Generating personalized 14-day learning roadmap',
];

export function AnalyzeView({ getIdToken, onAnalysisComplete }: AnalyzeViewProps) {
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const jdFileInputRef = useRef<HTMLInputElement>(null);

  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [isDraggingResume, setIsDraggingResume] = useState(false);

  const [jdMode, setJdMode] = useState<'text' | 'pdf'>('text');
  const [jdText, setJdText] = useState('');
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [jdError, setJdError] = useState<string | null>(null);

  const [quickScanLoading, setQuickScanLoading] = useState(false);
  const [quickScanResult, setQuickScanResult] = useState<QuickScanResult | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const validateClientPdf = (file: File): string | null => {
    const isPdfExt = file.name.toLowerCase().endsWith('.pdf');
    const isPdfType = !file.type || file.type === 'application/pdf';
    if (!isPdfExt && !isPdfType) {
      return 'Only PDF files (.pdf) are supported. Please upload a valid PDF document.';
    }
    if (file.size === 0) {
      return 'The selected PDF file is empty (0 bytes).';
    }
    if (file.size > MAX_FILE_BYTES) {
      return `File exceeds the 10 MB limit (${formatFileSize(file.size)}).`;
    }
    return null;
  };

  const handleSelectResume = (file: File | null) => {
    setSubmitError(null);
    if (!file) {
      setResumeFile(null);
      setResumeError(null);
      return;
    }
    const err = validateClientPdf(file);
    if (err) {
      setResumeFile(null);
      setResumeError(err);
      return;
    }
    setResumeError(null);
    setResumeFile(file);
  };

  const handleSelectJdFile = (file: File | null) => {
    setSubmitError(null);
    setQuickScanResult(null);
    if (!file) {
      setJdFile(null);
      setJdError(null);
      return;
    }
    const err = validateClientPdf(file);
    if (err) {
      setJdFile(null);
      setJdError(err);
      return;
    }
    setJdError(null);
    setJdFile(file);
  };

  const handleResumeDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingResume(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      handleSelectResume(dropped);
    }
  };

  const handleQuickScan = async () => {
    setJdError(null);
    setSubmitError(null);

    if (jdMode === 'text' && jdText.trim().length < 40) {
      setJdError('Enter at least 40 characters of Job Description text to run Quick Scan.');
      return;
    }
    if (jdMode === 'pdf' && !jdFile) {
      setJdError('Upload a Job Description PDF first to run Quick Scan.');
      return;
    }

    setQuickScanLoading(true);
    try {
      const result = await quickScanJd({
        jdText: jdMode === 'text' ? jdText.trim() : undefined,
        jdFile: jdMode === 'pdf' ? jdFile : null,
      });
      setQuickScanResult(result);
    } catch (error: unknown) {
      setJdError(
        error instanceof Error ? error.message : 'Quick Scan failed. Please try again.'
      );
    } finally {
      setQuickScanLoading(false);
    }
  };

  const handleCancelAnalysis = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setAnalyzing(false);
    setSubmitError('Analysis cancelled. You can adjust your inputs and try again.');
  };

  const handleRunAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setResumeError(null);
    setJdError(null);

    let hasError = false;
    if (!resumeFile) {
      setResumeError('Please upload a candidate resume in PDF format.');
      hasError = true;
    }

    if (jdMode === 'text') {
      const words = jdText.trim().split(/\s+/).filter(Boolean).length;
      if (jdText.trim().length < 40 || words < 8) {
        setJdError(
          'Please paste a complete Job Description (minimum 40 characters and 8 words) or switch to JD PDF upload.'
        );
        hasError = true;
      }
    } else if (!jdFile) {
      setJdError('Please upload a Job Description PDF file or switch to Paste Text.');
      hasError = true;
    }

    if (hasError || !resumeFile) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setAnalyzing(true);
    setActiveStepIndex(0);

    try {
      const token = await getIdToken();
      const report = await runGapAnalysis({
        resumeFile,
        jdText: jdMode === 'text' ? jdText.trim() : undefined,
        jdFile: jdMode === 'pdf' ? jdFile : null,
        token,
        signal: controller.signal,
        onProgress: (stepIndex) => {
          setActiveStepIndex(stepIndex);
        },
      });
      onAnalysisComplete(report);
    } catch (error: unknown) {
      if ((error as { name?: string })?.name === 'AbortError') {
        return;
      }
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Analysis failed due to an unexpected error. Please try again.'
      );
    } finally {
      abortControllerRef.current = null;
      setAnalyzing(false);
    }
  };

  const jdWordCount = jdText.trim() ? jdText.trim().split(/\s+/).length : 0;

  return (
    <div className="space-y-6">
      <div className="pb-5 border-b border-slate-200">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          New Resume vs JD Analysis
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Provide any candidate PDF resume and any target job description. Every skill, score, and 14-day roadmap is computed dynamically from your uploaded documents.
        </p>
      </div>

      {submitError && (
        <div
          role="alert"
          className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800"
        >
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-medium text-red-900">Analysis could not be completed</p>
            <p>{submitError}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleRunAnalysis} className="space-y-6" noValidate>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Column 1: Resume PDF Upload */}
          <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between gap-5">
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  1. Candidate Resume (PDF)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Supports text-based, multi-column, table layouts, and scanned/image PDFs up to 10 MB.
                </p>
              </div>

              <input
                ref={resumeInputRef}
                id="resume-pdf-input"
                type="file"
                accept=".pdf,application/pdf"
                onChange={(e) => handleSelectResume(e.target.files?.[0] || null)}
                className="sr-only"
                disabled={analyzing}
              />

              {!resumeFile ? (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingResume(true);
                  }}
                  onDragLeave={() => setIsDraggingResume(false)}
                  onDrop={handleResumeDrop}
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                    isDraggingResume
                      ? 'border-[#1D4ED8] bg-blue-50/60'
                      : resumeError
                      ? 'border-red-300 bg-red-50/40'
                      : 'border-slate-300 bg-slate-50/60 hover:border-slate-400'
                  }`}
                >
                  <div className="w-11 h-11 rounded-lg bg-white border border-slate-200 text-slate-700 flex items-center justify-center mx-auto mb-3">
                    <Upload className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <p className="text-sm font-medium text-slate-900">
                    Drop your PDF resume here
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    or select a file from your device
                  </p>
                  <button
                    type="button"
                    disabled={analyzing}
                    onClick={() => resumeInputRef.current?.click()}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
                    Choose Resume PDF
                  </button>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/60 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <CheckCircle2
                      className="w-5 h-5 text-[#15803D] shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {resumeFile.name}
                      </p>
                      <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                        PDF · {formatFileSize(resumeFile.size)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={analyzing}
                      onClick={() => resumeInputRef.current?.click()}
                      className="px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200/70 rounded-md transition-colors cursor-pointer"
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      disabled={analyzing}
                      aria-label={`Remove resume ${resumeFile.name}`}
                      onClick={() => {
                        handleSelectResume(null);
                        if (resumeInputRef.current) resumeInputRef.current.value = '';
                      }}
                      className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}

              {resumeError && (
                <p role="alert" className="text-xs text-red-700 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{resumeError}</span>
                </p>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100 text-xs text-slate-500 space-y-1">
              <p className="font-medium text-slate-700">Automatic document checks:</p>
              <p>
                Detects password-protected, corrupted, or blank PDFs and automatically switches to OCR when a page is scanned or image-based.
              </p>
            </div>
          </section>

          {/* Column 2: Job Description Input (Text or PDF) */}
          <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between gap-4">
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    2. Target Job Description
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Paste the complete job posting or upload a JD PDF file.
                  </p>
                </div>

                {/* Interactive Segmented Control */}
                <div
                  role="tablist"
                  aria-label="Job Description input mode"
                  className="inline-flex items-center p-1 bg-slate-100 rounded-lg self-start"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={jdMode === 'text'}
                    disabled={analyzing}
                    onClick={() => {
                      setJdMode('text');
                      setJdError(null);
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      jdMode === 'text'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Paste Text
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={jdMode === 'pdf'}
                    disabled={analyzing}
                    onClick={() => {
                      setJdMode('pdf');
                      setJdError(null);
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      jdMode === 'pdf'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Upload JD PDF
                  </button>
                </div>
              </div>

              {jdMode === 'text' ? (
                <div className="space-y-2">
                  <label htmlFor="jd-textarea" className="sr-only">
                    Job Description Text
                  </label>
                  <textarea
                    id="jd-textarea"
                    rows={9}
                    disabled={analyzing}
                    value={jdText}
                    onChange={(e) => {
                      setJdText(e.target.value);
                      if (jdError) setJdError(null);
                    }}
                    placeholder="Paste the complete job description here, including responsibilities, required technical and soft skills, qualifications, and experience..."
                    className={`w-full rounded-lg border px-3.5 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8] transition-colors resize-y ${
                      jdError ? 'border-red-300 bg-red-50/20' : 'border-slate-300 bg-white'
                    }`}
                  />
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-mono tabular-nums">
                      {jdWordCount} words · {jdText.trim().length} chars
                    </span>
                    <button
                      type="button"
                      disabled={analyzing || quickScanLoading || jdText.trim().length < 40}
                      onClick={handleQuickScan}
                      className="inline-flex items-center gap-1.5 font-medium text-[#1D4ED8] hover:text-[#1E40AF] disabled:text-slate-400 cursor-pointer disabled:cursor-not-allowed"
                    >
                      {quickScanLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Zap className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      Quick Scan JD
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <input
                    ref={jdFileInputRef}
                    id="jd-pdf-input"
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={(e) => handleSelectJdFile(e.target.files?.[0] || null)}
                    className="sr-only"
                    disabled={analyzing}
                  />
                  {!jdFile ? (
                    <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50/60">
                      <p className="text-sm font-medium text-slate-900">
                        Upload a Job Description PDF
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Text and scanned JD PDFs up to 10 MB are supported.
                      </p>
                      <button
                        type="button"
                        disabled={analyzing}
                        onClick={() => jdFileInputRef.current?.click()}
                        className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                      >
                        <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
                        Choose JD PDF
                      </button>
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/60 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <CheckCircle2
                          className="w-5 h-5 text-[#15803D] shrink-0"
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {jdFile.name}
                          </p>
                          <p className="text-xs text-slate-500 font-mono tabular-nums">
                            PDF · {formatFileSize(jdFile.size)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={analyzing || quickScanLoading}
                          onClick={handleQuickScan}
                          className="inline-flex items-center gap-1 text-xs font-medium text-[#1D4ED8] hover:underline cursor-pointer"
                        >
                          <Zap className="w-3.5 h-3.5" aria-hidden="true" />
                          Quick Scan
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove JD file ${jdFile.name}`}
                          onClick={() => {
                            handleSelectJdFile(null);
                            if (jdFileInputRef.current) jdFileInputRef.current.value = '';
                          }}
                          className="p-1.5 text-slate-500 hover:text-red-600 rounded-md cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {jdError && (
                <p role="alert" className="text-xs text-red-700 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{jdError}</span>
                </p>
              )}

              {/* Low-latency Quick Scan Preview Output */}
              {quickScanResult && (
                <div className="pt-4 border-t border-slate-100 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-800">
                      Quick Scan Preview: {quickScanResult.jobTitle}
                      {quickScanResult.companyName ? ` · ${quickScanResult.companyName}` : ''}
                    </span>
                    <span className="font-mono tabular-nums">
                      {quickScanResult.seniorityLevel}
                      {quickScanResult.requiredYears !== null
                        ? ` · ${quickScanResult.requiredYears}+ yrs`
                        : ''}
                    </span>
                  </div>
                  {quickScanResult.summary && (
                    <p className="text-xs text-slate-600">{quickScanResult.summary}</p>
                  )}
                  {quickScanResult.topSkills.length > 0 && (
                    <p className="text-xs text-slate-600">
                      <span className="font-medium text-slate-800">Detected priorities: </span>
                      {quickScanResult.topSkills.join(' · ')}
                    </p>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Submit & Processing Pipeline Bar */}
        <section className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-900">
              {analyzing ? 'Running full analysis pipeline...' : 'Ready to run dynamic gap analysis'}
            </p>
            <p className="text-xs text-slate-500">
              {analyzing
                ? PIPELINE_STEPS[activeStepIndex]
                : 'Includes PDF/OCR extraction, taxonomy normalization, semantic embedding matching, JD evidence verification, transparent scoring, and a 14-day plan.'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {analyzing && (
              <button
                type="button"
                onClick={handleCancelAnalysis}
                className="px-3.5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={analyzing}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:bg-blue-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
            >
              {analyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  Analyzing Documents...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                  Run Gap Analysis
                </>
              )}
            </button>
          </div>
        </section>

        {/* Visual Step Progress during Analysis */}
        {analyzing && (
          <section
            aria-live="polite"
            className="bg-white border border-slate-200 rounded-xl p-6 space-y-3"
          >
            <p className="text-xs font-medium text-slate-500">Processing Pipeline</p>
            <ol className="space-y-2.5">
              {PIPELINE_STEPS.map((label, idx) => {
                const isDone = idx < activeStepIndex;
                const isCurrent = idx === activeStepIndex;
                return (
                  <li
                    key={label}
                    className={`flex items-center gap-3 text-sm ${
                      isDone
                        ? 'text-slate-700'
                        : isCurrent
                        ? 'text-slate-900 font-medium'
                        : 'text-slate-400'
                    }`}
                  >
                    <span className="font-mono tabular-nums text-xs w-5">
                      0{idx + 1}
                    </span>
                    {isDone ? (
                      <CheckCircle2
                        className="w-4 h-4 text-[#15803D] shrink-0"
                        aria-hidden="true"
                      />
                    ) : isCurrent ? (
                      <Loader2
                        className="w-4 h-4 text-[#1D4ED8] animate-spin shrink-0"
                        aria-hidden="true"
                      />
                    ) : (
                      <span
                        className="w-4 h-4 rounded-full border border-slate-300 shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    <span>{label}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        )}
      </form>
    </div>
  );
}
