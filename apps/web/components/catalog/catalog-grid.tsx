'use client';

import type { Paginated, ProductDto } from '@topflow/shared';
import { SearchX } from 'lucide-react';
import { useApiQuery } from '@/lib/use-api';
import { useSession } from '@/lib/session';
import { Alert, EmptyState, LinkButton } from '../ui';
import { ProductCard } from './product-card';

/**
 * Renders the server-fetched (public, cached) catalog immediately, then — for members of a
 * verified trade account — re-fetches the same page with the organization header to reveal
 * negotiated prices and trade-only products.
 */
export function CatalogGrid({ initial, query }: { initial: Paginated<ProductDto>; query: Record<string, string> }) {
  const { activeMembership } = useSession();
  const trade = useApiQuery<Paginated<ProductDto>>(activeMembership ? '/catalog/products' : null, { query, org: true });
  const data = activeMembership && trade.data ? trade.data : initial;
  const tradeMode = Boolean(activeMembership && trade.data);

  return (
    <div>
      <h2 className="sr-only">Products</h2>
      {activeMembership && (
        <Alert tone={activeMembership.organizationStatus === 'ACTIVE' ? 'info' : 'warning'} className="mb-4">
          {activeMembership.organizationStatus === 'ACTIVE'
            ? `Showing trade prices for ${activeMembership.organizationName} (excl. VAT).`
            : `${activeMembership.organizationName} is pending verification — list prices shown until Top Flow approves your trade account.`}
        </Alert>
      )}
      {data.items.length === 0 ? (
        <EmptyState
          icon={<SearchX aria-hidden="true" />}
          title="No products match your filters"
          description="Try a different search term or clear the filters. You can also describe what you need in a quote request."
          action={
            <>
              <LinkButton href="/products" variant="secondary">
                Clear filters
              </LinkButton>
              <LinkButton href="/quote">Request a quote</LinkButton>
            </>
          }
        />
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {data.items.map((product) => (
            <li key={product.id}>
              <ProductCard product={product} trade={tradeMode} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
