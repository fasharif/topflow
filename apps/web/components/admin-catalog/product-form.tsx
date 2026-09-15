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
import { aed, aedRange } from '@/lib/format';
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from '@/lib/forms';
import { useApiQuery } from '@/lib/use-api';
import { categoryOptionLabel, categoryTree, formatPercent, humanize, parseAmount, parseTags, parseWholeNumber, sameTags } from './helpers';
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
  priceMin: string;
  priceMax: string;
  uom: UnitOfMeasure;
  minOrderQty: string;
  stockQuantity: string;
  lowStockThreshold: string;
  stockStatus: StockStatus;
  imageUrl: string;
  /** Comma-separated; saved as a trimmed, lower-case, de-duplicated list. */
  tags: string;
  isTradeOnly: boolean;
  isActive: boolean;
}

type TextField = 'sku' | 'name' | 'slug' | 'brand' | 'unitPrice' | 'priceMin' | 'priceMax' | 'minOrderQty' | 'stockQuantity' | 'lowStockThreshold' | 'imageUrl';

const VAT_LABEL = formatPercent(bpsToPercent(VAT_RATE_BPS));
const TAG_MIN_LENGTH = 2;
const TAG_MAX_LENGTH = 40;
const MAX_TAGS = 20;
const RANGE_HINT_ID = 'product-priceRange-hint';
/** A path served by this app, e.g. /catalog/products/y-type-disc-filter.webp (the rule the API applies). */
const SITE_PATH = /^\/(?!\/)[\w.~/-]+$/;

function draftFrom(product?: ProductDto): Draft {
  return {
    sku: product?.sku ?? '',
    name: product?.name ?? '',
    slug: product?.slug ?? '',
    brand: product?.brand ?? '',
    categoryId: product?.category ? String(product.category.id) : '',
    description: product?.description ?? '',
    unitPrice: product?.unitPrice ?? '',
    priceMin: product?.priceRange?.min ?? '',
    priceMax: product?.priceRange?.max ?? '',
    uom: product?.uom ?? UnitOfMeasure.PIECE,
    minOrderQty: String(product?.minOrderQty ?? 1),
    stockQuantity: String(product?.stockQuantity ?? 0),
    lowStockThreshold: String(product?.lowStockThreshold ?? 10),
    stockStatus: product?.stockStatus ?? StockStatus.IN_STOCK,
    imageUrl: product?.imageUrl ?? '',
    tags: (product?.tags ?? []).join(', '),
    isTradeOnly: product?.isTradeOnly ?? false,
    isActive: product?.isActive ?? true,
  };
}

function uomLabel(uom: UnitOfMeasure): string {
  const name = humanize(uom);
  return UOM_LABELS[uom] === name.toLowerCase() ? name : `${name} (${UOM_LABELS[uom]})`;
}

