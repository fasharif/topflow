'use client';

import { UOM_LABELS, type Paginated, type ProductDto } from '@topflow/shared';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge, Card, Field, Input, Spinner } from '@/components/ui';
import { aed } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api';

const MIN_TERM = 2;

/**
 * Catalog search for adding quotation lines. Signed-in sales staff see trade-only products too;
 * archived products are listed but cannot be added (the API refuses to quote them).
 */
export function ProductPicker({
  selectedIds,
  onSelect,
  disabled,
}: {
  selectedIds: readonly string[];
  onSelect: (product: ProductDto) => void;
  disabled?: boolean;
}) {
  const [input, setInput] = useState('');
  const [term, setTerm] = useState('');

  // Debounce keystrokes; the state update happens in the timer callback, not the effect body.
  useEffect(() => {
    const timer = setTimeout(() => setTerm(input.trim()), 300);
    return () => clearTimeout(timer);
  }, [input]);

  const searching = term.length >= MIN_TERM;
  const { data, error, loading } = useApiQuery<Paginated<ProductDto>>(searching ? '/catalog/products' : null, {
    query: { search: term, pageSize: 10 },
  });
  const showResults = searching && input.trim().length >= MIN_TERM;

  const select = (product: ProductDto) => {
    onSelect(product);
    setInput('');
    setTerm('');
  };

  return (
    <div>
      <Field label="Add product" htmlFor="product-search">
        <div className="relative">
          <Input
            id="product-search"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Search by product name, SKU or brand…"
            autoComplete="off"
            disabled={disabled}
            className="pr-9"
          />
          {showResults && loading && <Spinner className="absolute top-3 right-3 size-4 text-brand-600" />}
        </div>
      </Field>

      {showResults && (
        <Card className="mt-2 overflow-hidden" aria-live="polite">
          {error ? (
            <p className="px-4 py-3 text-sm text-danger-700">{error.message}</p>
          ) : !data ? (
            <p className="px-4 py-3 text-sm text-slate-600">Searching…</p>
          ) : data.items.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-600">No products match “{term}”.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-slate-200 overflow-y-auto">
              {data.items.map((product) => {
                const added = selectedIds.includes(product.id);
                return (
                  <li key={product.id}>
                    {/* The inset focus outline stays visible inside the scrolling, clipped list. */}
                    <button
                      type="button"
                      disabled={disabled || added || !product.isActive}
                      onClick={() => select(product)}
                      className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors focus-visible:-outline-offset-2 enabled:hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-ink-900">{product.name}</span>
                        <span className="block font-mono text-xs text-slate-500">
                          {product.sku}
                          {product.brand ? ` · ${product.brand}` : ''}
                        </span>
                      </span>
                      <span className="hidden shrink-0 text-right sm:block">
                        <span className="block tabular-nums text-ink-900">
                          {aed(product.unitPrice)} <span className="text-xs text-slate-500">/ {UOM_LABELS[product.uom]}</span>
                        </span>
                        <span className="block text-xs text-slate-600">{product.stockQuantity > 0 ? `${product.stockQuantity} in stock` : 'On order'}</span>
                      </span>
                      {product.isTradeOnly && <Badge tone="brand">Trade only</Badge>}
                      {added ? (
                        <Badge tone="success">Added</Badge>
                      ) : !product.isActive ? (
                        <Badge>Archived</Badge>
                      ) : (
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-700">
                          <Plus aria-hidden="true" className="size-4" />
                          Add
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
