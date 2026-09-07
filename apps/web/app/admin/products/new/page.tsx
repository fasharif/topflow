"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function NewProductPage() {
  const { token } = useAuth();
  const router = useRouter();
  const [categories, setCategories] = useState<any[]>([]);
  const [form, setForm] = useState({ sku: "", name: "", categoryId: "", description: "", unitPrice: "", stockStatus: "IN_STOCK", stockQuantity: "0" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/categories`).then((r) => r.json()).then(setCategories);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          sku: form.sku, name: form.name,
          categoryId: form.categoryId ? Number(form.categoryId) : undefined,
          description: form.description || undefined,
          unitPrice: Number(form.unitPrice), stockStatus: form.stockStatus,
          stockQuantity: Number(form.stockQuantity),
        }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.message || "Failed to create product"); }
      router.push("/admin/products");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally { setSaving(false); }
  };

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-bold text-topflow-navy">New Product</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div><label className="mb-1 block text-sm font-medium text-slate-700">SKU</label>
          <input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" /></div>
        <div><label className="mb-1 block text-sm font-medium text-slate-700">Name</label>
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" /></div>
        <div><label className="mb-1 block text-sm font-medium text-slate-700">Category</label>
          <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="w-full rounded border border-slate-300 px-3 py-2 text-sm">
            <option value="">— None —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></div>
        <div><label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" rows={3} /></div>
        <div className="flex gap-3">
          <div className="flex-1"><label className="mb-1 block text-sm font-medium text-slate-700">Unit Price (AED)</label>
            <input required type="number" step="0.01" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" /></div>
          <div className="flex-1"><label className="mb-1 block text-sm font-medium text-slate-700">Stock Qty</label>
            <input required type="number" value={form.stockQuantity} onChange={(e) => setForm({ ...form, stockQuantity: e.target.value })} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" /></div>
        </div>
        <div><label className="mb-1 block text-sm font-medium text-slate-700">Stock Status</label>
          <select value={form.stockStatus} onChange={(e) => setForm({ ...form, stockStatus: e.target.value })} className="w-full rounded border border-slate-300 px-3 py-2 text-sm">
            <option value="IN_STOCK">In Stock</option><option value="ON_ORDER">On Order</option>
          </select></div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button type="submit" disabled={saving} className="w-full rounded-md bg-topflow-teal px-4 py-2.5 font-medium text-white disabled:opacity-50">{saving ? "Saving…" : "Create Product"}</button>
      </form>
    </div>
  );
}