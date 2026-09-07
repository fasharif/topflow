"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";

export default function AdminCategoriesPage() {
  const { token } = useAuth();
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", slug: "", description: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/categories`).then((r) => r.json()).then(setCategories).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.message || "Failed to create category"); }
      setForm({ name: "", slug: "", description: "" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this category?")) return;
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/categories/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    load();
  };

  if (loading) return <p className="text-slate-500">Loading…</p>;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-topflow-navy">Categories</h1>
      <div className="mb-8 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-3">Name</th><th className="p-3">Slug</th><th className="p-3"></th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {categories.map((c) => (
              <tr key={c.id}>
                <td className="p-3 font-medium text-topflow-navy">{c.name}</td>
                <td className="p-3 font-mono text-xs text-slate-400">{c.slug}</td>
                <td className="p-3 text-right"><button onClick={() => handleDelete(c.id)} className="text-red-500">Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="max-w-md rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-3 font-semibold text-topflow-navy">Add Category</h2>
        <form onSubmit={handleCreate} className="space-y-3">
          <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
          <input required placeholder="Slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
          <input placeholder="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={saving} className="rounded-md bg-topflow-teal px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? "Adding…" : "Add Category"}</button>
        </form>
      </div>
    </div>
  );
}