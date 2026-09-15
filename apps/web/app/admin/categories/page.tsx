'use client';

import { Permission, type CategoryDto } from '@topflow/shared';
import { useState } from 'react';
import { RequirePermission, useCan } from '@/components/admin-catalog/access';
import { CategoryForm } from '@/components/admin-catalog/category-form';
import { ConfirmButton } from '@/components/admin-catalog/confirm-dialog';
import { categoryGroups } from '@/components/admin-catalog/helpers';
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
  const groups = categoryGroups(data);
  const lineTotal = data.length - groups.length;
  const names = new Map(data.map((category) => [category.id, category.name]));
  const lineCounts = new Map<number, number>();
  for (const category of data) {
    if (category.parentId !== null) lineCounts.set(category.parentId, (lineCounts.get(category.parentId) ?? 0) + 1);
  }

  const onSaved = (category: CategoryDto, created: boolean) => {
    setNotice(created ? `Category “${category.name}” was created.` : `Changes to “${category.name}” were saved.`);
    setEditingId(null);
    if (created) setCreatedCount((count) => count + 1);
    reload();
  };

  const remove = async (category: CategoryDto) => {
    const lines = lineCounts.get(category.id) ?? 0;
    await api<void>(`/admin/categories/${category.id}`, { method: 'DELETE' });
    if (editingId === category.id) setEditingId(null);
    setNotice(
      lines > 0
        ? `Category “${category.name}” was deleted. Its product lines are now top-level categories, and products filed directly under it are uncategorised.`
        : `Category “${category.name}” was deleted. Its products are now uncategorised.`,
    );
    reload();
  };

  const renderRow = (category: CategoryDto, depth: number) => {
    const lines = lineCounts.get(category.id) ?? 0;
    const products = category.productCount ?? 0;
    const selected = editingId === category.id;
    const parentName = category.parentId === null ? undefined : names.get(category.parentId);
    return (
      <tr
        key={category.id}
        className={cx('transition', selected ? 'bg-brand-50/70' : depth === 0 ? 'bg-slate-50/60 hover:bg-slate-100/70' : 'hover:bg-slate-50/70')}
      >
        <Td className="min-w-56">
          <div className="flex items-start gap-2" style={depth > 1 ? { paddingLeft: `${(depth - 1) * 1.25}rem` } : undefined}>
            {depth > 0 && <span aria-hidden="true" className="mt-0.5 ml-1.5 h-2 w-3 shrink-0 rounded-bl-sm border-b border-l border-slate-300" />}
            <div className="min-w-0">
              <p className={cx('text-ink-900', depth === 0 ? 'font-semibold' : 'font-medium')}>
                {category.name}
                {depth > 0 && parentName && <span className="sr-only"> (product line of {parentName})</span>}
              </p>
              {(depth === 0 || category.description) && (
                <p className="mt-0.5 line-clamp-1 max-w-md text-xs text-slate-500">
                  {depth === 0 && (lines > 0 ? pluralize(lines, 'product line') : 'No product lines')}
                  {depth === 0 && category.description ? ' · ' : null}
                  {category.description}
                </p>
              )}
            </div>
          </div>
        </Td>
        <Td className="font-mono text-xs whitespace-nowrap text-slate-600">{category.slug}</Td>
        <Td className="text-right tabular-nums text-slate-600">{category.displayOrder}</Td>
        <Td className={cx('text-right tabular-nums', depth === 0 ? 'font-semibold text-ink-900' : 'text-slate-700')}>{category.productCount ?? '—'}</Td>
        <Td className="text-right whitespace-nowrap">
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" aria-pressed={selected} onClick={() => setEditingId(category.id)}>
              Edit<span className="sr-only"> {category.name}</span>
            </Button>
            {canDelete && (
              <ConfirmButton
                variant="ghost"
                className="text-red-600! hover:bg-red-50! hover:text-red-700!"
                title={`Delete “${category.name}”?`}
                description={
                  <>
                    {lines > 0 ? (
                      <p>
                        Its {pluralize(lines, 'product line')} will move to the top level with their products. Products filed directly under this
                        category stay in the catalog but become uncategorised.
                      </p>
                    ) : (
                      <p>
                        Products in this category stay in the catalog but become uncategorised
                        {products > 0 ? ` (it has ${pluralize(products, 'published product')})` : ''}.
                      </p>
                    )}
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
              {pluralize(groups.length, 'category', 'categories')} · {pluralize(lineTotal, 'product line')}
              {loading && <Spinner className="size-4 text-brand-600" />}
            </div>
            <Table>
              <thead>
                <tr>
                  <Th>Category</Th>
                  <Th>Slug</Th>
                  <Th className="text-right">Order</Th>
                  <Th className="text-right">Products</Th>
                  <Th className="text-right">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              {groups.map((group) => (
                <tbody key={group.parent.id}>
                  {renderRow(group.parent, 0)}
                  {group.lines.map((node) => renderRow(node.category, node.depth))}
                </tbody>
              ))}
            </Table>
            <p className="text-xs text-slate-500">
              Product lines are listed under their category. Product counts include published products visible to retail shoppers (trade-only and
              archived products are not counted), and a category&apos;s count includes its product lines.
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
        description="Organise products into top-level categories and the product lines within them, for storefront navigation and filters."
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
