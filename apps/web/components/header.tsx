"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart-context";

export function Header() {
  const { totalItems } = useCart();

  return (
    <header className="bg-topflow-navy px-6 py-5 sm:px-10">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">TOP FLOW</h1>
          <p className="text-xs text-slate-300">Irrigation &amp; Flow-Control Supplies · UAE</p>
        </div>
        <Link
          href="/cart"
          className="flex items-center gap-2 rounded-md bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
        >
          Enquiry Cart
          {totalItems > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-topflow-teal px-1.5 text-xs font-bold">
              {totalItems}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}