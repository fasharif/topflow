import { toFils, type CategoryDto } from '@topflow/shared';

/** "12.50" → "12.5%". Display only: the API returns 2dp decimal strings. */
export function formatPercent(rate: string): string {
  const text = rate.includes('.') ? rate.replace(/\.?0+$/, '') : rate;
  return `${text}%`;
}

/** "FACILITY_MANAGEMENT" → "Facility management". */
export function humanize(value: string): string {
  const text = value.toLowerCase().replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** URL-safe slug suggestion: "Pop-up Sprinklers" → "pop-up-sprinklers". */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/, '');
}

/** Fils for a typed amount, or null when it is not a valid, non-negative amount. */
export function parseAmount(value: string): number | null {
  try {
    const fils = toFils(value);
    return fils >= 0 ? fils : null;
  } catch {
    return null;
  }
}

/** A whole number typed into an input, or null when blank or not a whole number. */
export function parseWholeNumber(value: string): number | null {
  const text = value.trim();
  return /^\d{1,10}$/.test(text) ? Number(text) : null;
}

export interface CategoryNode {
  category: CategoryDto;
  depth: number;
}

/** Categories in tree order (each parent followed by its children), keeping the API's sort within siblings. */
export function categoryTree(categories: CategoryDto[]): CategoryNode[] {
  const known = new Set(categories.map((category) => category.id));
  const children = new Map<number | null, CategoryDto[]>();
  for (const category of categories) {
    const parentId = category.parentId !== null && known.has(category.parentId) ? category.parentId : null;
    children.set(parentId, [...(children.get(parentId) ?? []), category]);
  }

  const nodes: CategoryNode[] = [];
  const visited = new Set<number>();
  const visit = (category: CategoryDto, depth: number) => {
    if (visited.has(category.id)) return;
    visited.add(category.id);
    nodes.push({ category, depth });
    for (const child of children.get(category.id) ?? []) visit(child, depth + 1);
  };
  for (const root of children.get(null) ?? []) visit(root, 0);
  // Defensive: categories caught in a parent cycle are unreachable from a root, but must still be listed.
  for (const category of categories) visit(category, 0);
  return nodes;
}

/** Indented label for <option> elements (which ignore CSS padding). */
export function categoryOptionLabel({ category, depth }: CategoryNode): string {
  return `${'— '.repeat(depth)}${category.name}`;
}

/** A category plus all of its descendants: none of them may become its parent. */
export function categoryWithDescendants(categories: CategoryDto[], id: number): Set<number> {
  const ids = new Set([id]);
  let added = true;
  while (added) {
    added = false;
    for (const category of categories) {
      if (category.parentId !== null && ids.has(category.parentId) && !ids.has(category.id)) {
        ids.add(category.id);
        added = true;
      }
    }
  }
  return ids;
}
