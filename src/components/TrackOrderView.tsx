import { AlertCircle, CheckCircle2, Clock, Search } from 'lucide-react';
import { useState } from 'react';
import { formatKenyanPhoneDisplay } from '../lib/phone.ts';
import type { OrderRecord } from '../types/safbundle.ts';

interface TrackOrderViewProps {
  initialOrderRef?: string;
  initialPhone?: string;
}

export function TrackOrderView({ initialOrderRef = '', initialPhone = '' }: TrackOrderViewProps) {
  const [orderRef, setOrderRef] = useState(initialOrderRef);
  const [phone, setPhone] = useState(initialPhone);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<Partial<OrderRecord> | null>(null);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOrder(null);

    if (!orderRef.trim() || !phone.trim()) {
      setError('Enter both your Order Reference and the recipient Safaricom phone number.');
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({
        ref: orderRef.trim().toUpperCase(),
        phone: phone.trim(),
      });
      const res = await fetch(`/api/orders/track?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'No matching order found.');
        return;
      }
      setOrder(data.order);
    } catch {
      setError('Network error while checking order status.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-8">
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-bold text-[#0F1F17] tracking-tight">
          Track Your Order
        </h1>
        <p className="text-[#475950] text-base">
          Verify your M-Pesa payment and bundle delivery status using your Order Reference and
          recipient Safaricom phone number.
        </p>
      </div>

      <form
        onSubmit={handleLookup}
        className="bg-white border border-[#E2E8E5] rounded-xl p-6 space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="track-ref" className="block text-sm font-medium text-[#0F1F17] mb-1.5">
              Order Reference
            </label>
            <input
              id="track-ref"
              type="text"
              value={orderRef}
              onChange={(e) => setOrderRef(e.target.value.toUpperCase())}
              placeholder="e.g. SB-4K9X2M"
              required
              className="w-full px-3.5 py-2.5 text-sm font-mono uppercase bg-white border border-[#D4DDD8] rounded-lg focus:outline-2 focus:outline-[#009E49]"
            />
          </div>
          <div>
            <label htmlFor="track-phone" className="block text-sm font-medium text-[#0F1F17] mb-1.5">
              Recipient Safaricom Number
            </label>
            <input
              id="track-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0712 345 678"
              required
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#D4DDD8] rounded-lg focus:outline-2 focus:outline-[#009E49]"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <p className="text-xs text-[#5A6D63]">
            Both fields are required so another customer&apos;s order details remain private.
          </p>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#009E49] hover:bg-[#007A38] disabled:opacity-60 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <Search className="w-4 h-4" />
            {loading ? 'Checking...' : 'Check Status'}
          </button>
        </div>
      </form>

      {error && (
        <div className="p-4 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-sm text-[#B91C1C] flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {order && (
        <div className="bg-white border border-[#E2E8E5] rounded-xl p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#E2E8E5]">
            <div>
              <div className="text-xs text-[#5A6D63]">Order Reference</div>
              <div className="font-mono text-xl font-bold text-[#0F1F17]">{order.orderRef}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-[#5A6D63]">Amount</div>
              <div className="font-display text-xl font-bold text-[#007A38] tabular-nums">
                KES {Number(order.amountKes || 0).toLocaleString()}
              </div>
            </div>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-[#5A6D63]">Package</dt>
              <dd className="font-medium text-[#0F1F17] mt-0.5">{order.productName}</dd>
            </div>
            <div>
              <dt className="text-xs text-[#5A6D63]">Recipient Line</dt>
              <dd className="font-mono font-medium text-[#0F1F17] mt-0.5">
                {order.recipientPhone ? formatKenyanPhoneDisplay(order.recipientPhone) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[#5A6D63]">Payment Status</dt>
              <dd className="mt-1 inline-flex items-center gap-1.5 font-medium">
                {order.paymentStatus === 'paid' ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-[#009E49]" />
                    <span className="text-[#007A38]">Paid</span>
                  </>
                ) : order.paymentStatus === 'failed' || order.paymentStatus === 'cancelled' ? (
                  <>
                    <AlertCircle className="w-4 h-4 text-[#DC2626]" />
                    <span className="text-[#DC2626] capitalize">{order.paymentStatus}</span>
                  </>
                ) : (
                  <>
                    <Clock className="w-4 h-4 text-[#D97706]" />
                    <span className="text-[#B45309] capitalize">
                      {order.paymentStatus?.replace('_', ' ')}
                    </span>
                  </>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[#5A6D63]">Delivery Status</dt>
              <dd className="mt-1 inline-flex items-center gap-1.5 font-medium">
                {order.deliveryStatus === 'delivered' ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-[#009E49]" />
                    <span className="text-[#007A38]">Delivered</span>
                  </>
                ) : order.deliveryStatus === 'failed' ? (
                  <>
                    <AlertCircle className="w-4 h-4 text-[#DC2626]" />
                    <span className="text-[#DC2626]">Failed</span>
                  </>
                ) : (
                  <>
                    <Clock className="w-4 h-4 text-[#475950]" />
                    <span className="text-[#0F1F17] capitalize">
                      {order.deliveryStatus?.replace('_', ' ')}
                    </span>
                  </>
                )}
              </dd>
            </div>
            {order.mpesaReceiptNumber && (
              <div>
                <dt className="text-xs text-[#5A6D63]">M-Pesa Receipt</dt>
                <dd className="font-mono font-medium text-[#0F1F17] mt-0.5">
                  {order.mpesaReceiptNumber}
                </dd>
              </div>
            )}
            {order.customerSubmittedRef && (
              <div>
                <dt className="text-xs text-[#5A6D63]">Submitted Till/Paybill Ref</dt>
                <dd className="font-mono font-medium text-[#0F1F17] mt-0.5">
                  {order.customerSubmittedRef}
                </dd>
              </div>
            )}
          </dl>

          {order.failureReason && (
            <div className="p-3.5 rounded-lg bg-[#FFFBEB] border border-[#FDE68A] text-xs text-[#92400E]">
              <strong>Note:</strong> {order.failureReason}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
