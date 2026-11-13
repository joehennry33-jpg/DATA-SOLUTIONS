import type { BusinessPaymentConfig } from '../types/safbundle.ts';
import type { AppView } from './Navbar.tsx';

interface FooterProps {
  config: BusinessPaymentConfig | null;
  onNavigate: (view: AppView, sectionId?: string) => void;
}

export function Footer({ config, onNavigate }: FooterProps) {
  return (
    <footer className="bg-[#0B1F16] text-[#D7E3DC] border-t border-[#1A3829]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div className="md:col-span-1 space-y-4">
            <div className="inline-flex items-center gap-2.5">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-[#009E49] text-white font-display font-bold text-sm">
                S
              </span>
              <span className="font-display text-lg font-bold text-white tracking-tight">
                SafBundle
              </span>
            </div>
            <p className="text-sm leading-relaxed text-[#9DB5A8]">
              Fast, transparent online purchasing for Safaricom data bundles and airtime across
              Kenya using M-Pesa STK Push and verified Till/Paybill payments.
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="font-display text-sm font-semibold text-white">Packages</h3>
            <ul className="space-y-2.5 text-sm text-[#9DB5A8]">
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('home', 'bundles')}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  Daily, Weekly &amp; Monthly Bundles
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('home', 'bundles')}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  Special Data Offers
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('home', 'airtime')}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  Safaricom Airtime Top-Up
                </button>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <h3 className="font-display text-sm font-semibold text-white">Customer Tools</h3>
            <ul className="space-y-2.5 text-sm text-[#9DB5A8]">
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('track')}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  Track Your Order
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('contact')}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  Contact Us
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('home', 'how-it-works')}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  How Payment Verification Works
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('home', 'faq')}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  Frequently Asked Questions
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('admin')}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  Admin Console
                </button>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <h3 className="font-display text-sm font-semibold text-white">Support Desk</h3>
            <ul className="space-y-2.5 text-sm text-[#9DB5A8]">
              <li>Phone: {config?.supportPhone || '+254 700 000 000'}</li>
              <li>WhatsApp: {config?.supportWhatsapp || '+254 700 000 000'}</li>
              <li>Email: {config?.supportEmail || 'support@safbundle.co.ke'}</li>
              <li className="text-xs text-[#7E988A] pt-1">
                Operating Hours: Daily, 6:00 AM – 11:00 PM EAT
              </li>
              <li className="pt-1">
                <button
                  type="button"
                  onClick={() => onNavigate('contact')}
                  className="text-sm font-semibold text-[#34D399] hover:text-white underline underline-offset-4 transition-colors cursor-pointer"
                >
                  Send a Support Message →
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-[#1A3829] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-[#7E988A]">
          <p>
            © {new Date().getFullYear()} SafBundle. Independent digital bundle &amp; airtime platform
            in Kenya. Not affiliated with or endorsed by Safaricom PLC.
          </p>
          <p>We never ask for or store your M-Pesa PIN.</p>
        </div>
      </div>
    </footer>
  );
}
