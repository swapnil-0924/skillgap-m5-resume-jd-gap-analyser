/**
 * Environment-based API URL configuration.
 *
 * - Unified hosting (local dev, Cloud Run, single-service Render): leave VITE_API_BASE_URL unset/empty
 *   so requests resolve against the same origin (`/api/...`).
 * - Split hosting (e.g. Vercel frontend + Render backend): set VITE_API_BASE_URL to the backend origin
 *   (e.g. `https://skillgap-m5.onrender.com`).
 */

export function normalizeApiBaseUrl(raw?: string | null): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // Reject unsafe or malformed schemes (only http/https origins are permitted).
  if (!/^https?:\/\//i.test(trimmed)) {
    return '';
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    // Strip trailing slashes and any accidental trailing `/api` suffix to prevent `/api/api/...`.
    const cleanPath = parsed.pathname.replace(/\/+$/, '').replace(/\/api$/i, '');
    return `${parsed.origin}${cleanPath}`;
  } catch {
    return '';
  }
}

export function getApiBaseUrl(): string {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return normalizeApiBaseUrl(env?.VITE_API_BASE_URL);
}

export function buildApiUrl(path: string, baseUrlOverride?: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base =
    baseUrlOverride !== undefined ? normalizeApiBaseUrl(baseUrlOverride) : getApiBaseUrl();
  return `${base}${normalizedPath}`;
}
