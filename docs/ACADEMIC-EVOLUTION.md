# From academic prototype to production platform

The starting point was coursework for the *Mobile Web Application Development* module (UWL, Computer Science): a native Android **Bicycle Shop** app written in Kotlin with Firebase Realtime Database, Firebase Authentication and Firebase Storage. Its report describes 17 activities — browse and search, product details, a local cart, sign-up/login/forgot-password, profile management, checkout, order history and an admin panel for inserting, editing and deleting items.

TopFlow Hub keeps the same core customer journey (*browse → cart → sign in → order → track*) and the same operational need (*staff manage the catalog and orders*), but re-engineers every layer for a real business that sells irrigation supplies to both consumers and companies.

## Feature mapping

| Prototype (Kotlin / Firebase) | TopFlow Hub implementation |
| --- | --- |
| `MainActivity` — grid of bicycles, exact-match brand filter done on the device | Server-side catalog: search across name, SKU, brand and description; category, brand and availability filters; sorting; pagination; SEO-friendly product pages with structured data. |
| `ShowBicycle` — details passed between screens as Intent extras | Product detail by slug, specifications, unit of measure, minimum order quantity, VAT-inclusive retail price or negotiated trade price depending on the viewer. |
| `Cart` — `SharedPreferences` string set of serialized `Bicycle` objects | Guest cart in `localStorage` exposed through `useSyncExternalStore` (web) and AsyncStorage (mobile). Only product ids and quantities are sent to the server, which re-prices everything. |
| `SignUp` / `Login` / `ResetPasswordActivity` via Firebase Auth | Identity is still delegated to a managed provider — Supabase Auth, with email confirmation, password recovery, two-factor authentication (required for staff) and "sign out everywhere" — but authorization moves to the server: the API verifies every token and enforces roles and tenant membership itself. Web sessions live in httpOnly cookies; the mobile app encrypts its session at rest. |
| `ManageAccount` — username, birth date, gender | Profile (name, phone), address book with UAE emirates, password change. Birth date and gender are no longer collected (data minimisation). |
| `CheckOut` — card number, expiry and CVV typed into the app | Pay on delivery today; online payments are designed for a hosted payment page so card data never touches Top Flow systems (PCI DSS scope stays minimal). |
| `Orders` / `ShowOrder` — orders stored under `orders/{uid}` with status fixed to "Confirmed" | Sales orders with a validated **state machine** (pending payment → confirmed → processing → dispatched → delivered / cancelled), an immutable status timeline, tracking references, payment status and customer emails. |
| `adminLogin`, `DisplayData`, `EditBicycle` — admin panel | Role-based back office: Sales (KYC, RFQs, quotations), Warehouse (fulfilment, stock), Admin (staff invitations, users, audit). Products are archived instead of deleted so order history is preserved. |
| *(not in prototype)* | **B2B procurement**: organizations, team invitations, delivery sites, RFQs, versioned quotations with PDF generation, spending-limit approvals, credit terms, organization-scoped data isolation. |

## Engineering shortcuts that were fixed

| Prototype behaviour | Risk | Production approach |
| --- | --- | --- |
| `if (login == "admin" && password == "admin")` in `Login.kt` opens the admin panel | Anyone who decompiles the APK (or guesses) gets full control; there is no server-side authorization at all | Platform roles and a permission matrix in `@topflow/shared`, enforced by global NestJS guards on every request, with a second factor required for staff; the UI only hides what the API already forbids. |
| Clients write directly to the Firebase database | Any user can alter prices, stock or other people's orders if rules are lax | All writes go through the API; services validate ownership, tenant membership and workflow state inside database transactions. The database's public Data API is closed: Row Level Security is on for every table and client roles have no privileges. |
| Order totals computed on the device with `Int` prices (`price * quantity`) | Tampered totals, no VAT, no decimals | Prices are fetched server-side and calculated in integer fils (1/100 AED) with 5% UAE VAT per line; the web cart previews totals with the *same* shared function. |
| Password rule says "at least 6 characters" but checks `length > 6` | Inconsistent validation between message and code | One Zod password schema in `@topflow/shared`, used by the web forms and the mobile app, matching the password policy configured in Supabase Auth. |
| Card number validated by `length == 16`, CVV kept in memory and logged (`Log.e("CVV: …")`) | Card data exposure, PCI DSS violation | Card details are never collected by the platform. |
| Deleting an item removes the database record and its image | Past orders lose their product references | Soft archive (`isActive = false`); order and quotation lines snapshot SKU, name and price. |
| `Set<Bicycle>` cart relies on `Parcelable` equality | Duplicate or lost cart lines | Cart lines keyed by product id; duplicate RFQ lines are merged on the server. |
| Navigation handlers (`homeIcon`, `cartIcon`, `profileIcon`) duplicated in every Activity | Maintenance burden | Shared layouts and components; one header and navigation per area. |
| No automated tests, no CI | Regressions reach users | Unit tests (maths, workflows, permissions, token verification, guards), end-to-end tests against PostgreSQL, GitHub Actions pipeline. |
| Firebase project configuration only | Hard to reproduce environments | Typed, validated environment configuration; Supabase Auth settings and email templates as code (`supabase/config.toml`); data-preserving SQL migrations; seed data; nightly encrypted backups. |

## Learning outcomes demonstrated

- **Requirements to design:** translating a single-audience prototype into a two-sided (B2C/B2B) domain with explicit bounded contexts.
- **Data modelling:** normalized relational schema, immutable document snapshots, audit trail, sequential document numbering, and a migration that upgrades live data instead of discarding it.
- **Secure software engineering:** threat-driven fixes (authorization, session theft, account takeover, price tampering, card data, enumeration, brute force, direct database access).
- **Software architecture:** modular monolith, shared contracts across three clients, backend-for-frontend, state machines as data, dependency injection, separation of concerns.
- **Quality engineering:** automated testing at unit and system level, static analysis, continuous integration, reproducible builds.
- **Professional practice:** documentation, decision records, an operations runbook, UAE-specific compliance considerations (VAT-inclusive consumer prices, TRNs on commercial documents).
