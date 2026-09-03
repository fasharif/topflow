"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/lib/cart-context";
import { useAuth } from "@/lib/auth-context";

export default function CartPage() {
  const router = useRouter();
  const { items, updateQuantity, removeItem, totalAmount, clearCart } = useCart();
  const { user, token, isLoaded } = useAuth();
  const [shippingAddress, setShippingAddress] = useState("");
  const [projectReference, setProjectReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!shippingAddress.trim()) {
      setError("Shipping address is required");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          shippingAddress,
          projectReference: projectReference || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to submit enquiry");
      }
      const order = await res.json();
      setSuccess(order.orderNumber);
      clearCart();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-topflow-canvas px-6">
        <div className="max-w-md text-center">
          <h1 className="mb-2 text-2xl font-bold text-topflow-navy">Enquiry submitted</h1>
          <p className="mb-6 text-slate-600">
            Reference <span className="font-mono font-semibold">{success}</span>. Our team will follow
            up with a formal quotation.
          </p>
          <Link href="/" className="font-medium text-topflow-teal">Back to catalog</Link>
        </div>
      </div>
    );
  }

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

            {isLoaded && !user ? (
              <div className="mt-6 rounded-md border border-topflow-amber/30 bg-topflow-amber/10 p-4 text-center">
                <p className="mb-2 text-sm text-slate-700">Sign in to submit this as a formal enquiry.</p>
                <Link href="/login" className="font-medium text-topflow-teal">Sign in</Link>
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Shipping / Site Address</label>
                  <textarea
                    required
                    value={shippingAddress}
                    onChange={(e) => setShippingAddress(e.target.value)}
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Project Reference <span className="text-slate-400">(optional)</span>
                  </label>
                  <input
                    value={projectReference}
                    onChange={(e) => setProjectReference(e.target.value)}
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                {error && <p className="text-sm text-red-500">{error}</p>}

                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full rounded-md bg-topflow-teal px-4 py-3 font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? "Submitting…" : "Submit Enquiry"}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}