# Performance

How the API is load-tested with k6, which thresholds fail a run, and what the measured runs showed. The approach is part of the [test plan](TEST-PLAN.md) and ADR-022 in [DECISIONS.md](../DECISIONS.md).

> **Status: measured on 3 October 2026.** Four runs of the load profile, on a laptop with nothing else running in Docker, against the stack started from production builds. Every endpoint's p95 was between 3 and 20 ms at about 90 requests a second, and 1 of 97,905 requests failed (a connection from the k6 container to the host that did not open). The p95 thresholds were then set from these runs. The numbers describe this laptop and this setup, not production ([what they do not show](#what-the-results-do-not-show)).

## What the test does

[`tests/load/api-load.ts`](../../tests/load/api-load.ts) runs in the pinned `grafana/k6` container and calls the API directly, the way the web app's server does:

| Scenario | Calls | Smoke profile | Load profile |
| --- | --- | --- | --- |
| `browse` | readiness, categories, a catalogue page, a search, a product page, then a one-second pause | 1 user, 3 iterations | 0 → 20 users over 1 minute, 20 users for 3 minutes, down over 30 seconds |
| `account` | `GET /auth/me`, `GET /me/orders` as the demo customer, then a one-second pause (each virtual user signs in once; `setup` makes one warm-up call outside the measurements) | 1 user, 3 iterations | 5 users for 4½ minutes |
| `quote` | `POST /quote-requests` with one catalogue product | 1 request | 12 per minute for 4½ minutes |

With `E2E_INTERNAL_API_SECRET` set, each virtual user sends the web app's shared secret and its own client address, so it is rate limited as one shopper, exactly as traffic behind the web app is; every quote request comes from a different visitor. Without it, all traffic counts as one client, and the default limits (300 requests a minute, 10 quote requests a minute) turn most of the load profile into 429 responses.

The three scenarios run at the same time, so the smoke profile has three virtual users, one per scenario, and the load profile up to 27. The demo customer's address and password come from `@topflow/shared`, and `run-k6.sh` hands them and the shared secret to the container by name, never on a command line. `setup()` returns only product slugs and ids, because k6 copies its return value into the summary export, which CI uploads: no access token reaches a report, and `run-k6.sh` refuses to keep a summary that contains one.

The sign-ins with Supabase Auth are not tagged with an endpoint, so they count in the totals but not in the table. Each virtual user pauses for a second after each iteration, so the load profile sends a fixed amount of traffic (about 90 requests a second once all users run): it measures latency at that load, not the most the API can serve.

## Thresholds

The p95 thresholds are listed once, in [`tests/load/targets.json`](../../tests/load/targets.json), which the load test and the results table both read. In the load profile each one is a k6 threshold: when one is missed, k6 exits with code 99 and the run fails. Both profiles also fail when more than 1 % of the requests fail, overall or to any one endpoint, or when fewer than 99 % of the checks pass. The rule per endpoint exists because the overall rate alone would let a rarely called endpoint fail outright: the load profile sends one quote request for every 440 or so other requests, so even if every quote request failed, the overall rate would stay near 0.2 %. The smoke profile replaces the p95 thresholds with a 30-second limit per request, because a p95 of three requests is only the slowest single request; its timings are shown, not judged. A crossed threshold was checked to exit with 99 on 26 September 2026 by lowering the smoke limit to 1 ms.

Because CI runs only the smoke profile, it also runs `npm run load:check -w @topflow/system-tests`: `k6 inspect` prints the load profile's options in the pinned container, and `tests/scripts/k6-thresholds.mts` fails unless every p95 threshold in `targets.json` is a `p(95)` threshold there, next to the thresholds on checks and on failed requests overall and per endpoint.

