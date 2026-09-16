'use client';

import { UOM_LABELS, type ProductDto } from '@topflow/shared';
import { Check, FilePlus, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { addToCart, useCart } from '@/lib/cart';
import { Button, IconButton, LinkButton, cx } from '../ui';

/**
 * "Add to quote" on product cards. It adds the minimum order quantity to the basket, then turns
 * into a link to the quote request (trade members send RFQs from the basket, so theirs links there)
 * plus a button to add more. Focus moves to the link so keyboard users keep their place.
 */
export function QuoteAction({ product, trade, className }: { product: ProductDto; trade: boolean; className?: string }) {
  const { lines } = useCart();
  const line = lines.find((entry) => entry.productId === product.id);
  const [announcement, setAnnouncement] = useState('');
  const viewRef = useRef<HTMLAnchorElement>(null);
  const focusView = useRef(false);
  const unit = UOM_LABELS[product.uom];

  useEffect(() => {
    if (line && focusView.current) {
      focusView.current = false;
      viewRef.current?.focus();
    }
  }, [line]);

  const add = () => {
    const total = (line?.quantity ?? 0) + product.minOrderQty;
    focusView.current = !line;
    addToCart(product, product.minOrderQty);
    setAnnouncement(`Added ${product.name} to your ${trade ? 'basket' : 'quote'}. ${total} ${unit} in total.`);
  };

  return (
    <div className={cx('flex items-center gap-2', className)}>
      {line ? (
        <>
          <LinkButton ref={viewRef} href={trade ? '/cart' : '/quote'} variant="soft" className="min-w-0 flex-1">
            <Check aria-hidden="true" />
            <span className="truncate">
              {trade ? 'View basket' : 'View quote'} · {line.quantity} {unit}
            </span>
          </LinkButton>
          <IconButton label={`Add ${product.minOrderQty} more ${unit} of ${product.name}`} variant="secondary" onClick={add}>
            <Plus aria-hidden="true" />
          </IconButton>
        </>
      ) : (
        <Button className="w-full" onClick={add}>
          <FilePlus aria-hidden="true" />
          Add to quote
        </Button>
      )}
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
