# Product photos

Every product on the storefront shows one of two things, and the catalogue records which:

- **Photographs** of Top Flow's own range — 240 products. They came from Top Flow's catalogue on topflow.ae and were imported with Top Flow's approval (see `packages/database/prisma/data/README.md`). They live in `apps/web/public/catalog/products/`.
- **Drawn illustrations** of the product type — 106 products, all from the range added on 2026-09-17. They are drawings of what the product is, not pictures of the item a customer receives, and they live in `apps/web/public/catalog/illustrations/`.

No third-party photograph is used anywhere on the site.

## Why not photos from manufacturer or distributor websites

Two reasons, and both matter for a real shop:

1. **Copyright.** A manufacturer's or distributor's product photography is their work. Copying it onto Top Flow's store needs their permission, which is normally given to dealers as part of a supply agreement — not taken from the website.
2. **It would misrepresent the goods.** These products carry the Top Flow name. A photograph of another manufacturer's pump, valve or controller shows a customer an item that is not what they would be sent.

## What a search of free-to-use sources found (2026-09-17)

All 106 products were searched on Wikimedia Commons and Openverse (which aggregates Flickr, Wikimedia and museum collections), filtered to licences that allow commercial use, a minimum of 800 px, and screened automatically for a plain background.

| Result | Products |
| --- | ---: |
| A candidate that passed the plain-background screen | 9 |
| Field or in-use photographs only | 23 |
| Nothing usable at all | 74 |

On inspection none of the 9 was usable: they were 19th-century engravings, engineering diagrams, a vintage hose reel and photographs of different products. The field photographs show equipment installed in crops, not the product. Free-to-use collections simply do not contain catalogue photography of irrigation hardware.

**Every product listed below is therefore flagged as needing a photograph.**

## Getting real photographs

Suppliers normally give their dealers an image pack free of charge. When asking, request:

- a plain white or transparent background, with the whole product in frame;
- at least 1,000 px on the longest side;
- a three-quarter view, plus a straight-on view where the face matters (controllers, meters, gauges);
- written confirmation that Top Flow may use the images on its website and in quotations;
- no other company's logo or watermark in the picture.

## Adding a photograph once it arrives

1. Convert it to WebP, no more than 960 px on the longest side, and save it in `apps/web/public/catalog/products/`.
2. Point the product at it: either set `imageUrl` in `packages/database/prisma/data/topflow-catalogue.json` and re-run `npm run db:seed`, or paste the path into the **Image URL** field on the product in the back office.
3. The drawn illustration can then be deleted.

## Products waiting for a photograph (106)

### Sprinklers & Rotors · Impact Sprinklers & Rain Guns

| SKU | Product | Size / rating |
| --- | --- | --- |
| `TF-SPR-IMP-050` | Impact Sprinkler 1/2" (Part or Full Circle) | 1/2" BSP male · radius 9–12 m |
| `TF-SPR-IMP-BR-075` | Brass Impact Sprinkler 3/4" | 3/4" BSP male · radius 14–18 m |
| `TF-SPR-TRIPOD-075` | Telescopic Tripod Stand for 3/4" Sprinklers | 3/4" female top thread · height 0.9–1.5 m |
| `TF-SPR-GUN-150` | Rain Gun 1-1/2" (Part Circle) | 1-1/2" BSP female · radius 25–38 m |
| `TF-SPR-GUN-200` | Rain Gun 2" (Part Circle) | 2" BSP female · radius 35–50 m |

### Drip Irrigation · Drip Irrigation Kits

| SKU | Product | Size / rating |
| --- | --- | --- |
| `TF-DRP-KIT-G30` | Home Garden Drip Kit (30 Plants) | 30 plants · 25 m of 16 mm pipe |
| `TF-DRP-KIT-T10` | Tree Drip Ring Kit (10 Trees) | 10 trees · 16 mm dripline rings |
| `TF-DRP-KIT-PALM10` | Palm Bubbler Kit (10 Palms) | 10 palms · adjustable bubblers |
| `TF-DRP-KIT-FARM-1000` | Farm Drip Kit 1,000 m² | 1,000 m² · rows 1 m apart |

### Drip Irrigation · Drip Tape

