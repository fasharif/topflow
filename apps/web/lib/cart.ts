'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ProductDto, UnitOfMeasure } from '@topflow/shared';
import { api } from './api';

/**
 * Guest-friendly cart persisted in localStorage — the web equivalent of the prototype's
 * SharedPreferences cart, so shoppers can build a cart before signing in. Only product ids
 * and quantities matter to the server; the cached names/prices are for display. The basket and
 * checkout pages refresh them from the catalogue (useCartPriceRefresh), so the totals shown are
 * the ones the order will be charged. The server prices every order again, and checkout sends the
 * total it showed, so an order whose total changed in between is refused rather than charged.
 */
export interface CartLine {
  productId: string;
  sku: string;
  slug: string;
  name: string;
  uom: UnitOfMeasure;
  unitPrice: string;
  retailPrice: string;
  minOrderQty: number;
  isTradeOnly: boolean;
  quantity: number;
  /** Absent on lines saved before images were added. */
  imageUrl?: string | null;
}

const STORAGE_KEY = 'topflow.cart.v2';
const EMPTY: CartLine[] = [];

let lines: CartLine[] = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

function readStorage(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? (parsed as CartLine[]).filter((line) => typeof line?.productId === 'string' && Number.isInteger(line.quantity) && line.quantity > 0)
      : EMPTY;
  } catch {
    return EMPTY;
  }
}

function commit(next: CartLine[]): void {
  lines = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or unavailable — the cart still works for this tab.
  }
  listeners.forEach((listener) => listener());
}

function onStorage(event: StorageEvent): void {
  if (event.key === STORAGE_KEY) {
    lines = readStorage();
    listeners.forEach((listener) => listener());
  }
}

const cartStore = {
  subscribe(listener: () => void): () => void {
    if (!hydrated) {
      hydrated = true;
      lines = readStorage();
      window.addEventListener('storage', onStorage);
      queueMicrotask(() => listeners.forEach((l) => l()));
    }
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: (): CartLine[] => lines,
  getServerSnapshot: (): CartLine[] => EMPTY,
};

export function addToCart(product: ProductDto, quantity: number = product.minOrderQty): void {
  const existing = lines.find((line) => line.productId === product.id);
  if (existing) {
    commit(lines.map((line) => (line.productId === product.id ? { ...line, quantity: line.quantity + quantity } : line)));
    return;
  }
  commit([
    ...lines,
    {
      productId: product.id,
      sku: product.sku,
      slug: product.slug,
      name: product.name,
      uom: product.uom,
      unitPrice: product.unitPrice,
      retailPrice: product.retailPrice,
      minOrderQty: product.minOrderQty,
      isTradeOnly: product.isTradeOnly,
      quantity: Math.max(quantity, product.minOrderQty),
      imageUrl: product.imageUrl,
    },
  ]);
}

export function setQuantity(productId: string, quantity: number): void {
  if (!Number.isFinite(quantity) || quantity < 1) {
    removeFromCart(productId);
    return;
  }
  commit(lines.map((line) => (line.productId === productId ? { ...line, quantity: Math.floor(quantity) } : line)));
}

export function removeFromCart(productId: string): void {
  commit(lines.filter((line) => line.productId !== productId));
}

export function clearCart(): void {
  commit(EMPTY);
}

/** The catalogue fields a basket line caches, as the catalogue shows them now. */
function catalogueFields(product: ProductDto): Omit<CartLine, 'productId' | 'quantity'> {
  return {
    sku: product.sku,
    slug: product.slug,
    name: product.name,
    uom: product.uom,
    unitPrice: product.unitPrice,
    retailPrice: product.retailPrice,
    minOrderQty: product.minOrderQty,
    isTradeOnly: product.isTradeOnly,
    imageUrl: product.imageUrl,
  };
}

/** The basket as it is now (outside React; components use useCart). */
export function cartLines(): CartLine[] {
  return lines;
}

/**
 * Replaces the names and prices cached in the basket with the catalogue's current ones: a price
 * changed in the back office, or edited in the browser's storage, must not be what the shopper
 * sees before ordering. Lines whose product cannot be loaded are kept for checkout to report, and
 * their ids are returned, so the page can say that those prices could not be checked.
 */
export async function refreshCartPrices(loadProduct: (productId: string) => Promise<ProductDto>): Promise<{ unchecked: string[] }> {
  const ids = [...new Set(lines.map((line) => line.productId))];
  const loaded = await Promise.all(ids.map((id) => loadProduct(id).catch(() => null)));
  const current = new Map(loaded.flatMap((product) => (product ? [[product.id, catalogueFields(product)] as const] : [])));
  const unchecked = ids.filter((id) => !current.has(id));
  let changed = false;
  const next = lines.map((line) => {
    const fields = current.get(line.productId);
    if (!fields) return line;
    const updated = { ...line, ...fields };
    if (JSON.stringify(updated) !== JSON.stringify(line)) changed = true;
    return updated;
  });
  if (changed) commit(next);
  return { unchecked };
}

/** Loads a product from the catalogue for refreshCartPrices. */
export function loadCatalogueProduct(productId: string): Promise<ProductDto> {
  return api<ProductDto>(`/catalog/products/${encodeURIComponent(productId)}`);
}

/** Whether the basket's prices have been checked against the catalogue on this page. */
export type PriceCheck = 'checking' | 'current' | 'unverified';

/**
 * Refreshes the basket from the catalogue once it has been read, and whenever its products change.
 * Returns `unverified` when a product could not be loaded, so the page can say that its price may
 * be out of date instead of silently showing the cached one.
 */
export function useCartPriceRefresh(): PriceCheck {
  const hydrated = useCartHydrated();
  const productIds = useCart()
    .lines.map((line) => line.productId)
    .join(',');
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

export function useCart(): { lines: CartLine[]; itemCount: number } {
  const current = useSyncExternalStore(cartStore.subscribe, cartStore.getSnapshot, cartStore.getServerSnapshot);
  return { lines: current, itemCount: current.reduce((sum, line) => sum + line.quantity, 0) };
}

/** False until the basket has been read from localStorage (on the server and during hydration it is always empty). */
export function useCartHydrated(): boolean {
  return useSyncExternalStore(cartStore.subscribe, () => hydrated, () => false);
}
