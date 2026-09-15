# @topflow/api

NestJS 11 REST API for the Top Flow commerce platform — a modular monolith with one module per bounded context. Interactive OpenAPI documentation is served at **`/docs`** (enabled by default outside production).

## Modules

| Module | Endpoints | Notes |
| --- | --- | --- |
| `auth` | `/auth/*` | Personal and business registration, login, refresh-token rotation, logout (one device / all devices), email verification, password reset and change |
| `users` | `/me`, `/me/addresses`, `/admin/users` | Profile, address book, staff account administration |
| `organizations` | `/org`, `/org/members`, `/org/invitations`, `/org/addresses`, `/invitations/*`, `/admin/organizations` | B2B tenants, roles and spending limits, invitations, delivery sites, KYC review and commercial terms |
| `catalog` | `/catalog/*`, `/admin/products`, `/admin/categories` | Public catalog with viewer-dependent pricing, product and stock administration |
| `procurement` | `/org/rfqs`, `/org/quotations`, `/admin/rfqs`, `/admin/quotations` | RFQs, quotation revisions, customer responses, purchase approvals, PDF quotations |
| `orders` | `/me/orders`, `/org/orders`, `/admin/orders` | Retail checkout, B2B orders, fulfilment transitions, payments |
| `dashboard`, `audit` | `/admin/dashboard`, `/admin/audit-logs` | KPIs and the audit trail |
| `health` | `/health`, `/health/ready` | Liveness and database readiness |

## Security model

- **Authentication:** 15-minute JWT access tokens; rotating, hashed refresh tokens with reuse detection (httpOnly cookie for browsers, response body for native apps that send `x-client-platform: mobile`).
- **Authorization:** global guards — `JwtAuthGuard` (every route unless `@Public()`), `PermissionsGuard` (`@RequirePermissions`, platform roles), `OrganizationGuard` (`@RequireOrgPermission`, tenant membership from `x-organization-id`).
- **Hardening:** Helmet, CORS allowlist, per-IP rate limits (stricter on credential endpoints), 1 MB body limit, validated environment, uniform error envelope with request ids, no client-supplied prices.

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

- **Unit** (`src/**/*.spec.ts`): token rotation and reuse detection, guards, error mapping, configuration, pricing.
- **End-to-end** (`test/app.e2e-spec.ts`): boots `AppModule` with the production middleware stack (`configureApp`) against PostgreSQL and covers authentication flows (via the development mail outbox), RBAC, tenant isolation, the RFQ → quotation → approval → order journey and retail checkout through delivery.
