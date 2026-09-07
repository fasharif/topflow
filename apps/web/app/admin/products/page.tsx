"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

export default function AdminProductsPage() {
  const { token, user } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/products`).then((r) => r.json()).then(setProducts).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/products/${id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    load();
  };

  if (loading) return <p className="text-slate-500">Loading…</p>;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-topflow-navy">Products</h1>
        <Link href="/admin/products/new" className="rounded-md bg-topflow-teal px-4 py-2 text-sm font-medium text-white">+ New Product</Link>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="p-3">SKU</th><th className="p-3">Name</th><th className="p-3">Category</th><th className="p-3">Price</th><th className="p-3">Stock</th><th className="p-3"></th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.map((p) => (
              <tr key={p.id}>
                <td className="p-3 font-mono text-xs text-slate-400">{p.sku}</td>
                <td className="p-3 font-medium text-topflow-navy">{p.name}</td>
                <td className="p-3 text-slate-500">{p.category?.name ?? "—"}</td>
                <td className="p-3">AED {Number(p.unitPrice).toFixed(2)}</td>
                <td className="p-3"><span className={p.stockQuantity < 10 ? "font-semibold text-topflow-amber" : ""}>{p.stockQuantity}</span></td>
                <td className="p-3 text-right">
                  <Link href={`/admin/products/${p.id}/edit`} className="mr-3 text-topflow-teal">Edit</Link>
                  {user?.role === "ADMIN" && <button onClick={() => handleDelete(p.id)} className="text-red-500">Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}