/**
 * k6 load test for the TopFlow Hub API (runs in the grafana/k6 container, see run-k6.sh).
 *
 *   K6_PROFILE=smoke  one virtual user, a few iterations: proves the script, the endpoints and the
 *                     thresholds work. It fails on errors and failed checks, not on timings: a p95
 *                     of three requests is the slowest single request, which says nothing.
 *   K6_PROFILE=load   shoppers browsing, signed-in customers and quote requests at a steady rate;
 *                     the p95 targets are thresholds, so a missed target fails the run (exit 99)
 *
 * Measured results belong in docs/testing/PERFORMANCE.md, from a quiet machine only.
 */
import { check, fail, group, sleep } from 'k6';
import exec from 'k6/execution';
import http, { type RefinedResponse, type ResponseType } from 'k6/http';
import type { Options } from 'k6/options';

const API_URL = (__ENV.API_URL ?? 'http://host.docker.internal:3000').replace(/\/+$/, '');
const SUPABASE_URL = (__ENV.SUPABASE_URL ?? 'http://host.docker.internal:54321').replace(/\/+$/, '');
const SUPABASE_PUBLISHABLE_KEY = __ENV.SUPABASE_PUBLISHABLE_KEY ?? '';
/** The demo customer's sign-in; run-k6.sh passes the published account from @topflow/shared. */
const CUSTOMER_EMAIL = __ENV.CUSTOMER_EMAIL ?? '';
const DEMO_PASSWORD = __ENV.DEMO_PASSWORD ?? '';
/** With the web app's shared secret, each virtual user is rate limited as its own shopper, as behind the web app. */
const INTERNAL_API_SECRET = __ENV.INTERNAL_API_SECRET ?? '';
const PROFILE = __ENV.K6_PROFILE ?? 'smoke';

const SEARCH_TERMS = ['drip', 'valve', 'sprinkler', 'filter', 'pipe', 'rotor', 'bubbler', 'hose'];

const SCENARIOS: Record<string, NonNullable<Options['scenarios']>> = {
  smoke: {
    browse: { executor: 'shared-iterations', exec: 'browse', vus: 1, iterations: 3 },
    account: { executor: 'shared-iterations', exec: 'account', vus: 1, iterations: 3 },
    quote: { executor: 'shared-iterations', exec: 'quote', vus: 1, iterations: 1 },
  },
  load: {
    browse: {
      executor: 'ramping-vus',
      exec: 'browse',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 20 },
        { duration: '3m', target: 20 },
        { duration: '30s', target: 0 },
      ],
    },
    account: {
      executor: 'constant-vus',
      exec: 'account',
      vus: 5,
      duration: '4m30s',
    },
    quote: {
      executor: 'constant-arrival-rate',
      exec: 'quote',
      rate: 12,
      timeUnit: '1m',
      duration: '4m30s',
      preAllocatedVUs: 2,
    },
  },
};

const scenarios = SCENARIOS[PROFILE];
if (!scenarios) throw new Error(`Unknown K6_PROFILE "${PROFILE}" (use smoke or load)`);

/** p95 targets in milliseconds per endpoint tag (docs/testing/PERFORMANCE.md). */
const P95_TARGETS_MS: Record<string, number> = {
  health: 200,
  categories: 500,
  catalogue: 500,
  search: 500,
  product: 500,
  me: 500,
  'my-orders': 500,
  'quote-request': 1000,
};

/**
 * The load profile gates on the p95 targets. The smoke profile only guards against a request that
 * hangs (30 s); the threshold still makes k6 report each endpoint separately in the summary.
 */
const durationThresholds = Object.fromEntries(
  Object.entries(P95_TARGETS_MS).map(([endpoint, target]) => [
    `http_req_duration{endpoint:${endpoint}}`,
    [PROFILE === 'load' ? `p(95)<${target}` : 'max<30000'],
  ]),
);

export const options: Options = {
  scenarios,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    ...durationThresholds,
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'max', 'count'],
};

/**
 * What setup() hands to every virtual user. k6 copies it into the summary export, so it must hold
 * nothing secret: each virtual user signs in for itself (customerToken).
 */
interface SetupData {
  slugs: string[];
  productIds: string[];
}

/**
 * Headers of the web app's server calling on behalf of shopper number `shopper` (by default one
 * shopper per virtual user), so each is rate limited on its own.
 */
function shopperHeaders(shopper: number = exec.vu.idInTest): Record<string, string> {
  if (!INTERNAL_API_SECRET) return {};
  return {
    'x-topflow-internal-auth': INTERNAL_API_SECRET,
    'x-topflow-client-ip': `10.${Math.floor(shopper / 62_500) % 256}.${Math.floor(shopper / 250) % 250}.${(shopper % 250) + 1}`,
  };
}

