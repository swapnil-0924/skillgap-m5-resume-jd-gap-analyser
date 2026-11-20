/**
 * Evidence Engine: Grounds every skill requirement in verbatim snippets
 * from the original Job Description text. Never fabricates JD quotes.
 */

export interface VerifiedEvidence {
  snippet: string;
  verified: boolean;
}

function splitJdIntoSegments(jdText: string): string[] {
  const normalized = jdText.replace(/\r\n/g, '\n');
  const lines = normalized
    .split(/\n+/)
    .map((line) => line.replace(/^[\s•\-*▪◦–—\d.)]+/, '').trim())
    .filter((line) => line.length >= 12);

  const segments: string[] = [];
  for (const line of lines) {
    if (line.length <= 240) {
      segments.push(line);
    } else {
      const sentences = line
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 12);
      segments.push(...sentences);
    }
  }
  return segments;
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tokenizeKeywords(skill: string): string[] {
  const stopWords = new Set(['and', 'or', 'of', 'the', 'in', 'for', 'with', 'to', 'a', 'an']);
  return normalizeForMatch(skill)
    .split(' ')
    .filter((t) => t.length >= 2 && !stopWords.has(t));
}

function clampSnippet(text: string, maxLen = 220): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen - 1).trimEnd()}…`;
}

/**
 * Verifies an AI-proposed quote against the raw JD text or locates the best
 * verbatim supporting sentence directly in the original JD.
 */
export function findVerifiedJdEvidence(
  jdText: string,
  canonicalSkill: string,
  rawSkill: string,
  proposedQuote?: string
): VerifiedEvidence {
  const normalizedJd = normalizeForMatch(jdText);
  const segments = splitJdIntoSegments(jdText);

  // 1. Check if the proposed quote actually exists verbatim in the original JD
  if (proposedQuote && proposedQuote.trim().length >= 10) {
    const cleanQuote = proposedQuote.trim();
    const normQuote = normalizeForMatch(cleanQuote);
    if (normQuote.length >= 10 && normalizedJd.includes(normQuote)) {
      return {
        snippet: clampSnippet(cleanQuote),
        verified: true,
      };
    }
  }

  // 2. Direct exact phrase lookup in JD segments for rawSkill or canonicalSkill
  const candidates = Array.from(
    new Set([rawSkill.trim(), canonicalSkill.trim()].filter((s) => s.length >= 2))
  );

  for (const candidate of candidates) {
    const escaped = escapeRegExp(candidate.toLowerCase());
    const boundaryRegex = new RegExp(`(^|[^a-z0-9+#])${escaped}([^a-z0-9+#]|$)`, 'i');
    const exactSegment = segments.find((seg) => boundaryRegex.test(seg));
    if (exactSegment) {
      return {
        snippet: clampSnippet(exactSegment),
        verified: true,
      };
    }
  }

  // 3. Token-overlap lookup across JD segments
  const tokens = Array.from(
    new Set([...tokenizeKeywords(rawSkill), ...tokenizeKeywords(canonicalSkill)])
  );

  if (tokens.length > 0 && segments.length > 0) {
    let bestSegment = '';
    let bestScore = 0;

    for (const seg of segments) {
      const normSeg = normalizeForMatch(seg);
      let hits = 0;
      for (const token of tokens) {
        if (normSeg.includes(token)) hits += 1;
      }
      const ratio = hits / tokens.length;
      if (ratio > bestScore) {
        bestScore = ratio;
        bestSegment = seg;
      }
    }

    if (bestScore >= 0.5 && bestSegment) {
      return {
        snippet: clampSnippet(bestSegment),
        verified: true,
      };
    }
  }

  // 4. Honest fallback if no exact sentence could be isolated — never fabricate a quote
  return {
    snippet: `Referenced as a requirement for "${rawSkill || canonicalSkill}" in the provided job description.`,
    verified: false,
  };
}
