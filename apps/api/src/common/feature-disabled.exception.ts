import { ServiceUnavailableException } from '@nestjs/common';

/**
 * A 503 the API answers on purpose because a feature is switched off by configuration, such as
 * the dispatch webhook endpoint without DISPATCH_WEBHOOK_SECRET. The status tells the caller to
 * try again later, but nothing has failed, so HttpExceptionFilter logs one warning line and does
 * not report it to Sentry. Treated as a server error, a public endpoint whose feature is off
 * would let anyone fill the error log and use up the Sentry quota.
 */
export class FeatureDisabledException extends ServiceUnavailableException {
  constructor(message: string, code: string) {
    super({ message, code });
  }
}
