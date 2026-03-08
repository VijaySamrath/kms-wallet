import { Request, Response, NextFunction } from 'express';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    sessionId?: string;
  }
}

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.session.userId || !req.session.sessionId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

export const rateLimiter = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Implement rate limiting logic here
  next();
};

export const auditLogger = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(
      `[AUDIT] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms - ${req.ip}`
    );
  });
  
  next();
};