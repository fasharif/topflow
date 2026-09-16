import { Cylinder, Droplet, Droplets, Funnel, Gauge, Package, PlugZap, Shapes, Trees, Wrench, type LucideIcon } from 'lucide-react';
import { createElement } from 'react';
import type { MainCategorySlug } from '@/lib/company';

const CATEGORY_ICONS: Record<MainCategorySlug, LucideIcon> = {
  'electrofusion-hdpe-fittings': PlugZap,
  'sprinklers-rotors': Droplets,
  'drip-irrigation': Droplet,
  'pipes-fittings': Cylinder,
  'valves-control': Gauge,
  filtration: Funnel,
  'landscaping-hardscape': Trees,
  specialty: Shapes,
  'facilities-mep': Wrench,
};

/** Decorative icon for a top-level catalogue category (see MAIN_CATEGORIES); a box for anything else. */
export function CategoryIcon({ slug, className }: { slug: string; className?: string }) {
  const icon = (CATEGORY_ICONS as Partial<Record<string, LucideIcon>>)[slug] ?? Package;
  return createElement(icon, { 'aria-hidden': true, className });
}
