# Operations runbook

How TopFlow Hub is configured, released, backed up and restored, and how its public demo works. Architecture background: [ARCHITECTURE.md](ARCHITECTURE.md).

> **Status (16 September 2026): nothing is hosted yet.** The platform runs locally — see [section 9](#9-local-development). The rest of this runbook is the plan for the day a host is chosen; the reasoning is in ADR-019 of [DECISIONS.md](DECISIONS.md).

## 1. Environments

| | Production (planned, not deployed yet) | Preview | Public demo (planned, not deployed yet) | Local |
| --- | --- | --- | --- | --- |
| Web | https://topflow-hub.vercel.app (Vercel `topflow-hub`) | Vercel preview URL per branch | Its own deployment, built with `NEXT_PUBLIC_DEMO_MODE=true` | http://localhost:3002 |
| API | https://topflow-hub-api.vercel.app (Vercel `topflow-hub-api`) | Vercel preview URL per branch | Its own deployment, with `DEMO_MODE=true` | http://localhost:3000 |
| Database & Auth | Supabase project `topflow-hub` (`ap-south-1`) | Production project (previews never migrate) | A separate Supabase project, reset every night ([section 10](#10-public-demo)) | `npm run supabase:start` |
| Deploys from | `develop` | any other branch | `develop` | — |

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
| `DEMO_MODE`, `DEMO_MAIL_ALLOWLIST` | API | Public demo only ([section 10](#10-public-demo)); `false` (or unset) and empty everywhere else |
| `COMPANY_*` | API | Printed on quotation PDFs |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Web | Publishable key (`sb_publishable_…`) |
| `NEXT_PUBLIC_SITE_URL` | Web (production only) | Public origin used in email redirects, metadata and the sitemap |
| `API_INTERNAL_URL` | Web | API origin |
| `NEXT_PUBLIC_DEMO_MODE` | Web (build) | `true` only for the public demo; inlined at build time |
| `SUPABASE_DB_URL` (secret), `BACKUP_AGE_RECIPIENT`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `API_HEALTH_URL` (variables) | GitHub Actions | Nightly backup and keep-alive |
| `DEMO_DATABASE_URL`, `DEMO_SUPABASE_SECRET_KEY` (secrets), `DEMO_SUPABASE_URL` (variable) | GitHub Actions | Nightly demo reset; the demo project's values, never production's |

Supabase Auth settings (site URL, redirect allow-list, password policy, MFA, email templates) are versioned in `supabase/config.toml` and applied with `npx supabase config push --project-ref <ref>` after `npx supabase login`. Never push it to the public demo's project: it has `enable_signup = true`, which would switch public sign-ups back on there ([section 10](#10-public-demo)).

## 3. Releasing

1. Merge into `develop`. Vercel builds both projects from the commit.
2. The API's production build runs `apps/api/scripts/release.mjs`: the environment preflight, then `prisma migrate deploy`. If either fails, the build fails and the previous deployment keeps serving.
3. Check the API's `/health/ready` endpoint (planned address: `https://topflow-hub-api.vercel.app/health/ready`) for `database: "up"`, and sign in to the web app.

**Rollback.** Use Vercel *Instant Rollback* on the affected project. Migrations are forward-only: keep them additive (add columns before using them, remove old columns in a later release) so the previous version still works against the new schema.

**New migration.** Change `packages/database/prisma/schema.prisma`, run `npm run db:migrate` locally, review the generated SQL, commit it. Production applies it on the next release.

**Versions and the changelog.** [release-please](https://github.com/googleapis/release-please) numbers the platform from the Conventional Commit messages on `develop` (`feat:` → minor, `fix:` → patch, `!` or `BREAKING CHANGE:` → major). After each push to `develop`, `.github/workflows/release-please.yml` opens or updates a release pull request against `develop` that sets the version in the root `package.json` and `package-lock.json` and in the API's default `APP_VERSION`, and writes `CHANGELOG.md`. Merging that pull request tags the commit (`v1.0.0` first) and publishes a GitHub release with the same notes; until then nothing is tagged.

- `release-please-config.json` holds the settings: the Node strategy for the repository root, tags without a component name, the changelog sections (features, bug fixes, performance, reverts, documentation; tests, CI and chores are left out), `initial-version: 1.0.0`, because no release exists yet, and two `extra-files`, `apps/api/src/config/env.ts` and `apps/api/.env.example`, whose `APP_VERSION` lines carry an `x-release-please-version` marker.
- `.release-please-manifest.json` records the last released version. It says `0.0.0`, which release-please treats as "never released", and the release pull request updates it.
- One-off repository setting: *Settings → Actions → General → Allow GitHub Actions to create and approve pull requests*. Pull requests opened with the built-in token do not start other workflows, so run CI on the release pull request by pushing an empty commit to its branch, or give the action a fine-grained token in a `RELEASE_PLEASE_TOKEN` secret and pass it as `token`.
- The release number lives in the root `package.json`. The API reports `APP_VERSION` at `GET /`, `/health`, the API docs and its start-up log; its default follows the release (`0.0.0` until the first one), and a deployment may still set it. The workspace packages keep their own internal version numbers, which no page or endpoint reads.

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
- **The public demo** sends business emails only to allow-listed addresses and never uses custom SMTP for account emails ([section 10](#10-public-demo)).

## 7. Monitoring and incidents

| Symptom | First checks |
| --- | --- |
| Web shows "service temporarily unavailable" | `/health/ready` on the API; Vercel runtime logs of `topflow-hub-api`; Supabase project status |
| Everyone is signed out or gets 401 | Supabase Auth status; `SUPABASE_URL` on the API; JWKS reachable at `<SUPABASE_URL>/auth/v1/.well-known/jwks.json` |
| Staff get "two-factor authentication required" | Expected until they verify with their authenticator app (`/auth/mfa`) |
| 429 Too Many Requests | Per-client limits (`THROTTLE_*`); confirm `INTERNAL_API_SECRET` matches in both projects, otherwise every shopper shares the web server's quota |
| Supabase project paused | Restore it from the dashboard; check that the nightly backup job (which keeps it awake) is succeeding |
| *Demo reset* workflow failed | Read the run log. "Demo reset refused" lists every failed safety check and means nothing was changed. Any other failure after "Emptied … tables" leaves the demo incomplete (empty, or with only part of the demo data if the seed stopped part-way, for example during a Supabase Auth outage): fix the cause and run the workflow again from the Actions tab. The reset accepts a partly seeded demo database |

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
npm run setup               # env files from the examples, local keys, migrations and demo data
npm run dev
npm run supabase:stop       # when finished (data is kept in Docker volumes)
```

`npm run setup` never overwrites an existing env file or a value that is already set, and loads data only into a database on this machine. Later, `npm run db:deploy` applies new migrations and `npm run db:seed` refreshes the catalogue and demo data. `npx supabase status` prints the local URLs and keys if a file needs them by hand.

To try demo mode locally, set `DEMO_MODE=true` and `STAFF_MFA_REQUIRED=false` in `apps/api/.env` and `NEXT_PUBLIC_DEMO_MODE=true` in `apps/web/.env.local`, and restart `npm run dev`. `DEMO_MODE=true npm run demo:reset -- --confirm` returns the local database to the demo data set.

## 10. Public demo

> **Status (26 September 2026): not hosted yet.** Demo mode, the reset script and the nightly workflow are built and tested on a local machine, and the CI workflow runs the reset and the demo checks on every push. No demo deployment or demo Supabase project exists, so the nightly workflow has never run against one. The reasoning is in ADR-021 of [DECISIONS.md](DECISIONS.md).

The public demo is the production build with its demo setting switched on. It lets anyone try the platform with published accounts, without the platform sending email to strangers or visitors locking each other out.

### What demo mode changes

| Area | In demo mode |
| --- | --- |
| Business email (API) | Delivered only to the addresses or `@domains` in `DEMO_MAIL_ALLOWLIST`. Everything else, including sales notifications to Top Flow's inbox, is withheld and logged as `Demo mode: withheld "<subject>" to jo***@example.com`. |
| Staff and customer invitations (API) | Refused with `403` and `code: "DEMO_RESTRICTED"` unless the address is allow-listed, because Supabase would send the invitation email. Team invitations are kept, but their email is withheld, so they stay pending. |
| Published demo accounts (API) | Their platform role cannot change and they cannot be suspended. In Desert Bloom, the owner cannot change the role or approval limit of the published buyer and approver or remove them. Other accounts and members can be changed, so the features stay visible. |
| Demo organisation (API) | Desert Bloom Landscaping LLC keeps its KYC status and trading terms (staff reviews of it are refused) and its TRN and trade licence number (its owner can edit the other details). Other organisations, such as the one in the KYC queue, can be reviewed. |
| Start-up checks (API) | The API refuses to start with `STAFF_MFA_REQUIRED=true` (nobody can share an authenticator app), with `THROTTLE_LIMIT` above 300 or `AUTH_THROTTLE_LIMIT` above 10, or with `THROTTLE_TTL_MS` below 60000: rate limits stay on and no looser than the defaults. `GET /` reports `"demo": true`. |
| Web app | Every page opens with *"Portfolio demo: data resets every night. This is not Top Flow's official store."* `robots.txt` disallows everything and pages carry `noindex`. The sign-in page lists the demo accounts. The Server Actions refuse sign-up, confirmation and password reset emails, password changes (including `/auth/set-password`, which only accepts an invitation or recovery link for an account that is not a demo account), and adding or removing an authenticator; a sign-out never ends other visitors' sessions, and "sign out of all devices" is hidden. Confirmation messages say that the demo sends no email instead of claiming one was sent. |

Outside demo mode none of this applies. The settings are `DEMO_MODE` and `DEMO_MAIL_ALLOWLIST` in `apps/api/.env.example` and `NEXT_PUBLIC_DEMO_MODE` in `apps/web/.env.example`.

### Demo accounts

Created by the demo seed and published on the demo's sign-in page (the list lives in `packages/shared/src/demo.ts`). They all use the password `TopFlow2026!`. Their addresses are on reserved example domains (RFC 2606), so no mail can reach them and the published password is never the password of a real mailbox.

| Email | Role | Try |
| --- | --- | --- |
| `customer@example.com` | Retail customer | Checkout and order tracking |
| `buyer@desertbloom.example` | Trade buyer (AED 5,000 approval limit) | RFQs and accepting quotations |
| `approver@desertbloom.example` | Trade approver (AED 50,000 approval limit) | Approving purchases above the buyer's limit |
| `owner@desertbloom.example` | Trade owner | Team invitations, delivery sites and the company profile |
| `sales@topflow.example` | Top Flow sales | KYC, RFQ triage and the quotation builder |
| `warehouse@topflow.example` | Top Flow warehouse | Fulfilment and stock |
| `admin@topflow.example` | Administrator | Everything, including users and the audit trail |

The seed also creates `owner@alwaha.example`, the owner of a company waiting in the KYC queue. It is not published. Desert Bloom Landscaping LLC and Al Waha Facility Management LLC are fictional.

### Setting up the hosted demo

1. Create a **separate** Supabase project for the demo, for example `topflow-hub-demo`. Never point demo settings at the production project.
2. In that project, keep Supabase's built-in email service (no custom SMTP), which only delivers to the project team's addresses, and switch off *Allow new users to sign up* under *Authentication → Sign In / Providers*. The seed and the reset create the demo accounts through the admin API, which that switch does not block. Set the site URL and redirect allow-list in the dashboard too: never run `npx supabase config push` against the demo project, because `supabase/config.toml` has `enable_signup = true` and would switch sign-ups back on.
3. Load the data from a checkout of `develop`, with the demo project's session connection string (port 5432) and keys:

   ```bash
   export DATABASE_URL='postgresql://postgres.<demo-ref>:<password>@aws-1-<region>.pooler.supabase.com:5432/postgres'
   export SUPABASE_URL=https://<demo-ref>.supabase.co SUPABASE_SECRET_KEY=sb_secret_…
   npm run db:deploy
   DEMO_MODE=true npm run demo:reset -- --confirm
   ```

4. Deploy the API with the production settings of [section 2](#2-configuration) for the demo project, plus `DEMO_MODE=true`, `STAFF_MFA_REQUIRED=false` and, if the maintainer wants to receive the demo's emails, `DEMO_MAIL_ALLOWLIST=<their address>`. Leave `THROTTLE_*` at their defaults or make them stricter (lower limits, a longer `THROTTLE_TTL_MS`); the API refuses anything looser.
5. Build the web app with `NEXT_PUBLIC_DEMO_MODE=true` and the demo project's `NEXT_PUBLIC_SUPABASE_*` values.
6. In GitHub, add the secrets `DEMO_DATABASE_URL` (the connection string from step 3) and `DEMO_SUPABASE_SECRET_KEY`, and the variable `DEMO_SUPABASE_URL`. Run the *Demo reset* workflow once from the Actions tab.
7. Check the result, starting with the API:
   - `GET /` on the demo API answers `"demo": true`;
   - every page of the demo web app shows the banner, and `/robots.txt` says `Disallow: /`;
   - inviting a staff member with an address outside the allow-list is refused;
   - public sign-ups are off: `curl -s -X POST "$SUPABASE_URL/auth/v1/signup" -H "apikey: <publishable key>" -H 'content-type: application/json' -d '{"email":"signup-check@example.com","password":"Check-password-1"}'` answers with `signup_disabled`;
   - `admin@topflow.example` signs in with the published password, and `/auth/set-password` then shows the demo notice instead of a password form.

### Nightly reset

`.github/workflows/demo-reset.yml` runs at 23:00 UTC (03:00 in the UAE) and on demand. It applies migrations, then runs `npm run demo:reset -- --confirm` with `DEMO_MODE=true`. The script:

1. refuses to start without `DEMO_MODE=true` and `--confirm` (`DEMO_MODE` must be set for the run, in the shell or the workflow: a value found only in `packages/database/.env` is refused), with `NODE_ENV=production`, `SEED_PROFILE=production` or `SEED_CREDENTIALS_FILE`, with only one of the two Supabase settings, or when `SUPABASE_URL` and `DATABASE_URL` name different Supabase projects (the project ref in each address), and lists every problem at once;
2. refuses a database that holds accounts the demo seed does not create but not the demo data set (Desert Bloom Landscaping LLC, TRN 100234567800003), and changes nothing. The seed creates Desert Bloom before any account, so a seed that stops part-way leaves a database that the next reset accepts;
3. lists the Supabase Auth users of `SUPABASE_URL` and refuses, changing nothing, unless they are exactly the rows of the target database's own `auth.users` table. This shows that the key works and that it belongs to the demo project: a key copied from production is refused before any sign-in is deleted;
4. empties every table except `_prisma_migrations` in one transaction;
5. deletes those Supabase Auth users, taking changed passwords, enrolled authenticators and visitors' own sign-ins with them;
6. runs the demo seed with the published password, which creates the demo accounts and sample documents again.

While the three GitHub settings are unset, the workflow skips itself with a notice, as the backup workflow does. With only some of them set, it fails.

**How the reset is tested.** The safety checks have unit tests with in-memory fakes (`packages/database/scripts/demo-reset.spec.ts`). CI's end-to-end job also runs the real script before its suites, in two ways:

- `npm run demo:reset -- --confirm` against its PostgreSQL service, without Supabase settings (steps 1, 2, 4 and 6);
- `npm run demo:rehearse -w @topflow/database`, which creates a throw-away database with an `auth.users` table and runs the real reset against it five times, with `SUPABASE_URL` pointing at a stand-in for the Supabase Auth admin API backed by that table (`packages/database/scripts/auth-standin.ts`). In order: an empty database gets the 8 seeded accounts and their sign-ins; a second reset replaces every sign-in, including a visitor's own, and restores the published password; a key for another project is refused before anything changes; a simulated Auth outage at the second account stops the seed part-way; and the next reset recovers. Every step runs, including 3 and 5.

The rehearsal also passed on 26 September 2026 in a `node:24` container against `postgres:17`, and it failed as expected with the project comparison switched off or with the seed's old account order. The stand-in is a test double, not Supabase Auth, so the reset has still not run against a real Supabase project.

### What demo mode does not prevent

- Visitors can change anything the published roles allow (prices, stock, orders, KYC decisions on other organisations, team invitations, names and phone numbers) until the next reset. Withheld team invitations stay pending, because nobody receives their link.
- The web app's refusals are not a security boundary: someone who calls Supabase Auth directly with the published password can still change it (`secure_password_change` is off in `supabase/config.toml`) or enrol an authenticator, which locks other visitors out of that account until the next reset. The reset undoes both each night, and the API still enforces every business rule.
- Demo mode is configuration. A public deployment without `DEMO_MODE=true` and `NEXT_PUBLIC_DEMO_MODE=true` behaves like production, which is why step 7 above follows every change to the demo's settings.
- The mobile app has no demo mode or banner. Pointed at the demo, it is subject to the same API restrictions, and its sign-up and password reset go straight to Supabase, where the demo project has sign-ups switched off and sends mail only to its own team (step 2 above).