| SKU | Product | Size / rating |
| --- | --- | --- |
| `TF-DRP-TAPE-6-20` | Drip Tape 16 mm 6 mil, 20 cm Spacing (2,000 m) | 16 mm · 0.15 mm wall · 20 cm spacing · 2,000 m roll |
| `TF-DRP-TAPE-8-30` | Drip Tape 16 mm 8 mil, 30 cm Spacing (2,000 m) | 16 mm · 0.20 mm wall · 30 cm spacing · 2,000 m roll |
| `TF-DRP-TAPE-SC-16` | Drip Tape Start Connector with Grommet 16 mm (Box of 100) | 16 mm tape · box of 100 |

### Drip Irrigation · Micro Sprinklers

| SKU | Product | Size / rating |
| --- | --- | --- |
| `TF-DRP-MSP-ROT` | Rotating Micro-Sprinkler 360° on Stake | 40–90 L/h · 60 cm stake |
| `TF-DRP-MSP-JET` | Micro-Jet Spray (90°, 180° or 360°) | 90°, 180° or 360° pattern · 20–40 L/h |
| `TF-DRP-MTUBE-47` | Microtube 4/7 mm (100 m) | 4 mm ID × 7 mm OD · 100 m roll |

### Pipes & Fittings · Irrigation Pipes

| SKU | Product | Size / rating |
| --- | --- | --- |
| `TF-PIPE-04` | Slotted Drainage Pipe | 90-450mm OD |

### Pipes & Fittings · Installation Tools

| SKU | Product | Size / rating |
| --- | --- | --- |
| `TF-TL-PUNCH-4` | Drip Hole Punch 4 mm | 4 mm hole · 12–20 mm PE pipe |
| `TF-TL-CUT-42` | PE Pipe Cutter up to 42 mm | PE and PVC pipe up to 42 mm OD |
| `TF-TL-WRENCH-SET` | Compression Fitting Wrench Set (20–110 mm) | 20–110 mm fittings |

### Valves & Control · Irrigation Controllers

| SKU | Product | Size / rating |
| --- | --- | --- |
| `TF-CTL-IN-4` | Indoor Irrigation Controller 4-Station | 4 stations · 230 V plug-in transformer |
| `TF-CTL-OUT-8` | Outdoor Irrigation Controller 8-Station | 8 stations · 230 V internal transformer |
| `TF-CTL-MOD-6` | Modular Irrigation Controller (6 to 22 Stations) | 6 stations, expandable to 22 · 230 V |
| `TF-CTL-MOD-EXP4` | Controller Expansion Module 4-Station | 4 stations |
| `TF-CTL-WIFI-8` | Wi-Fi Smart Irrigation Controller 8-Zone | 8 zones · 2.4 GHz Wi-Fi · 230 V |
| `TF-CTL-BAT-1` | Battery-Operated Controller 1-Station (9 V DC) | 1 station · 9 V battery |
| `TF-CTL-2W-50` | Two-Wire Commercial Controller 50 Stations | Up to 50 stations · 230 V |
| `TF-CTL-2W-DEC-1` | Two-Wire Valve Decoder 1-Station | 1 station |

### Valves & Control · Rain, Soil & Flow Sensors

| SKU | Product | Size / rating |
| --- | --- | --- |
| `TF-SNS-RAIN` | Wired Rain Sensor | 3–25 mm shut-off · 7.5 m cable |
| `TF-SNS-SOIL` | Soil Moisture Sensor Kit | Buried probe · controller interface |
| `TF-SNS-FLOW-100` | Irrigation Flow Sensor 1" | 1" · 0.5–9 m³/h |

### Valves & Control · Control Cable & Connectors

| SKU | Product | Size / rating |
| --- | --- | --- |
| `TF-CBL-7C-150` | Irrigation Control Cable 7-Core 1.5 mm² | 7 cores × 1.5 mm² · sold per metre |
| `TF-CBL-WC-30` | Waterproof Wire Connectors (Box of 30) | 0.8–2.5 mm² wire · box of 30 |
| `TF-SOL-DC-9V` | DC Latching Solenoid 9 V | 9 V DC · 2-wire |

### Valves & Control · Ball, Gate & Check Valves

