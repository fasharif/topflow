# Catalogue data

`topflow-catalogue.json` is the product range loaded by `prisma/seed.ts`: 9 categories, 41 product lines and 323 products.

## Where it comes from

- **Products, specifications, stock status and photos** come from Top Flow's own catalogue on topflow.ae. They were imported with Top Flow's approval on 2026-09-15. The photos are served by the web app from `apps/web/public/catalog/products/`, converted to WebP at 960 px or smaller.
- **Category and product-line descriptions** were written for this platform.
- **Indicative price ranges** (`priceMin` / `priceMax`, AED net of VAT, per unit of measure) were researched from UAE and international list prices for comparable products.
  - Where Top Flow publishes its own indicative price, the range is centred on that price.
  - The online list price (`unitPrice`) is the top of the range. Quotations can go lower.
  - Products that cover several sizes or configurations use a wider range.
- **SKUs** keep Top Flow's codes where they are valid SKU codes.
  - Descriptive identifiers become tidy codes: `TF-<LINE>-<NN>`, or the first code plus `-RANGE` for size series.
  - The original identifier is kept in the `Catalogue reference` specification.

## Updating

Edit the JSON and re-run `npm run db:seed`:

- Content and prices are refreshed, while live stock levels are kept.
- Products missing from the file are unpublished (`isActive = false`), never deleted, unless `SEED_KEEP_UNLISTED=true`.
