import type { NextFunction, Request, Response } from 'express';
import { cert, getApps, initializeApp, type AppOptions } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

function buildAdminOptions(): AppOptions {
  const rawCreds = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (rawCreds) {
    try {
      const parsed = JSON.parse(rawCreds);
      return {
        credential: cert(parsed),
        projectId: firebaseConfig.projectId,
      };
    } catch (err) {
      console.warn(
        'Invalid FIREBASE_SERVICE_ACCOUNT_JSON format; falling back to default credentials.',
        err,
      );
    }
  }
  return {
    projectId: firebaseConfig.projectId,
  };
}

const adminApp = getApps().length ? getApps()[0] : initializeApp(buildAdminOptions());

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);

export interface AdminRequest extends Request {
  adminUser?: DecodedIdToken;
}

const BOOTSTRAPPED_ADMIN_EMAIL = 'joehennry33@gmail.com';

function getAllowedAdminEmails(): Set<string> {
  const fromEnv = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return new Set([BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase(), ...fromEnv]);
}

export async function isAuthorizedAdminToken(decoded: DecodedIdToken): Promise<boolean> {
  if (!decoded.email_verified) {
    return false;
  }

  const email = (decoded.email || '').toLowerCase();
  if (email && getAllowedAdminEmails().has(email)) {
    return true;
  }

  const adminDoc = await adminDb.collection('admins').doc(decoded.uid).get();
  return adminDoc.exists;
}

export async function requireAdmin(
  req: AdminRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Sign in with an authorized admin account.' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'Missing bearer token.' });
    return;
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const allowed = await isAuthorizedAdminToken(decoded);
    if (!allowed) {
      res.status(403).json({
        error: 'Forbidden: Your Google account does not have SafBundle administrator privileges.',
      });
      return;
    }
    req.adminUser = decoded;
    next();
  } catch (error) {
    console.error('Admin token verification failed:', error);
    res.status(401).json({ error: 'Invalid or expired authentication session.' });
  }
}
