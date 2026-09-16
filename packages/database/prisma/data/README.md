# Catalogue data

`topflow-catalogue.json` is the product range loaded by `prisma/seed.ts`: 7 categories, 31 product lines and 241 products — irrigation, water management and farm supplies only.

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

## Curation (2026-09-17)

The imported range was narrowed to what fits the business, and its listings were cleaned:

- **Removed categories:** Facilities & MEP (ventilation, bins, lighting, sanitary products) and Landscaping & Hardscape (edging, pavers, catch basins, soil cells, and range overviews that repeated products listed elsewhere).
- **Removed products:** a sewage pipe (DIN 19537) and 33 electrofusion fittings listed more than once under different code series. Where copies existed, the `AX-EFS` code was kept.
- **Unique names:** every product name is unique.
  - Electrofusion fittings follow one scheme from their size: coupler, elbow, tee, reducer, reducing tee or reducing elbow.
  - Compression and barbed fittings name their system.
  - Variants that differ only by size carry the size.
- **Corrected data:** a welding reducer listed as 36 × 32 mm is 63 × 32 mm, the standard size of its series.

## Updating

Edit the JSON and re-run `npm run db:seed`:

- Content and prices are refreshed, while live stock levels are kept.
- Products missing from the file are unpublished (`isActive = false`) by default.
  - `SEED_KEEP_UNLISTED=true` leaves them untouched.
  - `SEED_PRUNE_UNLISTED=true` deletes them, together with categories the file no longer lists. Order, quotation and request lines keep their own copy of each product.
