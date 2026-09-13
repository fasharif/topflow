'use client';

import {
  Permission,
  ProductSort,
  StockStatus,
  UOM_LABELS,
  type CategoryDto,
  type Paginated,
  type ProductDto,
} from '@topflow/shared';
import Link from 'next/link';
import { Fragment, Suspense, useState } from 'react';
import { RequirePermission, useCan } from '@/components/admin-catalog/access';
import { ConfirmButton } from '@/components/admin-catalog/confirm-dialog';
import { categoryOptionLabel, categoryTree } from '@/components/admin-catalog/helpers';
import { LoadError, ResultSummary, SearchForm } from '@/components/admin-catalog/list-controls';
import { useQueryState } from '@/components/admin-catalog/query-state';
import { StockAdjuster } from '@/components/admin-catalog/stock-adjuster';
import { usePatchedItems } from '@/components/admin-catalog/use-patched-items';
import { STOCK_LABELS } from '@/components/catalog/labels';
import { ProductImage } from '@/components/catalog/product-card';
import { Alert, Badge, Button, Card, EmptyState, LinkButton, LoadingBlock, PageHeader, Pagination, Select, Table, Td, Th, cx } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { aed } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api';

const SORT_LABELS: Record<ProductSort, string> = {
  newest: 'Newest first',
  name: 'Name (A–Z)',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
};

const SORT_VALUES: readonly string[] = Object.values(ProductSort);
const STOCK_VALUES: readonly string[] = Object.values(StockStatus);
const COLUMNS = 9;

