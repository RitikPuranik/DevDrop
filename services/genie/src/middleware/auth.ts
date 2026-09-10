import { Request, Response, NextFunction } from 'express';
import { getSupabaseUserClient } from '../storage/SupabaseClient';

/**
 * Auth Middleware
 * Validates Supabase JWT tokens and attaches user information to requests
 */

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email?: string;
        role?: string;
      };
      supabaseToken?: string;
    }
  }
}

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email?: string;
    role?: string;
  };
  supabaseToken: string;
}

/**
 * Middleware to verify Supabase JWT token
 * Extracts token from Authorization header and validates it
 */
export async function authenticateUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header',
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Validate token with Supabase
    const supabase = getSupabaseUserClient(token);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
      return;
    }

    // Attach user info to request
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
    };
    req.supabaseToken = token;

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to authenticate user',
    });
  }
}

/**
 * Middleware to optionally authenticate user
 * Does not fail if token is missing, but validates if present
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    // If no auth header, continue without user
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.substring(7);

    // Validate token with Supabase
    const supabase = getSupabaseUserClient(token);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    // Only attach user if token is valid
    if (!error && user) {
      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
      };
      req.supabaseToken = token;
    }

    next();
  } catch (error) {
    // Don't fail on optional auth errors
    console.error('Optional auth error:', error);
    next();
  }
}

/**
 * Middleware to check if user has specific role
 */
export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      return;
    }

    if (req.user.role !== role) {
      res.status(403).json({
        error: 'Forbidden',
        message: `Requires ${role} role`,
      });
      return;
    }

    next();
  };
}

/**
 * Middleware to check if user owns the resource
 * Expects userId to be present in request params or body
 */
export function requireOwnership(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
    return;
  }

  const userId = req.params.userId || req.body.userId;
  
  if (!userId) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'userId not found in request',
    });
    return;
  }

  if (req.user.id !== userId) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'You do not have access to this resource',
    });
    return;
  }

  next();
}

/**
 * Type guard for authenticated requests
 */
export function isAuthenticatedRequest(
  req: Request
): req is AuthenticatedRequest {
  return req.user !== undefined && req.supabaseToken !== undefined;
}
