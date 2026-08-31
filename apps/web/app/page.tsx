import { Header } from "@/components/header";
import { ProductGrid } from "@/components/product-grid";

interface Product {
  id: string;
  sku: string;
  name: string;
  unitPrice: number;
  stockStatus: "IN_STOCK" | "ON_ORDER";
  category: { id: number; name: string; slug: string } | null;
}

async function getProducts(): Promise<Product[]> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/products`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch products");
  return res.json();
}

export default async function Home() {
  const products = await getProducts();

  return (
    <div className="min-h-screen bg-topflow-canvas">
      <Header />
      <main className="mx-auto max-w-6xl px-6 py-10 sm:px-10">
        <h2 className="mb-6 text-2xl font-semibold text-topflow-navy">Catalog</h2>
        <ProductGrid products={products} />
      </main>
    </div>
  );
}