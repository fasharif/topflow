/**
 * Idempotent reference and demo data for local development, CI end-to-end tests, demos and the
 * first load of a real environment. Run with `npm run db:seed`. Refuses to run in production
 * unless SEED_FORCE=true.
 *
 * - The catalogue in prisma/data/topflow-catalogue.json is Top Flow's product range with
 *   indicative price ranges. Products that are no longer listed are unpublished, never deleted
 *   (set SEED_KEEP_UNLISTED=true to leave them untouched). Re-running refreshes content and
 *   prices but keeps live stock levels. SEED_ACCOUNTS=false refreshes only the catalogue.
 * - SEED_PROFILE=demo (the default) adds fictional staff, a retail customer, two trade customers
 *   and sample documents (SEED_DEMO_DOCUMENTS=false skips the RFQs, quotations and orders).
 *   SEED_PROFILE=production adds only the staff roles and one retail test customer, and never
 *   changes accounts that already exist.
 * - Accounts sign in with Supabase Auth. With SUPABASE_URL and SUPABASE_SECRET_KEY set, the seed
 *   creates their identities (same id as the platform account). Demo identities share
 *   SEED_DEMO_PASSWORD (the default, TopFlow2026!, is public). With SEED_CREDENTIALS_FILE — required
 *   by the production profile, and only outside the repository — every identity the run creates
 *   gets its own random password, written only to that file and never logged.
 *   SEED_RESET_PASSWORDS=true also replaces the password of identities that exist. Without Supabase
 *   credentials only the platform rows are created, which is what the CI end-to-end suite needs
 *   (it signs its own test tokens).
 * - SEED_ADMIN_EMAIL, SEED_SALES_EMAIL, SEED_WAREHOUSE_EMAIL and SEED_CUSTOMER_EMAIL override the
 *   default account addresses.
 */
import 'dotenv/config';
import { randomInt, randomUUID } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  bpsToPercent,
  calculateTotals,
  fromFils,
  toFils,
  type DocumentTotals,
} from '@topflow/shared';
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

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (process.env.NODE_ENV === 'production' && process.env.SEED_FORCE !== 'true') {
  fail('Refusing to seed in production (set SEED_FORCE=true to override).');
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) fail('DATABASE_URL is not set.');

const PROFILE = process.env.SEED_PROFILE === 'production' ? 'production' : 'demo';
const SEED_ACCOUNTS = process.env.SEED_ACCOUNTS !== 'false';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'TopFlow2026!';
const RESET_PASSWORDS = process.env.SEED_RESET_PASSWORDS === 'true';
const CREDENTIALS_FILE = process.env.SEED_CREDENTIALS_FILE ? resolve(process.env.SEED_CREDENTIALS_FILE) : null;
const REPOSITORY_ROOT = resolve(__dirname, '..', '..', '..');
const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY);

const accountEmail = (variable: string, fallback: string) => (process.env[variable]?.trim() || fallback).toLowerCase();
const ACCOUNT_EMAILS = {
  admin: accountEmail('SEED_ADMIN_EMAIL', 'admin@topflow.ae'),
  sales: accountEmail('SEED_SALES_EMAIL', 'sales@topflow.ae'),
  warehouse: accountEmail('SEED_WAREHOUSE_EMAIL', 'warehouse@topflow.ae'),
  customer: accountEmail('SEED_CUSTOMER_EMAIL', 'customer@example.com'),
};

const supabaseAdmin =
  process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      })
    : null;

if (CREDENTIALS_FILE && (CREDENTIALS_FILE === REPOSITORY_ROOT || CREDENTIALS_FILE.toLowerCase().startsWith(`${REPOSITORY_ROOT.toLowerCase()}${sep}`))) {
  fail('SEED_CREDENTIALS_FILE must be outside the repository, so passwords can never be committed.');
}
if (SEED_ACCOUNTS && PROFILE === 'production') {
  if (!supabaseAdmin) fail('SEED_PROFILE=production creates real sign-ins: set SUPABASE_URL and SUPABASE_SECRET_KEY.');
  if (!CREDENTIALS_FILE) fail('SEED_PROFILE=production needs SEED_CREDENTIALS_FILE: every account gets its own password, written only to that file.');
}
if (SEED_ACCOUNTS && supabaseAdmin && process.env.NODE_ENV === 'production' && !CREDENTIALS_FILE) {
  fail('Refusing to give production sign-ins a shared password: set SEED_CREDENTIALS_FILE.');
}

