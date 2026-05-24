import type { RequestHandler } from 'express';

export function requireStaff(): RequestHandler {
  return (req, res, next) => {
    if (req.session?.user?.authorized) {
      next();
      return;
    }
    res.status(401).json({ error: 'unauthorized' });
  };
}
