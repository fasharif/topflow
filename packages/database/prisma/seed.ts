/**
 * Idempotent demo data for local development, CI end-to-end tests and portfolio demos.
 * Run with `npm run db:seed`. Refuses to run in production unless SEED_FORCE=true.
 * Set SEED_DEMO_DOCUMENTS=false to skip the sample RFQs, quotations and orders.
 */
import 'dotenv/config';
import {
  bpsToPercent,
  calculateTotals,
  fromFils,
  toFils,
  type DocumentTotals,
} from '@topflow/shared';
import bcrypt from 'bcryptjs';
import {
  Emirate,
  OrderChannel,
  OrderStatus,
  OrgRole,
  OrgStatus,
  OrgType,
  PaymentMethod,
  PaymentStatus,
  PaymentTerms,
  QuotationStatus,
  RfqStatus,
  Role,
  StockStatus,
  UnitOfMeasure,
  createPrismaClient,
  type Address,
  type Product,
} from '../src/index';

if (process.env.NODE_ENV === 'production' && process.env.SEED_FORCE !== 'true') {
  console.error('Refusing to seed demo data in production (set SEED_FORCE=true to override).');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const prisma = createPrismaClient({ connectionString });
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'TopFlow2026!';
const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY);

const categories = [
  { slug: 'sprinklers-rotors', name: 'Sprinklers & Rotors', description: 'Gear-driven rotors for medium and large turf areas.' },
  { slug: 'spray-heads-nozzles', name: 'Spray Heads & Nozzles', description: 'Pop-up spray bodies, rotary and fixed nozzles.' },
  { slug: 'drip-irrigation', name: 'Drip Irrigation', description: 'Driplines, emitters and micro-irrigation for planters and trees.' },
  { slug: 'valves', name: 'Valves', description: 'Solenoid, master and isolation valves.' },
  { slug: 'controllers-sensors', name: 'Controllers & Sensors', description: 'Smart controllers, weather and rain sensors.' },
  { slug: 'pipes-fittings', name: 'Pipes & Fittings', description: 'uPVC and HDPE pipes, fittings and accessories.' },
  { slug: 'filtration', name: 'Filtration', description: 'Screen and disc filters for clean irrigation water.' },
  { slug: 'pumps', name: 'Pumps', description: 'Booster sets and pumps for irrigation networks.' },
];

type SeedProduct = {
  sku: string;
  name: string;
  brand: string;
  category: string;
  price: string;
  stock: number;
  uom?: UnitOfMeasure;
  moq?: number;
  tradeOnly?: boolean;
  specs: Record<string, string>;
  description: string;
};