function get(path: string, endpoint: string, headers: Record<string, string> = {}): RefinedResponse<ResponseType> {
  return http.get(`${API_URL}${path}`, { headers: { accept: 'application/json', ...shopperHeaders(), ...headers }, tags: { endpoint } });
}

function jsonBody<T>(response: RefinedResponse<ResponseType>): T {
  return response.json() as unknown as T;
}

/** Signs the demo customer in with Supabase Auth; untagged, so it stays out of the endpoint results. */
function signIn(): string {
  const response = http.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email: CUSTOMER_EMAIL, password: DEMO_PASSWORD }),
    {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'content-type': 'application/json' },
    },
  );
  if (response.status !== 200)
    fail(`Supabase sign-in for ${CUSTOMER_EMAIL} failed with ${response.status}: ${typeof response.body === 'string' ? response.body : ''}`);
  return jsonBody<{ access_token: string }>(response).access_token;
}

/** This virtual user's access token: each one signs in once, on its first account iteration. */
let customerToken: string | undefined;
function accessToken(): string {
  customerToken ??= signIn();
  return customerToken;
}

export function setup(): SetupData {
  if (!CUSTOMER_EMAIL || !DEMO_PASSWORD) fail('Set CUSTOMER_EMAIL and DEMO_PASSWORD (run-k6.sh passes the demo customer).');
  const ready = http.get(`${API_URL}/health/ready`);
  if (ready.status !== 200) fail(`API not ready at ${API_URL} (status ${ready.status})`);

  const page = jsonBody<{ items: Array<{ id: string; slug: string; isTradeOnly: boolean }> }>(
    http.get(`${API_URL}/catalog/products?pageSize=100&sort=name`),
  );
  const retail = page.items.filter((item) => !item.isTradeOnly);
  if (retail.length === 0) fail('The catalogue is empty: seed the database first (npm run db:seed)');

  // Warm-up, untagged so it stays out of the endpoint results: the API fetches and caches the
  // Supabase signing keys on the first authenticated request. The token is not returned.
  const me = http.get(`${API_URL}/auth/me`, { headers: { authorization: `Bearer ${signIn()}` } });
  if (me.status !== 200) fail(`The API refused the customer's token (status ${me.status})`);

  return {
    slugs: retail.map((item) => item.slug),
    productIds: retail.map((item) => item.id),
  };
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}

/** An anonymous shopper: readiness, categories, a catalogue page, a search and a product page. */
export function browse(data: SetupData): void {
  group('browse the catalogue', () => {
    check(get('/health/ready', 'health'), { 'health: ready': (r) => r.status === 200 });
    check(get('/catalog/categories', 'categories'), { 'categories: 200': (r) => r.status === 200 });
    const page = 1 + Math.floor(Math.random() * 5);
    check(get(`/catalog/products?page=${page}&pageSize=20`, 'catalogue'), {
      'catalogue: 200': (r) => r.status === 200,
      'catalogue: has items': (r) => jsonBody<{ items: unknown[] }>(r).items.length > 0,
    });
    check(get(`/catalog/products?search=${pick(SEARCH_TERMS)}`, 'search'), { 'search: 200': (r) => r.status === 200 });
    check(get(`/catalog/products/${pick(data.slugs)}`, 'product'), { 'product: 200': (r) => r.status === 200 });
  });
  sleep(1);
}

/** A signed-in retail customer checking their account and order history. */
export function account(): void {
  const auth = { authorization: `Bearer ${accessToken()}` };
  group('customer account', () => {
    check(get('/auth/me', 'me', auth), { 'me: 200': (r) => r.status === 200 });
    check(get('/me/orders?pageSize=10', 'my-orders', auth), { 'my orders: 200': (r) => r.status === 200 });
  });
  sleep(1);
}

/** A website visitor sending their basket for a quotation (public, rate-limited form). */
export function quote(data: SetupData): void {
  const response = http.post(
    `${API_URL}/quote-requests`,
    JSON.stringify({
      name: 'Load Test Visitor',
      email: `load.${exec.vu.idInTest}.${exec.scenario.iterationInTest}@e2e.topflow.test`,
      phone: '+971 50 555 0199',
      preferredContact: 'EMAIL',
      projectReference: 'k6 load test',
      items: [{ productId: pick(data.productIds), quantity: 2 }],
    }),
    // Every quote request comes from a different visitor, as on the website.
    {
      headers: { 'content-type': 'application/json', ...shopperHeaders(100_000 + exec.scenario.iterationInTest) },
      tags: { endpoint: 'quote-request' },
    },
  );
  check(response, { 'quote request: 201': (r) => r.status === 201 });
}
