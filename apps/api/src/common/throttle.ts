import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { AppRequest } from './request-context';

/** Stricter per-client limit for unauthenticated writes such as public forms. */
export const strictThrottle = {
  default: {
    limit: () => Number(process.env.AUTH_THROTTLE_LIMIT ?? 10),
    ttl: 60_000,
  },
};

/**
 * Rate limits per client address. Browser traffic reaches the API through the web app's server,
 * so the address forwarded by that trusted proxy (see client-ip.ts) counts, not the socket peer.
 */
@Injectable()
export class ClientThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(
    request: Record<string, unknown>,
  ): Promise<string> {
    const appRequest = request as unknown as AppRequest;
    return Promise.resolve(appRequest.clientIp ?? appRequest.ip ?? 'unknown');
  }

  /**
   * Server-rendered pages fetch cached catalogue data from the web app's server with the internal
   * secret but no shopper address. Those calls must not share one quota, so they are not limited.
   */
  protected override shouldSkip(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AppRequest>();
    if (request.internalCaller && !request.clientIpForwarded) {
      return Promise.resolve(true);
    }
    return super.shouldSkip(context);
  }
}
