import type { NextFunction, Request, RequestHandler, Response } from 'express';
import AppError from '../utils/AppError';
import { verifyAuthToken } from '../utils/token';
import { findUserById } from '../data/appStore';
import { readCookieToken, toPublicUser } from '../services/auth.service';
import { USER_ROLES } from '../utils/constants';

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return null;
}

function loadUserFromToken(token: string) {
  const payload = verifyAuthToken(token);
  if (!payload) throw new AppError('Invalid or expired token', 401);
  const stored = findUserById(payload.id);
  if (!stored || !stored.isActive) throw new AppError('Invalid or expired token', 401);
  return toPublicUser(stored);
}

/** Organisation / staff auth — Bearer or org cookie */
export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = bearerToken(req) || readCookieToken(req, 'org');
    if (!token) throw new AppError('Authentication required', 401);
    const user = loadUserFromToken(token);
    if (user.role === USER_ROLES.SUPER_ADMIN) {
      throw new AppError('Use Visit Hub staff session for this area', 403);
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

/** Super admin auth — Bearer or super cookie */
export const authenticateSuper = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = bearerToken(req) || readCookieToken(req, 'super');
    if (!token) throw new AppError('Authentication required', 401);
    const user = loadUserFromToken(token);
    if (user.role !== USER_ROLES.SUPER_ADMIN) {
      throw new AppError('Forbidden', 403);
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

/** Either session (profile, etc.) — Bearer preferred, then org, then super */
export const authenticateAny = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = bearerToken(req) || readCookieToken(req, 'any');
    if (!token) throw new AppError('Authentication required', 401);
    req.user = loadUserFromToken(token);
    next();
  } catch (err) {
    next(err);
  }
};

export const authorize =
  (...roles: string[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError('Forbidden', 403));
    }
    return next();
  };
