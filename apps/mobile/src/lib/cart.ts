import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  calculateTotals,
  RETAIL_FREE_DELIVERY_THRESHOLD_FILS,
  retailDeliveryFeeFils,
  toFils,
  UnitOfMeasure,
  type DocumentTotals,
  type Fils,
  type ProductDto,
} from '@topflow/shared';
import { useSyncExternalStore } from 'react';

/**
 * Cart store persisted to AsyncStorage. Prices on a line are a snapshot for previewing totals
 * only — the API re-prices every line at checkout.
 */

export interface CartLine {
  productId: string;
  sku: string;
  slug: string;
  name: string;
  /** Catalogue image as returned by the API (may be site-relative); resolved when rendered. */
  imageUrl: string | null;
  uom: UnitOfMeasure;
  /** Net unit price (excl. VAT) as a decimal string. */
  unitPrice: string;
  /** VAT-inclusive unit price as a decimal string. */
  retailPrice: string;
  minOrderQty: number;
  quantity: number;
}

export interface CartState {
  readonly lines: readonly CartLine[];
  /** `false` until the saved cart has been read from storage. */
  readonly hydrated: boolean;
}

export interface CartTotals extends DocumentTotals {
  /** Net amount still needed to qualify for free delivery (0 when it already applies). */
  freeDeliveryRemainingFils: Fils;
}

const STORAGE_KEY = 'topflow.cart.v1';
/** Limits mirrored from the checkout contract. */
export const MAX_CART_LINES = 100;
export const MAX_LINE_QUANTITY = 100_000;

const UNITS: ReadonlySet<string> = new Set(Object.values(UnitOfMeasure));

let state: CartState = { lines: [], hydrated: false };
let hydration: Promise<void> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): CartState {
  return state;
}

function getLineCount(): number {
  return state.lines.length;
}

function commit(lines: readonly CartLine[]): void {
  state = { ...state, lines };
  for (const listener of listeners) listener();
  if (state.hydrated) persist(lines);
}

function persist(lines: readonly CartLine[]): void {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(lines)).catch(() => {
    // Best effort: the in-memory cart keeps working.
  });
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useCart(): CartState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Number of distinct products in the cart (used for the tab badge). */
export function useCartLineCount(): number {
  return useSyncExternalStore(subscribe, getLineCount, getLineCount);
}

/** Quantity of one product currently in the cart (0 when absent). */
export function useCartQuantity(productId: string): number {
  const read = () => state.lines.find((line) => line.productId === productId)?.quantity ?? 0;
  return useSyncExternalStore(subscribe, read, read);
}

// ─── Hydration ───────────────────────────────────────────────────────────────

/** Loads the saved cart once; lines added before it finishes take precedence. */
export function hydrateCart(): Promise<void> {
  if (!hydration) {
    hydration = AsyncStorage.getItem(STORAGE_KEY)
      .then(parseStoredLines, () => [])
      .then((stored) => {
        const merged = [...stored];
        for (const line of state.lines) {
          const index = merged.findIndex((item) => item.productId === line.productId);
          if (index >= 0) merged[index] = line;
          else merged.push(line);
        }
        state = { lines: merged.slice(0, MAX_CART_LINES), hydrated: true };
        for (const listener of listeners) listener();
        persist(state.lines);
      });
  }
  return hydration;
}

function parseStoredLines(raw: string | null): CartLine[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  return (data as unknown[]).filter(isCartLine).map((line) => ({
    productId: line.productId,
    sku: line.sku,
    slug: line.slug,
    name: line.name,
    // Carts saved before images were added have no `imageUrl`.
    imageUrl: line.imageUrl ?? null,
    uom: line.uom,
    unitPrice: line.unitPrice,
    retailPrice: line.retailPrice,
    minOrderQty: line.minOrderQty,
    quantity: clampQuantity(line.quantity, line.minOrderQty),
  }));
}

