import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm text-slate-600 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div>
          <p className="font-bold text-ink-900">TOP FLOW</p>
          <p className="mt-2">Irrigation &amp; flow control supplies for homes, landscapers and contractors across the UAE.</p>
        </div>
        <div>
          <p className="font-semibold text-ink-900">Shop</p>
          <ul className="mt-2 space-y-1.5">
            <li><Link className="hover:text-brand-700" href="/products?category=sprinklers-rotors">Sprinklers &amp; rotors</Link></li>
            <li><Link className="hover:text-brand-700" href="/products?category=drip-irrigation">Drip irrigation</Link></li>
            <li><Link className="hover:text-brand-700" href="/products?category=controllers-sensors">Controllers &amp; sensors</Link></li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-ink-900">Trade customers</p>
          <ul className="mt-2 space-y-1.5">
            <li><Link className="hover:text-brand-700" href="/register?type=business">Open a trade account</Link></li>
            <li><Link className="hover:text-brand-700" href="/business">Trade portal</Link></li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-ink-900">Good to know</p>
          <ul className="mt-2 space-y-1.5">
            <li>Prices shown to consumers include 5% VAT</li>
            <li>Free delivery on retail orders over AED 500</li>
            <li>Cash or card on delivery</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-100 py-4 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} Top Flow · www.topflow.ae
      </div>
    </footer>
  );
}