function ProductsList() {
  const { get, page, update } = useQueryState(['created', 'updated']);
  const search = get('search');
  const category = get('category');
  const stockStatus = STOCK_VALUES.includes(get('stockStatus')) ? get('stockStatus') : '';
  const sort = SORT_VALUES.includes(get('sort')) ? get('sort') : ProductSort.NEWEST;
  const archived = get('archived') === '1';
  const createdSku = get('created');
  const updatedSku = get('updated');

  const canAdjustStock = useCan(Permission.STOCK_WRITE);
  const canArchive = useCan(Permission.CATALOG_DELETE);

  const categories = useApiQuery<CategoryDto[]>('/catalog/categories');
  const { data, error, loading, reload } = useApiQuery<Paginated<ProductDto>>('/admin/products', {
    query: {
      page,
      search,
      category,
      stockStatus,
      sort: sort === ProductSort.NEWEST ? undefined : sort,
      includeInactive: archived ? true : undefined,
    },
  });
  const [items, patch] = usePatchedItems(data?.items);
  const [adjusting, setAdjusting] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filtered = Boolean(search || category || stockStatus);
  const clearFilters = () => update({ search: null, category: null, stockStatus: null, sort: null, archived: null });

  const onStockSaved = (product: ProductDto) => {
    patch(product);
    setAdjusting(null);
    setActionError(null);
    setNotice(`Stock for ${product.sku} is now ${product.stockQuantity} ${UOM_LABELS[product.uom]} (${STOCK_LABELS[product.stockStatus].toLowerCase()}).`);
    reload();
  };

  const archive = async (product: ProductDto) => {
    const result = await api<ProductDto>(`/admin/products/${product.id}`, { method: 'DELETE' });
    patch(result);
    setActionError(null);
    setNotice(`${result.name} is archived and hidden from the storefront. Its order and quotation history is kept.`);
    reload();
  };

  const restore = async (product: ProductDto) => {
    setRestoring(product.id);
    setNotice(null);
    setActionError(null);
    try {
      const result = await api<ProductDto>(`/admin/products/${product.id}`, { method: 'PATCH', body: { isActive: true } });
      patch(result);
      setNotice(`${result.name} is published again.`);
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setRestoring(null);
    }
  };

  let content;
  if (!data) {
    content = error ? null : <LoadingBlock label="Loading products…" />;
  } else if (items.length === 0 && data.total > 0) {
    content = (
      <EmptyState
        title="This page is empty"
        description={`There are only ${data.totalPages} page${data.totalPages === 1 ? '' : 's'} of results.`}
        action={
          <Button variant="secondary" onClick={() => update({ page: 1 })}>
            Go to the first page
          </Button>
        }
      />
    );
  } else if (items.length === 0) {
    content = filtered ? (
      <EmptyState
        title="No products match these filters"
        description={archived ? 'Try another search, category or availability.' : 'Try another search or category, or include archived products.'}
        action={
          <Button variant="secondary" onClick={clearFilters}>
            Clear filters
          </Button>
        }
      />
    ) : (
      <EmptyState
        title={archived ? 'No products yet' : 'No published products'}
        description="Add products to the catalog to sell them in the storefront and quote them to trade customers."
        action={<LinkButton href="/admin/products/new">New product</LinkButton>}
      />
    );
  } else {
    content = (
      <>
        <ResultSummary page={data.page} pageSize={data.pageSize} total={data.total} singular="product" loading={loading} />
        <div aria-busy={loading} className={loading ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
          <Table>
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th>Product</Th>
                <Th>Brand</Th>
                <Th>Category</Th>
                <Th className="text-right">Net price</Th>
                <Th className="text-right">Retail incl. VAT</Th>
                <Th className="text-right">Stock</Th>
                <Th>Availability</Th>
                <Th className="text-right">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {items.map((product) => {
                const low = product.stockQuantity <= product.lowStockThreshold;
                const expanded = adjusting === product.id;
                return (
                  <Fragment key={product.id}>
                    <tr className={cx('transition hover:bg-slate-50/70', !product.isActive && 'bg-slate-50/60')}>
                      <Td className="font-mono text-xs whitespace-nowrap text-slate-600">{product.sku}</Td>
                      <Td className="min-w-64">
                        <div className="flex items-center gap-3">
                          <div className={cx('size-10 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-white', !product.isActive && 'opacity-60')}>
                            <ProductImage product={product} />
                          </div>
                          <div className="min-w-0">
                            <Link
                              href={`/admin/products/${product.id}/edit`}
                              className={cx('font-medium hover:text-brand-700 hover:underline', product.isActive ? 'text-ink-900' : 'text-slate-500')}
                            >
                              {product.name}
                            </Link>
                            {(product.isTradeOnly || !product.isActive) && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {product.isTradeOnly && <Badge tone="brand">Trade only</Badge>}
                                {!product.isActive && <Badge>Archived</Badge>}
                              </div>
                            )}
                          </div>
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap text-slate-600">{product.brand ?? <span className="text-slate-400">—</span>}</Td>
                      <Td className="whitespace-nowrap text-slate-600">{product.category?.name ?? <span className="text-slate-400">Uncategorised</span>}</Td>
                      <Td className="text-right whitespace-nowrap tabular-nums">
                        {aed(product.unitPrice)}
                        <span className="block text-xs text-slate-400">per {UOM_LABELS[product.uom]}</span>
                      </Td>
                      <Td className="text-right whitespace-nowrap text-slate-600 tabular-nums">{aed(product.retailPrice)}</Td>
                      <Td className="text-right whitespace-nowrap tabular-nums">
                        <span className={cx('inline-block rounded-md px-1.5 py-0.5', low ? 'bg-amber-50 font-semibold text-amber-800 ring-1 ring-amber-200 ring-inset' : 'text-ink-900')}>
                          {product.stockQuantity}
                        </span>
                        <span className={cx('block text-xs', low ? 'text-amber-700' : 'text-slate-400')}>
                          {low ? 'Low · ' : ''}alert at {product.lowStockThreshold}
                        </span>
                      </Td>
                      <Td className="whitespace-nowrap">
                        <Badge tone={product.stockStatus === StockStatus.IN_STOCK ? 'success' : 'warning'}>{STOCK_LABELS[product.stockStatus]}</Badge>
                      </Td>
                      <Td className="text-right whitespace-nowrap">
                        <div className="flex justify-end gap-1">
                          <LinkButton href={`/admin/products/${product.id}/edit`} variant="ghost" size="sm">
                            Edit<span className="sr-only"> {product.name}</span>
                          </LinkButton>
                          {canAdjustStock && (
                            <Button variant="ghost" size="sm" aria-expanded={expanded} onClick={() => setAdjusting(expanded ? null : product.id)}>
                              Adjust stock<span className="sr-only"> for {product.name}</span>
                            </Button>
                          )}
                          {product.isActive
                            ? canArchive && (
                                <ConfirmButton
                                  variant="ghost"
                                  className="text-red-600! hover:bg-red-50! hover:text-red-700!"
                                  title={`Archive ${product.name}?`}
                                  description={
                                    <>
                                      <p>The product is hidden from the storefront, trade catalog and new quotations.</p>
                                      <p>Orders, quotations and RFQs that reference it are kept, and you can restore it at any time.</p>
                                    </>
                                  }
                                  confirmLabel="Archive product"
                                  onConfirm={() => archive(product)}
                                >
                                  Archive<span className="sr-only"> {product.name}</span>
                                </ConfirmButton>
                              )
                            : (
                                <Button variant="ghost" size="sm" loading={restoring === product.id} onClick={() => restore(product)}>
                                  Restore<span className="sr-only"> {product.name}</span>
                                </Button>
                              )}
                        </div>
                      </Td>
                    </tr>
                    {expanded && (
                      <tr>
                        <Td colSpan={COLUMNS} className="bg-brand-50/40">
                          <StockAdjuster product={product} onSaved={onStockSaved} onCancel={() => setAdjusting(null)} />
                        </Td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </Table>
        </div>
        <Pagination page={data.page} totalPages={data.totalPages} onPage={(next) => update({ page: next })} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Catalog"
        title="Products"
        description="Maintain the catalog, net list prices and stock levels. Retail prices include 5% VAT."
        actions={
          <>
            <LinkButton href="/admin/categories" variant="secondary">
              Categories
            </LinkButton>
            <LinkButton href="/admin/products/new">New product</LinkButton>
          </>
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <SearchForm
            id="product-search"
            label="Search products"
            placeholder="Search SKU, name, brand or description"
            value={search}
            onSearch={(value) => update({ search: value })}
            className="md:col-span-3 xl:col-span-1"
          />
          <div>
            <label htmlFor="product-category" className="sr-only">
              Category
            </label>
            <Select id="product-category" value={category} onChange={(e) => update({ category: e.target.value })}>
              <option value="">All categories</option>
              {categoryTree(categories.data ?? []).map((node) => (
                <option key={node.category.id} value={node.category.slug}>
                  {categoryOptionLabel(node)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="product-stock" className="sr-only">
              Availability
            </label>
            <Select id="product-stock" value={stockStatus} onChange={(e) => update({ stockStatus: e.target.value })}>
              <option value="">Any availability</option>
              {Object.values(StockStatus).map((value) => (
                <option key={value} value={value}>
                  {STOCK_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="product-sort" className="sr-only">
              Sort by
            </label>
            <Select id="product-sort" value={sort} onChange={(e) => update({ sort: e.target.value === ProductSort.NEWEST ? null : e.target.value })}>
              {Object.values(ProductSort).map((value) => (
                <option key={value} value={value}>
                  {SORT_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={archived} onChange={(e) => update({ archived: e.target.checked ? 1 : null })} className="size-4 accent-brand-600" />
            Show archived products
          </label>
          {(filtered || archived || sort !== ProductSort.NEWEST) && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Reset filters
            </Button>
          )}
        </div>
      </Card>

      <div className="space-y-4">
        {(createdSku || updatedSku) && (
          <Alert tone="success">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{createdSku ? `Product ${createdSku} was created.` : `Changes to ${updatedSku} were saved.`}</span>
              <Button variant="ghost" size="sm" onClick={() => update({ page })}>
                Dismiss
              </Button>
            </div>
          </Alert>
        )}
        {notice && <Alert tone="success">{notice}</Alert>}
        {actionError && <Alert tone="danger">{actionError}</Alert>}
        {error && <LoadError title="We couldn't load products" error={error} onRetry={reload} />}
        {categories.error && <Alert tone="warning">Categories couldn&apos;t be loaded, so the category filter is empty.</Alert>}
      </div>
      <div className={cx((createdSku || updatedSku || notice || actionError || error || categories.error) && 'mt-4')}>{content}</div>
    </>
  );
}

export default function AdminProductsPage() {
  return (
    <RequirePermission permission={Permission.CATALOG_WRITE} area="Catalog management">
      <Suspense fallback={<LoadingBlock label="Loading products…" />}>
        <ProductsList />
      </Suspense>
    </RequirePermission>
  );
}