/** The image address to preview: an http(s) URL, or a site path (loaded from this app). */
function previewableImage(value: string): string | null {
  const text = value.trim();
  if (SITE_PATH.test(text)) return text;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/** Errors for a single tag ("tags.3") are shown on the tags field as a whole. */
function withTagErrors(errors: FieldErrors): FieldErrors {
  const tagKey = Object.keys(errors).find((key) => key.startsWith('tags.'));
  return tagKey && !errors.tags ? { ...errors, tags: errors[tagKey] } : errors;
}

/** Live preview of the image field, which says so when nothing can be loaded from the address. */
function ImagePreview({ src, alt }: { src: string | null; alt: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = src !== null && src === failedSrc;
  return (
    <div>
      <div className="aspect-[4/3] overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        {src && !failed ? (
          // A plain <img>, as on the storefront: admin-supplied addresses can point to any host.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} onError={() => setFailedSrc(src)} className="size-full object-contain p-5" />
        ) : (
          <ProductImage product={{ imageUrl: null, name: alt }} />
        )}
      </div>
      {failed && (
        <p className="mt-2 text-xs text-amber-700" role="status">
          No image could be loaded from this address. Check the URL or path.
        </p>
      )}
    </div>
  );
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

  const minFils = parseAmount(draft.priceMin);
  const maxFils = parseAmount(draft.priceMax);
  const range = minFils !== null && maxFils !== null && minFils <= maxFils ? { min: minFils, max: maxFils } : null;
  const inverted = minFils !== null && maxFils !== null && minFils > maxFils;
  const rangeHint = [
    range
      ? `Incl. ${VAT_LABEL} VAT: ${aedRange(fromFils(grossFromNet(range.min)), fromFils(grossFromNet(range.max)))}.`
      : inverted
        ? 'The lowest price is above the highest.'
        : 'Optional: enter both prices, or leave both blank.',
    'The online list price is usually the top of the range.',
    range && netFils !== null && (netFils < range.min || netFils > range.max) ? `It is currently ${aed(fromFils(netFils))}, outside this range.` : null,
  ]
    .filter(Boolean)
    .join(' ');
  const imagePreview = previewableImage(draft.imageUrl);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const minOrderQty = parseWholeNumber(draft.minOrderQty);
    const stockQuantity = parseWholeNumber(draft.stockQuantity);
    const lowStockThreshold = parseWholeNumber(draft.lowStockThreshold);
    const specs = specificationsFromRows(specRows);
    const tagList = parseTags(draft.tags);
    const lowest = draft.priceMin.trim();
    const highest = draft.priceMax.trim();
    // A blank end of the range is left out when creating, and cleared (null) when editing.
    const noPrice = editing ? null : undefined;

    const common = {
      sku: draft.sku,
      name: draft.name,
      brand: draft.brand,
      description: draft.description,
      unitPrice: draft.unitPrice,
      priceMin: lowest || noPrice,
      priceMax: highest || noPrice,
      uom: draft.uom,
      minOrderQty: minOrderQty ?? undefined,
      stockQuantity: stockQuantity ?? undefined,
      lowStockThreshold: lowStockThreshold ?? undefined,
      stockStatus: draft.stockStatus,
      tags: tagList,
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
    // A range is shown as "from – to", so it needs both ends or neither.
    if (lowest && !highest) nextErrors.priceMax ??= 'Enter the highest price too, or clear the lowest';
    if (highest && !lowest) nextErrors.priceMin ??= 'Enter the lowest price too, or clear the highest';
    // Repeated here because the schema skips its range check while another amount (e.g. the list price) is invalid.
    const lowestFils = parseAmount(lowest);
    const highestFils = parseAmount(highest);
    if (lowestFils !== null && highestFils !== null && lowestFils > highestFils) nextErrors.priceMax ??= 'The upper price must be at least the lower price';
    const badTag = tagList.find((tag) => tag.length < TAG_MIN_LENGTH || tag.length > TAG_MAX_LENGTH);
    if (badTag) nextErrors.tags = `Each tag needs ${TAG_MIN_LENGTH}–${TAG_MAX_LENGTH} characters (check “${badTag}”)`;
    else if (tagList.length > MAX_TAGS) nextErrors.tags = `Use at most ${MAX_TAGS} tags (there are ${tagList.length})`;
    // The API treats an empty brand or description as "unchanged", so clearing one would silently do nothing.
    if (product?.brand && !draft.brand.trim()) nextErrors.brand = "A brand can't be removed once set. Enter a replacement.";
    if (product?.description && !draft.description.trim()) nextErrors.description = "A description can't be removed once set. Enter a replacement.";
    const shownErrors = withTagErrors(nextErrors);
    setErrors(shownErrors);
    if (!parsed.success || Object.keys(shownErrors).length > 0) {
      setError('Please correct the highlighted fields.');
      return;
    }

    let body: Record<string, unknown> = parsed.data;
    if (product) {
      const { specifications, tags, priceMin, priceMax, ...fields } = parsed.data;
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
      if (tags && !sameTags(tags, product.tags ?? [])) body.tags = tags;
      // Both ends are sent together, so the API never checks a new end against a stale one.
      const priceRange = { priceMin: priceMin ?? null, priceMax: priceMax ?? null };
      if (priceRange.priceMin !== (product.priceRange?.min ?? null) || priceRange.priceMax !== (product.priceRange?.max ?? null)) {
        Object.assign(body, priceRange);
      }
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
      if (err instanceof ApiError && err.status === 400 && /upper price/i.test(err.message)) fieldErrors.priceMax ??= err.message;
      setErrors(withTagErrors(fieldErrors));
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  const text = (
    key: TextField,
    label: string,
    props: {
      hint?: string;
      placeholder?: string;
      className?: string;
      maxLength?: number;
      mono?: boolean;
      inputMode?: 'decimal' | 'numeric' | 'url';
      type?: string;
      describedBy?: string;
    } = {},
  ) => (
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
        aria-describedby={props.describedBy}
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
              <Field
                label="Tags (optional)"
                htmlFor="product-tags"
                error={errors.tags}
                hint={`Comma-separated keywords, e.g. drip, pressure compensating. Saved in lower case without duplicates, up to ${MAX_TAGS}.`}
                className="sm:col-span-2"
              >
                <Input
                  id="product-tags"
                  value={draft.tags}
                  placeholder="drip, pressure compensating"
                  onChange={(e) => set('tags', e.target.value)}
                  onBlur={() => setDraft((current) => ({ ...current, tags: parseTags(current.tags).join(', ') }))}
                  aria-invalid={Boolean(errors.tags)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Pricing & ordering" description="Trade customers receive their organization's discount on the net price." />
            <div className="grid gap-4 p-5 sm:grid-cols-3">
              {text('unitPrice', 'Online list price, net (AED)', { inputMode: 'decimal', placeholder: '125.00', hint: priceHint, className: 'sm:col-span-3' })}
              <fieldset className="min-w-0 rounded-xl bg-slate-50 p-4 sm:col-span-3">
                <legend className="float-left mb-3 w-full text-sm font-semibold text-ink-900">Indicative price range (AED, excl. VAT)</legend>
                <div className="clear-left grid gap-3 sm:grid-cols-2">
                  {text('priceMin', 'Lowest', { inputMode: 'decimal', placeholder: '0.00', describedBy: RANGE_HINT_ID })}
                  {text('priceMax', 'Highest', { inputMode: 'decimal', placeholder: '0.00', describedBy: RANGE_HINT_ID })}
                </div>
                <p id={RANGE_HINT_ID} className="mt-2 text-xs text-slate-500">
                  {rangeHint}
                </p>
              </fieldset>
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
              {text('imageUrl', 'Image URL or site path (optional)', {
                inputMode: 'url',
                maxLength: 500,
                placeholder: 'https://… or /catalog/products/…',
                hint: 'An https:// address, or a path on this site such as /catalog/products/y-type-disc-filter.webp.',
              })}
              <ImagePreview src={imagePreview} alt={draft.name ? `${draft.name} (preview)` : 'Product image preview'} />
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
