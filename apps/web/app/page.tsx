interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unitPrice: number;
  stockStatus: "IN_STOCK" | "ON_ORDER";
  stockQuantity: number;
  imageUrl: string | null;
  category: { id: number; name: string; slug: string } | null;
}

async function getProducts(): Promise<Product[]> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/products`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error("Failed to fetch products");
  }
  return res.json();
}

export default async function Home() {
  const products = await getProducts();

  return (
    <div className="min-h-screen bg-topflow-canvas">
      <header className="bg-topflow-navy px-6 py-5 sm:px-10">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-xl font-bold tracking-tight text-white">TOP FLOW</h1>
          <p className="text-xs text-slate-300">
            Irrigation &amp; Flow-Control Supplies · UAE
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10 sm:px-10">
        <h2 className="mb-6 text-2xl font-semibold text-topflow-navy">Catalog</h2>

        {products.length === 0 ? (
          <p className="text-slate-500">No products yet — check back soon.</p>
        ) : (
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
                {product.category && (
                  <p className="mb-3 text-xs text-slate-500">{product.category.name}</p>
                )}

                <div className="flex items-end justify-between">
                  <span className="text-lg font-bold text-topflow-navy">
                    AED {Number(product.unitPrice).toFixed(2)}
                  </span>
                  <button className="rounded-md bg-topflow-teal px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90">
                    Add to Enquiry
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}