'use client';

import { createCategorySchema, updateCategorySchema, type CategoryDto } from '@topflow/shared';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, CardHeader, Field, Input, Select, Textarea } from '@/components/ui';
import { ApiError, api, errorMessage } from '@/lib/api';
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from '@/lib/forms';
import { categoryOptionLabel, categoryTree, categoryWithDescendants, parseWholeNumber, slugify } from './helpers';

/**
 * Create or edit a category. Render with a `key` that changes between categories (and after a
 * create) so the form starts from fresh state.
 */
export function CategoryForm({
  category,
  categories,
  onSaved,
  onCancel,
}: {
  category?: CategoryDto;
  categories: CategoryDto[];
  onSaved: (category: CategoryDto, created: boolean) => void;
  onCancel?: () => void;
}) {
  const editing = category !== undefined;
  const [draft, setDraft] = useState({
    name: category?.name ?? '',
    slug: category?.slug ?? '',
    description: category?.description ?? '',
    displayOrder: String(category?.displayOrder ?? 0),
    parentId: category?.parentId ? String(category.parentId) : '',
  });
  // New categories suggest a slug from the name until someone edits the slug by hand.
  const [slugEdited, setSlugEdited] = useState(editing);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const slug = slugEdited ? draft.slug : slugify(draft.name);
  const excluded = category ? categoryWithDescendants(categories, category.id) : new Set<number>();
  const parentOptions = categoryTree(categories).filter((node) => !excluded.has(node.category.id));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const displayOrder = parseWholeNumber(draft.displayOrder);
    const input = {
      name: draft.name,
      slug,
      description: draft.description,
      displayOrder: displayOrder ?? undefined,
      parentId: draft.parentId ? Number(draft.parentId) : editing ? null : undefined,
    };
    const parsed = editing ? updateCategorySchema.safeParse(input) : createCategorySchema.safeParse(input);
    const nextErrors: FieldErrors = parsed.success ? {} : zodFieldErrors(parsed.error);
    if (displayOrder === null) nextErrors.displayOrder = 'Enter a whole number, 0 or more';
    // The API treats an empty description as "unchanged", so clearing it would silently do nothing.
    if (category?.description && !draft.description.trim()) nextErrors.description = "A description can't be removed once set. Enter a replacement.";
    setErrors(nextErrors);
    if (!parsed.success || Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const saved = await api<CategoryDto>(category ? `/admin/categories/${category.id}` : '/admin/categories', {
        method: category ? 'PATCH' : 'POST',
        body: parsed.data,
      });
      onSaved(saved, !category);
    } catch (err) {
      const fieldErrors = apiFieldErrors(err);
      if (err instanceof ApiError && err.status === 409 && /slug/i.test(err.message)) fieldErrors.slug = 'Another category already uses this slug';
      setErrors(fieldErrors);
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title={category ? `Edit “${category.name}”` : 'New category'}
        description={category ? 'Changes apply to the storefront straight away.' : 'Categories organise the storefront navigation and catalog filters.'}
      />
      <form onSubmit={submit} noValidate className="space-y-4 p-5">
        <Field label="Name" htmlFor="category-name" error={errors.name}>
          <Input id="category-name" maxLength={80} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-invalid={Boolean(errors.name)} placeholder="Drip irrigation" />
        </Field>

        <Field
          label="Slug"
          htmlFor="category-slug"
          error={errors.slug}
          hint={`Storefront filter: /products?category=${slug || '…'}${editing ? '. Changing it breaks existing links.' : ''}`}
        >
          <Input
            id="category-slug"
            maxLength={120}
            value={slug}
            onChange={(e) => {
              setSlugEdited(true);
              setDraft({ ...draft, slug: e.target.value });
            }}
            aria-invalid={Boolean(errors.slug)}
            className="font-mono"
            spellCheck={false}
            autoComplete="off"
          />
        </Field>
        {!editing && slugEdited && (
          <button type="button" onClick={() => setSlugEdited(false)} className="-mt-2 text-xs font-medium text-brand-700 hover:underline">
            Use the slug suggested by the name
          </button>
        )}

        <Field label="Parent category" htmlFor="category-parent" error={errors.parentId} hint={editing ? 'A category cannot sit inside itself or one of its sub-categories.' : undefined}>
          <Select id="category-parent" value={draft.parentId} onChange={(e) => setDraft({ ...draft, parentId: e.target.value })} aria-invalid={Boolean(errors.parentId)}>
            <option value="">None (top level)</option>
            {parentOptions.map((node) => (
              <option key={node.category.id} value={String(node.category.id)}>
                {categoryOptionLabel(node)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Display order" htmlFor="category-order" error={errors.displayOrder} hint="Lower numbers are listed first.">
          <Input
            id="category-order"
            type="number"
            inputMode="numeric"
            min={0}
            max={10000}
            step={1}
            value={draft.displayOrder}
            onChange={(e) => setDraft({ ...draft, displayOrder: e.target.value })}
            aria-invalid={Boolean(errors.displayOrder)}
          />
        </Field>

        <Field label="Description (optional)" htmlFor="category-description" error={errors.description}>
          <Textarea
            id="category-description"
            maxLength={1000}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            aria-invalid={Boolean(errors.description)}
          />
        </Field>

        {error && <Alert tone="danger">{error}</Alert>}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          {onCancel && (
            <Button variant="secondary" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
          )}
          <Button type="submit" loading={saving}>
            {editing ? 'Save category' : 'Create category'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
