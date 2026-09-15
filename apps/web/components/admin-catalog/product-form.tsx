'use client';

import {
  StockStatus,
  UOM_LABELS,
  UnitOfMeasure,
  VAT_RATE_BPS,
  bpsToPercent,
  createProductSchema,
  fromFils,
  grossFromNet,
  updateProductSchema,
  type CategoryDto,
  type ProductDto,
} from '@topflow/shared';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { STOCK_LABELS } from '@/components/catalog/labels';
import { ProductImage } from '@/components/catalog/product-card';
import { Alert, Button, Card, CardHeader, Field, Input, LinkButton, Select, Textarea } from '@/components/ui';
import { ApiError, api, errorMessage } from '@/lib/api';
import { aed } from '@/lib/format';
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from '@/lib/forms';
import { useApiQuery } from '@/lib/use-api';
import { categoryOptionLabel, categoryTree, formatPercent, humanize, parseAmount, parseWholeNumber } from './helpers';
import { CheckboxField } from './list-controls';
import { SpecificationsEditor, rowsFromSpecifications, sameSpecifications, specificationsFromRows, type SpecificationRow } from './specifications-editor';

interface Draft {
  sku: string;
  name: string;
  slug: string;
  brand: string;
  categoryId: string;
  description: string;
  unitPrice: string;
  uom: UnitOfMeasure;
  minOrderQty: string;
  stockQuantity: string;
  lowStockThreshold: string;
  stockStatus: StockStatus;
  imageUrl: string;
  isTradeOnly: boolean;
  isActive: boolean;
}

type TextField = 'sku' | 'name' | 'slug' | 'brand' | 'unitPrice' | 'minOrderQty' | 'stockQuantity' | 'lowStockThreshold' | 'imageUrl';

const VAT_LABEL = formatPercent(bpsToPercent(VAT_RATE_BPS));

function draftFrom(product?: ProductDto): Draft {
  return {
    sku: product?.sku ?? '',
    name: product?.name ?? '',
    slug: product?.slug ?? '',
    brand: product?.brand ?? '',
    categoryId: product?.category ? String(product.category.id) : '',
    description: product?.description ?? '',
    unitPrice: product?.unitPrice ?? '',
    uom: product?.uom ?? UnitOfMeasure.PIECE,
    minOrderQty: String(product?.minOrderQty ?? 1),
    stockQuantity: String(product?.stockQuantity ?? 0),
    lowStockThreshold: String(product?.lowStockThreshold ?? 10),
    stockStatus: product?.stockStatus ?? StockStatus.IN_STOCK,
    imageUrl: product?.imageUrl ?? '',
    isTradeOnly: product?.isTradeOnly ?? false,
    isActive: product?.isActive ?? true,
  };
}

function uomLabel(uom: UnitOfMeasure): string {
  const name = humanize(uom);
  return UOM_LABELS[uom] === name.toLowerCase() ? name : `${name} (${UOM_LABELS[uom]})`;
}

function previewableUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Create / edit form for a catalog product. In edit mode only changed fields are sent, so a
 * concurrent stock count is never overwritten and the audit trail lists what actually changed.
 * Render it with `key={product.id}` so it is initialised from the loaded product.
 */
