import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { HttpError } from '../http.js';
import { User } from '../models.js';

export interface AuthInfo {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'staff';
  businessId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthInfo;
    }
  }
}

export function signToken(user: { id: string; tokenVersion: number; role: string }): string {
  return jwt.sign({ sub: user.id, tv: user.tokenVersion, role: user.role }, config.jwtSecret, { expiresIn: '7d' });
}

function secureCookie(req: Request): boolean {
  const origin = req.get('origin') || req.get('referer') || '';
  return config.cookieSecure || req.secure || origin.startsWith('https://');
}

function cookieOptions(req: Request) {
  const secure = secureCookie(req);
  return {
    httpOnly: true,
    secure,
    sameSite: (secure ? 'none' : 'lax') as 'none' | 'lax',
    path: '/',
  };
}

export function setAuthCookie(req: Request, res: Response, token: string): void {
  const options = cookieOptions(req);
  res.clearCookie('lekha_session', { path: '/', httpOnly: true, sameSite: 'lax', secure: false });
  res.clearCookie('lekha_session', { path: '/', httpOnly: true, sameSite: 'none', secure: true });
  res.cookie('lekha_session', token, { ...options, maxAge: 7 * 24 * 60 * 60 * 1000 });
}

export function clearAuthCookie(req: Request, res: Response): void {
  const options = cookieOptions(req);
  res.clearCookie('lekha_session', options);
  res.clearCookie('lekha_session', { path: '/', httpOnly: true, sameSite: 'lax', secure: false });
}

function readToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const cookie = req.cookies?.lekha_session;
  return typeof cookie === 'string' && cookie ? cookie : null;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = readToken(req);
    if (!token) throw new HttpError(401, 'Sign in to continue.');
    let payload: { sub?: string; tv?: number };
    try {
      payload = jwt.verify(token, config.jwtSecret) as { sub?: string; tv?: number };
    } catch {
      throw new HttpError(401, 'Your session has ended. Sign in again.');
    }
    const user = await User.findById(payload.sub);
    if (!user || user.tokenVersion !== payload.tv) throw new HttpError(401, 'Your session has ended. Sign in again.');
    req.auth = {
      id: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role as 'owner' | 'staff',
      businessId: user.businessId ? String(user.businessId) : null,
    };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireBusiness(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth?.businessId) {
    next(new HttpError(409, 'Add your business profile to continue.'));
    return;
  }
  next();
}

export function requireOwner(req: Request, _res: Response, next: NextFunction): void {
  if (req.auth?.role !== 'owner') {
    next(new HttpError(403, 'Only the owner can change these settings.'));
    return;
  }
  next();
}
