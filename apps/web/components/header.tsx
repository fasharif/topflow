"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart-context";
import { useAuth } from "@/lib/auth-context";

export function Header() {
  const { totalItems } = useCart();
  const { user, logout, isLoaded } = useAuth();

  return (
    <header className="bg-topflow-navy px-6 py-5 sm:px-10">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">TOP FLOW</h1>
          <p className="text-xs text-slate-300">Irrigation &amp; Flow-Control Supplies · UAE</p>
        </div>

        <div className="flex items-center gap-3">
          {isLoaded && (
            user ? (
              <div className="flex items-center gap-2 text-sm text-white">
                <span>{user.fullName}</span>
                <button onClick={logout} className="text-slate-300 underline hover:text-white">
                  Sign out
                </button>
              </div>
            ) : (
              <Link href="/login" className="text-sm font-medium text-white hover:text-slate-300">
                Sign in
              </Link>
            )
          )}

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
      </div>
    </header>
  );
}