const products: SeedProduct[] = [
  { sku: 'HU-PGP-ADJ', name: 'Hunter PGP Ultra Adjustable Rotor', brand: 'Hunter', category: 'sprinklers-rotors', price: '38.50', stock: 240, specs: { Radius: '7–16 m', Inlet: '3/4" BSP', Flow: '0.5–3.7 m³/h' }, description: 'Reliable gear-driven rotor with adjustable arc for parks and villa lawns.' },
  { sku: 'RB-5004-PC', name: 'Rain Bird 5004 Plus PC Rotor', brand: 'Rain Bird', category: 'sprinklers-rotors', price: '42.00', stock: 180, specs: { Radius: '7.6–15.2 m', Inlet: '3/4" BSP', Arc: '40°–360°' }, description: 'Part-circle rotor with Rain Curtain nozzle technology.' },
  { sku: 'TO-T7-ROTOR', name: 'Toro T7 Gear-Driven Rotor', brand: 'Toro', category: 'sprinklers-rotors', price: '29.75', stock: 95, specs: { Radius: '6.1–10.4 m', Inlet: '1/2" BSP' }, description: 'Compact rotor for residential turf.' },
  { sku: 'HU-I20-04SS', name: 'Hunter I-20 Stainless Riser Rotor', brand: 'Hunter', category: 'sprinklers-rotors', price: '67.00', stock: 60, specs: { Radius: '5.2–14 m', Riser: 'Stainless steel 10 cm' }, description: 'Vandal-resistant rotor for public landscapes.' },
  { sku: 'RB-1804-SAM', name: 'Rain Bird 1804 SAM Pop-up Spray Body', brand: 'Rain Bird', category: 'spray-heads-nozzles', price: '11.25', stock: 520, specs: { 'Pop-up height': '10 cm', 'Check valve': 'Seal-A-Matic' }, description: 'Industry-standard spray body with check valve.' },
  { sku: 'HU-PRS40', name: 'Hunter Pro-Spray PRS40 Spray Body', brand: 'Hunter', category: 'spray-heads-nozzles', price: '13.90', stock: 400, specs: { 'Pop-up height': '10 cm', Regulation: '2.8 bar' }, description: 'Pressure-regulated spray body that reduces misting.' },
  { sku: 'RB-HE-VAN-15', name: 'Rain Bird HE-VAN 15 ft Adjustable Nozzle', brand: 'Rain Bird', category: 'spray-heads-nozzles', price: '6.40', stock: 900, moq: 5, specs: { Radius: '2.4–4.6 m', Arc: '0°–360°' }, description: 'High-efficiency variable arc nozzle.' },
  { sku: 'HU-MP2000', name: 'Hunter MP Rotator MP2000', brand: 'Hunter', category: 'spray-heads-nozzles', price: '24.50', stock: 300, specs: { Radius: '4–6.4 m', 'Precip. rate': '10 mm/h' }, description: 'Multi-trajectory rotating streams for water savings.' },
  { sku: 'NE-TECHLINE-16', name: 'Netafim Techline CV 16 mm Dripline 2.1 L/h (100 m)', brand: 'Netafim', category: 'drip-irrigation', price: '245.00', stock: 40, uom: UnitOfMeasure.ROLL, specs: { Diameter: '16 mm', Spacing: '33 cm', Flow: '2.1 L/h' }, description: 'Pressure-compensating dripline with anti-drain check valves.' },
  { sku: 'NE-UNIRAM-17', name: 'Netafim UniRam 17 mm Dripline 1.6 L/h (400 m)', brand: 'Netafim', category: 'drip-irrigation', price: '890.00', stock: 12, uom: UnitOfMeasure.ROLL, tradeOnly: true, specs: { Diameter: '17 mm', Spacing: '50 cm', Flow: '1.6 L/h' }, description: 'Heavy-wall dripline for large agricultural and municipal projects.' },
  { sku: 'RB-XFD-16', name: 'Rain Bird XFD Inline Drip Tubing 16 mm', brand: 'Rain Bird', category: 'drip-irrigation', price: '3.20', stock: 5000, uom: UnitOfMeasure.METER, moq: 25, specs: { Diameter: '16 mm', Spacing: '30 cm' }, description: 'Flexible inline drip tubing sold by the metre.' },
  { sku: 'NE-PCJ-2L', name: 'Netafim PCJ 2 L/h Pressure-Compensating Dripper', brand: 'Netafim', category: 'drip-irrigation', price: '1.15', stock: 8000, moq: 50, specs: { Flow: '2 L/h', Range: '0.5–4 bar' }, description: 'Button dripper for trees and planters.' },
  { sku: 'RB-100-DV', name: 'Rain Bird 100-DV 1" Solenoid Valve', brand: 'Rain Bird', category: 'valves', price: '58.00', stock: 150, specs: { Size: '1"', Voltage: '24 VAC' }, description: 'Durable plastic solenoid valve with flow control.' },
  { sku: 'HU-PGV-101G', name: 'Hunter PGV-101G 1" Globe Valve', brand: 'Hunter', category: 'valves', price: '52.50', stock: 110, specs: { Size: '1"', Voltage: '24 VAC' }, description: 'Globe-configuration valve for residential systems.' },
  { sku: 'IR-205-2IN', name: 'Irritrol 205 2" Brass Master Valve', brand: 'Irritrol', category: 'valves', price: '485.00', stock: 8, tradeOnly: true, specs: { Size: '2"', Body: 'Brass' }, description: 'Commercial brass valve for mainline isolation.' },
  { sku: 'GF-BALL-32', name: 'GF uPVC Ball Valve 32 mm', brand: 'GF Piping Systems', category: 'valves', price: '36.00', stock: 75, specs: { Size: '32 mm', Rating: 'PN16' }, description: 'True-union ball valve for isolation duty.' },
  { sku: 'HU-HPC-400', name: 'Hunter Hydrawise HPC-400 Wi-Fi Controller', brand: 'Hunter', category: 'controllers-sensors', price: '690.00', stock: 22, specs: { Stations: '4 (expandable to 16)', Connectivity: 'Wi-Fi' }, description: 'Cloud-managed smart controller with predictive watering.' },
  { sku: 'RB-ESP-TM2-8', name: 'Rain Bird ESP-TM2 8-Station Controller', brand: 'Rain Bird', category: 'controllers-sensors', price: '520.00', stock: 18, specs: { Stations: '8', Connectivity: 'LNK2 Wi-Fi ready' }, description: 'Easy-to-program controller for villas and small commercial sites.' },
  { sku: 'HU-SOLAR-SYNC', name: 'Hunter Solar Sync ET Sensor', brand: 'Hunter', category: 'controllers-sensors', price: '415.00', stock: 4, specs: { Measures: 'Sunlight & temperature' }, description: 'Adjusts run times daily based on evapotranspiration.' },
  { sku: 'RB-RSD-BEX', name: 'Rain Bird RSD-BEx Rain Sensor', brand: 'Rain Bird', category: 'controllers-sensors', price: '118.00', stock: 30, specs: { Settings: '3–25 mm' }, description: 'Interrupts watering during rainfall.' },
  { sku: 'PVC-P-32-6', name: 'uPVC Pressure Pipe 32 mm PN10 (6 m length)', brand: 'Top Flow Select', category: 'pipes-fittings', price: '18.50', stock: 600, specs: { Diameter: '32 mm', Rating: 'PN10', Length: '6 m' }, description: 'Solvent-weld pressure pipe for irrigation mains.' },
  { sku: 'HDPE-25-PN16', name: 'HDPE Pipe 25 mm PN16 (100 m coil)', brand: 'Top Flow Select', category: 'pipes-fittings', price: '310.00', stock: 25, uom: UnitOfMeasure.ROLL, specs: { Diameter: '25 mm', Rating: 'PN16', Length: '100 m' }, description: 'UV-stabilised polyethylene pipe for laterals.' },
  { sku: 'PVC-ELB-32', name: 'uPVC Elbow 90° 32 mm', brand: 'Top Flow Select', category: 'pipes-fittings', price: '2.10', stock: 3000, moq: 10, specs: { Diameter: '32 mm', Angle: '90°' }, description: 'Solvent-weld elbow fitting.' },
  { sku: 'AM-SCREEN-1IN', name: 'Amiad 1" Screen Filter 120 Mesh', brand: 'Amiad', category: 'filtration', price: '96.00', stock: 45, specs: { Size: '1"', Mesh: '120' }, description: 'Compact screen filter for drip zones.' },
  { sku: 'AM-DISC-2IN', name: 'Amiad 2" Disc Filter 130 Micron', brand: 'Amiad', category: 'filtration', price: '540.00', stock: 6, specs: { Size: '2"', Filtration: '130 micron' }, description: 'High-capacity disc filter for main lines.' },
  { sku: 'GR-CMBE-3-62', name: 'Grundfos CMBE 3-62 Booster Pump Set', brand: 'Grundfos', category: 'pumps', price: '4350.00', stock: 3, uom: UnitOfMeasure.SET, tradeOnly: true, specs: { 'Max flow': '4.5 m³/h', 'Max head': '62 m' }, description: 'Variable-speed booster set with integrated controls.' },
  { sku: 'PE-PKM60', name: 'Pedrollo PKm 60 Peripheral Pump 0.5 HP', brand: 'Pedrollo', category: 'pumps', price: '310.00', stock: 14, specs: { Power: '0.37 kW', 'Max head': '40 m' }, description: 'Peripheral pump for small irrigation systems.' },
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function upsertUser(email: string, fullName: string, role: Role, passwordHash: string, phoneNumber?: string) {
  return prisma.user.upsert({
    where: { email },
    update: { fullName, role, isActive: true },
    create: { email, fullName, role, passwordHash, phoneNumber, emailVerifiedAt: new Date() },
  });
}

async function seedReferenceData(passwordHash: string) {
  for (const [index, category] of categories.entries()) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, description: category.description, displayOrder: index },
      create: { ...category, displayOrder: index },
    });
  }
  const categoryIds = new Map((await prisma.category.findMany()).map((c) => [c.slug, c.id]));

  for (const product of products) {
    const data = {
      name: product.name,
      slug: slugify(`${product.name}-${product.sku}`),
      brand: product.brand,
      categoryId: categoryIds.get(product.category) ?? null,
      description: product.description,
      specifications: product.specs,
      unitPrice: product.price,
      uom: product.uom ?? UnitOfMeasure.PIECE,
      minOrderQty: product.moq ?? 1,
      stockQuantity: product.stock,
      stockStatus: product.stock > 0 ? StockStatus.IN_STOCK : StockStatus.ON_ORDER,
      isTradeOnly: product.tradeOnly ?? false,
      isActive: true,
    };
    await prisma.product.upsert({ where: { sku: product.sku }, update: data, create: { sku: product.sku, ...data } });
  }

  await upsertUser('admin@topflow.ae', 'Aisha Rahman', Role.ADMIN, passwordHash, '+971 4 555 0100');
  await upsertUser('sales@topflow.ae', 'Omar Haddad', Role.SALES, passwordHash, '+971 4 555 0101');
  await upsertUser('warehouse@topflow.ae', 'Ravi Menon', Role.WAREHOUSE, passwordHash, '+971 4 555 0102');

  const customer = await upsertUser('customer@example.com', 'Sara Ahmed', Role.CUSTOMER, passwordHash, '+971 50 123 4567');
  if (!(await prisma.address.findFirst({ where: { userId: customer.id } }))) {
    await prisma.address.create({
      data: { userId: customer.id, label: 'Home', contactName: 'Sara Ahmed', phoneNumber: '+971 50 123 4567', line1: 'Villa 14, Street 3', area: 'Arabian Ranches', city: 'Dubai', emirate: Emirate.DUBAI, isDefault: true },
    });
  }

  const organization = await prisma.organization.upsert({
    where: { trn: '100234567800003' },
    update: {},
    create: {
      name: 'Desert Bloom Landscaping LLC',
      legalName: 'Desert Bloom Landscaping L.L.C.',
      type: OrgType.LANDSCAPING,
      status: OrgStatus.ACTIVE,
      tradeLicenseNumber: 'DED-778812',
      trn: '100234567800003',
      email: 'procurement@desertbloom.ae',
      phoneNumber: '+971 4 388 2200',
      paymentTerms: PaymentTerms.NET_30,
      creditLimit: '250000.00',
      discountRate: '7.50',
      verifiedAt: new Date(),
    },
  });

  const team: Array<[string, string, OrgRole, string | null]> = [
    ['owner@desertbloom.ae', 'Khalid Al Mansoori', OrgRole.OWNER, null],
    ['approver@desertbloom.ae', 'Fatima Noor', OrgRole.APPROVER, '50000.00'],
    ['buyer@desertbloom.ae', 'Joseph Mathew', OrgRole.BUYER, '5000.00'],
  ];
  for (const [email, fullName, role, approvalLimit] of team) {
    const user = await upsertUser(email, fullName, Role.CUSTOMER, passwordHash, '+971 55 700 1000');
    await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
      update: { role, approvalLimit },
      create: { organizationId: organization.id, userId: user.id, role, approvalLimit },
    });
  }

  if (!(await prisma.address.findFirst({ where: { organizationId: organization.id } }))) {
    await prisma.address.create({
      data: { organizationId: organization.id, label: 'Dubai Hills Estate — Parkway site', contactName: 'Joseph Mathew', phoneNumber: '+971 55 700 1000', line1: 'Plot 5, Parkway Landscaping Package', area: 'Dubai Hills Estate', city: 'Dubai', emirate: Emirate.DUBAI, isDefault: true },
    });
  }

  // A second business waiting in the KYC queue.
  const pending = await prisma.organization.upsert({
    where: { trn: '100998877600003' },
    update: {},
    create: { name: 'Al Waha Facility Management LLC', type: OrgType.FACILITY_MANAGEMENT, status: OrgStatus.PENDING_VERIFICATION, tradeLicenseNumber: 'DED-910221', trn: '100998877600003', email: 'procurement@alwaha.ae', phoneNumber: '+971 2 644 1100' },
  });
  const pendingOwner = await upsertUser('owner@alwaha.ae', 'Hamad Al Suwaidi', Role.CUSTOMER, passwordHash, '+971 50 900 4411');
  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: pending.id, userId: pendingOwner.id } },
    update: {},
    create: { organizationId: pending.id, userId: pendingOwner.id, role: OrgRole.OWNER },
  });

  return { organizationId: organization.id, customerId: customer.id };
}

