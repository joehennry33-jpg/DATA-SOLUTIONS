import { useEffect, useState } from 'react';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { CheckoutView } from './components/CheckoutView.tsx';
import { ContactView } from './components/ContactView.tsx';
import { Footer } from './components/Footer.tsx';
import { HomeView } from './components/HomeView.tsx';
import { Navbar, type AppView } from './components/Navbar.tsx';
import { TrackOrderView } from './components/TrackOrderView.tsx';
import { testFirestoreConnection } from './lib/firebase.ts';
import type {
  BusinessPaymentConfig,
  IntegrationStatus,
  OrderRecord,
  Product,
} from './types/safbundle.ts';

function resolveViewFromPath(pathname: string): AppView {
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.startsWith('/track')) return 'track';
  if (pathname.startsWith('/contact')) return 'contact';
  if (pathname.startsWith('/checkout')) return 'checkout';
  return 'home';
}

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>(() => {
    if (typeof window !== 'undefined') {
      return resolveViewFromPath(window.location.pathname);
    }
    return 'home';
  });

  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [config, setConfig] = useState<BusinessPaymentConfig | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(null);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [customAirtimeAmount, setCustomAirtimeAmount] = useState<number | null>(null);
  const [lastOrder, setLastOrder] = useState<OrderRecord | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      setCurrentView(resolveViewFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    testFirestoreConnection();

    let cancelled = false;
    async function loadInitialData() {
      setLoadingProducts(true);
      try {
        const [prodRes, cfgRes] = await Promise.all([
          fetch('/api/products'),
          fetch('/api/config/public'),
        ]);

        if (!prodRes.ok) {
          throw new Error('Could not load bundle catalog.');
        }

        const prodData = await prodRes.json();
        const cfgData = cfgRes.ok ? await cfgRes.json() : {};

        if (!cancelled) {
          setProducts(prodData.products || []);
          setConfig(cfgData.config || null);
          setIntegrations(cfgData.integrations || null);
          setProductsError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setProductsError(
            err instanceof Error ? err.message : 'Unable to load packages right now.',
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingProducts(false);
        }
      }
    }

    loadInitialData();
    return () => {
      cancelled = true;
    };
  }, []);

  function navigate(view: AppView, sectionId?: string) {
    setCurrentView(view);
    if (typeof window !== 'undefined') {
      const targetPath = view === 'home' ? '/' : `/${view}`;
      if (window.location.pathname !== targetPath) {
        window.history.pushState({}, '', targetPath);
      }
    }

    if (sectionId) {
      setTimeout(() => {
        const el = document.getElementById(sectionId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 60);
    } else if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function handleSelectProduct(product: Product) {
    setSelectedProduct(product);
    setCustomAirtimeAmount(null);
    navigate('checkout');
  }

  function handleSelectCustomAirtime(amountKes: number) {
    setSelectedProduct({
      id: 'custom_airtime',
      name: `Sample Custom Airtime KES ${amountKes}`,
      category: 'airtime',
      dataAllocation: `KES ${amountKes} Airtime`,
      validityLabel: 'Instant Top-Up',
      description: 'Custom Safaricom airtime recharge.',
      priceKes: amountKes,
      supplierSku: 'SKU_SAMPLE_AIRTIME_CUSTOM',
      isActive: true,
      isFeatured: false,
      isSample: true,
      sortOrder: 999,
      updatedAt: new Date().toISOString(),
    });
    setCustomAirtimeAmount(amountKes);
    navigate('checkout');
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAF9] text-[#0F1F17]">
      <Navbar currentView={currentView} onNavigate={navigate} />

      <main className="flex-1">
        {currentView === 'home' && (
          <HomeView
            products={products}
            loadingProducts={loadingProducts}
            productsError={productsError}
            config={config}
            onSelectProduct={handleSelectProduct}
            onSelectCustomAirtime={handleSelectCustomAirtime}
            onGoTrack={() => navigate('track')}
            onGoContact={() => navigate('contact')}
          />
        )}

        {currentView === 'checkout' && (
          <CheckoutView
            product={selectedProduct}
            customAirtimeAmount={customAirtimeAmount}
            config={config}
            integrations={integrations}
            onBack={() => navigate('home', 'bundles')}
            onOrderCreated={(order) => setLastOrder(order)}
          />
        )}

        {currentView === 'track' && (
          <TrackOrderView
            initialOrderRef={lastOrder?.orderRef || ''}
            initialPhone={lastOrder?.recipientPhone || ''}
          />
        )}

        {currentView === 'contact' && (
          <ContactView
            config={config}
            initialOrderRef={lastOrder?.orderRef || ''}
            onGoTrack={() => navigate('track')}
          />
        )}

        {currentView === 'admin' && <AdminDashboard />}
      </main>

      <Footer config={config} onNavigate={navigate} />
    </div>
  );
}
