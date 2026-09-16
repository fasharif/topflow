import 'dotenv/config';

// End-to-end tests exercise the real middleware stack against a real PostgreSQL database
// (DATABASE_URL from the environment or apps/api/.env). Supabase Auth is simulated so the suite
// needs no network: access tokens are signed locally with a test HS256 secret, exactly as the
// API verifies legacy-signed tokens, and the Auth admin API is replaced by an in-memory fake.
// Rate limits are raised so the suite can make many requests; everything else is production code.
process.env.NODE_ENV = 'test';
process.env.AUTH_THROTTLE_LIMIT = '10000';
process.env.THROTTLE_LIMIT = '100000';
process.env.MAIL_TRANSPORT = 'console';
process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.SUPABASE_JWT_SECRET =
  'e2e-supabase-jwt-secret-e2e-supabase-jwt-secret';
process.env.STAFF_MFA_REQUIRED = 'true';
process.env.INTERNAL_API_SECRET =
  'e2e-internal-api-secret-e2e-internal-api-secret';
delete process.env.SUPABASE_SECRET_KEY;
