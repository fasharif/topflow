import { Injectable } from '@nestjs/common';
import type { AuthSession } from '@topflow/shared';
import type { Response } from 'express';
import type { AppRequest } from '../common/request-context';
import { InjectConfig } from '../config/config.module';
import type { AppConfig } from '../config/env';
import type { IssuedSession } from './auth.service';

/** Native apps send this header so refresh tokens are returned in the body instead of a cookie. */
export const CLIENT_PLATFORM_HEADER = 'x-client-platform';

/**
 * Delivers sessions to clients. Browsers get the refresh token only as an httpOnly,
 * SameSite cookie (unreadable by JavaScript, so XSS cannot exfiltrate it); native apps,
 * which have OS-level secure storage, receive it in the response body.
 */
@Injectable()
export class SessionCookieService {
  constructor(@InjectConfig() private readonly config: AppConfig) {}

  respond(req: AppRequest, res: Response, issued: IssuedSession): AuthSession {
    if (req.get(CLIENT_PLATFORM_HEADER) === 'mobile') {
      return { ...issued.session, refreshToken: issued.refreshToken };
    }
    res.cookie(this.config.auth.refreshCookieName, issued.refreshToken, {
      httpOnly: true,
      secure: this.config.auth.cookieSecure,
      sameSite: this.config.auth.cookieSameSite,
      path: '/',
      expires: issued.refreshExpiresAt,
    });
    return issued.session;
  }

  read(req: AppRequest): string | undefined {
    const cookies = req.cookies as
      Record<string, string | undefined> | undefined;
    return cookies?.[this.config.auth.refreshCookieName];
  }

  clear(res: Response): void {
    res.clearCookie(this.config.auth.refreshCookieName, {
      httpOnly: true,
      secure: this.config.auth.cookieSecure,
      sameSite: this.config.auth.cookieSameSite,
      path: '/',
    });
  }
}
