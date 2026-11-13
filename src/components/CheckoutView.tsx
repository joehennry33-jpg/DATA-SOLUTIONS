import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Lock,
  Phone,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatKenyanPhoneDisplay, isValidKenyanMpesaPhone, normalizeSafaricomPhone } from '../lib/phone.ts';
import type {
  BusinessPaymentConfig,
  IntegrationStatus,
  OrderRecord,
  PaymentMethod,
  Product,
} from '../types/safbundle.ts';

interface CheckoutViewProps {
  product: Product | null;
  customAirtimeAmount: number | null;
  config: BusinessPaymentConfig | null;
  integrations: IntegrationStatus | null;
  onBack: () => void;
  onOrderCreated: (order: OrderRecord) => void;
}

export function CheckoutView({
  product,
  customAirtimeAmount,
  config,
  integrations,
  onBack,
  onOrderCreated,
}: CheckoutViewProps) {
  const [recipientPhone, setRecipientPhone] = useState('');
  const [confirmPhone, setConfirmPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    config?.stkPushEnabled === false ? 'till_paybill' : 'stk_push',
  );
  const [sameAsRecipient, setSameAsRecipient] = useState(true);
  const [mpesaPhone, setMpesaPhone] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createdOrder, setCreatedOrder] = useState<OrderRecord | null>(null);
  const [stkFeedback, setStkFeedback] = useState<{
    configured: boolean;
    success: boolean;
    message: string;
  } | null>(null);

  const [tillRefInput, setTillRefInput] = useState('');
  const [tillRefSaving, setTillRefSaving] = useState(false);
  const [tillRefMessage, setTillRefMessage] = useState<string | null>(null);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [idempotencyKey] = useState(() =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`,
  );

  useEffect(() => {
    if (sameAsRecipient) {
      setMpesaPhone(recipientPhone);
    }
  }, [sameAsRecipient, recipientPhone]);

  const effectiveAmount =
    product?.id === 'custom_airtime'
      ? customAirtimeAmount || 100
      : product?.priceKes || customAirtimeAmount || 0;

  const effectiveName =
    product?.id === 'custom_airtime'
      ? `Sample Custom Airtime KES ${effectiveAmount}`
      : product?.name || 'Safaricom Package';

  if (!product && !customAirtimeAmount) {
    return (
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-[#0F1F17]">No Package Selected</h1>
        <p className="text-[#475950]">
          Choose a Safaricom data bundle or airtime package from our catalog to begin checkout.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#009E49] text-white font-semibold text-sm rounded-lg hover:bg-[#007A38] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Browse Packages
        </button>
      </section>
    );
  }

  const recipientValidation = recipientPhone ? normalizeSafaricomPhone(recipientPhone) : null;

  async function handleSubmitOrder(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const recCheck = normalizeSafaricomPhone(recipientPhone);
    if (!recCheck.valid || !recCheck.normalized) {
      setError(recCheck.error || 'Enter a valid Safaricom recipient phone number.');
      return;
    }

    const confCheck = normalizeSafaricomPhone(confirmPhone);
    if (!confCheck.valid || !confCheck.normalized) {
      setError(confCheck.error || 'Confirm the recipient Safaricom phone number.');
      return;
    }

    if (recCheck.normalized !== confCheck.normalized) {
      setError('The two recipient phone numbers do not match. Please verify carefully.');
      return;
    }

    const payerRaw = sameAsRecipient ? recipientPhone : mpesaPhone;
    if (paymentMethod === 'stk_push') {
      const mpesaCheck = isValidKenyanMpesaPhone(payerRaw);
      if (!mpesaCheck.valid) {
        setError(mpesaCheck.error || 'Enter a valid Safaricom M-Pesa number.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product?.id || 'custom_airtime',
          customAmountKes: product?.id === 'custom_airtime' ? effectiveAmount : undefined,
          recipientPhone,
          confirmPhone,
          paymentMethod,
          mpesaPhone: paymentMethod === 'stk_push' ? payerRaw : undefined,
          idempotencyKey,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Could not create order. Please check your entries.');
        return;
      }

      setCreatedOrder(data.order);
      if (data.stkPush) {
        setStkFeedback(data.stkPush);
      }
      onOrderCreated(data.order);
    } catch {
      setError('Network error while creating your order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRetryStkPush() {
    if (!createdOrder) return;
    setRefreshingStatus(true);
    setError(null);
    try {
      const res = await fetch('/api/payments/stk-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderRef: createdOrder.orderRef,
          trackingToken: createdOrder.trackingToken,
          mpesaPhone: createdOrder.mpesaPhone || createdOrder.recipientPhone,
        }),
      });
      const data = await res.json();
      setStkFeedback({
        configured: Boolean(data.configured),
        success: Boolean(data.success),
        message: data.message || data.error || 'STK Push attempt finished.',
      });
      await handleRefreshOrderStatus();
    } catch {
      setError('Unable to resend STK Push right now.');
    } finally {
      setRefreshingStatus(false);
    }
  }

  async function handleSubmitTillReference(e: React.FormEvent) {
    e.preventDefault();
    if (!createdOrder) return;
    setTillRefSaving(true);
    setTillRefMessage(null);
    setError(null);

    try {
      const res = await fetch('/api/payments/till-reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderRef: createdOrder.orderRef,
          trackingToken: createdOrder.trackingToken,
          transactionRef: tillRefInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Invalid M-Pesa transaction code.');
        return;
      }
      setTillRefMessage(data.message);
      setCreatedOrder((prev) =>
        prev ? { ...prev, customerSubmittedRef: data.customerSubmittedRef } : prev,
      );
    } catch {
      setError('Could not save transaction reference.');
    } finally {
      setTillRefSaving(false);
    }
  }

  async function handleRefreshOrderStatus() {
    if (!createdOrder) return;
    setRefreshingStatus(true);
    try {
      const params = new URLSearchParams({
        ref: createdOrder.orderRef,
        token: createdOrder.trackingToken || '',
      });
      const res = await fetch(`/api/orders/track?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setCreatedOrder((prev) => (prev ? { ...prev, ...data.order } : prev));
      }
    } finally {
      setRefreshingStatus(false);
    }
  }

  // POST-ORDER CONFIRMATION & PAYMENT INSTRUCTIONS VIEW
  if (createdOrder) {
    const isPaid = createdOrder.paymentStatus === 'paid';
    const isFailed = createdOrder.paymentStatus === 'failed' || createdOrder.paymentStatus === 'cancelled';

    return (
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-[#475950] hover:text-[#0F1F17] mb-6 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Packages
        </button>

        <div className="bg-white border border-[#E2E8E5] rounded-xl p-6 sm:p-8 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#E2E8E5]">
            <div className="space-y-1">
              <p className="text-xs font-medium text-[#5A6D63]">
                Order Confirmation &amp; Payment Status
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0F1F17] tabular-nums">
                Reference {createdOrder.orderRef}
              </h1>
              <p className="text-sm text-[#475950]">
                Recipient: <span className="font-mono font-medium text-[#0F1F17]">{formatKenyanPhoneDisplay(createdOrder.recipientPhone)}</span>
                {' · '}
                Package: <span className="font-medium text-[#0F1F17]">{createdOrder.productName}</span>
              </p>
            </div>
            <div className="text-left sm:text-right">
              <div className="text-xs text-[#5A6D63]">Total Payable</div>
              <div className="font-display text-2xl font-bold text-[#0F1F17] tabular-nums">
                KES {createdOrder.amountKes.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Dual Status Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-[#F8FAF9] border border-[#E2E8E5] space-y-1.5">
              <div className="text-xs font-medium text-[#5A6D63]">M-Pesa Payment Status</div>
              <div className="flex items-center gap-2 font-display font-semibold text-base">
                {isPaid ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-[#009E49]" />
                    <span className="text-[#007A38]">Payment Verified</span>
                  </>
                ) : isFailed ? (
                  <>
                    <AlertCircle className="w-5 h-5 text-[#DC2626]" />
                    <span className="text-[#DC2626] capitalize">{createdOrder.paymentStatus}</span>
                  </>
                ) : (
                  <>
                    <Clock className="w-5 h-5 text-[#D97706]" />
                    <span className="text-[#B45309]">
                      {createdOrder.paymentStatus === 'initiated'
                        ? 'STK Prompt Sent — Awaiting PIN'
                        : 'Awaiting Payment Verification'}
                    </span>
                  </>
                )}
              </div>
              {createdOrder.mpesaReceiptNumber && (
                <p className="text-xs font-mono text-[#475950]">
                  Receipt: {createdOrder.mpesaReceiptNumber}
                </p>
              )}
            </div>

            <div className="p-4 rounded-lg bg-[#F8FAF9] border border-[#E2E8E5] space-y-1.5">
              <div className="text-xs font-medium text-[#5A6D63]">Bundle Delivery Status</div>
              <div className="flex items-center gap-2 font-display font-semibold text-base">
                {createdOrder.deliveryStatus === 'delivered' ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-[#009E49]" />
                    <span className="text-[#007A38]">Delivered to Line</span>
                  </>
                ) : createdOrder.deliveryStatus === 'failed' ? (
                  <>
                    <AlertCircle className="w-5 h-5 text-[#DC2626]" />
                    <span className="text-[#DC2626]">Delivery Failed — Escalated</span>
                  </>
                ) : (
                  <>
                    <Clock className="w-5 h-5 text-[#475950]" />
                    <span className="text-[#0F1F17] capitalize">
                      {createdOrder.deliveryStatus.replace('_', ' ')}
                    </span>
                  </>
                )}
              </div>
              <p className="text-xs text-[#475950]">
                Delivery starts automatically once Safaricom confirms payment.
              </p>
            </div>
          </div>

          {error && (
            <div className="p-4 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-sm text-[#B91C1C] flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Method-Specific Instructions */}
          {!isPaid && createdOrder.paymentMethod === 'stk_push' && (
            <div className="p-5 rounded-lg bg-[#F8FAF9] border border-[#E2E8E5] space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="font-display font-semibold text-base text-[#0F1F17]">
                    M-Pesa STK Push Instructions
                  </h2>
                  <p className="text-sm text-[#475950]">
                    {stkFeedback?.message ||
                      'Check your M-Pesa phone for the payment prompt and enter your PIN to confirm.'}
                  </p>
                </div>
              </div>

              {stkFeedback && !stkFeedback.configured && (
                <div className="p-3.5 rounded-lg bg-[#FFFBEB] border border-[#FDE68A] text-xs text-[#92400E] leading-relaxed">
                  <strong>Daraja Integration Notice:</strong> Live STK Push requires Safaricom Daraja
                  API credentials (Consumer Key, Consumer Secret, Shortcode, Passkey) configured on
                  the server. Your order <span className="font-mono font-semibold">{createdOrder.orderRef}</span> is
                  saved safely and can be paid once Daraja credentials are active.
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleRetryStkPush}
                  disabled={refreshingStatus}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#009E49] hover:bg-[#007A38] disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
                >
                  <Smartphone className="w-4 h-4" />
                  {refreshingStatus ? 'Sending...' : 'Resend STK Push'}
                </button>
                <button
                  type="button"
                  onClick={handleRefreshOrderStatus}
                  disabled={refreshingStatus}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[#0F1F17] bg-white border border-[#D4DDD8] hover:bg-[#F1F5F3] rounded-lg transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshingStatus ? 'animate-spin' : ''}`} />
                  Refresh Status
                </button>
              </div>
            </div>
          )}

          {!isPaid && createdOrder.paymentMethod === 'till_paybill' && (
            <div className="p-5 rounded-lg bg-[#F8FAF9] border border-[#E2E8E5] space-y-5">
              <div className="space-y-1">
                <h2 className="font-display font-semibold text-base text-[#0F1F17]">
                  Lipa na M-Pesa ({config?.paymentMode === 'till' ? 'Buy Goods Till' : 'Paybill'})
                </h2>
                <p className="text-sm text-[#475950]">
                  Complete payment using your M-Pesa menu with the exact details below.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white p-4 rounded-lg border border-[#E2E8E5]">
                <div>
                  <div className="text-xs text-[#5A6D63]">
                    {config?.paymentMode === 'till' ? 'Till Number' : 'Paybill Business No.'}
                  </div>
                  <div className="font-mono text-lg font-bold text-[#0F1F17] tabular-nums">
                    {config?.paymentMode === 'till'
                      ? config?.tillNumber || '000000'
                      : config?.paybillNumber || '000000'}
                  </div>
                </div>
                {config?.paymentMode !== 'till' && (
                  <div>
                    <div className="text-xs text-[#5A6D63]">Account Number</div>
                    <div className="font-mono text-lg font-bold text-[#0F1F17] tabular-nums">
                      {createdOrder.orderRef}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-xs text-[#5A6D63]">Exact Amount</div>
                  <div className="font-mono text-lg font-bold text-[#007A38] tabular-nums">
                    KES {createdOrder.amountKes.toLocaleString()}
                  </div>
                </div>
              </div>

              <form onSubmit={handleSubmitTillReference} className="space-y-3 pt-2 border-t border-[#E2E8E5]">
                <label className="block text-sm font-medium text-[#0F1F17]">
                  Submit M-Pesa Confirmation Code (Optional)
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    value={tillRefInput}
                    onChange={(e) => setTillRefInput(e.target.value.toUpperCase())}
                    placeholder="e.g. UBC4K92X1P"
                    maxLength={16}
                    className="flex-1 px-3.5 py-2.5 text-sm font-mono uppercase bg-white border border-[#D4DDD8] rounded-lg focus:outline-2 focus:outline-[#009E49]"
                  />
                  <button
                    type="submit"
                    disabled={tillRefSaving || !tillRefInput.trim()}
                    className="px-4 py-2.5 text-sm font-semibold text-white bg-[#009E49] hover:bg-[#007A38] disabled:opacity-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {tillRefSaving ? 'Saving...' : 'Submit Reference'}
                  </button>
                </div>
                <p className="text-xs text-[#5A6D63]">
                  Submitting a reference helps match your payment faster. Orders are only marked as paid
                  after official Safaricom Daraja C2B confirmation is received.
                </p>
                {tillRefMessage && (
                  <p className="text-xs font-medium text-[#007A38]">{tillRefMessage}</p>
                )}
              </form>

              <div>
                <button
                  type="button"
                  onClick={handleRefreshOrderStatus}
                  disabled={refreshingStatus}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#0F1F17] bg-white border border-[#D4DDD8] hover:bg-[#F1F5F3] rounded-lg cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshingStatus ? 'animate-spin' : ''}`} />
                  Check C2B Confirmation Status
                </button>
              </div>
            </div>
          )}

          {createdOrder.failureReason && (
            <div className="p-4 rounded-lg bg-[#FFFBEB] border border-[#FDE68A] text-sm text-[#92400E]">
              <strong>Status Note:</strong> {createdOrder.failureReason}
            </div>
          )}
        </div>
      </section>
    );
  }

  // CHECKOUT FORM VIEW
  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-medium text-[#475950] hover:text-[#0F1F17] mb-6 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        Change Package
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Checkout Form */}
        <form
          onSubmit={handleSubmitOrder}
          className="lg:col-span-7 bg-white border border-[#E2E8E5] rounded-xl p-6 sm:p-8 space-y-6"
        >
          <div className="space-y-1 pb-4 border-b border-[#E2E8E5]">
            <h1 className="font-display text-2xl font-bold text-[#0F1F17]">
              Complete Your Order
            </h1>
            <p className="text-sm text-[#475950]">
              Enter and confirm the Safaricom line that will receive this package.
            </p>
          </div>

          {error && (
            <div className="p-4 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-sm text-[#B91C1C] flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="recipient-phone" className="block text-sm font-medium text-[#0F1F17] mb-1.5">
                Safaricom Phone Number Receiving Bundle
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-[#5A6D63] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="recipient-phone"
                  type="tel"
                  required
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                  placeholder="0712 345 678 or 0112 345 678"
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-[#D4DDD8] rounded-lg focus:outline-2 focus:outline-[#009E49]"
                />
              </div>
              {recipientValidation && (
                <p
                  className={`mt-1.5 text-xs ${
                    recipientValidation.valid ? 'text-[#007A38]' : 'text-[#B91C1C]'
                  }`}
                >
                  {recipientValidation.valid
                    ? `Verified Safaricom line · Normalized: ${recipientValidation.normalized}`
                    : recipientValidation.error}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="confirm-phone" className="block text-sm font-medium text-[#0F1F17] mb-1.5">
                Confirm Recipient Phone Number
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-[#5A6D63] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="confirm-phone"
                  type="tel"
                  required
                  value={confirmPhone}
                  onChange={(e) => setConfirmPhone(e.target.value)}
                  placeholder="Re-enter Safaricom phone number"
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-[#D4DDD8] rounded-lg focus:outline-2 focus:outline-[#009E49]"
                />
              </div>
              {confirmPhone && recipientPhone && (
                <p
                  className={`mt-1.5 text-xs ${
                    normalizeSafaricomPhone(recipientPhone).normalized &&
                    normalizeSafaricomPhone(recipientPhone).normalized ===
                      normalizeSafaricomPhone(confirmPhone).normalized
                      ? 'text-[#007A38]'
                      : 'text-[#B91C1C]'
                  }`}
                >
                  {normalizeSafaricomPhone(recipientPhone).normalized &&
                  normalizeSafaricomPhone(recipientPhone).normalized ===
                    normalizeSafaricomPhone(confirmPhone).normalized
                    ? 'Numbers match'
                    : 'Numbers do not match yet'}
                </p>
              )}
            </div>
          </div>

          {/* Payment Method Selection */}
          <div className="space-y-3 pt-2">
            <span className="block text-sm font-medium text-[#0F1F17]">Choose Payment Method</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {config?.stkPushEnabled !== false && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod('stk_push')}
                  className={`p-4 text-left rounded-lg border transition-colors cursor-pointer ${
                    paymentMethod === 'stk_push'
                      ? 'border-[#009E49] bg-[#F2FBF6]'
                      : 'border-[#E2E8E5] bg-white hover:bg-[#F8FAF9]'
                  }`}
                >
                  <div className="font-display font-semibold text-sm text-[#0F1F17]">
                    M-Pesa STK Push
                  </div>
                  <p className="text-xs text-[#475950] mt-1">
                    Instant payment prompt sent directly to your phone.
                  </p>
                </button>
              )}

              {config?.tillPaybillEnabled !== false && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod('till_paybill')}
                  className={`p-4 text-left rounded-lg border transition-colors cursor-pointer ${
                    paymentMethod === 'till_paybill'
                      ? 'border-[#009E49] bg-[#F2FBF6]'
                      : 'border-[#E2E8E5] bg-white hover:bg-[#F8FAF9]'
                  }`}
                >
                  <div className="font-display font-semibold text-sm text-[#0F1F17]">
                    Till Number / Paybill
                  </div>
                  <p className="text-xs text-[#475950] mt-1">
                    Pay manually via Lipa na M-Pesa and verify via C2B.
                  </p>
                </button>
              )}
            </div>
          </div>

          {paymentMethod === 'stk_push' && (
            <div className="p-4 rounded-lg bg-[#F8FAF9] border border-[#E2E8E5] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="mpesa-phone" className="text-sm font-medium text-[#0F1F17]">
                  M-Pesa Number Paying
                </label>
                <label className="inline-flex items-center gap-2 text-xs text-[#475950] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sameAsRecipient}
                    onChange={(e) => setSameAsRecipient(e.target.checked)}
                    className="accent-[#009E49]"
                  />
                  Same as recipient
                </label>
              </div>
              <input
                id="mpesa-phone"
                type="tel"
                disabled={sameAsRecipient}
                value={sameAsRecipient ? recipientPhone : mpesaPhone}
                onChange={(e) => setMpesaPhone(e.target.value)}
                placeholder="0712 345 678"
                className="w-full px-3.5 py-2.5 text-sm bg-white disabled:bg-[#EFF3F0] border border-[#D4DDD8] rounded-lg focus:outline-2 focus:outline-[#009E49]"
              />
              {integrations && !integrations.darajaConfigured && (
                <p className="text-xs text-[#92400E]">
                  Note: Daraja API credentials are not yet configured on this server; submitting will
                  create a pending order ready for Daraja configuration.
                </p>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-[#475950] pt-1">
            <Lock className="w-3.5 h-3.5 text-[#009E49] shrink-0" />
            <span>SafBundle never asks for or stores your M-Pesa PIN.</span>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 px-6 text-sm font-semibold text-white bg-[#009E49] hover:bg-[#007A38] disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
          >
            {submitting
              ? 'Processing Order...'
              : paymentMethod === 'stk_push'
                ? `Pay KES ${effectiveAmount.toLocaleString()} via M-Pesa`
                : `Create Order · KES ${effectiveAmount.toLocaleString()}`}
          </button>
        </form>

        {/* Right: Order Summary */}
        <aside className="lg:col-span-5 bg-white border border-[#E2E8E5] rounded-xl p-6 space-y-5 lg:sticky lg:top-24">
          <div className="space-y-1 pb-4 border-b border-[#E2E8E5]">
            <span className="text-xs font-medium text-[#5A6D63] uppercase tracking-wider">
              Order Summary
            </span>
            <h2 className="font-display text-lg font-bold text-[#0F1F17]">{effectiveName}</h2>
            {product?.isSample !== false && (
              <p className="text-xs text-[#5A6D63]">Sample development catalog package</p>
            )}
          </div>

          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[#475950]">Category</dt>
              <dd className="font-medium text-[#0F1F17] capitalize">
                {product?.category || 'airtime'}
              </dd>
            </div>
            {product?.dataAllocation && (
              <div className="flex justify-between gap-4">
                <dt className="text-[#475950]">Allowance</dt>
                <dd className="font-medium text-[#0F1F17]">{product.dataAllocation}</dd>
              </div>
            )}
            {product?.validityLabel && (
              <div className="flex justify-between gap-4">
                <dt className="text-[#475950]">Validity</dt>
                <dd className="font-medium text-[#0F1F17]">{product.validityLabel}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-[#475950]">Recipient Line</dt>
              <dd className="font-mono font-medium text-[#0F1F17]">
                {recipientValidation?.valid
                  ? recipientValidation.formatted
                  : 'Enter Safaricom number'}
              </dd>
            </div>
            <div className="flex justify-between gap-4 pt-3 border-t border-[#E2E8E5]">
              <dt className="font-display font-semibold text-[#0F1F17]">Total Price</dt>
              <dd className="font-display text-xl font-bold text-[#007A38] tabular-nums">
                KES {effectiveAmount.toLocaleString()}
              </dd>
            </div>
          </dl>

          <div className="p-4 rounded-lg bg-[#F8FAF9] border border-[#E2E8E5] text-xs text-[#475950] space-y-2">
            <div className="flex items-center gap-2 font-semibold text-[#0F1F17]">
              <ShieldCheck className="w-4 h-4 text-[#009E49]" />
              Server-Verified Payment Protection
            </div>
            <p className="leading-relaxed">
              Your order is fulfilled only after Safaricom Daraja confirms the M-Pesa transaction on
              our backend, preventing duplicate charges or unverified claims.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