| SKU | Product | Size / rating |
| --- | --- | --- |
| `TF-VLV-PVC-BV-100` | PVC Compact Ball Valve 1" | 1" BSP female |
| `TF-VLV-PVC-BV-200` | PVC Compact Ball Valve 2" | 2" BSP female |
| `TF-VLV-GV-DN100` | Resilient-Seated Gate Valve DN100 (4") | DN100 (4") · flanged PN16 |
| `TF-VLV-BFV-DN100` | Wafer Butterfly Valve DN100 (4") with Lever | DN100 (4") · fits PN10/PN16 flanges |
| `TF-VLV-CHK-BR-100` | Brass Swing Check Valve 1" | 1" BSP female |

### Valves & Control · Pressure Regulators & Meters

| SKU | Product | Size / rating |
| --- | --- | --- |
| `TF-PRV-075-14` | Preset Pressure Regulator 3/4" (1.4 bar) | 3/4" BSP female · 1.4 bar (20 PSI) |
| `TF-PRV-100-21` | Preset Pressure Regulator 1" (2.1 bar) | 1" BSP female · 2.1 bar (30 PSI) |
| `TF-PRV-BR-ADJ-100` | Adjustable Brass Pressure Reducing Valve 1" | 1" BSP female · outlet 1–6 bar |
| `TF-PRV-HYD-300` | Hydraulic Pressure Reducing Valve 3" | 3" threaded · pilot-operated |
| `TF-GAU-063-10` | Glycerine-Filled Pressure Gauge 0–10 bar | 63 mm dial · 1/4" BSP bottom connection |
| `TF-MTR-MJ-100` | Multi-Jet Water Meter 1" | 1" BSP male · Q3 6.3 m³/h |
| `TF-MTR-WLT-DN80` | Woltman Water Meter DN80 (3") with Pulse Output | DN80 (3") · flanged PN16 · Q3 100 m³/h |

### Filtration · Screen Filters

| SKU | Product | Size / rating |
| --- | --- | --- |
| `TF-FLT-SCR-100` | Screen Filter 1" (120 Mesh) | 1" BSP male · up to 5 m³/h |
| `TF-FLT-SCR-200` | Screen Filter 2" (120 Mesh) | 2" BSP male · up to 25 m³/h |
| `TF-FLT-SCR-ST-300` | Steel Screen Filter 3" (120 Mesh) | 3" · up to 50 m³/h · max 10 bar |

### Filtration · Sand Media Filters

| SKU | Product | Size / rating |
| --- | --- | --- |
| `TF-FLT-MED-24` | Sand Media Filter 24" (15 m³/h) | 24" (600 mm) tank · 2" connections · up to 15 m³/h |
| `TF-FLT-MED-48` | Sand Media Filter 48" (60 m³/h) | 48" (1,200 mm) tank · 4" connections · up to 60 m³/h |
| `TF-FLT-SAND-25` | Filtration Silica Sand 0.8–1.2 mm (25 kg) | 0.8–1.2 mm grain · 25 kg bag |

### Filtration · Hydrocyclone Sand Separators

| SKU | Product | Size / rating |
| --- | --- | --- |
| `TF-FLT-HYC-200` | Hydrocyclone Sand Separator 2" | 2" · 10–20 m³/h |
| `TF-FLT-HYC-300` | Hydrocyclone Sand Separator 3" | 3" · 25–45 m³/h |

### Pumps & Water Supply · Surface Pumps & Booster Sets

| SKU | Product | Size / rating |
| --- | --- | --- |
| `TF-PMP-CS-050` | Centrifugal Surface Pump 0.5 HP | 0.37 kW · 1" × 1" · 230 V single-phase |
| `TF-PMP-CS-100` | Centrifugal Surface Pump 1 HP | 0.75 kW · 1" × 1" · 230 V single-phase |
| `TF-PMP-CS-200` | High-Flow Centrifugal Pump 2 HP | 1.5 kW · 2" × 2" · 230 V single-phase |
| `TF-PMP-ES-300-3P` | End-Suction Centrifugal Pump 3 HP (Three-Phase) | 2.2 kW · 2-1/2" × 2" · 400 V three-phase |
| `TF-PMP-MS-110` | Stainless-Steel Multistage Pump 1.5 HP | 1.1 kW · 1-1/4" × 1" · 230 V single-phase |
| `TF-PMP-BST-110` | Pressure Booster Set 1.1 kW with 24 L Tank | 1.1 kW · 1" outlet · 230 V single-phase |

### Pumps & Water Supply · Borehole Submersible Pumps

