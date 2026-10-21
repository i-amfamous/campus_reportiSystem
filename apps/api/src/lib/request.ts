import type { Request } from 'express';

export function requestMeta(req: Request): { ipAddress?: string; userAgent?: string } {
  const forwarded = req.headers['x-forwarded-for'];
  const ipAddress =
    (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined) ??
    req.socket.remoteAddress ??
    undefined;
  const userAgent = req.get('user-agent') ?? undefined;
  return { ipAddress, userAgent };
}
