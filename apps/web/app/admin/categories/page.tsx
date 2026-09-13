'use client';

import { Permission, type CategoryDto } from '@topflow/shared';
import { useState } from 'react';
import { RequirePermission, useCan } from '@/components/admin-catalog/access';
import { CategoryForm } from '@/components/admin-catalog/category-form';
import { ConfirmButton } from '@/components/admin-catalog/confirm-dialog';
import { categoryTree } from '@/components/admin-catalog/helpers';
import { LoadError } from '@/components/admin-catalog/list-controls';
import { Alert, Button, EmptyState, LinkButton, LoadingBlock, PageHeader, Spinner, Table, Td, Th, cx } from '@/components/ui';
import { api } from '@/lib/api';
import { pluralize } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api';

function CategoriesManager() {
  const { data, error, loading, reload } = useApiQuery<CategoryDto[]>('/catalog/categories');
  const canDelete = useCan(Permission.CATALOG_DELETE);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [createdCount, setCreatedCount] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  if (!data) {
    if (error) return <LoadError title="We couldn't load categories" error={error} onRetry={reload} />;
    return <LoadingBlock label="Loading categories…" />;
  }

  const editing = editingId === null ? undefined : data.find((category) => category.id === editingId);
  const parentNames = new Map(data.map((category) => [category.id, category.name]));
  const subcategoryCount = (id: number) => data.filter((category) => category.parentId === id).length;

  const onSaved = (category: CategoryDto, created: boolean) => {
    setNotice(created ? `Category “${category.name}” was created.` : `Changes to “${category.name}” were saved.`);
    setEditingId(null);
    if (created) setCreatedCount((count) => count + 1);
    reload();
  };

  const remove = async (category: CategoryDto) => {
    await api<void>(`/admin/categories/${category.id}`, { method: 'DELETE' });
    if (editingId === category.id) setEditingId(null);
    setNotice(`Category “${category.name}” was deleted. Its products are now uncategorised.`);
    reload();
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-4">
        {notice && <Alert tone="success">{notice}</Alert>}
        {error && <LoadError title="We couldn't refresh categories" error={error} onRetry={reload} />}

        {data.length === 0 ? (
          <EmptyState title="No categories yet" description="Create the first category with the form. Products can then be assigned to it." />
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm text-slate-500" aria-live="polite">
              {pluralize(data.length, 'category', 'categories')}
              {loading && <Spinner className="size-4 text-brand-600" />}
            </div>
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Slug</Th>
                  <Th>Parent</Th>
                  <Th className="text-right">Order</Th>
                  <Th className="text-right">Products</Th>
                  <Th className="text-right">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {categoryTree(data).map(({ category, depth }) => {
                  const subcategories = subcategoryCount(category.id);
                  const products = category.productCount ?? 0;
                  return (
                    <tr key={category.id} className={cx('transition', editingId === category.id ? 'bg-brand-50/70' : 'hover:bg-slate-50/70')}>
                      <Td className="min-w-52">
                        <div style={{ paddingLeft: `${depth * 1.25}rem` }}>
                          <span className="inline-flex items-center gap-2 font-medium text-ink-900">
                            {depth > 0 && (
                              <span aria-hidden="true" className="text-slate-300">
                                └
                              </span>
                            )}
                            {category.name}
                          </span>
                          {category.description && <p className="mt-0.5 line-clamp-1 max-w-sm text-xs text-slate-500">{category.description}</p>}
                        </div>
                      </Td>
                      <Td className="font-mono text-xs whitespace-nowrap text-slate-600">{category.slug}</Td>
                      <Td className="whitespace-nowrap text-slate-600">
                        {category.parentId === null ? <span className="text-slate-400">Top level</span> : (parentNames.get(category.parentId) ?? '—')}
                      </Td>
                      <Td className="text-right tabular-nums">{category.displayOrder}</Td>
                      <Td className="text-right tabular-nums">{category.productCount ?? '—'}</Td>
                      <Td className="text-right whitespace-nowrap">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" aria-pressed={editingId === category.id} onClick={() => setEditingId(category.id)}>
                            Edit<span className="sr-only"> {category.name}</span>
                          </Button>
                          {canDelete && (
                            <ConfirmButton
                              variant="ghost"
                              className="text-red-600! hover:bg-red-50! hover:text-red-700!"
                              title={`Delete “${category.name}”?`}
                              description={
                                <>
                                  <p>
                                    Products in this category stay in the catalog but become uncategorised
                                    {products > 0 ? ` (it has ${pluralize(products, 'published product')})` : ''}.
                                  </p>
                                  {subcategories > 0 && <p>Its {pluralize(subcategories, 'sub-category', 'sub-categories')} will move to the top level.</p>}
                                  <p>This can&apos;t be undone.</p>
                                </>
                              }
                              confirmLabel="Delete category"
                              onConfirm={() => remove(category)}
                            >
                              Delete<span className="sr-only"> {category.name}</span>
                            </ConfirmButton>
                          )}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <p className="text-xs text-slate-500">
              Product counts include published products visible to retail shoppers; trade-only and archived products are not counted.
              {!canDelete && ' Only administrators can delete categories.'}
            </p>
          </>
        )}
      </div>

      <div className="lg:sticky lg:top-6">
        <CategoryForm
          key={editing ? `edit-${editing.id}` : `new-${createdCount}`}
          category={editing}
          categories={data}
          onSaved={onSaved}
          onCancel={editing ? () => setEditingId(null) : undefined}
        />
      </div>
    </div>
  );
}

export default function AdminCategoriesPage() {
  return (
    <RequirePermission permission={Permission.CATALOG_WRITE} area="Catalog management">
      <PageHeader
        eyebrow="Catalog"
        title="Categories"
        description="Organise products into categories and sub-categories for storefront navigation and filters."
        actions={
          <LinkButton href="/admin/products" variant="secondary">
            Products
          </LinkButton>
        }
      />
      <CategoriesManager />
    </RequirePermission>
  );
}
