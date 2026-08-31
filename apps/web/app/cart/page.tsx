"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart-context";

export default function CartPage() {
  const { items, updateQuantity, removeItem, totalAmount } = useCart();

  return (
    <div className="min-h-screen bg-topflow-canvas">
      <header className="bg-topflow-navy px-6 py-5 sm:px-10">
        <div className="mx-auto max-w-6xl">
          <Link href="/" className="text-sm text-slate-300 hover:text-white">← Back to catalog</Link>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-white">Enquiry Cart</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10 sm:px-10">
        {items.length === 0 ? (
          <p className="text-slate-500">
            Your enquiry cart is empty.{" "}
            <Link href="/" className="font-medium text-topflow-teal">Browse the catalog</Link>.
          </p>
        ) : (
          <>
            <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
              {items.map((item) => (
                <div key={item.productId} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-mono text-xs text-slate-400">{item.sku}</p>
                    <p className="font-semibold text-topflow-navy">{item.name}</p>
                    <p className="text-sm text-slate-500">AED {item.unitPrice.toFixed(2)} each</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => updateQuantity(item.productId, Number(e.target.value))}
                      className="w-16 rounded border border-slate-300 px-2 py-1 text-center"
                    />
                    <span className="w-20 text-right font-semibold text-topflow-navy">
                      AED {(item.unitPrice * item.quantity).toFixed(2)}
                    </span>
                    <button onClick={() => removeItem(item.productId)} className="text-sm text-red-500 hover:underline">
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex items-center justify-between">
              <span className="text-lg font-semibold text-topflow-navy">Total</span>
              <span className="text-2xl font-bold text-topflow-navy">AED {totalAmount.toFixed(2)}</span>
            </div>

            <button
              disabled
              title="Needs a login flow first — next checkpoint"
              className="mt-6 w-full cursor-not-allowed rounded-md bg-slate-300 px-4 py-3 font-medium text-slate-500"
            >
              Submit Enquiry (requires login — coming next)
            </button>
          </>
        )}
      </main>
    </div>
  );
}