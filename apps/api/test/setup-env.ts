import 'dotenv/config';

// End-to-end tests exercise the real middleware stack against a real PostgreSQL database
// (DATABASE_URL from the environment or apps/api/.env). Rate limits are raised so the
// suite can sign in many times; everything else uses production code paths.
process.env.NODE_ENV = 'test';
process.env.AUTH_THROTTLE_LIMIT = '10000';
process.env.THROTTLE_LIMIT = '100000';
process.env.MAIL_TRANSPORT = 'console';
process.env.JWT_SECRET ??= 'e2e-test-secret-e2e-test-secret-e2e-test-secret';
