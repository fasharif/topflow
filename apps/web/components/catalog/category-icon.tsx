import { Cylinder, Droplet, Droplets, FlaskConical, Funnel, Gauge, Package, PlugZap, Shapes, ShowerHead, Sprout, Waves, type LucideIcon } from 'lucide-react';
import { createElement } from 'react';
import type { MainCategorySlug } from '@/lib/company';

const CATEGORY_ICONS: Record<MainCategorySlug, LucideIcon> = {
  'electrofusion-hdpe-fittings': PlugZap,
  'sprinklers-rotors': Droplets,
  'drip-irrigation': Droplet,
  'pipes-fittings': Cylinder,
  'valves-control': Gauge,
  filtration: Funnel,
  'pumps-water-supply': Waves,
  fertigation: FlaskConical,
  'greenhouse-nursery': Sprout,
  'hoses-watering': ShowerHead,
  specialty: Shapes,
};

/** Decorative icon for a top-level catalogue category (see MAIN_CATEGORIES); a box for anything else. */
export function CategoryIcon({ slug, className }: { slug: string; className?: string }) {
  const icon = (CATEGORY_ICONS as Partial<Record<string, LucideIcon>>)[slug] ?? Package;
  return createElement(icon, { 'aria-hidden': true, className });
}
