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

  /**
   * Waits for the newest email to `to` whose subject contains `subject`, and returns it. When none
   * arrives, the error lists the subjects Mailpit did receive for that address.
   */
  async latest(to: string, subject: string, timeoutMs = 30_000): Promise<MailpitMessage> {
    let id: string | undefined;
    try {
      await expect
        .poll(
          async () => {
            id = (await this.search(`to:"${to}" subject:"${subject}"`, 1))[0]?.ID;
            return id;
          },
          { message: `an email to ${to} with subject "${subject}"`, timeout: timeoutMs },
        )
        .toBeTruthy();
    } catch (error) {
      const received = (await this.search(`to:"${to}"`, 10).catch(() => [])).map((message) => `"${message.Subject}"`);
      throw new Error(
        `No email to ${to} with subject "${subject}" arrived within ${timeoutMs / 1000} s. ` +
          (received.length > 0
            ? `Mailpit received ${received.join(', ')} for that address. Another subject for the same email means the Supabase stack did not load the templates in supabase/templates (tests/README.md, Troubleshooting).`
            : 'Mailpit received nothing for that address.'),
        { cause: error },
      );
    }
    const message = await this.request.get(`${stack.mailpitUrl}/api/v1/message/${id}`);
    return (await message.json()) as MailpitMessage;
  }

  private async search(query: string, limit: number): Promise<MailpitSearch['messages']> {
    const response = await this.request.get(`${stack.mailpitUrl}/api/v1/search`, { params: { query, limit } });
    if (!response.ok()) throw new Error(`Mailpit search failed with ${response.status()}. Is Mailpit reachable at ${stack.mailpitUrl}?`);
    return ((await response.json()) as MailpitSearch).messages;
  }

  /** The first link in an email that points at `pathname` on the web app, with HTML entities decoded. */
  static link(message: MailpitMessage, pathname: string): string {
    const hrefs = [...message.HTML.matchAll(/href="([^"]+)"/g)].map((match) => (match[1] ?? '').replaceAll('&amp;', '&'));
    const found = hrefs.find((href) => new URL(href, stack.webUrl).pathname === pathname);
    if (!found) throw new Error(`No ${pathname} link in "${message.Subject}" (links: ${hrefs.join(', ') || 'none'})`);
    return found;
  }
}
