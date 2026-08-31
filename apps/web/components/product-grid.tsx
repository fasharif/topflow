"use client";

import { useCart } from "@/lib/cart-context";

interface Product {
  id: string;
  sku: string;
  name: string;
  unitPrice: number;
  stockStatus: "IN_STOCK" | "ON_ORDER";
  category: { id: number; name: string; slug: string } | null;
}

export function ProductGrid({ products }: { products: Product[] }) {
  const { addItem } = useCart();

  if (products.length === 0) {
    return <p className="text-slate-500">No products yet — check back soon.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((product) => (
        <div
          key={product.id}
          className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-xs text-slate-400">{product.sku}</span>
            <span
              className={
                product.stockStatus === "IN_STOCK"
                  ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"
                  : "rounded-full bg-topflow-amber/10 px-2 py-0.5 text-xs font-medium text-topflow-amber"
              }
            >
              {product.stockStatus === "IN_STOCK" ? "In Stock" : "On Order"}
            </span>
          </div>

          <h3 className="mb-1 font-semibold text-topflow-navy">{product.name}</h3>
          {product.category && <p className="mb-3 text-xs text-slate-500">{product.category.name}</p>}

          <div className="flex items-end justify-between">
            <span className="text-lg font-bold text-topflow-navy">
              AED {Number(product.unitPrice).toFixed(2)}
            </span>
            <button
              onClick={() =>
                addItem({
                  productId: product.id,
                  sku: product.sku,
                  name: product.name,
                  unitPrice: Number(product.unitPrice),
                })
              }
              className="rounded-md bg-topflow-teal px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90"
            >
              Add to Enquiry
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}