| Metric | Threshold | Fails the smoke run | Fails the load run |
| --- | --- | --- | --- |
| p95 of `GET /health/ready` | below 20 ms | no (only a request over 30 s) | yes |
| p95 of `GET /catalog/categories` and `GET /catalog/products/{slug}` | below 30 ms | no (only a request over 30 s) | yes |
| p95 of a catalogue page | below 60 ms | no (only a request over 30 s) | yes |
| p95 of a catalogue search | below 70 ms | no (only a request over 30 s) | yes |
| p95 of `GET /auth/me` and `GET /me/orders` | below 80 ms | no (only a request over 30 s) | yes |
| p95 of `POST /quote-requests` (writes the request and its audit entry, and starts two emails without waiting for them) | below 60 ms | no (only a request over 30 s) | yes |
| Failed requests, overall and to each endpoint | below 1 % | yes | yes |
| Checks (status codes and non-empty catalogue pages) | above 99 % | yes | yes |

**How the thresholds were set.** Until 3 October 2026 the p95 targets were 200 ms for readiness, 500 ms for the other reads and 1,000 ms for quote requests, chosen before anything had been measured. The measured p95s were about 25 to 90 times lower, so those targets would have let an endpoint become ten times slower without failing a run. Each threshold is now four times the highest p95 of runs 1 to 3 below, rounded up to a multiple of 10 ms, and at least 20 ms. Between runs, an endpoint's p95 varied by at most 20 %, so the margin leaves room for a somewhat slower machine, while a slowdown to four to six times the measured p95 fails the run. Run 4 confirmed that the new thresholds pass on this setup. The thresholds belong to this reference setup: on other hardware, measure three runs and derive them by the same rule rather than loosening one until it passes.

## Results

Measured on 3 October 2026 between 02:03 and 02:27 UAE time (22:03 to 22:27 UTC on 2 October). The API and the web app were built from commit `6faa66b`; the k6 script and the table script were those of commit `3fa1c13`, which adds the failed-request thresholds per endpoint and changes nothing else in the load test. Runs 1 to 3 were judged against the earlier p95 targets and met all of them; run 4 ran with the thresholds above (commit `f38bbb0`).

Run 4, from `node tests/scripts/k6-summary-table.mts tests/reports/k6/summary-load.json`:

| Endpoint | Requests | Per second | Failed | Median (p50) | p90 | p95 | p95 threshold | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| GET /health/ready | 4366 | 16.1 | 0.00 % | 2.5 ms | 3.2 ms | 3.3 ms | < 20 ms | met |
| GET /catalog/categories | 4366 | 16.1 | 0.00 % | 4.0 ms | 5.2 ms | 5.8 ms | < 30 ms | met |
| GET /catalog/products (page) | 4366 | 16.1 | 0.00 % | 7.0 ms | 10 ms | 12 ms | < 60 ms | met |
| GET /catalog/products?search= | 4366 | 16.1 | 0.00 % | 9.7 ms | 13 ms | 14 ms | < 70 ms | met |
| GET /catalog/products/{slug} | 4366 | 16.1 | 0.00 % | 2.6 ms | 4.0 ms | 4.9 ms | < 30 ms | met |
| GET /auth/me | 1319 | 4.87 | 0.00 % | 11 ms | 16 ms | 19 ms | < 80 ms | met |
| GET /me/orders | 1319 | 4.87 | 0.00 % | 11 ms | 18 ms | 20 ms | < 80 ms | met |
| POST /quote-requests | 55 | 0.20 | 0.00 % | 8.8 ms | 11 ms | 12 ms | < 60 ms | met |

All requests, including set-up and sign-ins: 24532 in 271 s, 90.5 per second.

Failed requests: 0.00 % (0 of 24532; threshold below 1 % overall and per endpoint).

Checks passed: 100.00 % (28889 of 28889; threshold above 99 %).

All four runs, from the summary of each:

