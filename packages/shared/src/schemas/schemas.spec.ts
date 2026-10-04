import { z } from 'zod';
import { OrgRole, UnitOfMeasure } from '../enums';
import {
  changePasswordSchema,
  loginSchema,
  newPasswordSchema,
  registerBusinessSchema,
  signUpMetadataSchema,
} from './auth';
import { createProductSchema, productQuerySchema, updateProductSchema } from './catalog';
import { emailSchema, moneySchema, optionalText } from './common';
import { dispatchEventEnvelopeSchema, dispatchEventSchema, isKnownDispatchEventType } from './integrations';
import { checkoutSchema } from './orders';
import { acceptInvitationSchema, inviteMemberSchema } from './organizations';
import {
  createQuotationSchema,
  createWebsiteQuoteRequestSchema,
  respondQuotationSchema,
} from './procurement';

const PRODUCT_ID = '3f0c8a52-7f7e-4d9a-9a52-0c2b5d3f1a11';

describe('request schemas', () => {
  it('normalises emails and enforces password strength', () => {
    expect(loginSchema.parse({ email: '  Jane@TopFlow.ae ', password: 'x' }).email).toBe('jane@topflow.ae');
    const weak = registerBusinessSchema.safeParse({
      email: 'jane@topflow.ae',
      password: 'password',
      fullName: 'Jane Doe',
      organization: { name: 'Oasis', type: 'CONTRACTOR', tradeLicenseNumber: 'DED-1234' },
    });
    expect(weak.success).toBe(false);
  });

  it('validates UAE TRNs on business registration', () => {
    const result = registerBusinessSchema.safeParse({
      email: 'jane@topflow.ae',
      password: 'Irrigate2026',
      fullName: 'Jane Doe',
      organization: { name: 'Oasis', type: 'CONTRACTOR', tradeLicenseNumber: 'DED-1234', trn: '12345' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects reusing the current password', () => {
    const result = changePasswordSchema.safeParse({ currentPassword: 'Irrigate2026', newPassword: 'Irrigate2026' });
    expect(result.success).toBe(false);
  });

  it('requires the new password to be typed twice identically', () => {
    expect(newPasswordSchema.safeParse({ password: 'Irrigate2026', confirmPassword: 'Irrigate2027' }).success).toBe(
      false,
    );
    expect(newPasswordSchema.safeParse({ password: 'Irrigate2026', confirmPassword: 'Irrigate2026' }).success).toBe(
      true,
    );
  });

  it('reads the profile stored as Supabase user metadata at sign-up', () => {
    const metadata = signUpMetadataSchema.parse({
      full_name: 'Jane Doe',
      organization: { name: 'Oasis Landscaping', type: 'LANDSCAPING', tradeLicenseNumber: 'DED-1234' },
    });
    expect(metadata).toMatchObject({ full_name: 'Jane Doe', organization: { name: 'Oasis Landscaping' } });
  });

  it('only needs the token to accept an invitation', () => {
    expect(acceptInvitationSchema.parse({ token: 'x'.repeat(43), password: 'ignored' })).toEqual({
      token: 'x'.repeat(43),
    });
  });

  it('normalises money input to two decimals and rejects negatives', () => {
    expect(moneySchema.parse(45.5)).toBe('45.50');
    expect(moneySchema.parse('1200')).toBe('1200.00');
    expect(moneySchema.safeParse('-3').success).toBe(false);
    expect(moneySchema.safeParse('12,5').success).toBe(false);
  });

  it('publishes money as a non-negative number or a digits string, not as an array (BUG-16)', () => {
    const schema = z.toJSONSchema(z.object({ amount: moneySchema }), { io: 'input', target: 'openapi-3.0' }) as {
      properties: Record<string, unknown>;
    };
    expect(schema.properties.amount).toEqual({
      anyOf: [
        { type: 'number', minimum: 0 },
        { type: 'string', pattern: expect.any(String) },
      ],
    });
    expect(moneySchema.safeParse('abc').error?.issues[0]?.message).toBe('Enter a valid amount, e.g. 125.50');
    expect(moneySchema.safeParse(-3).error?.issues[0]?.message).toBe('Amount cannot be negative');
    expect(moneySchema.parse(' 12.5 ')).toBe('12.50');
  });

  it('publishes email addresses with the email format and still trims them', () => {
    const schema = z.toJSONSchema(z.object({ email: emailSchema }), { io: 'input', target: 'openapi-3.0' }) as {
      properties: Record<string, unknown>;
    };
    expect(schema.properties.email).toMatchObject({ type: 'string', format: 'email' });
    expect(emailSchema.parse('  Jane@TopFlow.example ')).toBe('jane@topflow.example');
  });

  it('treats blank optional text as absent', () => {
    expect(optionalText(10).parse('   ')).toBeUndefined();
  });

  it('applies product defaults on create but never on update', () => {
    const created = createProductSchema.parse({ sku: 'ws-533', name: 'Rotor', unitPrice: '45.5' });
    expect(created).toMatchObject({ sku: 'WS-533', uom: UnitOfMeasure.PIECE, isActive: true, unitPrice: '45.50' });
    expect(updateProductSchema.parse({ name: 'Rotor v2' })).toEqual({ name: 'Rotor v2' });
  });

  it('accepts category ids from 1 and no category at all', () => {
    expect(updateProductSchema.safeParse({ categoryId: 0 }).success).toBe(false);
    expect(updateProductSchema.parse({ categoryId: 1 })).toEqual({ categoryId: 1 });
    expect(updateProductSchema.parse({ categoryId: null })).toEqual({ categoryId: null });
  });

  it('reads the includeInactive flag and ignores an empty value (BUG-07)', () => {
    expect(productQuerySchema.parse({ includeInactive: '' }).includeInactive).toBeUndefined();
    expect(productQuerySchema.parse({}).includeInactive).toBeUndefined();
    expect(productQuerySchema.parse({ includeInactive: '1' }).includeInactive).toBe(true);
    expect(productQuerySchema.parse({ includeInactive: 'false' }).includeInactive).toBe(false);
    expect(productQuerySchema.parse({ includeInactive: '0' }).includeInactive).toBe(false);
    expect(productQuerySchema.safeParse({ includeInactive: 'maybe' }).success).toBe(false);
  });

  it('publishes the values the includeInactive flag accepts', () => {
    const schema = z.toJSONSchema(productQuerySchema, { io: 'input' }) as { properties: Record<string, { type?: string; enum?: string[] }> };
    const flag = schema.properties.includeInactive ?? {};
    expect(flag.type).toBe('string');
    expect([...(flag.enum ?? [])].sort()).toEqual(['', '0', '1', 'false', 'true']);
  });

  it('coerces catalog query strings', () => {
    expect(productQuerySchema.parse({ page: '2', includeInactive: 'true' })).toMatchObject({
      page: 2,
      pageSize: 20,
      sort: 'newest',
      includeInactive: true,
    });
  });

  it('requires a delivery address at checkout and never accepts client prices', () => {
    const base = { items: [{ productId: PRODUCT_ID, quantity: 2, unitPrice: 1 }], paymentMethod: 'CASH_ON_DELIVERY' };
    expect(checkoutSchema.safeParse(base).success).toBe(false);
    const parsed = checkoutSchema.parse({ ...base, addressId: PRODUCT_ID });
    expect(parsed.items[0]).toEqual({ productId: PRODUCT_ID, quantity: 2 });
  });

  it('accepts a website project enquiry without products only when it is described', () => {
    const visitor = { name: 'Jane Doe', email: 'jane@oasis.ae', phone: '+971 50 123 4567' };
    expect(createWebsiteQuoteRequestSchema.safeParse({ ...visitor, notes: 'Too short' }).success).toBe(false);
    const enquiry = createWebsiteQuoteRequestSchema.parse({
      ...visitor,
      notes: 'Drip irrigation for a 2,000 m² villa garden in Al Barsha',
      preferredContact: 'WHATSAPP',
      requiredBy: '2026-10-01',
    });
    expect(enquiry).toMatchObject({ items: [], preferredContact: 'WHATSAPP', requiredBy: '2026-10-01' });
    const basket = createWebsiteQuoteRequestSchema.parse({
      ...visitor,
      items: [{ productId: PRODUCT_ID, quantity: 12, notes: 'Hunter or equivalent' }],
    });
    expect(basket.items[0]).toEqual({ productId: PRODUCT_ID, quantity: 12, notes: 'Hunter or equivalent' });
  });

  it('links quotations to an RFQ or a customer', () => {
    const items = [{ productId: PRODUCT_ID, quantity: 5, discountRate: '7.5' }];
    expect(createQuotationSchema.safeParse({ items }).success).toBe(false);
    expect(createQuotationSchema.parse({ items, customerId: PRODUCT_ID })).toMatchObject({
      validityDays: 14,
      items: [{ discountRate: 7.5 }],
    });
  });

  it('requires a reason when rejecting a quotation', () => {
    expect(respondQuotationSchema.safeParse({ action: 'REJECT' }).success).toBe(false);
    expect(respondQuotationSchema.parse({ action: 'ACCEPT', purchaseOrderNumber: 'PO-77' })).toEqual({
      action: 'ACCEPT',
      purchaseOrderNumber: 'PO-77',
    });
  });

  it('defaults invited members to BUYER', () => {
    expect(inviteMemberSchema.parse({ email: 'buyer@oasis.ae' }).role).toBe(OrgRole.BUYER);
  });

  it('accepts a signed-off delivery.completed event from dispatch and rejects unknown event types', () => {
    const event = {
      id: '7b0e8f2e-8d0a-4c55-9d6f-2f1d3c4b5a61',
      type: 'delivery.completed',
      createdAt: '2026-09-20T10:00:00.000Z',
      data: {
        deliveryId: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
        orderReference: 'TF-SO-2026-000123',
        status: 'delivered',
        occurredAt: '2026-09-20T09:59:30.000+04:00',
        driver: { id: PRODUCT_ID, name: 'Omar Haddad' },
        proof: {
          recipientName: 'Aisha Rahman',
          capturedAt: '2026-09-20T09:59:00.000Z',
          withinGeofence: true,
          distanceMeters: 12.4,
          hasPhoto: true,
          hasSignature: true,
        },
      },
    };
    expect(dispatchEventSchema.parse(event).data.proof?.withinGeofence).toBe(true);
    expect(dispatchEventSchema.safeParse({ ...event, type: 'delivery.teleported' }).success).toBe(false);
    expect(dispatchEventSchema.safeParse({ ...event, id: 'not-a-uuid' }).success).toBe(false);
  });

  it('reads the envelope of an event type it does not know, so it can be recorded', () => {
    const future = {
      id: '7b0e8f2e-8d0a-4c55-9d6f-2f1d3c4b5a62',
      type: 'delivery.rescheduled',
      createdAt: '2026-09-20T10:00:00.000Z',
      data: {
        deliveryId: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
        orderReference: 'TF-SO-2026-000123',
        occurredAt: '2026-09-20T10:00:00.000Z',
        newWindow: { from: '2026-09-21T08:00:00.000Z' },
      },
    };
    expect(isKnownDispatchEventType(future.type)).toBe(false);
    expect(isKnownDispatchEventType('delivery.completed')).toBe(true);
    const envelope = dispatchEventEnvelopeSchema.parse(future);
    expect(envelope.data.newWindow).toEqual({ from: '2026-09-21T08:00:00.000Z' });
    expect(dispatchEventEnvelopeSchema.safeParse({ ...future, data: { orderReference: 'x' } }).success).toBe(false);
  });
});
