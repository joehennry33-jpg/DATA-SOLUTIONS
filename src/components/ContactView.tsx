import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Headphones,
  Lock,
  Mail,
  MessageSquare,
  Phone,
  Send,
} from 'lucide-react';
import { useState } from 'react';
import supportDeskImage from '../assets/images/support_nairobi_desk_1794566641747.jpg';
import type { BusinessPaymentConfig, ContactTopic } from '../types/safbundle.ts';

interface ContactViewProps {
  config: BusinessPaymentConfig | null;
  initialOrderRef?: string;
  onGoTrack: () => void;
}

const TOPIC_OPTIONS: { value: ContactTopic; label: string }[] = [
  { value: 'order_issue', label: 'Order or Delivery Issue' },
  { value: 'mpesa_payment', label: 'M-Pesa Payment Verification' },
  { value: 'bundle_delivery', label: 'Bundle Packages & Pricing' },
  { value: 'partnership', label: 'Business & Reseller Inquiry' },
  { value: 'general', label: 'General Question' },
];

export function ContactView({ config, initialOrderRef = '', onGoTrack }: ContactViewProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [topic, setTopic] = useState<ContactTopic>('order_issue');
  const [orderRef, setOrderRef] = useState(initialOrderRef);
  const [message, setMessage] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketResult, setTicketResult] = useState<{
    ticketRef: string;
    message: string;
  } | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (name.trim().length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (message.trim().length < 10) {
      setError('Please describe how we can help (at least 10 characters).');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          topic,
          orderRef: orderRef.trim().toUpperCase(),
          message: message.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Unable to submit your message.');
        return;
      }
      setTicketResult({
        ticketRef: data.ticket?.ticketRef || 'TKT-SUBMITTED',
        message: data.message,
      });
      setMessage('');
    } catch {
      setError('Network error while sending your message. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-10">
      <div className="max-w-2xl space-y-3">
        <p className="text-sm font-medium text-[#007A38]">Customer Support Desk</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#0F1F17] tracking-tight">
          Contact Us
        </h1>
        <p className="text-base text-[#475950] leading-relaxed">
          Have a question about an M-Pesa payment, bundle delivery, or bulk packages? Send our
          Nairobi support team a message or reach us directly via phone, WhatsApp, or email.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Contact Form */}
        <div className="lg:col-span-7 bg-white border border-[#E2E8E5] rounded-xl p-6 sm:p-8">
          {ticketResult ? (
            <div className="space-y-6 py-4">
              <div className="flex items-start gap-3 p-5 rounded-lg bg-[#F2FBF6] border border-[#B7E4C7]">
                <CheckCircle2 className="w-6 h-6 text-[#009E49] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h2 className="font-display text-lg font-bold text-[#0F1F17]">
                    Message Received · {ticketResult.ticketRef}
                  </h2>
                  <p className="text-sm text-[#475950] leading-relaxed">{ticketResult.message}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setTicketResult(null)}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-[#009E49] hover:bg-[#007A38] rounded-lg transition-colors cursor-pointer"
                >
                  Send Another Inquiry
                </button>
                <button
                  type="button"
                  onClick={onGoTrack}
                  className="px-5 py-2.5 text-sm font-medium text-[#0F1F17] bg-[#F8FAF9] border border-[#D4DDD8] hover:bg-[#EDF2EF] rounded-lg transition-colors cursor-pointer"
                >
                  Track an Order
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1 pb-4 border-b border-[#E2E8E5]">
                <h2 className="font-display text-xl font-bold text-[#0F1F17]">
                  Send a Support Message
                </h2>
                <p className="text-sm text-[#475950]">
                  Include your Order Reference if you are inquiring about an existing purchase.
                </p>
              </div>

              {error && (
                <div className="p-4 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-sm text-[#B91C1C] flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="contact-name" className="block text-sm font-medium text-[#0F1F17] mb-1.5">
                    Full Name
                  </label>
                  <input
                    id="contact-name"
                    type="text"
                    required
                    maxLength={100}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Wanjiku Kamau"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#D4DDD8] rounded-lg focus:outline-2 focus:outline-[#009E49]"
                  />
                </div>

                <div>
                  <label htmlFor="contact-email" className="block text-sm font-medium text-[#0F1F17] mb-1.5">
                    Email Address
                  </label>
                  <input
                    id="contact-email"
                    type="email"
                    required
                    maxLength={160}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#D4DDD8] rounded-lg focus:outline-2 focus:outline-[#009E49]"
                  />
                </div>

                <div>
                  <label htmlFor="contact-phone" className="block text-sm font-medium text-[#0F1F17] mb-1.5">
                    Phone Number (Optional)
                  </label>
                  <input
                    id="contact-phone"
                    type="tel"
                    maxLength={25}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0712 345 678"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#D4DDD8] rounded-lg focus:outline-2 focus:outline-[#009E49]"
                  />
                </div>

                <div>
                  <label htmlFor="contact-topic" className="block text-sm font-medium text-[#0F1F17] mb-1.5">
                    Inquiry Topic
                  </label>
                  <select
                    id="contact-topic"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value as ContactTopic)}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#D4DDD8] rounded-lg focus:outline-2 focus:outline-[#009E49]"
                  >
                    {TOPIC_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="contact-order-ref" className="block text-sm font-medium text-[#0F1F17] mb-1.5">
                  Order Reference (Optional)
                </label>
                <input
                  id="contact-order-ref"
                  type="text"
                  maxLength={32}
                  value={orderRef}
                  onChange={(e) => setOrderRef(e.target.value.toUpperCase())}
                  placeholder="e.g. SB-4K9X2M"
                  className="w-full px-3.5 py-2.5 text-sm font-mono uppercase bg-white border border-[#D4DDD8] rounded-lg focus:outline-2 focus:outline-[#009E49]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="contact-message" className="text-sm font-medium text-[#0F1F17]">
                    Message
                  </label>
                  <span className="text-xs text-[#5A6D63] tabular-nums">
                    {message.length} / 2000
                  </span>
                </div>
                <textarea
                  id="contact-message"
                  rows={5}
                  required
                  minLength={10}
                  maxLength={2000}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe your inquiry, M-Pesa receipt reference (never your PIN), or question..."
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#D4DDD8] rounded-lg focus:outline-2 focus:outline-[#009E49]"
                />
              </div>

              <div className="flex items-center gap-2 text-xs text-[#475950]">
                <Lock className="w-3.5 h-3.5 text-[#009E49] shrink-0" />
                <span>For your security, never include your M-Pesa PIN in any support message.</span>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 text-sm font-semibold text-white bg-[#009E49] hover:bg-[#007A38] disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
              >
                <Send className="w-4 h-4" />
                {submitting ? 'Sending Message...' : 'Send Message'}
              </button>
            </form>
          )}
        </div>

        {/* Right Column: Direct Channels & Support Desk */}
        <aside className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-[#E2E8E5] rounded-xl overflow-hidden">
            <div className="h-52 bg-[#EDF2EF]">
              {!imgFailed ? (
                <img
                  src={supportDeskImage}
                  alt="SafBundle Nairobi customer support specialist assisting customers"
                  referrerPolicy="no-referrer"
                  onError={() => setImgFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Headphones className="w-10 h-10 text-[#009E49]" />
                </div>
              )}
            </div>

            <div className="p-6 space-y-5">
              <div className="space-y-1">
                <h2 className="font-display text-lg font-bold text-[#0F1F17]">
                  Direct Support Channels
                </h2>
                <p className="text-sm text-[#475950]">
                  Reach our Kenya support desk directly during operating hours.
                </p>
              </div>

              <dl className="space-y-3.5 text-sm">
                <div className="flex items-start gap-3">
                  <Phone className="w-4 h-4 text-[#009E49] shrink-0 mt-0.5" />
                  <div>
                    <dt className="text-xs text-[#5A6D63]">Support Phone</dt>
                    <dd className="font-medium text-[#0F1F17]">
                      {config?.supportPhone || '+254 700 000 000'}
                    </dd>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MessageSquare className="w-4 h-4 text-[#009E49] shrink-0 mt-0.5" />
                  <div>
                    <dt className="text-xs text-[#5A6D63]">WhatsApp Desk</dt>
                    <dd className="font-medium text-[#0F1F17]">
                      {config?.supportWhatsapp || '+254 700 000 000'}
                    </dd>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Mail className="w-4 h-4 text-[#009E49] shrink-0 mt-0.5" />
                  <div>
                    <dt className="text-xs text-[#5A6D63]">Support Email</dt>
                    <dd className="font-medium text-[#0F1F17]">
                      {config?.supportEmail || 'support@safbundle.co.ke'}
                    </dd>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Clock className="w-4 h-4 text-[#009E49] shrink-0 mt-0.5" />
                  <div>
                    <dt className="text-xs text-[#5A6D63]">Operating Hours</dt>
                    <dd className="font-medium text-[#0F1F17]">Daily, 6:00 AM – 11:00 PM EAT</dd>
                  </div>
                </div>
              </dl>

              <div className="pt-4 border-t border-[#E2E8E5]">
                <button
                  type="button"
                  onClick={onGoTrack}
                  className="w-full py-2.5 px-4 text-sm font-semibold text-[#0F1F17] bg-[#F8FAF9] border border-[#D4DDD8] hover:bg-[#EDF2EF] rounded-lg transition-colors cursor-pointer"
                >
                  Check Existing Order Status
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
