import type { NextFunction, Response } from 'express';
import { isIP } from 'node:net';
import { timingSafeEqual } from 'node:crypto';
import type { AppRequest } from './request-context';

/** Set by the web app's server when it forwards a browser request. */
export const FORWARDED_CLIENT_IP_HEADER = 'x-topflow-client-ip';
/** Proves the forwarded address comes from the web app (shared INTERNAL_API_SECRET). */
export const INTERNAL_AUTH_HEADER = 'x-topflow-internal-auth';

/**
 * Resolves the caller's IP address for rate limiting and the audit trail. Browser requests
 * reach the API server-to-server through the web app, so the socket address is the web
 * server's. The web app therefore forwards the shopper's address together with a shared
 * secret; without that secret the header is ignored, so nobody else can spoof an address.
 */
export function clientIp(internalSecret?: string) {
  const expected = internalSecret ? Buffer.from(internalSecret) : null;

  return (
    request: AppRequest,
    _response: Response,
    next: NextFunction,
  ): void => {
    request.clientIp = request.ip ?? null;
    request.internalCaller = false;
    request.clientIpForwarded = false;
    const presented = request.get(INTERNAL_AUTH_HEADER);
    if (expected && presented) {
      const candidate = Buffer.from(presented);
      if (
        candidate.length === expected.length &&
        timingSafeEqual(candidate, expected)
      ) {
        request.internalCaller = true;
        const forwarded = request.get(FORWARDED_CLIENT_IP_HEADER)?.trim();
        if (forwarded && isIP(forwarded)) {
          request.clientIp = forwarded;
          request.clientIpForwarded = true;
        }
      }
    }
    next();
  };
}
