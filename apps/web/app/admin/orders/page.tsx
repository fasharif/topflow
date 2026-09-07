"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

const STATUS_COLORS: Record<string, string> = {
  ENQUIRY_SUBMITTED: "bg-topflow-amber/10 text-topflow-amber",
  QUOTATION_ISSUED: "bg-blue-100 text-blue-700",
  CONFIRMED: "bg-emerald-100 text-emerald-700",
  DISPATCHED: "bg-purple-100 text-purple-700",
  DELIVERED: "bg-slate-200 text-slate-700",
  CANCELLED: "bg-red-100 text-red-700",
};

export default function AdminOrdersPage() {
  const { token } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders/admin/all`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json()).then(setOrders).finally(() => setLoading(false));
  }, [token]);

  if (loading) return <p className="text-slate-500">Loading…</p>;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-topflow-navy">Orders &amp; Enquiries</h1>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-3">Order #</th><th className="p-3">Customer</th><th className="p-3">Total</th><th className="p-3">Status</th><th className="p-3">Date</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <td className="p-3"><Link href={`/admin/orders/${o.id}`} className="font-mono text-xs text-topflow-teal">{o.orderNumber}</Link></td>
                <td className="p-3 text-topflow-navy">{o.user?.fullName ?? "—"}</td>
                <td className="p-3 font-semibold text-topflow-navy">AED {Number(o.totalAmount).toFixed(2)}</td>
                <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[o.status] ?? ""}`}>{o.status.replace(/_/g, " ")}</span></td>
                <td className="p-3 text-slate-500">{new Date(o.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}