| SKU | Product | Size / rating |
| --- | --- | --- |
| `TF-PMP-SUB4-150` | Borehole Submersible Pump 4" 1.5 HP | 1.1 kW · 1-1/4" outlet · 230 V single-phase |
| `TF-PMP-SUB4-300-3P` | Borehole Submersible Pump 4" 3 HP (Three-Phase) | 2.2 kW · 2" outlet · 400 V three-phase |
| `TF-PMP-SUB6-750-3P` | Borehole Submersible Pump 6" 7.5 HP (Three-Phase) | 5.5 kW · 3" outlet · 400 V three-phase |

### Pumps & Water Supply · Solar Pumping

| SKU | Product | Size / rating |
| --- | --- | --- |
| `TF-SOL-INV-220` | Solar Pump Inverter 2.2 kW | 2.2 kW · 400 V three-phase output |
| `TF-SOL-KIT-SUB4-1100` | Solar Submersible Pump Kit 4" 1.1 kW | 1.1 kW brushless DC · 1-1/4" outlet |

### Pumps & Water Supply · Pressure & Storage Tanks

| SKU | Product | Size / rating |
| --- | --- | --- |
| `TF-TNK-PRS-100V` | Vertical Pressure Tank 100 L | 100 L · 1" connection · max 10 bar |
| `TF-TNK-PE-500G` | Polyethylene Water Tank 500 gal (2,270 L) | 2,270 L (500 imperial gallons) |
| `TF-TNK-PE-1000G` | Polyethylene Water Tank 1,000 gal (4,550 L) | 4,550 L (1,000 imperial gallons) |

### Pumps & Water Supply · Pump Controls & Accessories

| SKU | Product | Size / rating |
| --- | --- | --- |
| `TF-PMP-EPC-10` | Electronic Pressure Control for Pumps | 1" male × 1" male · 230 V · pumps up to 1.5 kW |
| `TF-PMP-DOL-55` | Three-Phase Pump Starter Panel 5.5 kW | Pumps up to 5.5 kW · 400 V three-phase |
| `TF-PMP-FLT-5M` | Float Level Switch with 5 m Cable | 5 m cable · 16 A 250 V |
| `TF-PMP-FV-150` | Brass Foot Valve 1-1/2" | 1-1/2" BSP female |

### Fertigation · Venturi Injectors

| SKU | Product | Size / rating |
| --- | --- | --- |
| `TF-FRT-VEN-075` | Venturi Fertiliser Injector 3/4" | 3/4" BSP male |
| `TF-FRT-VEN-100` | Venturi Fertiliser Injector 1" | 1" BSP male |
| `TF-FRT-VEN-200` | Venturi Fertiliser Injector 2" | 2" BSP male |
| `TF-FRT-VEN-KIT-100` | Venturi Bypass Kit 1" with Flow Meter | 1" BSP connections |

### Fertigation · Dosing Pumps

| SKU | Product | Size / rating |
| --- | --- | --- |
| `TF-FRT-DOS-W25` | Water-Powered Proportional Doser 2.5 m³/h | 3/4" BSP · 0.2–2% dosing |
| `TF-FRT-DOS-E10` | Electric Dosing Pump 10 L/h | 10 L/h · max 10 bar · 230 V |

### Fertigation · Fertiliser Tanks

| SKU | Product | Size / rating |
| --- | --- | --- |
| `TF-FRT-TNK-BP-060` | Bypass Fertiliser Tank 60 L | 60 L · 3/4" connections · max 8 bar |
| `TF-FRT-TNK-BP-120` | Bypass Fertiliser Tank 120 L | 120 L · 1" connections · max 8 bar |
| `TF-FRT-TNK-MIX-500` | Fertiliser Mixing Tank 500 L | 500 L · 2" outlet |

### Fertigation · EC & pH Control

| SKU | Product | Size / rating |
| --- | --- | --- |
| `TF-FRT-MTR-ECPH` | Portable EC/pH/Temperature Meter | pH 0–14 · EC 0–20 mS/cm |
| `TF-FRT-CTL-2CH` | Fertigation Controller with EC/pH Control (2 Channels) | 2 injection channels · 230 V |

### Greenhouse & Nursery · Shade & Insect Nets

