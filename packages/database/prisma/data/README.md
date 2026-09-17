# Catalogue data

`topflow-catalogue.json` is the product range loaded by `prisma/seed.ts`: 11 categories, 61 product lines and 346 products — irrigation, water management and farm supplies only.

- 241 products come from Top Flow's own catalogue.
- 105 typical products of the UAE irrigation and farm-supply market fill the gaps in that range (see [Added range](#added-range-2026-09-17)).

## Where it comes from

- **Imported products, specifications, stock status and photos** come from Top Flow's own catalogue on topflow.ae. They were imported with Top Flow's approval on 2026-09-15. The photos are served by the web app from `apps/web/public/catalog/products/`, converted to WebP at 960 px or smaller.
- **Category and product-line descriptions** were written for this platform.
- **Indicative price ranges** (`priceMin` / `priceMax`, AED net of VAT, per unit of measure) were researched from UAE and international list prices for comparable products.
  - Most ranges run from about 0.78 × to 1.23 × the typical price, rounded.
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
- **Renamed line:** Recycled Water & Drainage is now Recycled Water (Purple), because it holds no drainage products.

## Added range (2026-09-17)

Top Flow's catalogue had nothing for several things irrigation customers in the UAE buy with it. These product lines were added, each with products that are typical for the market:

| Category | Added product lines | Products |
| --- | --- | ---: |
| Pumps & Water Supply (new) | Surface Pumps & Booster Sets · Borehole Submersible Pumps · Solar Pumping · Pressure & Storage Tanks · Pump Controls & Accessories | 18 |
| Fertigation (new) | Venturi Injectors · Dosing Pumps · Fertiliser Tanks · EC & pH Control | 11 |
| Greenhouse & Nursery (new) | Shade & Insect Nets · Greenhouse Film & Fixings · Cooling & Misting · Nursery Containers & Media | 13 |
| Hoses & Watering (new) | Garden & Rubber Hoses · Layflat & Suction Hoses · Hose Reels · Spray Guns & Connectors | 11 |
| Valves & Control | Irrigation Controllers · Rain, Soil & Flow Sensors · Control Cable & Connectors · Ball, Gate & Check Valves · Pressure Regulators & Meters | 26 |
| Drip Irrigation | Drip Irrigation Kits · Drip Tape · Micro Sprinklers | 10 |
| Filtration | Screen Filters · Sand Media Filters · Hydrocyclone Sand Separators | 8 |
| Sprinklers & Rotors | Impact Sprinklers & Rain Guns | 5 |
| Pipes & Fittings | Installation Tools | 3 |

How these products differ from the imported ones:

- **Brand and codes:** they carry the Top Flow brand and `TF-<family>-<size>` codes, such as `TF-PMP-SUB4-150` or `TF-CTL-OUT-8`. No other manufacturer is named.
- **Specifications** are typical for each product type and size: flow, head, pressure, dimensions and materials.
- **Prices** are estimates from UAE retail and trade prices for comparable products, using the same range rule as the rest of the catalogue.
- **Availability:** every added product is "On order" with no stock. Staff record real stock in the back office, and online checkout only sells what is in stock.
- **Photos:** none yet. The storefront shows a placeholder until Top Flow adds photos.

Before these products are sold to real customers, Top Flow should confirm each specification and price against its supplier's data sheet and price list, then update the file or the back office.

## Updating

Edit the JSON and re-run `npm run db:seed`:

- Content and prices are refreshed, while live stock levels are kept.
- Products missing from the file are unpublished (`isActive = false`) by default.
  - `SEED_KEEP_UNLISTED=true` leaves them untouched.
  - `SEED_PRUNE_UNLISTED=true` deletes them, together with categories the file no longer lists. Order, quotation and request lines keep their own copy of each product.
