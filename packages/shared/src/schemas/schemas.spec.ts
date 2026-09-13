import { OrgRole, UnitOfMeasure } from '../enums';
import { registerBusinessSchema, loginSchema, changePasswordSchema } from './auth';
import { createProductSchema, productQuerySchema, updateProductSchema } from './catalog';
import { moneySchema, optionalText } from './common';
import { checkoutSchema } from './orders';
import { inviteMemberSchema } from './organizations';
import { createQuotationSchema, respondQuotationSchema } from './procurement';

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

  it('normalises money input to two decimals and rejects negatives', () => {
    expect(moneySchema.parse(45.5)).toBe('45.50');
    expect(moneySchema.parse('1200')).toBe('1200.00');
    expect(moneySchema.safeParse('-3').success).toBe(false);
    expect(moneySchema.safeParse('12,5').success).toBe(false);
  });

  it('treats blank optional text as absent', () => {
    expect(optionalText(10).parse('   ')).toBeUndefined();
  });

  it('applies product defaults on create but never on update', () => {
    const created = createProductSchema.parse({ sku: 'ws-533', name: 'Rotor', unitPrice: '45.5' });
    expect(created).toMatchObject({ sku: 'WS-533', uom: UnitOfMeasure.PIECE, isActive: true, unitPrice: '45.50' });
    expect(updateProductSchema.parse({ name: 'Rotor v2' })).toEqual({ name: 'Rotor v2' });
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
});
