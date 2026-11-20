import { timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '../lib/firebase-admin.ts';
import { getOrCreateUser } from '../db/repository.ts';

const DEFAULT_ADMIN_EMAILS = ['swapnilajmera2399@gmail.com'];

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  dbUser?: {
    id: number;
    uid: string;
    email: string;
    displayName: string | null;
  };
  isQaAdmin?: boolean;
}

function getConfiguredAdminEmails(): Set<string> {
  const raw = process.env.QA_ADMIN_EMAILS;
  if (!raw || !raw.trim()) {
    return new Set(DEFAULT_ADMIN_EMAILS.map((e) => e.toLowerCase()));
  }
  const parsed = raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return new Set(parsed.length > 0 ? parsed : DEFAULT_ADMIN_EMAILS);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getConfiguredAdminEmails().has(email.trim().toLowerCase());
}

export function hasValidQaAdminKey(req: Request): boolean {
  const configuredKey = process.env.QA_ADMIN_API_KEY?.trim();
  if (!configuredKey || configuredKey.length < 16) {
    return false;
  }
  const headerVal = req.headers['x-qa-admin-key'];
  if (typeof headerVal !== 'string' || !headerVal.trim()) {
    return false;
  }
  const providedBuf = Buffer.from(headerVal.trim(), 'utf8');
  const expectedBuf = Buffer.from(configuredKey, 'utf8');
  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }
  return timingSafeEqual(providedBuf, expectedBuf);
}

export function isRequestAdmin(req: AuthRequest): boolean {
  if (hasValidQaAdminKey(req)) {
    return true;
  }
  if (!req.user) {
    return false;
  }
  if (req.user.admin === true) {
    return true;
  }
  const email = req.user.email || req.dbUser?.email;
  return isAdminEmail(email);
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please sign in with Google.' });
  }

  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Missing bearer token.' });
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    const email = decodedToken.email || `${decodedToken.uid}@users.local`;
    const displayName = typeof decodedToken.name === 'string' ? decodedToken.name : null;
    req.dbUser = await getOrCreateUser(decodedToken.uid, email, displayName);
    return next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Invalid or expired authentication token. Please sign in again.' });
  }
};

export const optionalAuth = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!token) {
    return next();
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    const email = decodedToken.email || `${decodedToken.uid}@users.local`;
    const displayName = typeof decodedToken.name === 'string' ? decodedToken.name : null;
    req.dbUser = await getOrCreateUser(decodedToken.uid, email, displayName);
  } catch (error) {
    console.warn('Optional auth token could not be verified; proceeding in unsaved session mode:', error);
  }
  return next();
};

/**
 * Strictly restricts QA & Security Audit endpoints to authorized administrators:
 * - Either a valid Firebase ID token belonging to an admin user (custom claim `admin === true`
 *   or email listed in `QA_ADMIN_EMAILS`), OR
 * - An exact constant-time match for `X-QA-Admin-Key` when `QA_ADMIN_API_KEY` (>= 16 chars)
 *   is explicitly configured on the server.
 */
export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (hasValidQaAdminKey(req)) {
    req.isQaAdmin = true;
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Administrator authentication required to access QA and security audit endpoints.',
    });
  }

  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!token) {
    return res.status(401).json({
      error: 'Administrator authentication required. Missing bearer token.',
    });
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    const email = decodedToken.email || `${decodedToken.uid}@users.local`;
    const displayName = typeof decodedToken.name === 'string' ? decodedToken.name : null;
    req.dbUser = await getOrCreateUser(decodedToken.uid, email, displayName);

    if (!isRequestAdmin(req)) {
      return res.status(403).json({
        error: 'Forbidden. Administrator privileges are required for QA and security audit controls.',
      });
    }

    req.isQaAdmin = true;
    return next();
  } catch (error) {
    console.error('Error verifying admin Firebase ID token:', error);
    return res.status(401).json({
      error: 'Invalid or expired authentication token. Please sign in again.',
    });
  }
};
