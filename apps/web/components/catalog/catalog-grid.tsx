'use client';

import type { Paginated, ProductDto } from '@topflow/shared';
import { useApiQuery } from '@/lib/use-api';
import { useSession } from '@/lib/session';
import { Alert, EmptyState } from '../ui';
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
      {activeMembership && (
        <div className="mb-4">
          <Alert tone={activeMembership.organizationStatus === 'ACTIVE' ? 'info' : 'warning'}>
            {activeMembership.organizationStatus === 'ACTIVE'
              ? `Showing trade prices for ${activeMembership.organizationName} (excl. VAT).`
              : `${activeMembership.organizationName} is pending verification — list prices shown until Top Flow approves your trade account.`}
          </Alert>
        </div>
      )}
      {data.items.length === 0 ? (
        <EmptyState title="No products match your filters" description="Try a different search term or clear the filters." />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.items.map((product) => (
            <ProductCard key={product.id} product={product} trade={tradeMode} />
          ))}
        </div>
      )}
    </div>
  );
}
