import AsyncStorage from '@react-native-async-storage/async-storage';
import { toFils, UnitOfMeasure, type ProductDto } from '@topflow/shared';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { api } from './api';
import { withCataloguePrices, type CartLine } from './cart-pricing';

export { cartTotals, checkoutRequest, type CartLine, type CartTotals } from './cart-pricing';

/**
 * Cart store persisted to AsyncStorage. Prices on a line are a snapshot of the catalogue, which the
 * cart screen refreshes when it opens (useCartPriceRefresh), so the total shown is the one charged.
 * The API prices every order again, and checkout sends the total it showed, so an order whose total
 * changed in between is refused rather than charged (BUG-02 in docs/testing/BUGS-FOUND.md).
 */

export interface CartState {
  readonly lines: readonly CartLine[];
  /** `false` until the saved cart has been read from storage. */
  readonly hydrated: boolean;
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

// ─── Catalogue prices ────────────────────────────────────────────────────────

/**
 * Replaces the names and prices cached in the cart with the catalogue's current ones, so a price
 * changed since the product was added is what the customer sees before ordering. Lines whose
 * product cannot be loaded are kept, and their ids are returned so the screen can say that those
 * prices could not be checked.
 */
export async function refreshCartPrices(
  loadProduct: (productId: string) => Promise<ProductDto>,
): Promise<{ unchecked: string[] }> {
  const ids = [...new Set(state.lines.map((line) => line.productId))];
  const loaded = await Promise.all(ids.map((id) => loadProduct(id).catch(() => null)));
  const products = new Map(ids.map((id, index) => [id, loaded[index] ?? null] as const));
  // Applied to the cart as it is now; a line added while loading is checked on the next refresh.
  const result = withCataloguePrices(
    state.lines.filter((line) => products.has(line.productId)),
    products,
  );
  if (result.changed) {
    const updated = new Map(result.lines.map((line) => [line.productId, line] as const));
    commit(state.lines.map((line) => updated.get(line.productId) ?? line));
  }
  return { unchecked: result.unchecked };
}

/** Loads a product from the catalogue (by id) for refreshCartPrices. */
export function loadCatalogueProduct(productId: string): Promise<ProductDto> {
  return api<ProductDto>(`/catalog/products/${encodeURIComponent(productId)}`);
}

/** Whether the cart's prices have been checked against the catalogue on this screen. */
export type PriceCheck = 'checking' | 'current' | 'unverified';

/**
 * Refreshes the cart from the catalogue once it has been read, and whenever its products change.
 * Returns `unverified` when a product could not be loaded, so the screen can say that its price may
 * be out of date instead of silently showing the cached one.
 */
export function useCartPriceRefresh(): PriceCheck {
  const { lines, hydrated } = useCart();
  const productIds = lines.map((line) => line.productId).join(',');
  const [checked, setChecked] = useState<{ productIds: string; unverified: boolean } | null>(null);
  useEffect(() => {
    if (!hydrated || productIds === '') return;
    let current = true;
    void refreshCartPrices(loadCatalogueProduct).then(({ unchecked }) => {
      if (current) setChecked({ productIds, unverified: unchecked.length > 0 });
    });
    return () => {
      current = false;
    };
  }, [hydrated, productIds]);
  if (checked?.productIds !== productIds) return 'checking';
  return checked.unverified ? 'unverified' : 'current';
}
