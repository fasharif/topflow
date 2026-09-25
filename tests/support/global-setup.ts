import { stack } from './env';

async function reachable(url: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    return { ok: response.ok, detail: `${response.status}` };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

/** Fails fast, with instructions, when the stack under test is not running. */
export default async function globalSetup(): Promise<void> {
  const checks = [
    { name: 'API readiness', url: `${stack.apiUrl}/health/ready`, hint: 'start the API (npm run dev, or npm run start:prod -w @topflow/api)' },
    { name: 'web app', url: `${stack.webUrl}/login`, hint: 'start the web app (npm run dev, or npm run start -w web)' },
    { name: 'Mailpit', url: `${stack.mailpitUrl}/api/v1/info`, hint: 'start Supabase locally (npm run supabase:start)' },
  ];
  const failures: string[] = [];
  for (const check of checks) {
    const result = await reachable(check.url);
    if (!result.ok) failures.push(`- ${check.name} at ${check.url} is not ready (${result.detail}): ${check.hint}`);
  }
  if (failures.length > 0) {
    throw new Error(`The stack under test is not running:\n${failures.join('\n')}\nSee tests/README.md.`);
  }
}
