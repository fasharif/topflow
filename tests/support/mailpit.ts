import { expect, type APIRequestContext } from '@playwright/test';
import { stack } from './env';

interface MailpitSearch {
  messages: Array<{ ID: string; Subject: string; Created: string }>;
}

interface MailpitMessage {
  Subject: string;
  HTML: string;
  Text: string;
}

/**
 * Reads the emails the local Supabase stack sends (Mailpit, http://127.0.0.1:54324 by default).
 * Mailpit API reference: https://mailpit.axllent.org/docs/api-v1/
 */
export class Mailpit {
  constructor(private readonly request: APIRequestContext) {}

  /** Waits for the newest email to `to` whose subject contains `subject`, and returns it. */
  async latest(to: string, subject: string, timeoutMs = 30_000): Promise<MailpitMessage> {
    let id: string | undefined;
    await expect
      .poll(
        async () => {
          const response = await this.request.get(`${stack.mailpitUrl}/api/v1/search`, {
            params: { query: `to:"${to}" subject:"${subject}"`, limit: 1 },
          });
          if (!response.ok()) throw new Error(`Mailpit search failed with ${response.status()}. Is Mailpit reachable at ${stack.mailpitUrl}?`);
          id = ((await response.json()) as MailpitSearch).messages[0]?.ID;
          return id;
        },
        { message: `an email to ${to} with subject "${subject}"`, timeout: timeoutMs },
      )
      .toBeTruthy();
    const message = await this.request.get(`${stack.mailpitUrl}/api/v1/message/${id}`);
    return (await message.json()) as MailpitMessage;
  }

  /** The first link in an email that points at `pathname` on the web app, with HTML entities decoded. */
  static link(message: MailpitMessage, pathname: string): string {
    const hrefs = [...message.HTML.matchAll(/href="([^"]+)"/g)].map((match) => (match[1] ?? '').replaceAll('&amp;', '&'));
    const found = hrefs.find((href) => new URL(href, stack.webUrl).pathname === pathname);
    if (!found) throw new Error(`No ${pathname} link in "${message.Subject}" (links: ${hrefs.join(', ') || 'none'})`);
    return found;
  }
}
