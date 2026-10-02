# @topflow/api

NestJS 11 REST API for TopFlow Hub — a modular monolith with one module per bounded context, deployed to Vercel Functions. Interactive OpenAPI documentation is served at **`/docs`** (enabled by default outside production).

## Modules

| Module | Endpoints | Notes |
| --- | --- | --- |
| `auth` | `/auth/me` | Supabase token verification, account provisioning, global guards. Sign-in itself happens with Supabase Auth |
| `users` | `/me`, `/me/organizations`, `/me/addresses`, `/admin/users` | Profile, opening a trade account, address book, staff invitations and suspension |
| `organizations` | `/org`, `/org/members`, `/org/invitations`, `/org/addresses`, `/invitations/*`, `/admin/organizations` | B2B tenants, roles and spending limits, invitations, delivery sites, KYC review and commercial terms |
| `catalog` | `/catalog/*`, `/admin/products`, `/admin/categories` | Public catalog with viewer-dependent pricing, product and stock administration |
| `procurement` | `/quote-requests`, `/org/rfqs`, `/org/quotations`, `/admin/rfqs`, `/admin/quotations` | Website quote requests and project enquiries, RFQs, quotation revisions, responses, purchase approvals, PDF quotations |
| `orders` | `/me/orders`, `/org/orders`, `/admin/orders` | Retail checkout, B2B orders, fulfilment transitions, payments |
| `dashboard`, `audit` | `/admin/dashboard`, `/admin/audit-logs` | KPIs and the audit trail |
| `health` | `/health`, `/health/ready` | Liveness and database readiness |

## Security model

- **Authentication.** Clients send a Supabase access token (`Authorization: Bearer …`). `AccessTokenVerifier` checks the signature against the project's JWKS (cached), the issuer, the `authenticated` audience and expiry; anonymous sessions are refused. The first request of a new identity provisions the platform account (same id) from the sign-up metadata; later requests reload it, so role changes and suspensions apply immediately.
- **Authorization.** Global guards: `AuthenticationGuard` (every route unless `@Public()`), `PermissionsGuard` (`@RequirePermissions`, platform roles, plus `aal2` for staff when `STAFF_MFA_REQUIRED=true`) and `OrganizationGuard` (`@RequireOrgPermission`, tenant membership from `x-organization-id`).
- **Supabase administration.** `IdentityAdminService` uses the secret key for staff invitations and suspensions; it never leaves the API.
- **Public demo.** With `DEMO_MODE=true`, `MailService` delivers business email only to single addresses on `DEMO_MAIL_ALLOWLIST` or its `@domains` (`src/mail/mail-guard.ts`; a whole public mail domain such as `@gmail.com` is refused at start-up), and `DemoPolicy` (`src/demo/demo-policy.ts`) refuses, with `code: "DEMO_RESTRICTED"`, Supabase invitations outside that list, changes to the published demo accounts (platform role, suspension, organisation role, approval limit and membership) and changes to the demo organisation's KYC status, trading terms, TRN and trade licence number. The environment check refuses staff MFA and rate limits looser than the defaults in demo mode ([ADR-021](../../docs/DECISIONS.md)).
- **Hardening.** Helmet, CORS allowlist, per-client rate limits (stricter on public forms) with trusted client-IP forwarding from the web app (`INTERNAL_API_SECRET`), 1 MB body limit, validated environment, uniform error envelope with request ids and machine-readable codes, no client-supplied prices, and RLS lockdown of every table.

## Scripts

```bash
npm run start:dev -w @topflow/api     # watch mode on :3000
npm run build -w @topflow/api         # compile to dist/
npm run lint -w @topflow/api          # ESLint (type-aware) + Prettier check
npm run check-types -w @topflow/api
npm test -w @topflow/api              # unit tests
npm run test:e2e -w @topflow/api      # end-to-end tests (needs a migrated + seeded database)
```

Configuration is documented in [`.env.example`](.env.example) and validated at startup by [`src/config/env.ts`](src/config/env.ts).

## Testing

- **Unit** (`src/**/*.spec.ts`): Supabase token verification (ES256 keys, legacy HS256, issuer/audience/expiry), guards including staff MFA, error mapping, configuration (including demo mode), pricing, the demo mail guard and `DemoPolicy`.
- **End-to-end** (`test/app.e2e-spec.ts`): boots `AppModule` with the production middleware stack (`configureApp`) against PostgreSQL. Supabase is simulated — tokens are signed locally (`test/support/supabase.ts`) and the admin API is an in-memory fake — so the suite needs no network. It covers provisioning, token rejection, MFA, staff invitations and suspension, team invitations, trade accounts, RBAC, tenant isolation, the RFQ → quotation → approval → order journey, website quote requests, retail checkout through delivery, trusted client-IP forwarding and the RLS lockdown.
- **Demo mode** (`test/demo.e2e-spec.ts`): boots the same stack with `DEMO_MODE=true` and the Resend transport, recording calls to Resend at the fetch boundary. It checks the seeded demo accounts and organisation, withheld and allow-listed email, refused staff and customer invitations, the locked demo accounts, members and organisation (and that other members and organisations can still be changed) and the public-form rate limit. Each test starts from the seeded demo state, so a broken guard fails only its own test.

## Deployment

Not hosted yet ([ADR-019](../../docs/DECISIONS.md)). The API is ready to deploy as a serverless function or a container: `npm run release` validates the environment and applies migrations before a new version serves traffic, and [`vercel.json`](vercel.json) with [`scripts/release.mjs`](scripts/release.mjs) are kept for the Vercel option. See [docs/OPERATIONS.md](../../docs/OPERATIONS.md).