function isCartLine(value: unknown): value is CartLine {
  if (typeof value !== 'object' || value === null) return false;
  const line = value as Record<string, unknown>;
  return (
    typeof line.productId === 'string' &&
    typeof line.sku === 'string' &&
    typeof line.slug === 'string' &&
    typeof line.name === 'string' &&
    (line.imageUrl === undefined || line.imageUrl === null || typeof line.imageUrl === 'string') &&
    typeof line.uom === 'string' &&
    UNITS.has(line.uom) &&
    isMoney(line.unitPrice) &&
    isMoney(line.retailPrice) &&
    isPositiveInteger(line.minOrderQty) &&
    isPositiveInteger(line.quantity)
  );
}

function isMoney(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return toFils(value) >= 0;
  } catch {
    return false;
  }
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

// ─── Mutations ───────────────────────────────────────────────────────────────

function clampQuantity(quantity: number, minOrderQty: number): number {
  const minimum = Math.max(1, minOrderQty);
  const whole = Number.isFinite(quantity) ? Math.floor(quantity) : minimum;
  return Math.min(MAX_LINE_QUANTITY, Math.max(minimum, whole));
}

/**
 * Adds `quantity` units of a product (default: its minimum order quantity for a new line, or one
 * more for a line already in the cart) and refreshes the line's product snapshot.
 * Throws when the cart already holds the maximum number of different products.
 */
export function addToCart(product: ProductDto, quantity?: number): CartLine {
  const existing = state.lines.find((line) => line.productId === product.id);
  if (!existing && state.lines.length >= MAX_CART_LINES) {
    throw new Error(`Your cart can hold up to ${MAX_CART_LINES} different products.`);
  }
  const added = quantity ?? (existing ? 1 : product.minOrderQty);
  const line: CartLine = {
    productId: product.id,
    sku: product.sku,
    slug: product.slug,
    name: product.name,
    imageUrl: product.imageUrl,
    uom: product.uom,
    unitPrice: product.unitPrice,
    retailPrice: product.retailPrice,
    minOrderQty: Math.max(1, product.minOrderQty),
    quantity: clampQuantity((existing?.quantity ?? 0) + added, product.minOrderQty),
  };
  commit(
    existing
      ? state.lines.map((item) => (item.productId === product.id ? line : item))
      : [...state.lines, line],
  );
  return line;
}

/** Sets a line's quantity, never below its minimum order quantity. Use `removeFromCart` to delete. */
export function setQuantity(productId: string, quantity: number): void {
  const existing = state.lines.find((line) => line.productId === productId);
  if (!existing) return;
  const next = clampQuantity(quantity, existing.minOrderQty);
  if (next === existing.quantity) return;
  commit(state.lines.map((line) => (line.productId === productId ? { ...line, quantity: next } : line)));
}

export function removeFromCart(productId: string): void {
  if (!state.lines.some((line) => line.productId === productId)) return;
  commit(state.lines.filter((line) => line.productId !== productId));
}

export function clearCart(): void {
  if (state.lines.length === 0) return;
  commit([]);
}

// ─── Totals preview ──────────────────────────────────────────────────────────

/** Previews totals with the same money maths and delivery policy the API uses to invoice. */
export function cartTotals(lines: readonly CartLine[]): CartTotals {
  const inputs = lines.map((line) => ({ listPriceFils: toFils(line.unitPrice), quantity: line.quantity }));
  const netSubtotalFils = inputs.reduce((sum, line) => sum + line.listPriceFils * line.quantity, 0);
  const totals = calculateTotals(inputs, { deliveryFeeFils: retailDeliveryFeeFils(netSubtotalFils) });
  return {
    ...totals,
    freeDeliveryRemainingFils:
      totals.deliveryFeeFils > 0 ? Math.max(0, RETAIL_FREE_DELIVERY_THRESHOLD_FILS - netSubtotalFils) : 0,
  };
}
