# @topflow/shared

Domain contracts shared by the API, the web app and the mobile app. Everything here is framework-free TypeScript compiled to CommonJS, so it runs in NestJS, Next.js and React Native alike.

| Module | Contents |
| --- | --- |
| `enums.ts` | Const-object enums mirroring the Prisma schema, plus human-readable labels (checked against Prisma at compile time by the API) |
| `permissions.ts` | Platform role → permission matrix and organization role → permission matrix |
| `workflows/` | Order, quotation and RFQ state machines, approval (spending limit) rules |
| `money.ts` | Integer-fils arithmetic, basis-point rates, per-line VAT, document totals, AED formatting |
| `commerce.ts` | Retail delivery-fee policy |
| `numbering.ts` | Sequential document number formatting (`TF-SO-2026-000123`) |
| `schemas/` | Zod request schemas — the API validates with them and clients reuse them for form validation |
| `types.ts` | API response DTOs |

```bash
npm run build -w @topflow/shared   # emit dist/ (consumers depend on the build)
npm test -w @topflow/shared        # unit tests for maths, workflows, permissions and schemas
```

**Rule of thumb:** if a business rule must behave identically on the server and in a client — a status transition, a VAT calculation, a password policy — it belongs here.
