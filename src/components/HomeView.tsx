import {
  ArrowRight,
  Check,
  ChevronDown,
  Headphones,
  Mail,
  MessageSquare,
  Phone,
  Search,
  ShieldCheck,
  Smartphone,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import heroImage from '../assets/images/hero_kenya_connectivity_1794566641147.jpg';
import simShowcaseImage from '../assets/images/brand_sim_card_kit_1794566641529.jpg';
import supportDeskImage from '../assets/images/support_nairobi_desk_1794566641747.jpg';
import type { BusinessPaymentConfig, Product, ProductCategory } from '../types/safbundle.ts';

interface HomeViewProps {
  products: Product[];
  loadingProducts: boolean;
  productsError: string | null;
  config: BusinessPaymentConfig | null;
  onSelectProduct: (product: Product) => void;
  onSelectCustomAirtime: (amountKes: number) => void;
  onGoTrack: () => void;
  onGoContact: () => void;
}

const CATEGORY_TABS: { id: 'all' | ProductCategory; label: string }[] = [
  { id: 'all', label: 'All Packages' },
  { id: 'daily', label: 'Daily Bundles' },
  { id: 'weekly', label: 'Weekly Bundles' },
  { id: 'monthly', label: 'Monthly Bundles' },
  { id: 'special', label: 'Special Offers' },
  { id: 'airtime', label: 'Airtime' },
];

const CATEGORY_LABELS: Record<ProductCategory, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  special: 'Special Offer',
  airtime: 'Airtime',
};

const CATEGORY_OVERVIEW: {
  id: ProductCategory;
  title: string;
  subtitle: string;
}[] = [
  { id: 'daily', title: 'Daily Data', subtitle: '24-hour quick bundles' },
  { id: 'weekly', title: 'Weekly Data', subtitle: '7-day steady browsing' },
  { id: 'monthly', title: 'Monthly Data', subtitle: '30-day work & home' },
  { id: 'special', title: 'Special Offers', subtitle: 'Video & night bundles' },
];

const FAQ_ITEMS = [
  {
    question: 'Which Kenyan phone numbers are supported on SafBundle?',
    answer:
      'SafBundle validates and normalizes Safaricom numbers starting with 070x, 071x, 072x, 0740–0743, 0745–0746, 0748, 0757–0759, 0768–0769, 079x, and 0110–0115. Enter your number in 07xx, 011x, or +254 format and confirm it before paying.',
  },
  {
    question: 'How does M-Pesa STK Push payment verification work?',
    answer:
      'When you choose M-Pesa STK Push, our backend requests a prompt through Safaricom Daraja API. After you enter your M-Pesa PIN on your handset, Safaricom sends a signed callback directly to our server to verify the receipt and amount before bundle delivery begins.',
  },
  {
    question: 'What happens if I pay using Till Number or Paybill?',
    answer:
      'Follow the exact Paybill or Till instructions shown on your order confirmation screen, using your Order Reference as the account number. You can submit your M-Pesa code to help matching, and your order becomes paid automatically once Safaricom Daraja C2B confirmation reaches our backend.',
  },
  {
    question: 'What if a bundle delivery fails after payment?',
    answer:
      'Every verified payment is recorded against your Order Reference. If the supplier API returns a delivery failure, the order is flagged automatically for our support team to investigate and re-dispatch without charging you twice.',
  },
  {
    question: 'Does SafBundle ever ask for my M-Pesa PIN?',
    answer:
      'Never. You only enter your M-Pesa PIN inside the official Safaricom SIM toolkit / M-Pesa prompt on your own phone. Never share your PIN on any website form or support chat.',
  },
];

