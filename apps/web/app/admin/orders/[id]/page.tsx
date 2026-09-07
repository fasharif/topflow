"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const STATUSES = ["ENQUIRY_SUBMITTED", "QUOTATION_ISSUED", "CONFIRMED", "DISPATCHED", "DELIVERED", "CANCELLED"];

export default function AdminOrderDetailPage() {
  const { token } = useAuth();
  const params = useParams();
  const id = params.id as string;
  const [order, setOrder] = useState<any>(null);
  const [updating, setUpdating] = useState(false);

  const load = () => {
    if (!token) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json()).then(setOrder);
  };
  useEffect(() => { load(); }, [token, id]);

  const handleStatusChange = async (status: string) => {
    setUpdating(true);
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    load();
    setUpdating(false);
  };

  const handleDownloadPdf = async () => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders/${id}/quotation.pdf`, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quotation-${order?.orderNumber}.pdf`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (!order) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-topflow-navy">{order.orderNumber}</h1><p className="text-sm text-slate-500">{order.user?.fullName} · {order.user?.email}</p></div>
        <button onClick={handleDownloadPdf} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-topflow-navy">Download PDF</button>
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
        <label className="mb-1 block text-sm font-medium text-slate-700">Status</label>
        <select value={order.status} disabled={updating} onChange={(e) => handleStatusChange(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm">
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
      </div>

      <div className="mb-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {order.items.map((item: any) => (
          <div key={item.id} className="flex items-center justify-between p-4 text-sm">
            <div><p className="font-mono text-xs text-slate-400">{item.sku}</p><p className="font-medium text-topflow-navy">{item.productName}</p></div>
            <p className="text-slate-500">×{item.quantity}</p>
            <p className="font-semibold text-topflow-navy">AED {Number(item.totalPrice).toFixed(2)}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 flex justify-between text-lg"><span className="font-semibold text-topflow-navy">Total</span><span className="font-bold text-topflow-navy">AED {Number(order.totalAmount).toFixed(2)}</span></div>

      <div className="space-y-2 text-sm">
        <p><span className="text-slate-500">Shipping:</span> {order.shippingAddress}</p>
        {order.projectReference && <p><span className="text-slate-500">Project:</span> {order.projectReference}</p>}
        {order.notes && <p><span className="text-slate-500">Notes:</span> {order.notes}</p>}
      </div>
    </div>
  );
}