| SKU | Product | Size / rating |
| --- | --- | --- |
| `TF-GH-SHN-50G-2X50` | Shade Net 50% Green (2 m × 50 m) | 2 m × 50 m roll · 50% shade |
| `TF-GH-SHN-70B-4X50` | Shade Net 70% Black (4 m × 50 m) | 4 m × 50 m roll · 70% shade |
| `TF-GH-INS-50M-3X100` | Insect Net 50 Mesh (3 m × 100 m) | 3 m × 100 m roll · 50 mesh |

### Greenhouse & Nursery · Greenhouse Film & Fixings

| SKU | Product | Size / rating |
| --- | --- | --- |
| `TF-GH-FLM-200-9X50` | Greenhouse Film 200 Micron (9 m × 50 m) | 9 m × 50 m roll · 200 µm |
| `TF-GH-LCK-2M` | Aluminium Lock Channel 2 m | 2 m length |
| `TF-GH-WGL-2M` | PVC-Coated Wiggle Wire 2 m | 2 m length |

### Greenhouse & Nursery · Cooling & Misting

| SKU | Product | Size / rating |
| --- | --- | --- |
| `TF-GH-PAD-150` | Evaporative Cooling Pad 150 mm (1.8 m × 0.6 m) | 1,800 × 600 × 150 mm |
| `TF-GH-FOG-4W` | Four-Way Cross Fogger with Anti-Drip Valve | 4 nozzles · 7.5 L/h at 4 bar |
| `TF-GH-MST-KIT-20` | Misting Line Kit 20 m | 20 m of 1/4" tubing · 20 nozzles |

### Greenhouse & Nursery · Nursery Containers & Media

| SKU | Product | Size / rating |
| --- | --- | --- |
| `TF-NUR-TRY-128` | Seedling Tray 128 Cells (Pack of 50) | 128 cells · 540 × 280 mm · pack of 50 |
| `TF-NUR-POT-5G` | Nursery Pot 5 gal (19 L) | 19 L · top diameter 290 mm |
| `TF-NUR-GB-100` | Coco Peat Grow Bag 100 cm | 100 × 20 × 10 cm (expanded) |
| `TF-NUR-GC-100-2X100` | Weed Control Ground Cover 100 g/m² (2 m × 100 m) | 2 m × 100 m roll · 100 g/m² |

### Hoses & Watering · Garden & Rubber Hoses

| SKU | Product | Size / rating |
| --- | --- | --- |
| `TF-HOS-PVC-12-30` | Reinforced Garden Hose 1/2" (30 m) | 1/2" (13 mm) bore · 30 m |
| `TF-HOS-PVC-34-30` | Reinforced Garden Hose 3/4" (30 m) | 3/4" (19 mm) bore · 30 m |
| `TF-HOS-RUB-34-50` | Heavy-Duty Rubber Hose 3/4" (50 m) | 3/4" (19 mm) bore · 50 m |

### Hoses & Watering · Layflat & Suction Hoses

| SKU | Product | Size / rating |
| --- | --- | --- |
| `TF-HOS-LF-2-100` | PVC Layflat Hose 2" (100 m) | 2" (50 mm) · 100 m |
| `TF-HOS-LF-3-100` | PVC Layflat Hose 3" (100 m) | 3" (75 mm) · 100 m |
| `TF-HOS-SUC-2` | PVC Spiral Suction Hose 2" | 2" (50 mm) bore · cut to length |
| `TF-HOS-CAM-2` | Cam-Lock Coupling Set 2" (Type A and C) | 2" · BSP female thread × hose tail |

### Hoses & Watering · Hose Reels

| SKU | Product | Size / rating |
| --- | --- | --- |
| `TF-HOS-REEL-CART` | Hose Reel Cart for 60 m of 1/2" Hose | Holds 60 m of 1/2" hose (hose not included) |
| `TF-HOS-REEL-AUTO-20` | Wall-Mounted Auto-Rewind Hose Reel 20 m | 20 m of 1/2" hose included |

### Hoses & Watering · Spray Guns & Connectors

| SKU | Product | Size / rating |
| --- | --- | --- |
| `TF-HOS-GUN-8P` | Eight-Pattern Spray Gun | 8 spray patterns · click-fit connection |
| `TF-HOS-CON-SET` | Hose Connector Set 1/2" | 1/2" hose · 3/4" tap thread |