export function HomeView({
  products,
  loadingProducts,
  productsError,
  config,
  onSelectProduct,
  onSelectCustomAirtime,
  onGoTrack,
  onGoContact,
}: HomeViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<'all' | ProductCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [customAirtime, setCustomAirtime] = useState('100');
  const [airtimeError, setAirtimeError] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [simImgFailed, setSimImgFailed] = useState(false);
  const [supportImgFailed, setSupportImgFailed] = useState(false);

  const categoryStats = useMemo(() => {
    const stats: Record<ProductCategory, { count: number; minPrice: number | null }> = {
      daily: { count: 0, minPrice: null },
      weekly: { count: 0, minPrice: null },
      monthly: { count: 0, minPrice: null },
      special: { count: 0, minPrice: null },
      airtime: { count: 0, minPrice: null },
    };
    for (const item of products) {
      const entry = stats[item.category];
      if (!entry) continue;
      entry.count += 1;
      if (entry.minPrice === null || item.priceKes < entry.minPrice) {
        entry.minPrice = item.priceKes;
      }
    }
    return stats;
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products
      .filter((item) => (selectedCategory === 'all' ? true : item.category === selectedCategory))
      .filter((item) => {
        if (!q) return true;
        return (
          item.name.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.dataAllocation.toLowerCase().includes(q) ||
          item.validityLabel.toLowerCase().includes(q) ||
          CATEGORY_LABELS[item.category].toLowerCase().includes(q)
        );
      });
  }, [products, selectedCategory, searchQuery]);

  function handleSelectCategoryOverview(category: ProductCategory) {
    setSelectedCategory(category);
    const el = document.getElementById('bundles');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function handleCustomAirtimeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const numeric = Math.round(Number(customAirtime));
    if (!Number.isFinite(numeric) || numeric < 10 || numeric > 10000) {
      setAirtimeError('Enter an airtime amount between KES 10 and KES 10,000.');
      return;
    }
    setAirtimeError(null);
    onSelectCustomAirtime(numeric);
  }

  return (
    <div>
      {/* 1. HERO SECTION */}
      <section className="bg-white border-b border-[#E2E8E5]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 lg:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
              <p className="text-sm font-medium text-[#007A38]">
                Kenya Digital Connectivity · M-Pesa Verified Fulfilment
              </p>
              <h1
                className="font-display font-extrabold tracking-tight text-[#0F1F17] leading-[1.1]"
                style={{ fontSize: 'clamp(2.25rem, 4vw, 3.5rem)', textWrap: 'balance' }}
              >
                Stay Connected. Buy Safaricom Bundles Easily.
              </h1>
              <p className="text-base sm:text-lg text-[#475950] leading-relaxed max-w-xl">
                Purchase daily, weekly, monthly, and special Safaricom data packages or instant
                airtime from anywhere in Kenya. Pay securely via M-Pesa STK Push or Till/Paybill
                with transparent live order tracking.
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-1">
                <a
                  href="#bundles"
                  className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-semibold text-white bg-[#009E49] hover:bg-[#007A38] rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  Buy Bundles
                  <ArrowRight className="w-4 h-4" />
                </a>
                <a
                  href="#airtime"
                  className="inline-flex items-center gap-2 px-5 py-3.5 text-sm font-semibold text-[#0F1F17] bg-[#F8FAF9] hover:bg-[#EDF2EF] border border-[#D4DDD8] rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  Buy Airtime
                </a>
                <button
                  type="button"
                  onClick={onGoTrack}
                  className="text-sm font-medium text-[#475950] hover:text-[#007A38] underline underline-offset-4 transition-colors cursor-pointer px-2 py-2 whitespace-nowrap"
                >
                  Track an order
                </button>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="relative h-72 sm:h-96 lg:h-full min-h-[320px] rounded-xl overflow-hidden border border-[#E2E8E5] bg-[#0B1F16]">
                {!heroImgFailed ? (
                  <img
                    src={heroImage}
                    alt="Kenyan professional staying connected with Safaricom mobile data and laptop in Nairobi"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center text-white bg-gradient-to-br from-[#0B1F16] to-[#163D2B]">
                    <Wifi className="w-12 h-12 text-[#34D399] mb-3" />
                    <span className="font-display text-lg font-semibold">
                      SafBundle Kenya Connectivity
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Full-width 4-Column Structural Value Strip */}
          <div className="mt-12 pt-8 border-t border-[#E2E8E5] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-1">
              <div className="font-display font-semibold text-sm text-[#0F1F17]">
                M-Pesa STK Push &amp; Paybill
              </div>
              <p className="text-xs text-[#475950] leading-relaxed">
                Seamless mobile checkout backed by Safaricom Daraja callback verification.
              </p>
            </div>
            <div className="space-y-1">
              <div className="font-display font-semibold text-sm text-[#0F1F17]">
                Safaricom Line Validation
              </div>
              <p className="text-xs text-[#475950] leading-relaxed">
                Automatic 07xx and 011x prefix checks with double-entry confirmation.
              </p>
            </div>
            <div className="space-y-1">
              <div className="font-display font-semibold text-sm text-[#0F1F17]">
                Duplicate-Safe Fulfilment
              </div>
              <p className="text-xs text-[#475950] leading-relaxed">
                Idempotent callback processing prevents double charges or duplicate delivery.
              </p>
            </div>
            <div className="space-y-1">
              <div className="font-display font-semibold text-sm text-[#0F1F17]">
                Private Order Tracking
              </div>
              <p className="text-xs text-[#475950] leading-relaxed">
                Check real-time payment and delivery status with your unique reference.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 2. CATEGORY DIRECTORY + BUNDLE PACKAGES CATALOG */}
      <section id="bundles" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 space-y-8">
        {/* Structured Category Quick-Jump Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {CATEGORY_OVERVIEW.map((cat) => {
            const stat = categoryStats[cat.id];
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleSelectCategoryOverview(cat.id)}
                className={`text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[#F2FBF6] border-[#009E49]'
                    : 'bg-white border-[#E2E8E5] hover:border-[#B9CBC1]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-sm font-bold text-[#0F1F17]">{cat.title}</span>
                  <span className="text-xs font-mono text-[#007A38] tabular-nums">
                    {stat.minPrice !== null ? `From KES ${stat.minPrice}` : `${stat.count} plans`}
                  </span>
                </div>
                <p className="text-xs text-[#5A6D63] mt-1">
                  {cat.subtitle} · {stat.count} {stat.count === 1 ? 'package' : 'packages'}
                </p>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#0F1F17] tracking-tight">
              Safaricom Data Bundles &amp; Offers
            </h2>
            <p className="text-sm sm:text-base text-[#475950]">
              Choose a category or search below, select your preferred package, and confirm the
              Safaricom line receiving the bundle.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            {/* Live Catalog Search */}
            <div className="relative">
              <Search className="w-4 h-4 text-[#5A6D63] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search GB, validity, or name..."
                aria-label="Search Safaricom bundle packages"
                className="w-full sm:w-60 pl-9 pr-8 py-2 text-xs bg-white border border-[#D4DDD8] rounded-lg focus:outline-2 focus:outline-[#009E49]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear package search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#5A6D63] hover:text-[#0F1F17] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Category Filter Tabs + Result Count */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div
            role="tablist"
            aria-label="Bundle categories"
            className="flex flex-wrap items-center gap-1 p-1 bg-[#EDF2EF] rounded-lg border border-[#E2E8E5]"
          >
            {CATEGORY_TABS.map((tab) => {
              const active = selectedCategory === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedCategory(tab.id)}
                  className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-white text-[#0F1F17] shadow-xs'
                      : 'text-[#475950] hover:text-[#0F1F17]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {!loadingProducts && !productsError && (
            <div className="text-xs text-[#5A6D63] tabular-nums">
              Showing {filteredProducts.length}{' '}
              {filteredProducts.length === 1 ? 'package' : 'packages'}
            </div>
          )}
        </div>

        {/* Transparent Sample Catalog Disclaimer */}
        <div className="p-4 rounded-lg bg-white border border-[#E2E8E5] text-xs text-[#475950] leading-relaxed">
          <strong className="text-[#0F1F17]">Sample Development Catalog:</strong>{' '}
          {config?.sampleNotice ||
            'Packages and prices below are clearly labelled sample development items for testing. Official live rates and supplier SKUs are managed in the Admin Console.'}
        </div>

        {loadingProducts ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div
                key={n}
                className="h-52 rounded-xl bg-white border border-[#E2E8E5] p-6 animate-pulse"
              />
            ))}
          </div>
        ) : productsError ? (
          <div className="p-6 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-sm text-[#B91C1C]">
            {productsError}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-10 rounded-xl bg-white border border-[#E2E8E5] text-center space-y-3">
            <p className="text-sm text-[#475950]">
              No active packages matched your current filter or search query.
            </p>
            {(selectedCategory !== 'all' || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('all');
                  setSearchQuery('');
                }}
                className="px-4 py-2 text-xs font-semibold text-[#007A38] bg-[#F2FBF6] border border-[#B7E4C7] rounded-lg cursor-pointer"
              >
                Show All Packages
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProducts.map((product) => (
              <article
                key={product.id}
                className="bg-white border border-[#E2E8E5] rounded-xl p-6 flex flex-col justify-between transition-transform duration-150 hover:-translate-y-0.5 hover:border-[#B9CBC1]"
              >
                <div className="space-y-3">
                  {/* Unboxed Metadata with typographic separator */}
                  <div className="flex items-center justify-between gap-2 text-xs text-[#5A6D63]">
                    <span>
                      {product.isFeatured && (
                        <strong className="font-semibold text-[#007A38]">Popular · </strong>
                      )}
                      {CATEGORY_LABELS[product.category]}
                      {product.validityLabel ? ` · ${product.validityLabel}` : ''}
                    </span>
                    {product.isSample && <span>Sample Rate</span>}
                  </div>

                  <div>
                    <h3 className="font-display text-lg font-bold text-[#0F1F17]">
                      {product.name}
                    </h3>
                    {product.dataAllocation && (
                      <div className="font-display text-2xl font-extrabold text-[#007A38] mt-1">
                        {product.dataAllocation}
                      </div>
                    )}
                  </div>

                  <p className="text-sm text-[#475950] leading-relaxed">{product.description}</p>
                </div>

                <div className="pt-5 mt-5 border-t border-[#E2E8E5] flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[11px] text-[#5A6D63]">Total Price</div>
                    <div className="font-display text-xl font-bold text-[#0F1F17] tabular-nums">
                      KES {product.priceKes.toLocaleString()}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectProduct(product)}
                    className="px-4 py-2.5 text-sm font-semibold text-white bg-[#009E49] hover:bg-[#007A38] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Select Package
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* 3. SAFARICOM AIRTIME TOP-UP SECTION */}
      <section id="airtime" className="bg-white border-y border-[#E2E8E5]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-6 space-y-4">
              <p className="text-xs font-semibold text-[#007A38] uppercase tracking-wider">
                Instant Airtime Top-Up
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#0F1F17] tracking-tight">
                Buy Safaricom Airtime for Any Amount
              </h2>
              <p className="text-sm sm:text-base text-[#475950] leading-relaxed">
                Top up your own line or send airtime to family and colleagues across Kenya. Pick a
                quick preset or enter any custom amount between KES 10 and KES 10,000.
              </p>

              <div className="flex flex-wrap gap-2.5 pt-2">
                {[20, 50, 100, 250, 500, 1000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      setCustomAirtime(String(amt));
                      setAirtimeError(null);
                    }}
                    className={`px-4 py-2 text-sm font-semibold rounded-lg border transition-colors tabular-nums cursor-pointer ${
                      customAirtime === String(amt)
                        ? 'bg-[#009E49] text-white border-[#009E49]'
                        : 'bg-[#F8FAF9] text-[#0F1F17] border-[#D4DDD8] hover:border-[#009E49]'
                    }`}
                  >
                    KES {amt}
                  </button>
                ))}
              </div>
            </div>

            <form
              onSubmit={handleCustomAirtimeSubmit}
              className="lg:col-span-6 bg-[#F8FAF9] border border-[#E2E8E5] rounded-xl p-6 sm:p-8 space-y-4"
            >
              <div>
                <label
                  htmlFor="custom-airtime-input"
                  className="block text-sm font-semibold text-[#0F1F17] mb-1.5"
                >
                  Custom Airtime Amount (KES)
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    id="custom-airtime-input"
                    type="number"
                    min={10}
                    max={10000}
                    value={customAirtime}
                    onChange={(e) => setCustomAirtime(e.target.value)}
                    className="flex-1 px-4 py-3 text-base font-mono font-semibold bg-white border border-[#D4DDD8] rounded-lg focus:outline-2 focus:outline-[#009E49]"
                  />
                  <button
                    type="submit"
                    className="px-6 py-3 text-sm font-semibold text-white bg-[#009E49] hover:bg-[#007A38] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Continue to Checkout
                  </button>
                </div>
                {airtimeError && <p className="text-xs text-[#DC2626] mt-2">{airtimeError}</p>}
              </div>
              <p className="text-xs text-[#5A6D63]">
                Sample development airtime flow. Supports M-Pesa STK Push and Till/Paybill payment
                methods.
              </p>
            </form>
          </div>
        </div>
      </section>

      {/* 4. HOW IT WORKS & WHY CHOOSE US */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 space-y-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-5">
            <div className="h-72 lg:h-full min-h-[280px] rounded-xl overflow-hidden border border-[#E2E8E5] bg-[#EDF2EF]">
              {!simImgFailed ? (
                <img
                  src={simShowcaseImage}
                  alt="Safaricom 5G SIM packaging and smartphone on natural stone surface"
                  referrerPolicy="no-referrer"
                  onError={() => setSimImgFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center text-[#0F1F17]">
                  <Smartphone className="w-10 h-10 text-[#009E49] mb-2" />
                  <span className="font-display font-semibold">Mobile Data Delivery</span>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-7 flex flex-col justify-center space-y-8">
            <div className="space-y-2">
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#0F1F17] tracking-tight">
                How SafBundle Works
              </h2>
              <p className="text-[#475950]">
                From package selection to verified M-Pesa settlement in three straightforward steps.
              </p>
            </div>

            <div className="space-y-6">
              <div className="flex gap-4">
                <span className="font-mono text-sm font-bold text-[#007A38] pt-0.5 shrink-0">
                  01.
                </span>
                <div className="space-y-1">
                  <h3 className="font-display font-semibold text-base text-[#0F1F17]">
                    Select a Bundle or Airtime Amount
                  </h3>
                  <p className="text-sm text-[#475950] leading-relaxed">
                    Browse Daily, Weekly, Monthly, or Special Offer bundles—or enter any custom
                    Safaricom airtime amount.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <span className="font-mono text-sm font-bold text-[#007A38] pt-0.5 shrink-0">
                  02.
                </span>
                <div className="space-y-1">
                  <h3 className="font-display font-semibold text-base text-[#0F1F17]">
                    Enter &amp; Confirm Recipient Safaricom Number
                  </h3>
                  <p className="text-sm text-[#475950] leading-relaxed">
                    Our validator checks Safaricom prefixes (07xx and 011x) and normalizes your
                    recipient line to prevent sending data to the wrong number.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <span className="font-mono text-sm font-bold text-[#007A38] pt-0.5 shrink-0">
                  03.
                </span>
                <div className="space-y-1">
                  <h3 className="font-display font-semibold text-base text-[#0F1F17]">
                    Pay via M-Pesa &amp; Automated Fulfilment
                  </h3>
                  <p className="text-sm text-[#475950] leading-relaxed">
                    Complete the M-Pesa STK Push prompt or pay via Paybill/Till. Once Daraja
                    confirms your payment on our server, supplier fulfilment triggers automatically.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Why Choose Us Grid */}
        <div className="pt-8 border-t border-[#E2E8E5] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="p-5 bg-white border border-[#E2E8E5] rounded-xl space-y-2">
            <Zap className="w-5 h-5 text-[#009E49]" />
            <h3 className="font-display font-semibold text-sm text-[#0F1F17]">
              Automated After Payment
            </h3>
            <p className="text-xs text-[#475950] leading-relaxed">
              Fulfilment begins automatically the moment Daraja verifies your M-Pesa callback.
            </p>
          </div>
          <div className="p-5 bg-white border border-[#E2E8E5] rounded-xl space-y-2">
            <ShieldCheck className="w-5 h-5 text-[#009E49]" />
            <h3 className="font-display font-semibold text-sm text-[#0F1F17]">
              Strict Privacy &amp; PIN Safety
            </h3>
            <p className="text-xs text-[#475950] leading-relaxed">
              We never store M-Pesa PINs, and order lookup requires both reference and phone.
            </p>
          </div>
          <div className="p-5 bg-white border border-[#E2E8E5] rounded-xl space-y-2">
            <Check className="w-5 h-5 text-[#009E49]" />
            <h3 className="font-display font-semibold text-sm text-[#0F1F17]">
              Zero Duplicate Deliveries
            </h3>
            <p className="text-xs text-[#475950] leading-relaxed">
              Idempotency protection ensures callbacks never double-deliver or double-bill.
            </p>
          </div>
          <div className="p-5 bg-white border border-[#E2E8E5] rounded-xl space-y-2">
            <Headphones className="w-5 h-5 text-[#009E49]" />
            <h3 className="font-display font-semibold text-sm text-[#0F1F17]">
              Local Support Desk
            </h3>
            <p className="text-xs text-[#475950] leading-relaxed">
              Failed deliveries are surfaced immediately for our Nairobi team to resolve.
            </p>
          </div>
        </div>
      </section>

      {/* 5. FAQ & CUSTOMER SUPPORT */}
      <section id="faq" className="bg-white border-t border-[#E2E8E5]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* FAQ Accordion */}
          <div className="lg:col-span-7 space-y-6">
            <div className="space-y-2">
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#0F1F17] tracking-tight">
                Frequently Asked Questions
              </h2>
              <p className="text-sm text-[#475950]">
                Clear answers about phone validation, M-Pesa payments, and order verification.
              </p>
            </div>

            <div className="divide-y divide-[#E2E8E5] border-y border-[#E2E8E5]">
              {FAQ_ITEMS.map((item, idx) => {
                const isOpen = openFaq === idx;
                return (
                  <div key={item.question} className="py-4">
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : idx)}
                      aria-expanded={isOpen}
                      className="w-full flex items-center justify-between gap-4 text-left font-display font-semibold text-sm sm:text-base text-[#0F1F17] py-1 cursor-pointer"
                    >
                      <span>{item.question}</span>
                      <ChevronDown
                        className={`w-4 h-4 text-[#5A6D63] shrink-0 transition-transform ${
                          isOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {isOpen && (
                      <p className="mt-2.5 text-sm text-[#475950] leading-relaxed pr-6">
                        {item.answer}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Customer Support Panel */}
          <div id="support" className="lg:col-span-5">
            <div className="bg-[#F8FAF9] border border-[#E2E8E5] rounded-xl overflow-hidden">
              <div className="h-52 bg-[#EDF2EF]">
                {!supportImgFailed ? (
                  <img
                    src={supportDeskImage}
                    alt="SafBundle Nairobi customer support specialist ready to assist with bundle orders"
                    referrerPolicy="no-referrer"
                    onError={() => setSupportImgFailed(true)}
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
                  <h3 className="font-display text-lg font-bold text-[#0F1F17]">
                    Need Help With an Order?
                  </h3>
                  <p className="text-sm text-[#475950]">
                    Share your Order Reference (<span className="font-mono">SB-XXXXXX</span>) and
                    M-Pesa receipt code with our support desk.
                  </p>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-3 text-[#0F1F17]">
                    <Phone className="w-4 h-4 text-[#009E49] shrink-0" />
                    <span>{config?.supportPhone || '+254 700 000 000'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[#0F1F17]">
                    <MessageSquare className="w-4 h-4 text-[#009E49] shrink-0" />
                    <span>WhatsApp: {config?.supportWhatsapp || '+254 700 000 000'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[#0F1F17]">
                    <Mail className="w-4 h-4 text-[#009E49] shrink-0" />
                    <span>{config?.supportEmail || 'support@safbundle.co.ke'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={onGoContact}
                    className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-[#009E49] hover:bg-[#007A38] rounded-lg transition-colors cursor-pointer"
                  >
                    Contact Us
                  </button>
                  <button
                    type="button"
                    onClick={onGoTrack}
                    className="w-full py-2.5 px-4 text-sm font-semibold text-[#0F1F17] bg-white border border-[#D4DDD8] hover:bg-[#EDF2EF] rounded-lg transition-colors cursor-pointer"
                  >
                    Track Order
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
