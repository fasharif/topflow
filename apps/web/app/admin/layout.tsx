"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, isLoaded } = useAuth();
  const router = useRouter();
  const allowed = user && (user.role === "ADMIN" || user.role === "WAREHOUSE");

  useEffect(() => {
    if (isLoaded && !allowed) router.replace("/");
  }, [isLoaded, allowed, router]);

  if (!isLoaded || !allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-topflow-canvas">
        <p className="text-slate-500">Checking access…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-topflow-canvas">
      <header className="bg-topflow-navy px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/admin" className="text-lg font-bold text-white">TOP FLOW ADMIN</Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/admin" className="text-slate-300 hover:text-white">Dashboard</Link>
            <Link href="/admin/products" className="text-slate-300 hover:text-white">Products</Link>
            <Link href="/admin/categories" className="text-slate-300 hover:text-white">Categories</Link>
            <Link href="/admin/orders" className="text-slate-300 hover:text-white">Orders</Link>
            <Link href="/" className="text-slate-300 hover:text-white">← Storefront</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}