# Operations runbook

How TopFlow Hub is configured, released, backed up and restored. Architecture background: [ARCHITECTURE.md](ARCHITECTURE.md).

> **Status (16 September 2026): nothing is hosted yet.** The platform runs locally — see [section 9](#9-local-development). The rest of this runbook is the plan for the day a host is chosen; the reasoning is in ADR-019 of [DECISIONS.md](DECISIONS.md).

## 1. Environments

| | Production | Preview | Local |
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
| `SUPABASE_DB_URL` (secret), `BACKUP_AGE_RECIPIENT`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `API_HEALTH_URL` (variables) | GitHub Actions | Nightly backup and keep-alive |

Supabase Auth settings (site URL, redirect allow-list, password policy, MFA, email templates) are versioned in `supabase/config.toml` and applied with `npx supabase config push --project-ref <ref>` after `npx supabase login`.

## 3. Releasing

1. Merge into `develop`. Vercel builds both projects from the commit.
2. The API's production build runs `apps/api/scripts/release.mjs`: the environment preflight, then `prisma migrate deploy`. If either fails, the build fails and the previous deployment keeps serving.
3. Check `https://topflow-hub-api.vercel.app/health/ready` (`database: "up"`) and sign in to the web app.

**Rollback.** Use Vercel *Instant Rollback* on the affected project. Migrations are forward-only: keep them additive (add columns before using them, remove old columns in a later release) so the previous version still works against the new schema.

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

Every API response and error carries `x-request-id`; search the Vercel logs for it.

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