export function ProductForm({ product }: { product?: ProductDto }) {
  const router = useRouter();
  const editing = product !== undefined;
  const categories = useApiQuery<CategoryDto[]>('/catalog/categories');
  const [draft, setDraft] = useState<Draft>(() => draftFrom(product));
  const [specRows, setSpecRows] = useState<SpecificationRow[]>(() => rowsFromSpecifications(product?.specifications));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const netFils = parseAmount(draft.unitPrice);
  const priceHint =
    netFils === null
      ? `Net list price per unit, excluding VAT. Shoppers see it with ${VAT_LABEL} VAT added.`
      : `Retail price incl. ${VAT_LABEL} VAT: ${aed(fromFils(grossFromNet(netFils)))}`;
  const imagePreview = previewableUrl(draft.imageUrl);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const minOrderQty = parseWholeNumber(draft.minOrderQty);
    const stockQuantity = parseWholeNumber(draft.stockQuantity);
    const lowStockThreshold = parseWholeNumber(draft.lowStockThreshold);
    const specs = specificationsFromRows(specRows);

    const common = {
      sku: draft.sku,
      name: draft.name,
      brand: draft.brand,
      description: draft.description,
      unitPrice: draft.unitPrice,
      uom: draft.uom,
      minOrderQty: minOrderQty ?? undefined,
      stockQuantity: stockQuantity ?? undefined,
      lowStockThreshold: lowStockThreshold ?? undefined,
      stockStatus: draft.stockStatus,
      isActive: draft.isActive,
      isTradeOnly: draft.isTradeOnly,
    };
    const parsed = editing
      ? updateProductSchema.safeParse({
          ...common,
          slug: draft.slug,
          categoryId: draft.categoryId ? Number(draft.categoryId) : null,
          specifications: specs.specifications,
          imageUrl: draft.imageUrl.trim() || null,
        })
      : createProductSchema.safeParse({
          ...common,
          slug: draft.slug.trim() || undefined,
          categoryId: draft.categoryId ? Number(draft.categoryId) : undefined,
          specifications: Object.keys(specs.specifications).length > 0 ? specs.specifications : undefined,
          imageUrl: draft.imageUrl.trim() || undefined,
        });

    const nextErrors: FieldErrors = { ...(parsed.success ? {} : zodFieldErrors(parsed.error)), ...specs.errors };
    if (minOrderQty === null) nextErrors.minOrderQty = 'Enter a whole number, 1 or more';
    if (stockQuantity === null) nextErrors.stockQuantity = 'Enter a whole number, 0 or more';
    if (lowStockThreshold === null) nextErrors.lowStockThreshold = 'Enter a whole number, 0 or more';
    // The API treats an empty brand or description as "unchanged", so clearing one would silently do nothing.
    if (product?.brand && !draft.brand.trim()) nextErrors.brand = "A brand can't be removed once set. Enter a replacement.";
    if (product?.description && !draft.description.trim()) nextErrors.description = "A description can't be removed once set. Enter a replacement.";
    setErrors(nextErrors);
    if (!parsed.success || Object.keys(nextErrors).length > 0) {
      setError('Please correct the highlighted fields.');
      return;
    }

    let body: Record<string, unknown> = parsed.data;
    if (product) {
      const { specifications, ...fields } = parsed.data;
      const current: Record<string, unknown> = {
        sku: product.sku,
        name: product.name,
        slug: product.slug,
        brand: product.brand,
        categoryId: product.category?.id ?? null,
        description: product.description,
        unitPrice: product.unitPrice,
        uom: product.uom,
        minOrderQty: product.minOrderQty,
        stockQuantity: product.stockQuantity,
        lowStockThreshold: product.lowStockThreshold,
        stockStatus: product.stockStatus,
        imageUrl: product.imageUrl,
        isActive: product.isActive,
        isTradeOnly: product.isTradeOnly,
      };
      body = Object.fromEntries(Object.entries(fields).filter(([key, value]) => value !== undefined && value !== current[key]));
      if (specifications && !sameSpecifications(specifications, product.specifications)) body.specifications = specifications;
      if (Object.keys(body).length === 0) {
        setNotice('There are no changes to save.');
        return;
      }
    }

    setSaving(true);
    try {
      const saved = await api<ProductDto>(product ? `/admin/products/${product.id}` : '/admin/products', {
        method: product ? 'PATCH' : 'POST',
        body,
      });
      router.push(`/admin/products?${product ? 'updated' : 'created'}=${encodeURIComponent(saved.sku)}`);
    } catch (err) {
      const fieldErrors = apiFieldErrors(err);
      if (err instanceof ApiError && err.status === 409) {
        if (/sku/i.test(err.message)) fieldErrors.sku = 'Another product already uses this SKU';
        if (/slug/i.test(err.message)) fieldErrors.slug = 'Another product already uses this slug';
      }
      setErrors(fieldErrors);
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  const text = (key: TextField, label: string, props: { hint?: string; placeholder?: string; className?: string; maxLength?: number; mono?: boolean; inputMode?: 'decimal' | 'numeric' | 'url'; type?: string } = {}) => (
    <Field label={label} htmlFor={`product-${key}`} error={errors[key]} hint={props.hint} className={props.className}>
      <Input
        id={`product-${key}`}
        type={props.type ?? 'text'}
        inputMode={props.inputMode}
        value={draft[key]}
        maxLength={props.maxLength}
        placeholder={props.placeholder}
        onChange={(e) => set(key, e.target.value)}
        aria-invalid={Boolean(errors[key])}
        className={props.mono ? 'font-mono' : undefined}
        autoComplete="off"
        spellCheck={props.mono ? false : undefined}
      />
    </Field>
  );

  return (
    <form onSubmit={submit} noValidate>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Product details" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              {text('sku', 'SKU', { maxLength: 40, mono: true, placeholder: 'RB-5004-PC', hint: 'Letters, numbers, dots, dashes or underscores. Saved in upper case.' })}
              {text('brand', 'Brand (optional)', { maxLength: 60, placeholder: 'Rain Bird' })}
              {text('name', 'Name', { maxLength: 160, className: 'sm:col-span-2', placeholder: '5004 Series rotor, 4 in pop-up' })}
              {text('slug', editing ? 'Slug' : 'Slug (optional)', {
                maxLength: 120,
                mono: true,
                className: 'sm:col-span-2',
                hint: editing
                  ? `Storefront address: /products/${draft.slug || '…'}. Changing it breaks existing links.`
                  : 'Leave blank to generate one from the name and SKU.',
              })}
              <Field label="Category" htmlFor="product-category" error={errors.categoryId} className="sm:col-span-2" hint={categories.error ? "Categories couldn't be loaded." : undefined}>
                <Select id="product-category" value={draft.categoryId} onChange={(e) => set('categoryId', e.target.value)} aria-invalid={Boolean(errors.categoryId)}>
                  <option value="">No category</option>
                  {categoryTree(categories.data ?? []).map((node) => (
                    <option key={node.category.id} value={String(node.category.id)}>
                      {categoryOptionLabel(node)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Description (optional)" htmlFor="product-description" error={errors.description} className="sm:col-span-2">
                <Textarea
                  id="product-description"
                  rows={5}
                  maxLength={5000}
                  value={draft.description}
                  onChange={(e) => set('description', e.target.value)}
                  aria-invalid={Boolean(errors.description)}
                />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Pricing & ordering" description="Trade customers receive their organization's discount on the net price." />
            <div className="grid gap-4 p-5 sm:grid-cols-3">
              {text('unitPrice', 'Unit price, net (AED)', { inputMode: 'decimal', placeholder: '125.00', hint: priceHint, className: 'sm:col-span-3' })}
              <Field label="Unit of measure" htmlFor="product-uom" error={errors.uom}>
                <Select id="product-uom" value={draft.uom} onChange={(e) => set('uom', e.target.value as UnitOfMeasure)}>
                  {Object.values(UnitOfMeasure).map((uom) => (
                    <option key={uom} value={uom}>
                      {uomLabel(uom)}
                    </option>
                  ))}
                </Select>
              </Field>
              {text('minOrderQty', 'Minimum order quantity', { type: 'number', inputMode: 'numeric' })}
            </div>
          </Card>

          <Card>
            <CardHeader title="Inventory" />
            <div className="grid gap-4 p-5 sm:grid-cols-3">
              {text('stockQuantity', 'Stock quantity', {
                type: 'number',
                inputMode: 'numeric',
                hint: editing ? 'For stock counts, prefer "Adjust stock" on the product list, which records a note.' : undefined,
              })}
              {text('lowStockThreshold', 'Low-stock alert at', { type: 'number', inputMode: 'numeric', hint: 'Highlighted when stock falls to this level.' })}
              <Field label="Availability" htmlFor="product-stockStatus" error={errors.stockStatus}>
                <Select id="product-stockStatus" value={draft.stockStatus} onChange={(e) => set('stockStatus', e.target.value as StockStatus)}>
                  {Object.values(StockStatus).map((status) => (
                    <option key={status} value={status}>
                      {STOCK_LABELS[status]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Specifications" description="Shown as a comparison table on the product page." />
            <div className="p-5">
              <SpecificationsEditor rows={specRows} onChange={setSpecRows} errors={errors} />
            </div>
          </Card>
        </div>

        <div className="space-y-6 lg:sticky lg:top-6">
          <Card>
            <CardHeader title="Visibility" />
            <div className="space-y-4 p-5">
              <CheckboxField
                id="product-isActive"
                label="Published"
                description={draft.isActive ? 'Visible in the catalog and available for orders and quotations.' : 'Archived: hidden from the storefront and new quotations.'}
                checked={draft.isActive}
                onChange={(checked) => set('isActive', checked)}
              />
              <CheckboxField
                id="product-isTradeOnly"
                label="Trade only"
                description="Only members of trade accounts (and staff) can see and quote this product."
                checked={draft.isTradeOnly}
                onChange={(checked) => set('isTradeOnly', checked)}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Image" />
            <div className="space-y-4 p-5">
              {text('imageUrl', 'Image URL (optional)', { type: 'url', inputMode: 'url', maxLength: 500, placeholder: 'https://…' })}
              <div className="aspect-[4/3] overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                <ProductImage product={{ imageUrl: imagePreview, name: draft.name ? `${draft.name} (preview)` : 'Product image preview' }} />
              </div>
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {notice && <Alert tone="info">{notice}</Alert>}
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="flex flex-wrap justify-end gap-3">
          <LinkButton href="/admin/products" variant="secondary">
            Cancel
          </LinkButton>
          <Button type="submit" loading={saving}>
            {editing ? 'Save changes' : 'Create product'}
          </Button>
        </div>
      </div>
    </form>
  );
}