// ─── Demo documents ─────────────────────────────────────────────────────────

type DemoLine = { sku: string; quantity: number; discountBps?: number };

interface Priced {
  products: Product[];
  totals: DocumentTotals;
}

async function price(lines: DemoLine[], deliveryFeeFils: number): Promise<Priced> {
  const found = await prisma.product.findMany({ where: { sku: { in: lines.map((l) => l.sku) } } });
  const bySku = new Map(found.map((p) => [p.sku, p]));
  const productsForLines = lines.map((l) => {
    const product = bySku.get(l.sku);
    if (!product) throw new Error(`Demo product ${l.sku} is missing`);
    return product;
  });
  const totals = calculateTotals(
    lines.map((l, i) => ({ listPriceFils: toFils(productsForLines[i].unitPrice), quantity: l.quantity, discountBps: l.discountBps ?? 0 })),
    { deliveryFeeFils },
  );
  return { products: productsForLines, totals };
}

function money(totals: DocumentTotals) {
  return {
    subtotal: fromFils(totals.subtotalFils),
    discountTotal: fromFils(totals.discountTotalFils),
    deliveryFee: fromFils(totals.deliveryFeeFils),
    vatAmount: fromFils(totals.vatFils),
  };
}

function quotationItems({ products: items, totals }: Priced) {
  return items.map((product, i) => {
    const line = totals.lines[i];
    return {
      productId: product.id,
      sku: product.sku,
      productName: product.name,
      uom: product.uom,
      quantity: line.quantity,
      listPrice: fromFils(line.listPriceFils),
      discountRate: bpsToPercent(line.discountBps),
      unitPrice: fromFils(line.unitPriceFils),
      lineSubtotal: fromFils(line.lineSubtotalFils),
      vatAmount: fromFils(line.vatFils),
      lineTotal: fromFils(line.lineTotalFils),
      sortOrder: i,
    };
  });
}

