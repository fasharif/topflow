"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

export default function AdminDashboard() {
  const { token } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/products`).then((r) => r.json()),
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders/admin/all`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json()),
    ]).then(([p, o]) => { setProducts(p); setOrders(o); }).finally(() => setLoading(false));
  }, [token]);

  const lowStock = products.filter((p) => p.stockQuantity < 10);
  const pendingOrders = orders.filter((o) => o.status === "ENQUIRY_SUBMITTED");

  if (loading) return <p className="text-slate-500">Loading…</p>;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-topflow-navy">Dashboard</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Total Products</p>
          <p className="text-3xl font-bold text-topflow-navy">{products.length}</p>
        </div>
        <div className="rounded-lg border border-topflow-amber/30 bg-topflow-amber/5 p-5">
          <p className="text-sm text-slate-500">Low Stock (&lt;10)</p>
          <p className="text-3xl font-bold text-topflow-amber">{lowStock.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Pending Enquiries</p>
          <p className="text-3xl font-bold text-topflow-navy">{pendingOrders.length}</p>
        </div>
      </div>

      {lowStock.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-topflow-navy">Low Stock Alerts</h2>
          <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {lowStock.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3 text-sm">
                <span className="font-mono text-xs text-slate-400">{p.sku}</span>
                <span className="text-topflow-navy">{p.name}</span>
                <span className="font-semibold text-topflow-amber">{p.stockQuantity} left</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 flex gap-4">
        <Link href="/admin/products/new" className="rounded-md bg-topflow-teal px-4 py-2 text-sm font-medium text-white">+ New Product</Link>
        <Link href="/admin/categories" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-topflow-navy">Manage Categories</Link>
      </div>
    </div>
  );
}