'use client';

import { createCategorySchema, updateCategorySchema, type CategoryDto } from '@topflow/shared';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, CardHeader, Field, Input, Select, Textarea } from '@/components/ui';
import { ApiError, api, errorMessage } from '@/lib/api';
import { pluralize } from '@/lib/format';
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from '@/lib/forms';
import { parseWholeNumber, slugify } from './helpers';

/**
 * Create or edit a category. Render with a `key` that changes between categories (and after a
 * create) so the form starts from fresh state.
 *
 * Categories form a two-level tree: top-level categories and the product lines inside them. Only a
 * top-level category can be a parent, and a category that has product lines stays at the top level.
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
  const categoryId = category?.id ?? null;
  const lineCount = categoryId === null ? 0 : categories.filter((item) => item.parentId === categoryId).length;
  const savedParentId = category?.parentId ?? null;
  const savedParent = savedParentId === null ? undefined : categories.find((item) => item.id === savedParentId);
  const topLevel = lineCount > 0 ? [] : categories.filter((item) => item.parentId === null && item.id !== categoryId);
  // The saved parent stays selectable even when it isn't top level (data from before the two-level rule).
  const parentOptions = savedParent && !topLevel.includes(savedParent) ? [...topLevel, savedParent] : topLevel;
  const parentHint =
    lineCount > 0
      ? `It has ${pluralize(lineCount, 'product line')}, so it ${savedParent ? 'can only move to' : 'stays at'} the top level.`
      : 'Choose a top-level category to make this one of its product lines.';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const displayOrder = parseWholeNumber(draft.displayOrder);
    const parentId = draft.parentId ? Number(draft.parentId) : null;
    const input = {
      name: draft.name,
      slug,
      description: draft.description,
      displayOrder: displayOrder ?? undefined,
      parentId: parentId ?? (editing ? null : undefined),
    };
    const parsed = editing ? updateCategorySchema.safeParse(input) : createCategorySchema.safeParse(input);
    const nextErrors: FieldErrors = parsed.success ? {} : zodFieldErrors(parsed.error);
    if (displayOrder === null) nextErrors.displayOrder = 'Enter a whole number, 0 or more';
    if (categoryId !== null && parentId === categoryId) nextErrors.parentId = 'A category cannot be its own parent';
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
      if (err instanceof ApiError && err.status === 400 && /own parent/i.test(err.message)) fieldErrors.parentId = err.message;
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
          <button
            type="button"
            onClick={() => setSlugEdited(false)}
            className="-mt-2 flex min-h-6 w-fit cursor-pointer items-center text-xs font-medium text-brand-700 underline-offset-4 hover:underline"
          >
            Use the slug suggested by the name
          </button>
        )}

        <Field label="Parent category" htmlFor="category-parent" error={errors.parentId} hint={parentHint}>
          <Select
            id="category-parent"
            value={draft.parentId}
            onChange={(e) => setDraft({ ...draft, parentId: e.target.value })}
            disabled={lineCount > 0 && !savedParent}
            aria-invalid={Boolean(errors.parentId)}
          >
            <option value="">None (top level)</option>
            {parentOptions.map((item) => (
              <option key={item.id} value={String(item.id)}>
                {item.parentId === null ? item.name : `${item.name} (current)`}
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

        <Field label="Description" optional htmlFor="category-description" error={errors.description}>
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