function orderItems({ products: items, totals }: Priced) {
  return items.map((product, i) => {
    const line = totals.lines[i];
    return {
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      uom: product.uom,
      unitPrice: fromFils(line.unitPriceFils),
      discountRate: bpsToPercent(line.discountBps),
      quantity: line.quantity,
      totalPrice: fromFils(line.lineSubtotalFils),
      vatAmount: fromFils(line.vatFils),
    };
  });
}

function snapshot(address: Address) {
  const { label, contactName, phoneNumber, line1, line2, area, city, emirate, country } = address;
  return { label, contactName, phoneNumber, line1, line2, area, city, emirate, country };
}

function formatted(address: Address): string {
  return [address.line1, address.line2, address.area, address.city, 'United Arab Emirates'].filter(Boolean).join(', ');
}

async function seedDemoDocuments(organizationId: string, customerId: string) {
  const byEmail = async (email: string) => prisma.user.findUniqueOrThrow({ where: { email } });
  const [buyer, approver, sales, warehouse] = await Promise.all(
    ['buyer@desertbloom.ae', 'approver@desertbloom.ae', 'sales@topflow.ae', 'warehouse@topflow.ae'].map(byEmail),
  );
  const site = await prisma.address.findFirstOrThrow({ where: { organizationId, isDefault: true } });
  const home = await prisma.address.findFirstOrThrow({ where: { userId: customerId, isDefault: true } });
  const trade = 750; // Desert Bloom's negotiated 7.5% discount, in basis points
  let created = 0;

  const rfqBase = (number: string, status: RfqStatus, projectReference: string, lines: DemoLine[], age: number) => ({
    number,
    organizationId,
    requestedById: buyer.id,
    assignedToId: status === RfqStatus.SUBMITTED ? null : sales.id,
    status,
    projectReference,
    shippingAddress: formatted(site),
    deliveryAddress: snapshot(site),
    createdAt: daysAgo(age),
    items: { create: lines.map((l) => ({ sku: l.sku, productName: l.sku, quantity: l.quantity })) },
  });

  async function rfqWithQuotation(options: {
    rfqNumber: string;
    quotationNumber: string;
    rfqStatus: RfqStatus;
    quotationStatus: QuotationStatus;
    project: string;
    lines: DemoLine[];
    age: number;
    extra?: Record<string, unknown>;
  }) {
    if (await prisma.quoteRequest.findUnique({ where: { number: options.rfqNumber } })) return null;
    const priced = await price(options.lines, 150_00);
    const rfq = await prisma.quoteRequest.create({ data: rfqBase(options.rfqNumber, options.rfqStatus, options.project, options.lines, options.age) });
    // Replace placeholder RFQ line names with the real catalog names.
    for (const product of priced.products) {
      await prisma.quoteRequestItem.updateMany({ where: { quoteRequestId: rfq.id, sku: product.sku }, data: { productName: product.name, productId: product.id } });
    }
    const quotation = await prisma.quotation.create({
      data: {
        number: options.quotationNumber,
        revision: 1,
        quoteRequestId: rfq.id,
        organizationId,
        customerId: buyer.id,
        createdById: sales.id,
        status: options.quotationStatus,
        ...money(priced.totals),
        total: fromFils(priced.totals.totalFils),
        sentAt: daysAgo(options.age - 1),
        validUntil: new Date(Date.now() + 12 * DAY),
        notes: 'Prices include delivery to one site in Dubai.',
        items: { create: quotationItems(priced) },
        ...options.extra,
      },
    });
    created++;
    return { rfq, quotation, priced };
  }

  // 1. A fresh RFQ waiting for the sales team.
  if (!(await prisma.quoteRequest.findUnique({ where: { number: 'TF-RFQ-2026-D00001' } }))) {
    const lines = [{ sku: 'HU-MP2000', quantity: 120 }, { sku: 'RB-1804-SAM', quantity: 120 }];
    const priced = await price(lines, 0);
    const rfq = await prisma.quoteRequest.create({ data: { ...rfqBase('TF-RFQ-2026-D00001', RfqStatus.SUBMITTED, 'Emirates Hills villa cluster — irrigation retrofit', lines, 1), notes: 'Please include MP rotator nozzles matched to the bodies.' } });
    for (const product of priced.products) {
      await prisma.quoteRequestItem.updateMany({ where: { quoteRequestId: rfq.id, sku: product.sku }, data: { productName: product.name, productId: product.id } });
    }
    created++;
  }

  // 2. A quotation awaiting the buyer's decision (within the buyer's AED 5,000 limit).
  await rfqWithQuotation({
    rfqNumber: 'TF-RFQ-2026-D00002',
    quotationNumber: 'TF-QT-2026-D00001',
    rfqStatus: RfqStatus.QUOTED,
    quotationStatus: QuotationStatus.SENT,
    project: 'Al Barari — community park upgrade',
    lines: [{ sku: 'HU-PGP-ADJ', quantity: 60, discountBps: trade }, { sku: 'HU-HPC-400', quantity: 2, discountBps: trade }],
    age: 4,
  });

  // 3. A quotation the buyer accepted above their limit — waiting for the approver.
  await rfqWithQuotation({
    rfqNumber: 'TF-RFQ-2026-D00003',
    quotationNumber: 'TF-QT-2026-D00002',
    rfqStatus: RfqStatus.QUOTED,
    quotationStatus: QuotationStatus.PENDING_APPROVAL,
    project: 'Dubai Hills Estate — Parkway drip zones',
    lines: [{ sku: 'NE-TECHLINE-16', quantity: 40, discountBps: trade }, { sku: 'AM-DISC-2IN', quantity: 2, discountBps: trade }],
    age: 6,
    extra: { respondedById: buyer.id, respondedAt: daysAgo(1), purchaseOrderNumber: 'DB-PO-5120', responseNote: 'Approved in the Phase 2 budget — needs sign-off.' },
  });

  // 4. An accepted quotation that became a sales order, now being picked.
  const accepted = await rfqWithQuotation({
    rfqNumber: 'TF-RFQ-2026-D00004',
    quotationNumber: 'TF-QT-2026-D00003',
    rfqStatus: RfqStatus.CLOSED,
    quotationStatus: QuotationStatus.ACCEPTED,
    project: 'Jumeirah Golf Estates — valve replacement',
    lines: [{ sku: 'RB-100-DV', quantity: 30, discountBps: trade }, { sku: 'PVC-P-32-6', quantity: 80, discountBps: trade }],
    age: 9,
    extra: { respondedById: buyer.id, respondedAt: daysAgo(3), approvedById: approver.id, approvedAt: daysAgo(3), purchaseOrderNumber: 'DB-PO-5074' },
  });
  if (accepted && !(await prisma.order.findUnique({ where: { orderNumber: 'TF-SO-2026-D00001' } }))) {
    await prisma.order.create({
      data: {
        orderNumber: 'TF-SO-2026-D00001',
        channel: OrderChannel.B2B,
        status: OrderStatus.PROCESSING,
        userId: buyer.id,
        organizationId,
        quotationId: accepted.quotation.id,
        ...money(accepted.priced.totals),
        totalAmount: fromFils(accepted.priced.totals.totalFils),
        paymentMethod: PaymentMethod.CREDIT_ACCOUNT,
        purchaseOrderNumber: 'DB-PO-5074',
        projectReference: 'Jumeirah Golf Estates — valve replacement',
        shippingAddress: formatted(site),
        deliveryAddress: snapshot(site),
        confirmedAt: daysAgo(3),
        createdAt: daysAgo(3),
        items: { create: orderItems(accepted.priced) },
        events: {
          create: [
            { toStatus: OrderStatus.CONFIRMED, actorId: approver.id, note: 'Created from quotation TF-QT-2026-D00003. Released on Net 30 days credit.', createdAt: daysAgo(3) },
            { fromStatus: OrderStatus.CONFIRMED, toStatus: OrderStatus.PROCESSING, actorId: warehouse.id, note: 'Picking started', createdAt: daysAgo(1) },
          ],
        },
      },
    });
    created++;
  }

  // 5. Retail orders: one delivered and paid, one waiting to be picked.
  if (!(await prisma.order.findUnique({ where: { orderNumber: 'TF-SO-2026-D00002' } }))) {
    const priced = await price([{ sku: 'HU-MP2000', quantity: 6 }, { sku: 'RB-RSD-BEX', quantity: 1 }], 25_00);
    await prisma.order.create({
      data: {
        orderNumber: 'TF-SO-2026-D00002',
        channel: OrderChannel.RETAIL,
        status: OrderStatus.DELIVERED,
        userId: customerId,
        ...money(priced.totals),
        totalAmount: fromFils(priced.totals.totalFils),
        paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
        paymentStatus: PaymentStatus.PAID,
        paidAt: daysAgo(8),
        trackingReference: 'ARAMEX-DEMO-4471',
        shippingAddress: formatted(home),
        deliveryAddress: snapshot(home),
        confirmedAt: daysAgo(11),
        dispatchedAt: daysAgo(9),
        deliveredAt: daysAgo(8),
        createdAt: daysAgo(11),
        items: { create: orderItems(priced) },
        events: {
          create: [
            { toStatus: OrderStatus.CONFIRMED, actorId: customerId, note: 'Order placed online — payment on delivery', createdAt: daysAgo(11) },
            { fromStatus: OrderStatus.CONFIRMED, toStatus: OrderStatus.PROCESSING, actorId: warehouse.id, createdAt: daysAgo(10) },
            { fromStatus: OrderStatus.PROCESSING, toStatus: OrderStatus.DISPATCHED, actorId: warehouse.id, note: 'Tracking reference: ARAMEX-DEMO-4471', createdAt: daysAgo(9) },
            { fromStatus: OrderStatus.DISPATCHED, toStatus: OrderStatus.DELIVERED, actorId: warehouse.id, note: 'Payment collected on delivery', createdAt: daysAgo(8) },
          ],
        },
      },
    });
    created++;
  }

  if (!(await prisma.order.findUnique({ where: { orderNumber: 'TF-SO-2026-D00003' } }))) {
    const priced = await price([{ sku: 'RB-HE-VAN-15', quantity: 10 }, { sku: 'RB-1804-SAM', quantity: 10 }], 25_00);
    await prisma.order.create({
      data: {
        orderNumber: 'TF-SO-2026-D00003',
        channel: OrderChannel.RETAIL,
        status: OrderStatus.CONFIRMED,
        userId: customerId,
        ...money(priced.totals),
        totalAmount: fromFils(priced.totals.totalFils),
        paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
        shippingAddress: formatted(home),
        deliveryAddress: snapshot(home),
        notes: 'Please call before delivery.',
        confirmedAt: daysAgo(0.2),
        createdAt: daysAgo(0.2),
        items: { create: orderItems(priced) },
        events: { create: [{ toStatus: OrderStatus.CONFIRMED, actorId: customerId, note: 'Order placed online — payment on delivery', createdAt: daysAgo(0.2) }] },
      },
    });
    created++;
  }

  return created;
}

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const { organizationId, customerId } = await seedReferenceData(passwordHash);
  const documents = process.env.SEED_DEMO_DOCUMENTS === 'false' ? 0 : await seedDemoDocuments(organizationId, customerId);

  console.log(
    `Seeded ${categories.length} categories, ${products.length} products, 8 users, 2 organizations` +
      ` and ${documents} new demo document(s). Demo password: ${process.env.SEED_DEMO_PASSWORD ? '(from SEED_DEMO_PASSWORD)' : DEMO_PASSWORD}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
