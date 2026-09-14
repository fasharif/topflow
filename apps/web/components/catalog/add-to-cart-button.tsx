'use client';

import type { ProductDto } from '@topflow/shared';
import { useState } from 'react';
import { addToCart } from '@/lib/cart';
import { Button, Input } from '../ui';

export function AddToCartButton({ product, compact = false }: { product: ProductDto; compact?: boolean }) {
  const [quantity, setQuantity] = useState(product.minOrderQty);
  const [added, setAdded] = useState(false);

  const add = () => {
    addToCart(product, quantity);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1600);
  };

  if (compact) {
    return (
      <Button size="sm" onClick={add} aria-label={`Add ${product.name} to basket`}>
        {added ? 'Added ✓' : 'Add'}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <label className="sr-only" htmlFor={`qty-${product.id}`}>
        Quantity
      </label>
      <Input
        id={`qty-${product.id}`}
        type="number"
        min={product.minOrderQty}
        step={1}
        value={quantity}
        onChange={(event) => setQuantity(Math.max(product.minOrderQty, Number(event.target.value) || product.minOrderQty))}
        className="w-24"
      />
      <Button size="lg" onClick={add}>
        {added ? 'Added to basket ✓' : 'Add to basket'}
      </Button>
    </div>
  );
}
