# Security policy

## Reporting a vulnerability

Please report security problems privately, through GitHub's
[private vulnerability reporting](https://github.com/fasharif/topflow/security/advisories/new),
rather than in a public issue. Include the steps to reproduce the problem and the impact you
expect.

## Scope

TopFlow Hub is a portfolio project and is not hosted yet, so there is no production deployment
to test against. Reports about the code in this repository are welcome.

## How the platform is protected

The main measures are summarised in the README's [*Features*](README.md#features) table and described in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (sections 6 and 7):

- Supabase Auth, with two-factor authentication required for staff.
- Access tokens verified against Supabase's JWKS on every API request.
- Role-based access control, and tenant isolation for business accounts.
- Row Level Security on every table; a test fails if a table is missing it.
- Rate limiting per client, and prices always calculated on the server.
- A demo mode for the public portfolio demo that keeps business email to an allow-list, refuses
  invitations and keeps the shared demo accounts and demo organisation usable, and a nightly reset
  that refuses to delete sign-ins of any Supabase project but the demo database's own
  (ADR-021 in [docs/DECISIONS.md](docs/DECISIONS.md)).
