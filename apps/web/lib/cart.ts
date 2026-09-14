'use client';

import { useSyncExternalStore } from 'react';
import type { ProductDto, UnitOfMeasure } from '@topflow/shared';

/**
 * Guest-friendly cart persisted in localStorage — the web equivalent of the prototype's
 * SharedPreferences cart, so shoppers can build a cart before signing in. Only product ids
 * and quantities matter to the server; the cached names/prices are for display and are
 * re-validated at checkout.
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

export function useCart(): { lines: CartLine[]; itemCount: number } {
  const current = useSyncExternalStore(cartStore.subscribe, cartStore.getSnapshot, cartStore.getServerSnapshot);
  return { lines: current, itemCount: current.reduce((sum, line) => sum + line.quantity, 0) };
}
