import { z } from 'zod';
import { OrderChannel, OrderStatus, PaymentMethod } from '../enums';
import { addressSchema } from './account';
import { idSchema, lineItemSchema, optionalText, paginationSchema } from './common';

/**
 * Retail checkout. Prices are never accepted from the client — the server re-prices
 * every line from the catalog (the prototype trusted totals computed on the device).
 */
export const checkoutSchema = z
  .object({
    items: z
      .array(lineItemSchema)
      .min(1, { error: 'Your cart is empty' })
      .max(100, { error: 'An order can contain at most 100 lines' }),
    /** A saved address from the customer's address book… */
    addressId: idSchema.optional(),
    /** …or a new one entered at checkout. */
    address: addressSchema.optional(),
    saveAddress: z.boolean().optional(),
    paymentMethod: z.enum([PaymentMethod.CASH_ON_DELIVERY, PaymentMethod.CARD]),
    notes: optionalText(1000),
  })
  .refine((data) => data.addressId !== undefined || data.address !== undefined, {
    error: 'Choose a delivery address',
    path: ['addressId'],
  });
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const orderQuerySchema = paginationSchema.extend({
  status: z.enum(OrderStatus).optional(),
  channel: z.enum(OrderChannel).optional(),
  organizationId: idSchema.optional(),
  search: optionalText(100),
});
export type OrderQuery = z.infer<typeof orderQuerySchema>;

export const updateOrderStatusSchema = z.object({
  status: z.enum(OrderStatus),
  note: optionalText(500),
  trackingReference: optionalText(100),
});
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(3, { error: 'Tell us why the order is being cancelled' }).max(500),
});
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

/** Staff records a received payment (cash on delivery collected, bank transfer cleared). */
export const recordPaymentSchema = z.object({
  paymentReference: optionalText(100),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

/** Staff records the refund of a cancelled order that had already been paid. */
export const recordRefundSchema = z.object({
  refundReference: optionalText(100),
  note: optionalText(500),
});
export type RecordRefundInput = z.infer<typeof recordRefundSchema>;
