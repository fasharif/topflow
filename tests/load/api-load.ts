/**
 * k6 load test for the TopFlow Hub API (runs in the grafana/k6 container, see run-k6.sh).
 *
 *   K6_PROFILE=smoke  one virtual user, a few iterations: proves the script and thresholds work
 *   K6_PROFILE=load   shoppers browsing, signed-in customers and quote requests at a steady rate
 *
 * The p95 thresholds below are targets. When one is missed, k6 exits with code 99 and the run
 * fails. Measured results belong in docs/testing/PERFORMANCE.md, from a quiet machine only.
 */
import { check, fail, group, sleep } from 'k6';
import exec from 'k6/execution';
import http, { type RefinedResponse, type ResponseType } from 'k6/http';
import type { Options } from 'k6/options';

const API_URL = (__ENV.API_URL ?? 'http://host.docker.internal:3000').replace(/\/+$/, '');
const SUPABASE_URL = (__ENV.SUPABASE_URL ?? 'http://host.docker.internal:54321').replace(/\/+$/, '');
const SUPABASE_PUBLISHABLE_KEY = __ENV.SUPABASE_PUBLISHABLE_KEY ?? '';
const CUSTOMER_EMAIL = __ENV.CUSTOMER_EMAIL ?? 'customer@example.com';
const DEMO_PASSWORD = __ENV.DEMO_PASSWORD ?? 'TopFlow2026!';
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

export const options: Options = {
  scenarios,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    'http_req_duration{endpoint:health}': ['p(95)<200'],
    'http_req_duration{endpoint:categories}': ['p(95)<500'],
    'http_req_duration{endpoint:catalogue}': ['p(95)<500'],
    'http_req_duration{endpoint:search}': ['p(95)<500'],
    'http_req_duration{endpoint:product}': ['p(95)<500'],
    'http_req_duration{endpoint:me}': ['p(95)<500'],
    'http_req_duration{endpoint:my-orders}': ['p(95)<500'],
    'http_req_duration{endpoint:quote-request}': ['p(95)<1000'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'max', 'count'],
};

interface SetupData {
  accessToken: string;
  slugs: string[];
  productIds: string[];
}

/** Headers of the web app's server calling on behalf of shopper number `vu`. */
function shopperHeaders(): Record<string, string> {
  if (!INTERNAL_API_SECRET) return {};
  const vu = exec.vu.idInTest;
  return {
    'x-topflow-internal-auth': INTERNAL_API_SECRET,
    'x-topflow-client-ip': `10.20.${Math.floor(vu / 250)}.${(vu % 250) + 1}`,
  };
}

function get(path: string, endpoint: string, headers: Record<string, string> = {}): RefinedResponse<ResponseType> {
  return http.get(`${API_URL}${path}`, { headers: { accept: 'application/json', ...shopperHeaders(), ...headers }, tags: { endpoint } });
}

function jsonBody<T>(response: RefinedResponse<ResponseType>): T {
  return response.json() as unknown as T;
}

export function setup(): SetupData {
  const ready = http.get(`${API_URL}/health/ready`);
  if (ready.status !== 200) fail(`API not ready at ${API_URL} (status ${ready.status})`);

  const signIn = http.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, JSON.stringify({ email: CUSTOMER_EMAIL, password: DEMO_PASSWORD }), {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'content-type': 'application/json' },
  });
  if (signIn.status !== 200)
    fail(`Supabase sign-in for ${CUSTOMER_EMAIL} failed with ${signIn.status}: ${typeof signIn.body === 'string' ? signIn.body : ''}`);

  const page = jsonBody<{ items: Array<{ id: string; slug: string; isTradeOnly: boolean }> }>(
    http.get(`${API_URL}/catalog/products?pageSize=100&sort=name`),
  );
  const retail = page.items.filter((item) => !item.isTradeOnly);
  if (retail.length === 0) fail('The catalogue is empty: seed the database first (npm run db:seed)');
  return {
    accessToken: jsonBody<{ access_token: string }>(signIn).access_token,
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
export function account(data: SetupData): void {
  const auth = { authorization: `Bearer ${data.accessToken}` };
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
    { headers: { 'content-type': 'application/json', ...shopperHeaders() }, tags: { endpoint: 'quote-request' } },
  );
  check(response, { 'quote request: 201': (r) => r.status === 201 });
}
