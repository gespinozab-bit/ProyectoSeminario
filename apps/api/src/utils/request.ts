import type { Request } from 'express';

export const requestMetadata = (req: Request): { ipAddress?: string; userAgent?: string } => {
  const userAgent = req.get('user-agent');
  return {
    ...(req.ip ? { ipAddress: req.ip.replace(/^::ffff:/, '') } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
};