const prisma = createPrismaClient({ connectionString });

interface CatalogueCategory {
  slug: string;
  name: string;
  description: string;
  imageUrl: string | null;
  displayOrder: number;
}

interface CatalogueFile {
  source: string;
  categories: Array<CatalogueCategory & { lines: CatalogueCategory[] }>;
  products: Array<{
    sku: string;
    name: string;
    category: string;
    line: string;
    brand: string;
    description: string;
    specifications: Record<string, string>;
    priceMin: string | null;
    priceMax: string | null;
    uom: UnitOfMeasure;
    stockStatus: StockStatus;
    stockQuantity: number;
    tags: string[];
    imageUrl: string | null;
  }>;
}

const catalogue = JSON.parse(readFileSync(join(__dirname, 'data', 'topflow-catalogue.json'), 'utf8')) as CatalogueFile;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// ─── Accounts ───────────────────────────────────────────────────────────────

/** Letters and digits without look-alikes (no I, l, O, 0, 1). */
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
let issuedPasswords = 0;
let seededAccounts = 0;

/** 24 characters from a 56-symbol alphabet (about 139 bits), always mixing upper case, lower case and digits. */
function generatePassword(): string {
  for (;;) {
    const password = Array.from({ length: 24 }, () => PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]).join('');
    if (/[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password)) return password;
  }
}

/**
 * The password for an identity that is being created or reset. With SEED_CREDENTIALS_FILE it is
 * unique and appended to that file (owner-only permissions) before Supabase is called, so a failure
 * later in the run can never leave an account whose password nobody knows.
 */
function issuePassword(email: string, role: Role): string {
  if (!CREDENTIALS_FILE) return DEMO_PASSWORD;
  const password = generatePassword();
  if (issuedPasswords === 0) {
    appendFileSync(
      CREDENTIALS_FILE,
      `# TopFlow Hub sign-ins issued ${new Date().toISOString()}. Keep private: move them to a password manager, then delete this file.\n`,
      { mode: 0o600 },
    );
  }
  appendFileSync(CREDENTIALS_FILE, `${email}\t${role}\t${password}\n`, { mode: 0o600 });
  issuedPasswords++;
  return password;
}

let identityIdsByEmail: Map<string, string> | null = null;

/** Supabase identities by email. Seeded environments are small, so one page of users is enough. */
async function findIdentityId(email: string): Promise<string | undefined> {
  if (!supabaseAdmin) return undefined;
  if (!identityIdsByEmail) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw error;
    identityIdsByEmail = new Map(data.users.flatMap((user) => (user.email ? [[user.email.toLowerCase(), user.id]] : [])));
  }
  return identityIdsByEmail.get(email);
}

/**
 * Makes sure an account can sign in with Supabase Auth and returns the identity id, which the
 * platform account shares. Without Supabase credentials it only settles the platform id.
 */
async function ensureIdentity(existingId: string | undefined, email: string, fullName: string, role: Role, phoneNumber?: string): Promise<string> {
  if (!supabaseAdmin) return existingId ?? randomUUID();

  const knownId = existingId ?? (await findIdentityId(email));
  if (knownId) {
    const { data } = await supabaseAdmin.auth.admin.getUserById(knownId);
    if (data.user) {
      if (RESET_PASSWORDS) {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(knownId, { password: issuePassword(email, role), email_confirm: true });
        if (error) throw error;
      }
      return knownId;
    }
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    ...(knownId && { id: knownId }),
    email,
    password: issuePassword(email, role),
    email_confirm: true,
    user_metadata: { full_name: fullName, ...(phoneNumber && { phone_number: phoneNumber }) },
  });
  if (error || !data.user) throw error ?? new Error(`Could not create the Supabase identity for ${email}`);
  return data.user.id;
}