| Endpoint | Median (p50), runs 1 / 2 / 3 / 4 | p95, runs 1 / 2 / 3 / 4 | Highest p95, runs 1 to 3 | p95 threshold |
| --- | --- | --- | ---: | ---: |
| GET /health/ready | 2.4 / 2.4 / 2.4 / 2.5 ms | 3.4 / 3.2 / 3.4 / 3.3 ms | 3.4 ms | 20 ms |
| GET /catalog/categories | 4.1 / 4.1 / 4.0 / 4.0 ms | 6.1 / 6.0 / 6.2 / 5.8 ms | 6.2 ms | 30 ms |
| GET /catalog/products (page) | 7.5 / 7.4 / 7.2 / 7.0 ms | 13 / 13 / 13 / 12 ms | 13.4 ms | 60 ms |
| GET /catalog/products?search= | 10 / 10 / 10 / 9.7 ms | 16 / 16 / 16 / 14 ms | 16.0 ms | 70 ms |
| GET /catalog/products/{slug} | 3.0 / 2.9 / 2.7 / 2.6 ms | 5.4 / 5.4 / 5.7 / 4.9 ms | 5.7 ms | 30 ms |
| GET /auth/me | 11 / 10 / 10 / 11 ms | 19 / 16 / 19 / 19 ms | 19.3 ms | 80 ms |
| GET /me/orders | 10 / 11 / 9.6 / 11 ms | 20 / 18 / 18 / 20 ms | 19.9 ms | 80 ms |
| POST /quote-requests | 9.6 / 9.5 / 9.0 / 8.8 ms | 12 / 13 / 14 / 12 ms | 13.8 ms | 60 ms |

| Run | Started (UTC) | Requests | Per second | Failed requests | Checks passed | k6 exit code |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 22:03:02 | 24352 | 89.8 | 1 (health) | 28672 of 28673 | 0 |
| 2 | 22:08:14 | 24498 | 90.4 | 0 | 28847 of 28847 | 0 |
| 3 | 22:14:53 | 24523 | 90.5 | 0 | 28877 of 28877 | 0 |
| 4 | 22:22:39 | 24532 | 90.5 | 0 | 28889 of 28889 | 0 |

Each run lasted 271 s and reached 27 virtual users. The failed request of run 1 was a readiness call made in the first minute, while the browsing users were ramping up. k6 reported `dial: i/o timeout` at 22:04:22: the TCP connection from the k6 container to `host.docker.internal:3000` did not open within 30 seconds, so the request never reached the API, whose log shows no error. The failure lies in the connection from Docker's virtual machine to the Windows host; it did not happen in runs 2 to 4. The slowest single request to a tagged endpoint in any run took 55 ms.

### Environment

| Part | What ran |
| --- | --- |
| Machine | ASUS TUF Gaming A15 FA507RC laptop: AMD Ryzen 7 6800H (8 cores, 16 logical CPUs), 16 GB of RAM, Windows 11 Home 10.0.26200, on mains power with the Performance power plan |
| Docker | Docker Desktop with Docker Engine 29.8.1 in its WSL 2 virtual machine (kernel 6.18.33.2), with 16 CPUs and 7.4 GiB of memory for all containers |
| Supabase | Supabase CLI 2.117.0 with Auth (GoTrue 2.196.0), PostgreSQL 17.6 (`supabase/postgres:17.6.1.167`), Kong 2.8.1 and Mailpit 1.30.2; the other services left out as in `system-tests.yml`. No memory limit on these containers, as the CLI starts them |
| Data | The demo profile of `npm run db:seed` (72 categories, 346 products, 8 sign-ins), plus what the runs added (about 55 quote requests each) |
| API | Production build (`node dist/main`) of commit `6faa66b`, one Node 24.19.0 process on the Windows host, `NODE_ENV=test`, default rate limits, default database pool (10 connections), `MAIL_TRANSPORT=console`; no memory limit set (about 450 MB in use after the runs) |
| k6 | `grafana/k6:2.3.0` in Docker, with the 512 MB memory limit of `tests/compose.yaml`; it reached the API at `host.docker.internal:3000`, so each request crossed from Docker's virtual machine to the Windows host, and the API reached PostgreSQL through the port Docker Desktop forwards (54322) |
| Activity | Nothing else ran in Docker. A web browser, an editor and the Claude desktop app were open but idle. Each run started only after the host's total CPU use stayed below 10 % for 30 s and no other container used more than 5 % of a CPU. During the runs the host's CPU use averaged 10 to 15 % (highest sample 27 %), and Windows never reported less than 1.2 GB of memory available. PostgreSQL used about 13 % of one CPU on average, k6 about 8 % |

