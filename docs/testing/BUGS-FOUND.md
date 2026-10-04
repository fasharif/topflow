# Bugs found

Defects found while building and reviewing the system tests in [TEST-PLAN.md](TEST-PLAN.md), with the evidence to reproduce them. Each defect fixed on this branch has its own `fix:` commit with a regression test. BUG-08 to BUG-10 were fixed on `feature/demo-mode`, which this branch is based on. One defect is open: BUG-17 (Low), which needs a product decision before it is fixed. Issues can be filed for the record once Farah approves them.

BUG-18 to BUG-22 were added on 4 October 2026 and are of one kind: two requests that change the same record at the same moment. They were found by reading the API's code, not by a test or by a user, and were then reproduced with the tests written for them, which is described at [Simultaneous requests](#simultaneous-requests-bug-18-to-bug-22).

The reproductions ran on 26 to 28 September 2026 on a Windows 11 laptop, against the local stack: the Supabase CLI (Auth, PostgreSQL 17, Mailpit), the API and the web app from production builds, and the demo seed. Severity uses this scale:

| Severity | Meaning |
| --- | --- |
| High | Money, data or access is wrong for real users, with no workaround |
| Medium | A user sees wrong information or cannot complete a task in one way, and a workaround exists |
| Low | Documentation, developer experience or a contract detail; no user-visible harm |

"Found by" says honestly where each defect came from. Three of them (BUG-12, BUG-13 and BUG-14), and the mobile part of BUG-02, were missed by the suites and found when the branch was reviewed; each now has a test that fails without its fix. BUG-18 to BUG-22 were missed by every suite as well: no test sent two requests at once, except the one written for BUG-13.

## Summary