async function upsertUser(email: string, fullName: string, role: Role, phoneNumber?: string) {
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  const id = await ensureIdentity(existing?.id, email, fullName, role, phoneNumber);
  seededAccounts++;
  if (existing) {
    // Real environments keep whatever their administrators changed (names, roles, suspensions).
    return PROFILE === 'production'
      ? prisma.user.findUniqueOrThrow({ where: { id: existing.id } })
      : prisma.user.update({ where: { id: existing.id }, data: { fullName, role, isActive: true } });
  }
  return prisma.user.create({ data: { id, email, fullName, role, phoneNumber, emailVerifiedAt: new Date() } });
}

// ─── Catalogue ──────────────────────────────────────────────────────────────

/** Matches on slug or name, so categories created by earlier data sets are updated, not duplicated. */
async function upsertCategory(data: CatalogueCategory & { parentId: number | null }) {
  const existing = await prisma.category.findFirst({ where: { OR: [{ slug: data.slug }, { name: data.name }] } });
  return existing ? prisma.category.update({ where: { id: existing.id }, data }) : prisma.category.create({ data });
}

async function seedCatalogue() {
  const categoryIds = new Map<string, number>();
  for (const category of catalogue.categories) {
    const { lines, ...parent } = category;
    const saved = await upsertCategory({ ...parent, parentId: null });
    categoryIds.set(parent.slug, saved.id);
    for (const line of lines) {
      categoryIds.set(line.slug, (await upsertCategory({ ...line, parentId: saved.id })).id);
    }
  }

  for (const product of catalogue.products) {
    const content = {
      name: product.name,
      slug: slugify(`${product.name}-${product.sku}`),
      brand: product.brand,
      categoryId: categoryIds.get(product.line) ?? categoryIds.get(product.category) ?? null,
      description: product.description,
      specifications: product.specifications,
      // Online orders are priced at the top of the indicative range; quotations can go lower.
      unitPrice: product.priceMax ?? '0.00',
      priceMin: product.priceMin,
      priceMax: product.priceMax,
      uom: product.uom,
      imageUrl: product.imageUrl,
      tags: product.tags,
      // Without a price an item can only be quoted, so it is kept out of the retail storefront.
      isTradeOnly: product.priceMax === null,
      isActive: true,
    };
    await prisma.product.upsert({
      where: { sku: product.sku },
      update: content,
      create: {
        sku: product.sku,
        ...content,
        minOrderQty: 1,
        lowStockThreshold: 5,
        stockQuantity: product.stockQuantity,
        stockStatus: product.stockStatus,
      },
    });
  }

  const retired =
    process.env.SEED_KEEP_UNLISTED === 'true'
      ? 0
      : (
          await prisma.product.updateMany({
            where: { isActive: true, sku: { notIn: catalogue.products.map((p) => p.sku) } },
            data: { isActive: false },
          })
        ).count;
  return { categories: categoryIds.size, products: catalogue.products.length, retired };
}

/**
 * A real environment starts with one administrator and one retail test customer — no fictional
 * people or companies. Sales and warehouse staff are invited from the back office.
 */
async function seedProductionAccounts() {
  await upsertUser(ACCOUNT_EMAILS.admin, 'Top Flow Administrator', Role.ADMIN);
  await upsertUser(ACCOUNT_EMAILS.customer, 'Test Customer', Role.CUSTOMER);
}

