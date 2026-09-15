'use client';

import { Permission } from '@topflow/shared';
import Link from 'next/link';
import { RequirePermission } from '@/components/admin-catalog/access';
import { ProductForm } from '@/components/admin-catalog/product-form';
import { PageHeader } from '@/components/ui';

export default function NewProductPage() {
  return (
    <RequirePermission permission={Permission.CATALOG_WRITE} area="Catalog management">
      <PageHeader
        eyebrow={
          <Link href="/admin/products" className="hover:underline">
            ← Products
          </Link>
        }
        title="New product"
        description="Add a product to the catalog. Prices are net of VAT; stock, visibility and specifications can be changed at any time."
      />
      <ProductForm />
    </RequirePermission>
  );
}
