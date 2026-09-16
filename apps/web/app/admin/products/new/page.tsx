'use client';

import { Permission } from '@topflow/shared';
import { RequirePermission } from '@/components/admin-catalog/access';
import { ProductForm } from '@/components/admin-catalog/product-form';
import { BackLink, PageHeader } from '@/components/ui';

export default function NewProductPage() {
  return (
    <RequirePermission permission={Permission.CATALOG_WRITE} area="Catalog management">
      <BackLink href="/admin/products">Products</BackLink>
      <PageHeader
        title="New product"
        description="Add a product to the catalogue. Prices are net of VAT; stock, visibility and specifications can be changed at any time."
      />
      <ProductForm />
    </RequirePermission>
  );
}
