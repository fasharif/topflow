# Operations runbook

How TopFlow Hub is configured, released, backed up and restored. Architecture background: [ARCHITECTURE.md](ARCHITECTURE.md).

> **Status (26 September 2026): nothing is hosted yet.** The platform runs locally — see [section 9](#9-local-development) — and as a production-like container stack ([section 10](#10-production-like-stack-docker-compose)). The rest of this runbook is the plan for the day a host is chosen: Vercel as ADR-014 planned, or the container images on AWS that [section 11](#11-aws-prepared-not-applied) prepares. The reasoning is in ADR-019 and ADR-023 of [DECISIONS.md](DECISIONS.md).

## 1. Environments

| | Production (planned, not deployed yet) | Preview | Local |
| --- | --- | --- | --- |
| Web | https://topflow-hub.vercel.app (Vercel `topflow-hub`) | Vercel preview URL per branch | http://localhost:3002 |
| API | https://topflow-hub-api.vercel.app (Vercel `topflow-hub-api`) | Vercel preview URL per branch | http://localhost:3000 |
| Database & Auth | Supabase project `topflow-hub` (`ap-south-1`) | Production project (previews never migrate) | `npm run supabase:start` |
| Deploys from | `develop` | any other branch | — |

## 2. Configuration

Secrets live only in the Vercel project settings, GitHub Actions secrets and Supabase — never in the repository. `apps/*/.env.example` documents every variable.

| Variable | Where | Notes |
| --- | --- | --- |
| `DATABASE_URL` | API | Supabase transaction pooler (port 6543) |
| `DIRECT_URL` | API (build) | Supabase session pooler (port 5432) — used by `prisma migrate deploy` |
| `SUPABASE_URL` | API | `https://<project-ref>.supabase.co` |
| `SUPABASE_SECRET_KEY` | API | Secret key (`sb_secret_…`): staff invitations, suspension |
| `STAFF_MFA_REQUIRED` | API | `true` in production |
| `INTERNAL_API_SECRET` | API **and** web | Same random value (32+ characters) in both projects |
| `APP_PUBLIC_URL`, `CORS_ORIGINS`, `TRUST_PROXY=true`, `NODE_ENV=production` | API | Links in emails, allowed browser origins |
| `MAIL_TRANSPORT`, `MAIL_FROM`, `RESEND_API_KEY` | API | Business emails (quotations, orders, team invitations) |
| `COMPANY_*` | API | Printed on quotation PDFs |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Web | Publishable key (`sb_publishable_…`) |
| `NEXT_PUBLIC_SITE_URL` | Web (production only) | Public origin used in email redirects, metadata and the sitemap |
| `API_INTERNAL_URL` | Web | API origin |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE` | API **and** web (optional) | Server errors go to Sentry when `SENTRY_DSN` is set; without it nothing is sent |
| `APP_VERSION` | API and web (set by the container images) | Reported by `/health`, so a deployment can be checked |
| `SUPABASE_DB_URL` (secret), `BACKUP_AGE_RECIPIENT`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `API_HEALTH_URL` (variables) | GitHub Actions | Nightly backup and keep-alive |
| `UPTIME_WEB_URL`, `UPTIME_API_URL` (variables) | GitHub Actions | Uptime check every 15 minutes ([section 7](#7-monitoring-and-incidents)) |
| `AWS_DEPLOY_ROLE_ARN`, `WEB_URL`, `API_URL` (environment variables); `AWS_TERRAFORM_PLAN_ROLE_ARN`, `AWS_TERRAFORM_APPLY_ROLE_ARN`, `TF_STATE_BUCKET` (repository variables) | GitHub Actions | AWS deployments ([section 11](#11-aws-prepared-not-applied)); workflows skip with a notice without them |

Supabase Auth settings (site URL, redirect allow-list, password policy, MFA, email templates) are versioned in `supabase/config.toml` and applied with `npx supabase config push --project-ref <ref>` after `npx supabase login`.

## 3. Releasing

1. Merge into `develop`. Vercel builds both projects from the commit.
2. The API's production build runs `apps/api/scripts/release.mjs`: the environment preflight, then `prisma migrate deploy`. If either fails, the build fails and the previous deployment keeps serving.
3. Check the API's `/health/ready` endpoint (planned address: `https://topflow-hub-api.vercel.app/health/ready`) for `database: "up"`, and sign in to the web app.

**Rollback.** Use Vercel *Instant Rollback* on the affected project. Migrations are forward-only: keep them additive (add columns before using them, remove old columns in a later release) so the previous version still works against the new schema.

**Containers.** The same release step ships as the `topflow-hub-migrate` image: the environment preflight, then `prisma migrate deploy`. The Compose stack runs it before the API starts; on AWS the Deploy workflow runs it as a one-off task before either service changes, and a rollback puts the previous images back without it ([section 11](#11-aws-prepared-not-applied)).

**New migration.** Change `packages/database/prisma/schema.prisma`, run `npm run db:migrate` locally, review the generated SQL, commit it. Production applies it on the next release.

## 4. Backups and restore

**What runs.** `.github/workflows/backup.yml` runs every night at 05:17 UAE time (and on demand from the Actions tab). It stores `topflow-hub-db-<timestamp>.tar.gz.age` for 30 days. The archive contains `roles.sql`, `schema.sql` and `data.sql` from `supabase db dump`, encrypted to the public key in `BACKUP_AGE_RECIPIENT`.

**The private key** is the only way to read a backup. Keep it in a password manager and one offline copy; without it, backups are unusable. To rotate: generate a new key pair, update `BACKUP_AGE_RECIPIENT`, and keep the old private key until the old artifacts expire.

**Restore** (to a new or emptied Supabase project):

```bash
# 1. Download the artifact from the workflow run and decrypt it
age -d -i topflow-hub-backup-key.txt topflow-hub-db-<timestamp>.tar.gz.age | tar -xz

# 2. Restore with the session connection string of the target project
psql "$TARGET_DB_URL" --single-transaction --variable ON_ERROR_STOP=1 \
  --file roles.sql --file schema.sql \
  --command 'SET session_replication_role = replica' --file data.sql
```

3. Point `DATABASE_URL` / `DIRECT_URL` of the API at the restored project if it changed, redeploy, and check `/health/ready`.
4. Storage objects are not part of database dumps; product photos also live in the repository (`apps/web/public/catalog`).

**Restore drill.** Practise the restore without touching any database: `infra/scripts/restore-drill.sh` decrypts a backup, restores it into a disposable container in the same way (one transaction, triggers off while data loads), checks that every table holds as many rows as the dump and that the core tables are not empty, reports how long each step took and removes the container.

```bash
infra/scripts/restore-drill.sh --backup topflow-hub-db-<timestamp>.tar.gz.age \
  --identity topflow-hub-backup-key.txt --report restore-drill.md
```

It restores into the Supabase Postgres image by default, because Supabase dumps expect its roles and extensions. Run it after changing the backup job, after rotating the key, and at least once a quarter; keep the reports. CI runs it on every change with a synthetic backup and a throwaway key ([infra/README.md](../infra/README.md#restore-drill)).

## 5. Accounts and access

- **Staff:** invite from *Back office → Users → Invite staff member*. Supabase emails the invitation; the colleague chooses a password and, in production, enrols an authenticator app on first access.
- **Lost authenticator:** in the Supabase dashboard, *Authentication → Users →* the user *→ MFA factors*, delete the factor. The user enrols a new app on next sign-in.
- **Suspension:** toggle *Account active* in *Back office → Users*. Access stops on the next request and the Supabase identity is banned.
- **Password help:** users reset their own password from *Forgot your password?*. Administrators never set passwords.

## 6. Email

- **Account emails** (confirmation, recovery, invitations, email change, security notifications) are sent by Supabase Auth with the templates in `supabase/templates`. Production needs custom SMTP: in Supabase *Authentication → Emails → SMTP*, use Resend (`smtp.resend.com`, port 465, user `resend`, password = Resend API key) with a verified `topflow.ae` sender.
- **Business emails** (quote acknowledgements, quotations, approvals, order updates, team invitations) are sent by the API through Resend (`MAIL_TRANSPORT=resend`).

## 7. Monitoring and incidents

| Symptom | First checks |
| --- | --- |
| Web shows "service temporarily unavailable" | `/health/ready` on the API; Vercel runtime logs of `topflow-hub-api`; Supabase project status |
| Everyone is signed out or gets 401 | Supabase Auth status; `SUPABASE_URL` on the API; JWKS reachable at `<SUPABASE_URL>/auth/v1/.well-known/jwks.json` |
| Staff get "two-factor authentication required" | Expected until they verify with their authenticator app (`/auth/mfa`) |
| 429 Too Many Requests | Per-client limits (`THROTTLE_*`); confirm `INTERNAL_API_SECRET` matches in both projects, otherwise every shopper shares the web server's quota |
| Supabase project paused | Restore it from the dashboard; check that the nightly backup job (which keeps it awake) is succeeding |
| The Uptime workflow failed | Its job summary lists which check failed (web or API liveness, database readiness, home page); then as above |
| A CloudWatch alarm (AWS) | The alarm's description names the symptom; the service's log group is `/topflow-hub/<environment>/api` or `/web` |

Every API response and error carries `x-request-id`; search the logs for it (Vercel, CloudWatch or `docker compose logs`).

- **Error reporting.** With `SENTRY_DSN` set, the API reports every 5xx (with its request id) and the web server reports errors in Server Components, Route Handlers, Server Actions and the proxy. Every event loses the request's cookies, authorisation and internal headers, client addresses, body and query string; breadcrumbs of outgoing calls keep only the URL's origin and path, and console output is not sent. Error messages and stack traces are sent as written, so code must not put personal data into them. Without the variable the SDK is never started. Browser-side errors are not reported (ADR-023).
- **Uptime.** `.github/workflows/uptime.yml` checks both health endpoints, database readiness and the home page every 15 minutes, with retries; a failed run emails whoever last changed the schedule.

## 8. Rotating secrets

| Secret | Steps |
| --- | --- |
| `INTERNAL_API_SECRET` | Set the new value in both Vercel projects, redeploy the API first, then the web app |
| `SUPABASE_SECRET_KEY` | Create a new secret key in Supabase *Project Settings → API Keys*, update the API, redeploy, delete the old key |
| Database password | Reset it in Supabase *Database settings*, update `DATABASE_URL`, `DIRECT_URL` and the backup secret `SUPABASE_DB_URL` |
| JWT signing keys | Rotate in Supabase *JWT Keys*; the API picks up the new key from the JWKS automatically and existing sessions keep working |

## 9. Local development

```bash
npm run supabase:start      # PostgreSQL, Auth, Storage, Studio (54323) and Mailpit (54324)
npx supabase status         # URLs and keys for apps/api/.env, apps/web/.env.local, packages/database/.env
npm run db:deploy && npm run db:seed
npm run dev
npm run supabase:stop       # when finished (data is kept in Docker volumes)
```

## 10. Production-like stack (Docker Compose)

`docker-compose.prod.yml` runs the container images with production settings — HTTPS through Caddy, staff MFA, read-only containers, the release step before the API — next to PostgreSQL 17, Supabase Auth (GoTrue) and Mailpit. CI starts it for every change and runs the smoke test with a real sign-in.

```bash
node infra/compose/generate-env.mts            # secrets and Supabase keys → infra/compose/.env
docker compose -f docker-compose.prod.yml --env-file infra/compose/.env up -d --build --wait
docker compose -f docker-compose.prod.yml --env-file infra/compose/.env --profile demo run --rm seed
docker compose -f docker-compose.prod.yml --env-file infra/compose/.env logs -f api web
docker compose -f docker-compose.prod.yml --env-file infra/compose/.env --profile demo down -v
```

The web app is at https://localhost:8443, the API at https://api.localhost:8443 and Supabase Auth at https://auth.localhost:8443/auth/v1; emails appear at http://127.0.0.1:8025. Certificates come from Caddy's local authority; trust its root certificate (`docker compose ... cp proxy:/data/caddy/pki/authorities/local/root.crt .`) or accept the browser's warning. Details: [infra/README.md](../infra/README.md#production-like-stack-docker-compose).

## 11. AWS (prepared, not applied)

`infra/terraform` describes staging and production on ECS Fargate behind an Application Load Balancer in `ap-south-1`, with Supabase unchanged for data and identity. None of it has been applied; the first-time setup and the GitHub configuration are in [infra/README.md](../infra/README.md#aws-prepared-not-applied).

| Task | How |
| --- | --- |
| Release | **Deploy** workflow: environment, `deploy`, the image tag `sha-<commit>` published by the Containers workflow. After a reviewer approves: release step, then API, then web, each checked healthy; then a smoke test of the public URLs |
| Roll back | **Deploy** workflow with `rollback`: the previous images return on both services in one step, without migrations (keep them additive, [section 3](#3-releasing)); running it again returns to the newer release |
| Set or rotate a secret | `aws ssm put-parameter --overwrite --type SecureString --key-id alias/topflow-hub-<environment> --name /topflow-hub/<environment>/api/<NAME> --value ...`, then release again (tasks read secrets when they start) |
| Change infrastructure | Pull request: the Infrastructure workflow checks it and, once configured, plans both environments; apply with the workflow's manual `apply` input |
| Watch costs | The account budget (bootstrap) emails at 50%, 80% and 100% of the monthly limit and on the forecast |