async function seedDemoAccounts() {
  await upsertUser(ACCOUNT_EMAILS.admin, 'Aisha Rahman', Role.ADMIN, '+971 4 555 0100');
  await upsertUser(ACCOUNT_EMAILS.sales, 'Omar Haddad', Role.SALES, '+971 4 555 0101');
  await upsertUser(ACCOUNT_EMAILS.warehouse, 'Ravi Menon', Role.WAREHOUSE, '+971 4 555 0102');

  const customer = await upsertUser(ACCOUNT_EMAILS.customer, 'Sara Ahmed', Role.CUSTOMER, '+971 50 123 4567');
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
    const user = await upsertUser(email, fullName, Role.CUSTOMER, '+971 55 700 1000');
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
  const pendingOwner = await upsertUser('owner@alwaha.ae', 'Hamad Al Suwaidi', Role.CUSTOMER, '+971 50 900 4411');
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
    ['buyer@desertbloom.ae', 'approver@desertbloom.ae', ACCOUNT_EMAILS.sales, ACCOUNT_EMAILS.warehouse].map(byEmail),
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
    const lines = [{ sku: 'WS-1702', quantity: 120 }, { sku: 'WS-VB910-G', quantity: 40 }];
    const priced = await price(lines, 0);
    const rfq = await prisma.quoteRequest.create({ data: { ...rfqBase('TF-RFQ-2026-D00001', RfqStatus.SUBMITTED, 'Emirates Hills villa cluster — tree bubbler retrofit', lines, 1), notes: 'One bubbler per tree; valve boxes for each new zone.' } });
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
    lines: [{ sku: 'AX-RB-SJ-01', quantity: 30, discountBps: trade }, { sku: 'WSI-F025-Y', quantity: 2, discountBps: trade }],
    age: 4,
  });

  // 3. A quotation the buyer accepted above their limit — waiting for the approver.
  await rfqWithQuotation({
    rfqNumber: 'TF-RFQ-2026-D00003',
    quotationNumber: 'TF-QT-2026-D00002',
    rfqStatus: RfqStatus.QUOTED,
    quotationStatus: QuotationStatus.PENDING_APPROVAL,
    project: 'Dubai Hills Estate — Parkway HDPE mains',
    lines: [{ sku: 'AX-EFS-005', quantity: 80, discountBps: trade }, { sku: 'WSI-F050-Y', quantity: 4, discountBps: trade }],
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
    lines: [{ sku: 'WS-ISCV-101G', quantity: 12, discountBps: trade }, { sku: 'WS-VB1419-G', quantity: 12, discountBps: trade }],
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
    const priced = await price([{ sku: 'WS-DDRIP-14', quantity: 6 }, { sku: 'AX-RB-D-03', quantity: 10 }], 25_00);
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
    const priced = await price([{ sku: 'WS-1600', quantity: 10 }, { sku: 'WSI-F020-Y', quantity: 1 }], 25_00);
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

function describeAccounts(): string {
  if (!SEED_ACCOUNTS) return 'no accounts (SEED_ACCOUNTS=false)';
  const count = `${seededAccounts} account(s)`;
  if (!supabaseAdmin) return `${count} as platform rows only (set SUPABASE_URL and SUPABASE_SECRET_KEY to create sign-in identities)`;
  if (CREDENTIALS_FILE) return `${count} with Supabase sign-in; ${issuedPasswords} new password(s) written to ${CREDENTIALS_FILE}`;
  const password = process.env.SEED_DEMO_PASSWORD ? '(from SEED_DEMO_PASSWORD)' : DEMO_PASSWORD;
  return `${count} with Supabase sign-in${RESET_PASSWORDS ? ' (passwords reset)' : ''}; demo password: ${password}`;
}

async function main() {
  const catalog = await seedCatalogue();
  let organizations = 0;
  let documents = 0;
  if (SEED_ACCOUNTS && PROFILE === 'production') {
    await seedProductionAccounts();
  } else if (SEED_ACCOUNTS) {
    const { organizationId, customerId } = await seedDemoAccounts();
    organizations = 2;
    documents = process.env.SEED_DEMO_DOCUMENTS === 'false' ? 0 : await seedDemoDocuments(organizationId, customerId);
  }

  console.log(
    `Seeded (${PROFILE} profile) ${catalog.categories} categories and ${catalog.products} products (${catalog.retired} unlisted product(s) unpublished), ` +
      `${describeAccounts()}, ${organizations} demo organization(s) and ${documents} new demo document(s).`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