### How the runs were made

The stack was started as in [tests/README.md](../../tests/README.md), with the Supabase services that `system-tests.yml` starts, and the API with its default rate limits:

```bash
npx supabase start -x realtime,storage-api,imgproxy,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
export SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SECRET_KEY=<SECRET_KEY from npx supabase status>
npm run db:deploy && npm run db:seed
npx turbo run build --filter=@topflow/api --filter=web
export INTERNAL_API_SECRET=<32 or more random characters>
NODE_ENV=test STAFF_MFA_REQUIRED=false MAIL_TRANSPORT=console npm run start:prod -w @topflow/api &

# Each run (about five minutes), then the table:
E2E_INTERNAL_API_SECRET=$INTERNAL_API_SECRET E2E_SUPABASE_URL=http://127.0.0.1:54321 \
  E2E_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY> E2E_SUPABASE_SECRET_KEY=<SECRET_KEY> \
  K6_PROFILE=load npm run load -w @topflow/system-tests
node tests/scripts/k6-summary-table.mts tests/reports/k6/summary-load.json
```

On this machine the repository's path is longer than Windows allows for starting a program, so `npx supabase` and Prisma's migration engine could not start from it. The CLI ran as `node_modules/@supabase/cli-windows-x64/bin/supabase.exe` from a copy of `supabase/` with its own project id, and the Node steps ran from a drive letter mapped to the repository with `subst`. Neither changes what was measured. The `E2E_SUPABASE_*` variables are set because `run-k6.sh` otherwise asks `npx supabase status` for them. The runs were made one after another without restarting the API, after two smoke runs; a script sampled the host's CPU use (Windows `typeperf`) and every container's CPU and memory (`docker stats`) every 5 seconds.

### What the results do not show

- **Production.** Nothing is hosted yet (ADR-019). A hosted deployment adds cold starts, TLS, network latency, a connection pooler and a hosted database, none of which are in these numbers.
- **Capacity.** The load profile sends a fixed amount of traffic; no run looked for the most requests the API can serve or where it breaks.
- **Pages.** k6 calls the API, not the web app, so server rendering and the browser are not measured (risk R10 in the [test plan](TEST-PLAN.md#2-risks) is about pages).
- **Sign-in.** Supabase Auth's sign-in is called once per virtual user and is not reported per endpoint.
- **Email.** The quote request starts its two emails after it answers and does not wait for them; with `MAIL_TRANSPORT=console` and `NODE_ENV=test` nothing was sent or logged.

## Running a measured load test again

1. Use a machine with nothing else running, and record its CPU, memory, operating system and Docker version next to the results.
2. Start the stack from production builds as above, seeded with the demo profile, with `THROTTLE_LIMIT` left at its default and `E2E_INTERNAL_API_SECRET` equal to the API's `INTERNAL_API_SECRET`.
3. Run `K6_PROFILE=load npm run load -w @topflow/system-tests` three times (about five minutes each).
4. Generate each table with `node tests/scripts/k6-summary-table.mts tests/reports/k6/summary-load.json`, copying the summary between runs, and record the date, the commit and the machine. On new hardware, derive new thresholds by the rule above.

The smoke profile runs in CI on every push to `develop` and every pull request, and its table appears in the job summary. It proves that the script and the endpoints work and that errors fail the run; shared CI runners are not a measurement environment, which is why the smoke run does not judge timings.