| ID | Title | Severity | Found by | Status |
| --- | --- | --- | --- | --- |
| [BUG-01](#bug-01--wide-tables-cannot-be-scrolled-with-the-keyboard) | Wide tables cannot be scrolled with the keyboard | Medium | axe scan | Fixed |
| [BUG-02](#bug-02--the-customer-can-be-charged-a-total-other-than-the-one-shown) | The customer can be charged a total other than the one shown | High | Security check (tampered price), then two reviews | Fixed (web, mobile and API) |
| [BUG-03](#bug-03--the-openapi-description-drops-every-validation-rule) | The OpenAPI description drops every validation rule | Low | Schemathesis | Fixed |
| [BUG-04](#bug-04--the-openapi-description-documents-only-success-responses) | The OpenAPI description documents only success responses | Low | Schemathesis, then review | Fixed |
| [BUG-05](#bug-05--invalid-openapi-30-bounds-on-category-ids) | Invalid OpenAPI 3.0 bounds on category ids | Low | Schemathesis | Fixed |
| [BUG-06](#bug-06--identifiers-and-the-organisation-header-are-not-described-as-uuids) | Identifiers and the organisation header are not described as UUIDs | Low | Schemathesis | Fixed |
| [BUG-07](#bug-07--an-empty-includeinactive-filter-is-rejected) | An empty `includeInactive` filter is rejected | Low | Schemathesis | Fixed |
| [BUG-08](#bug-08--getting-started-copies-a-file-that-does-not-exist) | Getting started copies a file that does not exist | Low | Setting up the stack | Fixed on `feature/demo-mode` |
| [BUG-09](#bug-09--the-readme-understates-the-catalogue) | The README understates the catalogue | Low | Seeding | Fixed on `feature/demo-mode` |
| [BUG-10](#bug-10--the-web-apps-readme-describes-the-previous-architecture) | The web app's README describes the previous architecture | Low | Reading the code | Fixed on `feature/demo-mode` |
| [BUG-11](#bug-11--organisation-links-in-the-users-list-rely-on-colour) | Organisation links in the users list rely on colour | Low | axe scan | Fixed |
| [BUG-12](#bug-12--a-new-order-shows-delivered-as-completed) | A new order shows "Delivered" as completed | Medium | Review of the README GIF | Fixed |
| [BUG-13](#bug-13--two-acceptances-at-the-same-moment-pass-the-credit-limit) | Two acceptances at the same moment pass the credit limit | High | Review (concurrency probe) | Fixed |
| [BUG-14](#bug-14--money-columns-are-hidden-at-common-desktop-widths) | Money columns are hidden at common desktop widths | Medium | Review of the README screenshots | Fixed |
| [BUG-15](#bug-15--a-nul-character-in-the-input-causes-a-server-error) | A NUL character in the input causes a server error | Low | Schemathesis | Fixed |
| [BUG-16](#bug-16--money-amounts-are-published-as-arrays-of-numbers) | Money amounts are published as arrays of numbers | Low | Schemathesis (staff and trade passes) | Fixed |
| [BUG-17](#bug-17--one-account-can-open-any-number-of-trade-account-applications) | One account can open any number of trade account applications | Low | Schemathesis (customer pass), then review | Open: needs a product decision |
| [BUG-18](#bug-18--two-requests-that-change-one-quotation-at-the-same-moment-both-take-effect) | Two requests that change one quotation at the same moment both take effect | High | Code review | Fixed |
| [BUG-19](#bug-19--two-requests-that-change-one-order-at-the-same-moment-both-take-effect) | Two requests that change one order at the same moment both take effect | Medium | Code review | Fixed |
| [BUG-20](#bug-20--two-owners-who-demote-or-remove-each-other-leave-a-company-without-an-owner) | Two owners who demote or remove each other leave a company without an owner | High | Code review | Fixed |
| [BUG-21](#bug-21--an-invitation-revoked-while-it-is-being-accepted-is-still-accepted) | An invitation revoked while it is being accepted is still accepted | Medium | Code review | Fixed |
| [BUG-22](#bug-22--an-rfqs-status-or-a-companys-suspension-is-overwritten-by-a-request-that-read-the-old-one) | An RFQ's status, or a company's suspension, is overwritten by a request that read the old one | Medium | Code review | Fixed |

---

## BUG-01 — Wide tables cannot be scrolled with the keyboard

**Severity:** Medium. WCAG 2.2 success criterion 2.1.1 (Keyboard) fails; axe-core rates the rule `scrollable-region-focusable` as *serious*.

**Steps**

1. Sign in as `customer@example.com` and open the delivered demo order `TF-SO-2026-D00002` (`/account/orders/<id>`) in a 1280 × 720 window.
2. Press Tab through the page to reach the Total column of the Items table.
3. Run axe-core 4.13 on the page (`tests/e2e/accessibility.spec.ts`).

**Expected:** the scrolling container of the table can be focused and scrolled with the arrow keys, as with the mouse.

**Actual:** the container is not focusable, so the columns that do not fit cannot be reached from the keyboard. The first axe scan reported the violation on the customer's order page, the trade quotation page and the back-office order page at desktop size.

**Fix** (commit `fix(web): let keyboard users scroll wide tables`): `ScrollRegion` renders the container as a named region with `tabIndex={0}`, and `Table` requires a label for it. Review then found that this made every table a tab stop and a landmark, even tables that fit; commit `fix(web): make a table region a tab stop only while it scrolls` measures the region and makes it focusable only while its content overflows. Regression tests: the axe scans at phone size, where the tables still scroll, and *a table is a tab stop only while it scrolls* in `tests/e2e/layout.spec.ts`, which checks the customer's orders table at 1280 px (no tab stop, no region), at 412 px (a focusable region named "Your orders") and at 1280 px again.

## BUG-02 — The customer can be charged a total other than the one shown

**Severity:** High, raised from Medium in review. When a price rose between adding an item and placing the order, the customer was charged more than the total they had agreed to, with nothing on screen to say so.

**Steps (price changed by sales)**

1. As `customer@example.com`, add one *Electrofusion Reducer (63 x 32 mm)* (`AX-EFS-001`, AED 33.00 net) to the basket.
2. As `admin@topflow.example`, change its price to AED 30.00 (`PATCH /admin/products/:id`).
3. As the customer, open `/checkout`, note the total and place the order.

**Expected:** checkout shows AED 57.75 (AED 30.00 + AED 25.00 delivery + AED 2.75 VAT), the amount of the order.

**Actual (before the first fix):** checkout showed **AED 60.90** (the old price); the order was created for **AED 57.75**.

**Steps (price edited in the browser)**

1. As the customer, add two *Electrofusion Tee (50 mm)* (`AX-EFS-002`, AED 39.00) to the basket.
2. In the browser's developer tools, set `unitPrice` to `"0.01"` in the `topflow.cart.v2` entry of localStorage.
3. Open `/checkout`.

**Expected:** checkout shows the catalogue total, AED 108.15.

**Actual (before the first fix):** checkout showed **AED 26.27**; the order placed from it cost AED 108.15.

**Fix, in three steps.**

1. Commit `fix(web): show current catalogue prices in the basket and at checkout`: the basket and checkout pages refresh every line from the catalogue when they open (`useCartPriceRefresh` in `apps/web/lib/cart.ts`).
2. Review showed that this left two gaps: a price changed after the page opened was still charged without a word, and a failed refresh left the cached price on screen. Commit `fix: refuse an order whose total changed since the customer saw it`: checkout sends the total it shows (`expectedTotal`), and the API answers 409 `PRICE_CHANGED`, with the new total, when its own total differs; checkout then shows the current prices. When a product cannot be loaded, the basket and checkout say that the total may be out of date.

3. The second review found, by reading the code, the same defect in the mobile app, which the first two commits had not touched. Its cart keeps each product's price from when it was added (`apps/mobile/src/lib/cart.ts`), previews the total from that copy, and its checkout posted `/me/orders` without `expectedTotal`, so a price changed after the product was added would be charged without a word. It was not reproduced on a device, since the app has no device tests; the code path is the one the web app had before the first step. Commit `fix(mobile): refuse a checkout whose total changed since the cart showed it`: the checkout sends the total the cart shows; on 409 `PRICE_CHANGED` it loads the current prices and shows the API's message with the new total; and the cart screen refreshes every line from the catalogue when it opens, saying so when a price could not be checked.

`expectedTotal` stays optional in the API, so a client that leaves it out is priced as before; both of the repository's clients send it.

**Regression tests:** *a price tampered with in the browser is ignored* in `tests/e2e/security.spec.ts` (it checks that the basket really was edited and that exactly one order request was rewritten); *a price changed while the customer is at checkout is charged only after they see it* in `tests/e2e/retail-checkout.spec.ts`; *refuses an order whose total differs from the total the customer was shown* in `apps/api/test/app.e2e-spec.ts`; `apps/web/lib/cart.spec.ts`; and `apps/mobile/src/lib/cart-pricing.spec.ts` (the order request carries the total shown, 108.15 for two tees worked out by hand, and the new total after a price change). The mobile app's screens have no automated test (device tests are out of scope, see the test plan).

## BUG-03 — The OpenAPI description drops every validation rule

**Severity:** Low. The API validated correctly; its published contract said less than it enforced.

**Steps:** `curl http://localhost:3000/docs-json` and read `components.schemas.InvitationTokenDto` and `CreateWebsiteQuoteRequestDto`.

**Expected:** the Zod rules appear as JSON Schema constraints (`minLength: 20` on the token, a `pattern` on the phone number, integer bounds on quantities).

**Actual:** every property was a bare `{"type": "string"}` or `{"type": "number"}`. `nestjs-zod` generates the schemas with its own `zod` import, which npm resolved to zod 3.25.76 at the root (hoisted for Expo's CLI) while the schemas are built with zod 4.6.4.

**Fix** (commit `fix(api): publish the validation rules in the OpenAPI description`): zod 4.6.4 is a root dev dependency, so all workspaces and `nestjs-zod` share it; Expo's CLI keeps its own zod 3. The root version has to follow the workspaces': it became 4.6.5 when the branch was merged with `develop` on 4 October 2026 (`develop`, which did not have this fix yet, still had zod 3.25.76 at the root). Regression test: *publishes the validation rules and the error envelope in its OpenAPI description* in `apps/api/test/app.e2e-spec.ts`.

## BUG-04 — The OpenAPI description documents only success responses

**Severity:** Low.

**Steps:** run Schemathesis 4.28.0 against `/docs-json` (`npm run contract -w @topflow/system-tests`, before the fix).

**Expected:** every status the API returns is documented, with the shared error envelope (`ApiErrorBody`).

**Actual:** only the 200/201 response was documented. The first unauthenticated run (seed 1, 25 examples per operation) reported **78** undocumented status codes.

**Fix, in two steps.** Commit `fix(api): document the error envelope for every operation` added the `ApiError` schema as the `default` response of every operation. Review pointed out that a `default` matches any status, so Schemathesis's `status_code_conformance` check could no longer catch an unexpected one. Commit `fix(api): list the error statuses each operation answers instead of a default` lists them per operation from how the API is built: 400 for operations with input, 401 and 403 unless the route is public, 404 for path parameters and writes, 409 and 422 for writes, 429 for all, and `5XX`. Operations that need a token now also carry the bearer security requirement. Regression tests: `apps/api/src/common/openapi.spec.ts` and the OpenAPI end-to-end test, which fails on any `default` response.

## BUG-05 — Invalid OpenAPI 3.0 bounds on category ids

**Severity:** Low.

**Steps:** run Schemathesis against `/docs-json` with a signed-in customer.

**Expected:** the document is valid OpenAPI 3.0.

**Actual:** Schemathesis stopped with *Schema Error* on four operations (`POST/PATCH /admin/products`, `POST/PATCH /admin/categories`): `categoryId` and `parentId` carried `exclusiveMinimum: 0`, which OpenAPI 3.0 only allows as a boolean next to `minimum`. The source was `z.number().int().positive()`.

**Fix** (commit `fix(shared): write positive category ids as a minimum of 1`): `min(1)` accepts exactly the same integers and is published as `minimum: 1`. Regression tests: a schema test in `packages/shared/src/schemas/schemas.spec.ts` and the OpenAPI end-to-end test, which fails on any numeric exclusive bound.

## BUG-06 — Identifiers and the organisation header are not described as UUIDs

**Severity:** Low.

**Steps:** `curl http://localhost:3000/docs-json` and read the parameters of `GET /org/quotations/{id}`.

**Expected:** the path id and the `x-organization-id` header are described as UUIDs, since the API refuses anything else with 400.

**Actual:** both were plain strings. Schemathesis sent `0` as an id or an empty header, which the description allowed, and the API answered 400 (`Validation failed (uuid is expected)`, `Select an organization first`). These accounted for 30 of the 35 entries of the first baseline.

**Fix** (commit `fix(api): describe ids and the organization header as UUIDs`): `UuidParam` replaces `@Param(name, ParseUUIDPipe)` on the 39 UUID path parameters and publishes `format: uuid`; the trade-portal controllers share one header description with `format: uuid`. The catalogue's optional header had the same format at first, but the catalogue ignores other values rather than refusing them, so commit `fix(api): describe the catalogue's organization header as it behaves` publishes it as a string with that explanation. Regression test: *describes ids and the organization header as UUIDs in its OpenAPI description* in `apps/api/test/app.e2e-spec.ts`.

## BUG-07 — An empty `includeInactive` filter is rejected

**Severity:** Low. The web app never sends the empty value, so no user was affected.

**Steps:** `curl -i "http://localhost:3000/catalog/products?includeInactive="`

**Expected:** an empty value is ignored, as for `search=`, `category=` and `brand=`.

**Actual:** 400 with *Invalid option: expected one of "true"|"1"|…*. The flag was a `z.stringbool()`, which is also published as any string, so generated values such as `abc` were refused too.

**Fix** (commit `fix(shared): read includeInactive as a listed flag and ignore it when empty`): `queryFlagSchema` accepts `true`, `1`, `false`, `0` and the empty value (absent), and the description lists exactly those. Regression tests: schema tests in `packages/shared/src/schemas/schemas.spec.ts` and *treats an empty includeInactive filter as absent* in `apps/api/test/app.e2e-spec.ts`.

## BUG-08 — Getting started copies a file that does not exist

**Severity:** Low.

**Steps:** on `develop`, follow *Getting started* in the README: `cp apps/web/.env.example apps/web/.env.local`.

**Expected:** a documented example of the web app's variables.

**Actual:** `cp: cannot stat 'apps/web/.env.example'`. `apps/web/.gitignore` ignored `.env*`, so the file was never committed.

**Status:** fixed on `feature/demo-mode` (commit `feat(web): demo banner and demo-mode limits in the web app` adds `apps/web/.env.example`; `npm run setup` copies every example). This branch is based on that branch.

## BUG-09 — The README understates the catalogue

**Severity:** Low.

**Steps:** run `npm run db:seed` and compare its output with the README on `develop`.

**Expected:** the README matches `packages/database/prisma/data/topflow-catalogue.json`.

**Actual:** the README said *323 products in 9 categories and 41 product lines*; the catalogue and the seed have **346 products in 11 categories and 61 product lines**.

**Status:** fixed on `feature/demo-mode` (commit `docs: restructure the README and correct its catalogue numbers`). This branch carried the same correction; it was dropped when the branch was rebased onto `feature/demo-mode`.

## BUG-10 — The web app's README describes the previous architecture

**Severity:** Low.

**Steps:** read `apps/web/README.md` on `develop`.

**Expected:** it describes the web app as ADR-013 left it: Supabase sessions in httpOnly cookies, Server Actions for authentication and the `/api` route handler as a backend for frontend.

**Actual:** it described `npm run db:up` (which no longer exists), a `/api` rewrite in `next.config.ts` and an access token held in memory with a refresh cookie.

**Status:** fixed on `feature/demo-mode` (commit `docs: bring the runbook, ADR-021 and package READMEs up to date`).

## BUG-11 — Organisation links in the users list rely on colour

**Severity:** Low. WCAG 2.2 success criterion 1.4.1 (Use of Color) fails; axe-core rates the rule `link-in-text-block` as *serious*. Only staff see the page.

**Steps**

1. Sign in as `admin@topflow.example` and open `/admin/users` with a user in several organisations on the page.
2. Look at the *Organizations* column without hovering.

**Expected:** the organisation names are recognisable as links without relying on colour.

**Actual:** each name was a link in the same colour as the surrounding text, underlined only on hover. axe reported it once a Schemathesis customer with 42 trade accounts was listed.

**Fix** (commit `fix(web): underline organization links in the back-office users list`): the links are underlined. Regression test: *organization links in the users list are underlined* in `tests/e2e/accessibility.spec.ts`, which checks the style directly because axe depends on how much text a row holds.

## BUG-12 — A new order shows "Delivered" as completed

**Severity:** Medium. The customer sees wrong information about their order; the badge and the timeline below it are right.

**Steps**

1. Sign in as `customer@example.com` and place an order, or open the confirmed demo order `TF-SO-2026-D00003` (`/account/orders/<id>`).
2. Look at the progress tracker, or read it with a screen reader.

**Expected:** Confirmed is the current step; Processing, Dispatched and Delivered are still to come.

**Actual:** the Delivered step was ticked, with a filled connector into it, and screen readers announced *Completed: Delivered*. `buildSteps` compared each step's own status with `DELIVERED` instead of the order's, so the last step was always complete. The walkthrough GIF in the README showed it; the retail journey checked only the "Confirmed" badge.

**Fix** (commit `fix(web): mark Delivered complete only when the order was delivered`): the step logic moves to `apps/web/lib/order-progress.ts`, and Delivered is complete only when the order is delivered. Regression tests: `apps/web/lib/order-progress.spec.ts` (five of its nine tests fail on the old rule), and the retail journey now checks that the current step is Confirmed and that no step is announced as completed.

## BUG-13 — Two acceptances at the same moment pass the credit limit

**Severity:** High. Goods are released on credit beyond a company's limit, which is the rule R3 of the test plan protects.

**Steps**

1. Create a trade customer with Net 30 terms and a credit limit of AED 1,050.00, and send it two quotations of AED 1,000.00 net (AED 1,050.00 with VAT).
2. As its owner, accept both at the same moment: two `POST /org/quotations/:id/respond` calls with `{"action": "ACCEPT"}` in parallel.

**Expected:** one order is confirmed on credit; the other waits for payment, because together they would be AED 1,050.00 above the limit.

**Actual:** both orders were confirmed on the credit account, an exposure of AED 2,100.00 against a limit of AED 1,050.00. `OrderWriter.createFromQuotation` summed the unpaid orders and then created the order in a READ COMMITTED transaction, and nothing stopped the second transaction from reading the same sum.

How often it happens: the first version of the regression test below ran its five rounds on one organisation and cleared the orders only after a round passed, so after one failing round the later rounds started from leftover exposure; its "5 of 5" counted one real trial. With each round on a new organisation (commit `test(api): make each concurrency round a separate trial`), removing the lock released both orders on credit in 5 of 5 rounds, in each of four runs on 27 and 28 September 2026 (`node tests/scripts/mutation-check.mts --with-db`).

**Fix** (commit `fix(api): release one organisation's orders on credit one at a time`): the organisation's row is locked (`SELECT … FOR UPDATE`) before the exposure is summed, and the terms are read again under the lock. The buyer's acceptance and the approver's sign-off both go through this path. Regression tests: *decision table B under concurrency* in `apps/api/test/decision-tables.e2e-spec.ts` (five rounds of two simultaneous acceptances, each on a new organisation; exactly one order is released on credit each time), and two unit tests in `order-writer.service.spec.ts`. The mutation check in CI removes the lock and fails if these rounds still pass.

## BUG-14 — Money columns are hidden at common desktop widths

**Severity:** Medium. The totals are there, but only after scrolling each table sideways.

**Steps**

1. In a 1280 × 720 window, sign in as `approver@desertbloom.example` and open quotation `TF-QT-2026-D00002` in the trade portal.
2. Do the same as the customer on `/account/orders/<id>`, and as the warehouse on the back-office page of order `TF-SO-2026-D00001`.

**Expected:** every column of the line items, including Net and Total, is visible.

**Actual:** the tables (640 to 760 pixels wide) sit in a column narrowed by the page's side panel, so the Net and Total columns were cut off behind a sideways scroll, even at 1440 pixels in the README screenshots. BUG-01 had made the scroll reachable by keyboard but left the layout as it was.

**Fix** (commit `fix(web): stack priced lines when their table does not fit beside the side panel`): the priced lines use a container query: the table where it fits, otherwise one stacked entry per line with its total, quantity, unit price, net and VAT. Regression test: `tests/e2e/layout.spec.ts` opens six order and quotation pages at 1280 × 720 (two customer orders, a trade quotation and order, and a back-office order and quotation) and fails if anything scrolls sideways or a line total ends outside the window.

## BUG-15 — A NUL character in the input causes a server error

**Severity:** Low. A crafted request gets a 500 instead of an answer; no data is affected.

**Steps:** `curl -i "http://localhost:3000/catalog/products?search=%00abc"`

**Expected:** 200, as for any other search.

**Actual:** 500. PostgreSQL refuses U+0000 in text (error 22021, *invalid byte sequence for encoding "UTF8": 0x00*). The catalogue search is public, and any text field in a request body could fail the same way. Schemathesis found it once the fixes above let more of its requests reach the database.

**Fix** (commit `fix(api): remove NUL characters from input before it reaches PostgreSQL`): a global pipe removes NUL characters from bodies, query strings and path parameters before validation. Regression tests: `apps/api/src/common/strip-nul.pipe.spec.ts` and *ignores NUL characters in input instead of failing on them* in `apps/api/test/app.e2e-spec.ts`.

## BUG-16 — Money amounts are published as arrays of numbers

**Severity:** Low. The API validated correctly; a client generated from the description would send the wrong type.

**Steps:** `curl http://localhost:3000/docs-json` and read `components.schemas.ReviewOrganizationDto.properties.creditLimit`.

**Expected:** a number or a decimal string, as the API accepts.

**Actual:** `{"type": "array", "items": {"type": "number"}}`, for every money field (prices, credit and approval limits, delivery fees). Zod writes the number-or-string union as a JSON Schema type list, which `nestjs-zod`'s OpenAPI 3.0 clean-up turns into an array. Email fields were published as any string. The staff and trade passes of Schemathesis sent arrays and odd strings, which the API refused.

**Fix** (commit `fix(shared): publish money amounts and email addresses in a form OpenAPI 3.0 keeps`): each form of `moneySchema` carries its rule (a number of at least 0, or a digits string), so the union is kept as two alternatives, and `emailSchema` carries `format: email`. Regression tests: schema tests in `packages/shared/src/schemas/schemas.spec.ts`, and the OpenAPI end-to-end test fails if any field is published as an array of numbers.

## BUG-17 — One account can open any number of trade account applications

**Severity:** Low. Customers, money and access are unaffected, and staff can reject the applications; the harm is work for the sales team and a KYC queue that no longer shows real demand.

**Steps**

1. Sign in as any customer.
2. Send `POST /me/organizations` (the web app's *Open a trade account* form) again and again with a different company name and trade licence number each time.

**Expected:** a second application is refused while the first is waiting for verification, or the number of pending applications per account is limited.

**Actual:** every application is accepted and waits in the KYC queue. In one Schemathesis run a single customer account opened 42 companies. The general rate limit slows this down but does not stop it.

**Status:** open. Recorded as an observation before the second review, which asked for it to be treated as a defect. The fix is a product rule (one pending application per account, or a small limit), so it waits for Farah's decision; the issue will be filed once approved.

## Simultaneous requests (BUG-18 to BUG-22)

**How they were found.** By code review on 4 October 2026: the services read a record, decide in application code and then write by id, and the write did not check that the record was still as it had been read. PostgreSQL's default isolation level (READ COMMITTED) lets two transactions read the same committed row, so two requests that arrive together could both decide on the same reading and both write. Only the credit limit had a test with simultaneous requests (BUG-13).

**How they were reproduced.** `apps/api/test/concurrency.e2e-spec.ts` was written first and run against the code as it was, on a Windows 11 laptop (Node 24.19) against PostgreSQL 17 in a container prepared as in CI. It sends the two requests in the same tick, five rounds per case on new records; where one request always finishes first because it is shorter, it queues both behind a row lock, so that both have read the record before either writes. Against the unfixed services 86 of its 89 tests failed. The "Actual" lines below are from that run, from the two runs of an earlier version of the same tests, and from a throwaway script that repeated each case three times and printed what the database held afterwards. Nothing was reproduced through the browser, and none of these was reported by a user.

**The fix they share.** Each change is now applied only if the record is still as it was read: the state is part of the `WHERE` clause of the `UPDATE` or `DELETE`, or a row is locked first (`SELECT … FOR UPDATE`) where the rule spans several rows. The request that comes second answers `409` and writes nothing; where it lost to a conditional write the answer carries `code: "CONCURRENT_UPDATE"` and the message *This quotation was changed by someone else a moment ago, so your change was not applied. Reload it to see where it stands now.* The web and mobile apps already show the API's message for a failed action, so they needed no change. [ARCHITECTURE.md, section 5](../ARCHITECTURE.md#consistency-under-simultaneous-requests) lists every guard. `tests/scripts/mutation-check.mts` removes each guard in turn and fails unless the tests notice (its table is in [TEST-PLAN.md, section 7](TEST-PLAN.md#7-decision-tables-and-boundary-values)).

## BUG-18 — Two requests that change one quotation at the same moment both take effect

**Severity:** High. A sales order could exist for a quotation recorded as rejected, declined or superseded, and nothing on screen said so. Likelihood is low: two people in one company (or sales and the customer) must act on the same quotation within the same few milliseconds.

**Steps**

1. Send a quotation to a verified trade customer.
2. At the same moment, send `POST /org/quotations/:id/respond` with `{"action": "ACCEPT"}` as the owner and with `{"action": "REJECT", "note": "…"}` as another member.

**Expected:** one answer takes effect; the other is refused. An order exists only if the acceptance won.

**Actual (before the fix):** both requests answered 200 in 5 of 5 rounds. In the three rounds whose result was printed, the quotation ended as Rejected with one sales order and two audit entries. Both requests also answered 200, in 5 of 5 rounds each, for a buyer's request for approval against an owner's acceptance, for an approver's approval against another approver's decline, and for a personal quotation accepted and rejected by its customer. Further cases in the same service:

- **A revision sent while the earlier one is accepted.** The acceptance answered 200 and created the order while the quotation ended as Superseded, in 5 of 5 rounds (3 and 4 of 5 in the two earlier runs). Sending a revision read the open revisions and then superseded them by id.
- **A draft sent while it is edited.** The customer was emailed one total (AED 105.00 in the test) while the quotation stored another (AED 147.00), in 5 of 5 rounds of the earlier version of the test.
- **A draft sent, then discarded by a request that had read it as a draft.** The discard answered 204 and the sent quotation was deleted (queued test), although the customer had been emailed a link to it.
- **Two first drafts for one RFQ.** Both answered 201 in 5 of 5 rounds; the RFQ then had two quotations with two numbers.

Two acceptances of one quotation were already safe: `orders.quotationId` is unique, so the second answered 409 (*A record with this value already exists*) and rolled back. It now answers the same 409 as the other cases.

**Fix** (commit `fix(api): apply a change to a quotation only if it is still as it was read`): every change goes through one conditional write on the status that was read (and, for a customer's answer, the validity date); sending supersedes only revisions that are still open, in the same statement; discarding deletes only a draft; drafting the first quotation locks the RFQ's row before checking that it has none. The order, the RFQ's status and the audit entry follow the guarded write in the same transaction. Regression tests: *answers to one quotation at the same moment*, *a revision sent while the earlier one is accepted*, *first drafts for one RFQ at the same moment* and *a draft quotation sent while it is edited or discarded*.

**Not changed:** a draft revision can still be sent after an earlier revision was accepted, one request after the other, and could then be accepted as well. That is a product rule, not a race; it is listed in the pull request for a decision.

## BUG-19 — Two requests that change one order at the same moment both take effect

**Severity:** Medium. Stock was deducted twice, or an order ended in a state its lifecycle does not allow; staff can correct both (a stock adjustment, a refund), but nothing told them to.

**Steps**

1. Place a retail order of two units and mark it as Processing.
2. At the same moment, send `PATCH /admin/orders/:id/status` with `{"status": "DISPATCHED"}` twice.

**Expected:** one request dispatches the order; the other is refused. Stock goes down by two.

**Actual (before the fix):** both answered 200 in 5 of 5 rounds; stock went down by four, and the timeline and the audit log each had two dispatch entries. In 5 of 5 rounds each, both requests also answered 200 for: a cancellation against a dispatch (the order ended as Cancelled with its stock deducted, or as Dispatched although the cancellation had been confirmed); two cancellations (two timeline entries and two audit entries); a customer's cancellation against a payment record (the order ended as Cancelled and Paid, a combination the rules reserve for Top Flow to create); and two refund records (two timeline entries and two audit entries).

**Fix** (commit `fix(api): apply a change to an order only if it is still as it was read`): a status change, a payment, a cancellation and a refund are each written only if the order still has the status and the payment status that were read; stock is deducted after that write, in the same transaction. Products are now locked in id order, so two orders that share products cannot wait for each other. Regression tests: *changes to one order at the same moment* (five cases, five rounds each).

## BUG-20 — Two owners who demote or remove each other leave a company without an owner

**Severity:** High. Without an owner nobody can manage the company's members, invitations or profile, and no endpoint lets staff restore one: it takes a change in the database.

**Steps**

1. Give a company two owners.
2. At the same moment, each owner sends `PATCH /org/members/:memberId` with `{"role": "BUYER"}` for the other (or `DELETE /org/members/:memberId`).

**Expected:** one request succeeds; the other is refused with *An organization must always have at least one owner*.

**Actual (before the fix):** both demotions answered 200 in 5 of 5 rounds and the company had no owner; both removals answered 204 in 4 of 5 rounds (5 of 5 in the earlier runs) and the company had no member at all. The check that another owner exists and the write were separate statements, outside any transaction.

**Fix** (commit `fix(api): change one company's members one request at a time`): the rule is about several rows, so no single conditional write can carry it. The change now runs in a transaction that locks the organisation's row first (as the credit release of BUG-13 does), reads the member again and counts the other owners under the lock. The second request waits, then gets the rule's ordinary 409. Regression tests: *owner changes at the same moment* (two cases, five rounds each, a new company per round).

## BUG-21 — An invitation revoked while it is being accepted is still accepted

**Severity:** Medium. Someone joins a company after its owner withdrew the invitation; the owner can remove the member again.

**Steps**

1. As an owner, invite a colleague.
2. At the same moment, the colleague sends `POST /invitations/accept` and the owner sends `DELETE /org/invitations/:invitationId`.

**Expected:** either the colleague joins and the revocation answers 404, or the invitation is revoked and nobody joins.

**Actual (before the fix):** the revocation answered 204 and the acceptance 200 in 5 of 5 rounds (10 of 10 in the earlier runs): the invitation was both revoked and accepted, and the colleague was a member. The acceptance checked the revocation before its transaction and then marked the invitation accepted on `acceptedAt` alone.

**Fix** (commit `fix(api): do not accept an invitation that was revoked at the same moment`): the acceptance first takes the invitation with one conditional write (not accepted, not revoked, not expired) and creates the membership only if that succeeded. Regression tests: *an invitation revoked while it is accepted* (five rounds, and once queued behind a row lock so that the revocation is certain to land between the acceptance's check and its write).

## BUG-22 — An RFQ's status, or a company's suspension, is overwritten by a request that read the old one

**Severity:** Medium for the suspension, Low for the RFQ.

**Steps (suspension)**

1. As the owner of a verified company, send `PATCH /org` with a new trade licence number.
2. At the same moment, as sales, send `PATCH /admin/organizations/:id/review` with `{"status": "SUSPENDED"}`.

**Expected:** the company stays suspended.

**Actual (before the fix):** with the suspension written first and the profile update, which had read the company as active, written second (queued test), the company ended as *Pending verification*: a changed legal identifier sends a verified company back to review, and that write replaced the suspension. In the earlier version of the test, which sent both at the same moment, this happened in 10 of 10 rounds.

**Steps (RFQ)**

1. Submit an RFQ and move it to *In review*.
2. At the same moment, cancel it as the customer (`POST /org/rfqs/:id/cancel`) and close it as sales (`PATCH /admin/rfqs/:id` with `{"status": "CLOSED"}`).

**Expected:** one request succeeds; the RFQ keeps that status.

**Actual (before the fix):** both answered 200 in 4 of 5 rounds, so one of the two was told it had succeeded while the RFQ kept the other's status. Both statuses are final.

**Fix** (commit `fix(api): keep an RFQ's status and a company's suspension set at the same moment`): a profile update that changes a legal identifier is written only if the company's status is still the one that was read; an RFQ's status is written only over the status it was checked against. Regression tests: *a company profile edited while the company is suspended* and *an RFQ cancelled while sales close it*.

---

## Schemathesis triage

`npm run contract -w @topflow/system-tests` runs three passes against `/docs-json`, each signed in as a throwaway account:

| Pass | Operations | Account |
| --- | --- | --- |
| customer | the 58 outside the trade portal: the 25 a customer or visitor may call, and the 33 of the back office, which must refuse a customer | a new customer with a saved address and one order, whose ids are given to the operations that need them |
| staff | the 13 back-office read operations (`GET /admin/...`) | a new account promoted to Administrator by the demo administrator |
| trade | the 24 trade-portal operations (`/org/...`) | the owner of a new company waiting for verification, with its id in the `x-organization-id` header |

**What is not fuzzed.** Back-office writes (prices, stock, users, KYC decisions, quotations) are left out on purpose: fuzzing them would change the shared demo data the browser journeys rely on (a first attempt that included them sent generated writes to the demo catalogue, users and companies). The API end-to-end suite covers them. The customer pass does send them, and they must refuse it. The trade portal is fuzzed only in the trade pass, which has a real membership: for a customer every request there is refused before any code behind it runs.

**Where it runs.** Only against a stack on the same machine (`localhost`, `127.0.0.1`, `[::1]` or `host.docker.internal`), unless `SCHEMATHESIS_ALLOW_REMOTE=1`, because the staff pass's account is an administrator. Every run gives its accounts a new random password; when it ends they are deactivated and their sign-ins deleted. Before the second review the password was fixed in the script and the accounts stayed.

**Classes of finding handled in `tests/contract/schemathesis.toml` or on the command line:**

| Finding | Decision |
| --- | --- |
| Unknown query parameters are accepted | By design: unknown parameters and body fields are ignored, which is how client-sent prices are discarded (ADR-009). `allow-extra-parameters = false` |
| TRACE answers 404 instead of 405 | Accepted: Express does not route undeclared methods and nothing is exposed. The `unsupported_method` check is excluded |
| 422 for an unknown or archived product at checkout | Correct: 422 marks well-formed input that breaks a business rule. Added to the accepted statuses |
| Network errors (*Resource temporarily unavailable*) | Test environment: Docker Desktop's port forwarding under four workers. The runner uses two workers and retries network failures twice |

**Single findings in the baselines** (`contract/baseline.json`, 5 entries; `baseline-trade.json`, 3; `baseline-staff.json` is empty). Each is a 400 for a request that matches the published description. Six more entries, for trade-portal operations sent by the customer pass without their header (a Schemathesis 4.28 quirk), were removed when that pass stopped including the trade portal:

| Operation | Why the API refuses it | Decision |
| --- | --- | --- |
| `PATCH /me`, `PATCH /org/members/{memberId}` | An update must change at least one field | Accepted: a rule across fields that JSON Schema here cannot express |
| `POST /me/orders` | A saved address or a new address is required | Accepted: rule across fields |
| `POST /me/quotations/{id}/respond`, `POST /org/quotations/{id}/respond` | Asking for a revision needs a note | Accepted: rule across fields |
| `POST /quote-requests` | Products or a 20-character description; a required-by date from today onwards | Accepted: rule across fields and relative to today |
| `POST /me/organizations`, `POST /org/invitations` | An address such as `!j{-9!q}8f@ep.net` is valid for JSON Schema's `email` format but not for the API's stricter check | Accepted: the API accepts a common subset of addresses |

**Coverage warnings.** Schemathesis also reports how much of the API its requests reached, and these warnings limit what the case counts mean. On the final run (see [TEST-PLAN.md, section 9](TEST-PLAN.md#9-results-of-this-cycle)):

- **Customer pass.** The 33 back-office operations are there to be refused: 24 answered only 401 or 403, and 16 writes mostly failed validation of the generated body (7 of them are among the 24). Schemathesis does not know roles, so that a customer cannot use them is checked by the API's RBAC tests and the browser security checks, not here. Of the 25 operations a customer or visitor may call, 15 were reached without a warning. The other 10: 7 repeatedly answered 404 (invitation tokens and personal quotations have no test data, and the saved-address operations after the fuzzer deleted the address), and 7 mostly received input the API rejected (4 are in both lists), because of rules across fields that the description cannot express, listed in the baseline table above.
- **Staff pass.** 8 of the 13 read operations were reached without a warning; 5 lookups by id repeatedly answered 404, because the new administrator does not know the ids of existing documents.
- **Trade pass.** 10 of the 24 operations were reached without a warning. The other 14 act on documents, members, addresses and invitations by id, which a new company waiting for verification does not have yet, so they answered 404 (9 of them also mostly rejected the generated input).

The number of generated cases also varies a little between runs with the same seed, because the stateful and coverage phases depend on the responses. `node tests/scripts/schemathesis-summary.mts tests/reports/schemathesis` prints these counts for any run, and CI adds them to the job summary. Examples or custom strategies for the rules across fields would let more requests through; they are not written yet.

**History.** Runs signed in as a customer only found BUG-03 to BUG-07, and later, once the BUG-04 and BUG-06 fixes let more requests through, BUG-15 and the catalogue header description (BUG-06). The staff and trade passes found BUG-16. No check found a server error once BUG-15 was fixed.

## Observations for review

These are not defects, but the rules differ in ways a reviewer might not expect. A third observation, that one account can open any number of trade accounts, is now recorded as BUG-17.

- **Approval limits and credit limits measure different amounts.** A buyer's spending limit is compared with the net value (goods after discount plus delivery, excluding VAT); the credit limit is compared with order totals including VAT. Excluding VAT from budgets is common for VAT-registered companies, and credit covers what the customer owes, so both look intentional; the test plan's decision tables record them as found.
- **Orders waiting for payment count against the credit limit.** An order released as *Pending payment* because it exceeded the credit limit still counts as exposure until it is paid or cancelled, so an abandoned order blocks credit for later orders until sales cancel it.
