import { Menu, X } from 'lucide-react';
import { useState } from 'react';

export type AppView = 'home' | 'checkout' | 'track' | 'contact' | 'admin';

interface NavbarProps {
  currentView: AppView;
  onNavigate: (view: AppView, sectionId?: string) => void;
}

export function SafBundleLogo() {
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0">
      <svg
        width="28"
        height="28"
        viewBox="0 0 28 28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="28" height="28" rx="7" fill="#009E49" />
        <path
          d="M8.5 18.5C8.5 13.8056 12.3056 10 17 10H19.5"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path
          d="M12.5 18.5C12.5 16.0147 14.5147 14 17 14H19.5"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <circle cx="18.2" cy="18.2" r="1.8" fill="white" />
      </svg>
      <span className="font-display text-xl font-bold tracking-tight text-[#0F1F17]">
        SafBundle
      </span>
    </span>
  );
}

export function Navbar({ currentView, onNavigate }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLink = (view: AppView, sectionId?: string) => {
    setMobileOpen(false);
    onNavigate(view, sectionId);
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-[#E2E8E5]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Wordmark */}
        <button
          type="button"
          onClick={() => handleLink('home')}
          className="text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#009E49] rounded-md shrink-0 cursor-pointer"
        >
          <SafBundleLogo />
        </button>

        {/* Zone 2: Clean Single-Line Nav Links */}
        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-[#475950]"
        >
          <button
            type="button"
            onClick={() => handleLink('home', 'bundles')}
            className="hover:text-[#0F1F17] hover:underline underline-offset-4 decoration-[#009E49] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Bundles
          </button>
          <button
            type="button"
            onClick={() => handleLink('home', 'airtime')}
            className="hover:text-[#0F1F17] hover:underline underline-offset-4 decoration-[#009E49] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Airtime
          </button>
          <button
            type="button"
            onClick={() => handleLink('home', 'how-it-works')}
            className="hover:text-[#0F1F17] hover:underline underline-offset-4 decoration-[#009E49] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            How It Works
          </button>
          <button
            type="button"
            onClick={() => handleLink('track')}
            className={`hover:text-[#0F1F17] hover:underline underline-offset-4 decoration-[#009E49] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              currentView === 'track' ? 'text-[#007A38] font-semibold underline' : ''
            }`}
          >
            Track Order
          </button>
          <button
            type="button"
            onClick={() => handleLink('contact')}
            className={`hover:text-[#0F1F17] hover:underline underline-offset-4 decoration-[#009E49] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              currentView === 'contact' ? 'text-[#007A38] font-semibold underline' : ''
            }`}
          >
            Contact Us
          </button>
        </nav>

        {/* Zone 3: Single Primary Action + Mobile Menu Trigger */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => handleLink('home', 'bundles')}
            className="hidden sm:inline-flex items-center justify-center px-5 py-2.5 text-sm font-semibold text-white bg-[#009E49] hover:bg-[#007A38] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009E49]"
          >
            Buy Bundles
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            className="md:hidden inline-flex items-center justify-center w-11 h-11 rounded-lg border border-[#E2E8E5] text-[#0F1F17] hover:bg-[#F1F5F3] transition-colors"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-[#E2E8E5] bg-white px-4 py-4 space-y-1">
          <button
            type="button"
            onClick={() => handleLink('home', 'bundles')}
            className="w-full text-left px-3 py-3 text-base font-medium text-[#0F1F17] hover:bg-[#F1F5F3] rounded-lg"
          >
            Data Bundles
          </button>
          <button
            type="button"
            onClick={() => handleLink('home', 'airtime')}
            className="w-full text-left px-3 py-3 text-base font-medium text-[#0F1F17] hover:bg-[#F1F5F3] rounded-lg"
          >
            Safaricom Airtime
          </button>
          <button
            type="button"
            onClick={() => handleLink('home', 'how-it-works')}
            className="w-full text-left px-3 py-3 text-base font-medium text-[#0F1F17] hover:bg-[#F1F5F3] rounded-lg"
          >
            How It Works
          </button>
          <button
            type="button"
            onClick={() => handleLink('track')}
            className={`w-full text-left px-3 py-3 text-base font-medium rounded-lg ${
              currentView === 'track'
                ? 'bg-[#F2FBF6] text-[#007A38] font-semibold'
                : 'text-[#0F1F17] hover:bg-[#F1F5F3]'
            }`}
          >
            Track Order
          </button>
          <button
            type="button"
            onClick={() => handleLink('contact')}
            className={`w-full text-left px-3 py-3 text-base font-medium rounded-lg ${
              currentView === 'contact'
                ? 'bg-[#F2FBF6] text-[#007A38] font-semibold'
                : 'text-[#0F1F17] hover:bg-[#F1F5F3]'
            }`}
          >
            Contact Us
          </button>
          <button
            type="button"
            onClick={() => handleLink('admin')}
            className="w-full text-left px-3 py-3 text-base font-medium text-[#475950] hover:bg-[#F1F5F3] rounded-lg"
          >
            Admin Console
          </button>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => handleLink('home', 'bundles')}
              className="w-full py-3 px-4 text-sm font-semibold text-white bg-[#009E49] hover:bg-[#007A38] rounded-lg"
            >
              Buy Bundles
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
