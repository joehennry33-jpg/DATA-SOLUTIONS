import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  AlertCircle,
  CheckCircle2,
  LogOut,
  Package,
  Plus,
  RefreshCw,
  Settings,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import { formatKenyanPhoneDisplay } from '../lib/phone.ts';
import type {
  BusinessPaymentConfig,
  ContactMessage,
  ContactStatus,
  DashboardOverview,
  OrderRecord,
  PaymentCallbackRecord,
  PaymentRecord,
  Product,
  ProductCategory,
  SupplierTransactionRecord,
} from '../types/safbundle.ts';

type AdminTab =
  | 'overview'
  | 'products'
  | 'orders'
  | 'payments'
  | 'supplier'
  | 'contact'
  | 'settings';

export function AdminDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [supplierTxs, setSupplierTxs] = useState<SupplierTransactionRecord[]>([]);
  const [callbacks, setCallbacks] = useState<PaymentCallbackRecord[]>([]);
  const [contactMessages, setContactMessages] = useState<ContactMessage[]>([]);
  const [settings, setSettings] = useState<BusinessPaymentConfig | null>(null);

  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Order filter
  const [orderFilter, setOrderFilter] = useState<'all' | 'paid' | 'pending' | 'failed'>('all');

  // Support inbox filter & active ticket
  const [contactFilter, setContactFilter] = useState<'all' | ContactStatus>('all');
  const [inspectingTicket, setInspectingTicket] = useState<ContactMessage | null>(null);
  const [ticketStatusDraft, setTicketStatusDraft] = useState<ContactStatus>('open');
  const [ticketNotesDraft, setTicketNotesDraft] = useState('');
  const [savingTicket, setSavingTicket] = useState(false);

  // Product editor state
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [savingProduct, setSavingProduct] = useState(false);

  // Order investigation drawer/panel
  const [inspectingOrder, setInspectingOrder] = useState<OrderRecord | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const fetchWithAdminToken = useCallback(
    async (url: string, init?: RequestInit) => {
      if (!user) throw new Error('Not authenticated');
      const token = await user.getIdToken();
      const res = await fetch(url, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(init?.headers || {}),
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      return data;
    },
    [user],
  );

  const loadDashboardData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setActionError(null);
    try {
      const [ov, pr, or, pa, su, cb, cm, st] = await Promise.all([
        fetchWithAdminToken('/api/admin/overview'),
        fetchWithAdminToken('/api/admin/products'),
        fetchWithAdminToken('/api/admin/orders'),
        fetchWithAdminToken('/api/admin/payments'),
        fetchWithAdminToken('/api/admin/supplier-transactions'),
        fetchWithAdminToken('/api/admin/callbacks'),
        fetchWithAdminToken('/api/admin/contact-messages'),
        fetchWithAdminToken('/api/admin/settings'),
      ]);

      setOverview(ov.overview);
      setProducts(pr.products || []);
      setOrders(or.orders || []);
      setPayments(pa.payments || []);
      setSupplierTxs(su.transactions || []);
      setCallbacks(cb.callbacks || []);
      setContactMessages(cm.messages || []);
      setSettings(st.config || null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to load admin data.');
    } finally {
      setLoading(false);
    }
  }, [user, fetchWithAdminToken]);

  useEffect(() => {
    if (user) {
      loadDashboardData();
    }
  }, [user, loadDashboardData]);

  async function handleGoogleSignIn() {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google sign-in failed.');
    }
  }

  async function handleSaveProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!editingProduct) return;
    setSavingProduct(true);
    setActionError(null);
    setActionNotice(null);

    try {
      if (editingProduct.id) {
        await fetchWithAdminToken(`/api/admin/products/${editingProduct.id}`, {
          method: 'PATCH',
          body: JSON.stringify(editingProduct),
        });
        setActionNotice('Package updated.');
      } else {
        await fetchWithAdminToken('/api/admin/products', {
          method: 'POST',
          body: JSON.stringify(editingProduct),
        });
        setActionNotice('New package created.');
      }
      setEditingProduct(null);
      await loadDashboardData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save product.');
    } finally {
      setSavingProduct(false);
    }
  }

  async function handleDeleteProduct(id: string) {
    setActionError(null);
    setActionNotice(null);
    try {
      await fetchWithAdminToken(`/api/admin/products/${id}`, { method: 'DELETE' });
      setActionNotice('Package deleted.');
      await loadDashboardData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete product.');
    }
  }

  async function handleRetryDelivery(orderId: string) {
    setActionError(null);
    setActionNotice(null);
    try {
      const res = await fetchWithAdminToken(`/api/admin/orders/${orderId}/retry-delivery`, {
        method: 'POST',
      });
      setActionNotice(res.result?.message || 'Delivery retry processed.');
      await loadDashboardData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to retry delivery.');
    }
  }

  async function handleUpdateOrderStatus(
    orderId: string,
    updates: Partial<Pick<OrderRecord, 'paymentStatus' | 'deliveryStatus' | 'failureReason'>>,
  ) {
    setActionError(null);
    setActionNotice(null);
    try {
      await fetchWithAdminToken(`/api/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      setActionNotice('Order status updated.');
      setInspectingOrder(null);
      await loadDashboardData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update order.');
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setActionError(null);
    setActionNotice(null);
    try {
      await fetchWithAdminToken('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      setActionNotice('Business payment and support configuration saved.');
      await loadDashboardData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save configuration.');
    }
  }

  function openTicketInspector(ticket: ContactMessage) {
    setInspectingTicket(ticket);
    setTicketStatusDraft(ticket.status);
    setTicketNotesDraft(ticket.adminNotes || '');
  }

  async function handleSaveTicketUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!inspectingTicket) return;
    setSavingTicket(true);
    setActionError(null);
    setActionNotice(null);
    try {
      await fetchWithAdminToken(`/api/admin/contact-messages/${inspectingTicket.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: ticketStatusDraft,
          adminNotes: ticketNotesDraft,
        }),
      });
      setActionNotice(`Updated support ticket ${inspectingTicket.ticketRef}.`);
      setInspectingTicket(null);
      await loadDashboardData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update support ticket.');
    } finally {
      setSavingTicket(false);
    }
  }

  if (!authReady) {
    return (
      <div className="max-w-md mx-auto px-4 py-24 text-center text-sm text-[#475950]">
        Checking admin session...
      </div>
    );
  }

  if (!user) {
    return (
      <section className="max-w-md mx-auto px-4 py-20">
        <div className="bg-white border border-[#E2E8E5] rounded-xl p-8 space-y-6 text-center">
          <div className="w-12 h-12 rounded-xl bg-[#F2FBF6] border border-[#C6EBD5] text-[#007A38] flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-bold text-[#0F1F17]">
              SafBundle Admin Console
            </h1>
            <p className="text-sm text-[#475950]">
              Sign in with an authorized administrator Google account to manage bundles, verify
              M-Pesa records, and investigate failed deliveries.
            </p>
          </div>

          {authError && (
            <div className="p-3 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#B91C1C] text-left">
              {authError}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full py-3 px-4 text-sm font-semibold text-white bg-[#009E49] hover:bg-[#007A38] rounded-lg transition-colors cursor-pointer"
          >
            Sign in with Google
          </button>
        </div>
      </section>
    );
  }

  const filteredOrders = orders.filter((o) => {
    if (orderFilter === 'all') return true;
    if (orderFilter === 'paid') return o.paymentStatus === 'paid';
    if (orderFilter === 'pending')
      return o.paymentStatus === 'pending' || o.paymentStatus === 'initiated';
    return o.paymentStatus === 'failed' || o.deliveryStatus === 'failed';
  });

  const openTicketCount = contactMessages.filter((m) => m.status === 'open').length;
  const filteredContactMessages = contactMessages.filter((m) =>
    contactFilter === 'all' ? true : m.status === contactFilter,
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar */}
        <aside className="lg:w-60 shrink-0 space-y-6">
          <div className="bg-white border border-[#E2E8E5] rounded-xl p-4 space-y-4">
            <div className="pb-3 border-b border-[#E2E8E5]">
              <div className="text-xs text-[#5A6D63]">Signed in as</div>
              <div className="text-sm font-semibold text-[#0F1F17] truncate">{user.email}</div>
            </div>

            <nav className="space-y-1">
              {(
                [
                  { id: 'overview', label: 'Overview' },
                  { id: 'products', label: 'Products & SKUs' },
                  { id: 'orders', label: 'Orders & Fulfilment' },
                  { id: 'payments', label: 'Payments & Callbacks' },
                  { id: 'supplier', label: 'Supplier Logs' },
                  {
                    id: 'contact',
                    label:
                      openTicketCount > 0
                        ? `Support Inbox (${openTicketCount})`
                        : 'Support Inbox',
                  },
                  { id: 'settings', label: 'Payment Config' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full text-left px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-[#F2FBF6] text-[#007A38] font-semibold'
                      : 'text-[#475950] hover:bg-[#F8FAF9] hover:text-[#0F1F17]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            <div className="pt-3 border-t border-[#E2E8E5] flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={loadDashboardData}
                disabled={loading}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#475950] hover:text-[#0F1F17] cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => signOut(auth)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#B91C1C] hover:underline cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 min-w-0 space-y-6">
          {actionError && (
            <div className="p-4 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-sm text-[#B91C1C] flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{actionError}</span>
            </div>
          )}

          {actionNotice && (
            <div className="p-4 rounded-lg bg-[#F2FBF6] border border-[#B7E4C7] text-sm text-[#007A38] flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{actionNotice}</span>
            </div>
          )}

          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && overview && (
            <div className="space-y-6">
              <h1 className="font-display text-2xl font-bold text-[#0F1F17]">
                Operations Overview
              </h1>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="bg-white border border-[#E2E8E5] rounded-xl p-5 space-y-1">
                  <div className="text-xs text-[#5A6D63]">Total Verified Sales</div>
                  <div className="font-display text-2xl font-bold text-[#0F1F17] tabular-nums">
                    KES {overview.totalSalesKes.toLocaleString()}
                  </div>
                </div>
                <div className="bg-white border border-[#E2E8E5] rounded-xl p-5 space-y-1">
                  <div className="text-xs text-[#5A6D63]">Total Orders</div>
                  <div className="font-display text-2xl font-bold text-[#0F1F17] tabular-nums">
                    {overview.totalOrders}
                  </div>
                </div>
                <div className="bg-white border border-[#E2E8E5] rounded-xl p-5 space-y-1">
                  <div className="text-xs text-[#5A6D63]">Successful Payments</div>
                  <div className="font-display text-2xl font-bold text-[#007A38] tabular-nums">
                    {overview.successfulPayments}
                  </div>
                </div>
                <div className="bg-white border border-[#E2E8E5] rounded-xl p-5 space-y-1">
                  <div className="text-xs text-[#5A6D63]">Pending Payments</div>
                  <div className="font-display text-2xl font-bold text-[#B45309] tabular-nums">
                    {overview.pendingPayments}
                  </div>
                </div>
                <div className="bg-white border border-[#E2E8E5] rounded-xl p-5 space-y-1">
                  <div className="text-xs text-[#5A6D63]">Failed Orders</div>
                  <div className="font-display text-2xl font-bold text-[#DC2626] tabular-nums">
                    {overview.failedOrders}
                  </div>
                </div>
                <div className="bg-white border border-[#E2E8E5] rounded-xl p-5 space-y-1">
                  <div className="text-xs text-[#5A6D63]">Delivered Bundles</div>
                  <div className="font-display text-2xl font-bold text-[#0F1F17] tabular-nums">
                    {overview.deliveredOrders}
                  </div>
                </div>
              </div>

              {/* External Integration Readiness */}
              <div className="bg-white border border-[#E2E8E5] rounded-xl p-6 space-y-4">
                <h2 className="font-display text-base font-bold text-[#0F1F17]">
                  External Integration Readiness
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="p-4 rounded-lg bg-[#F8FAF9] border border-[#E2E8E5] space-y-1">
                    <div className="text-xs text-[#5A6D63]">Database Persistence</div>
                    <div className="font-semibold text-[#007A38]">Firestore Connected</div>
                  </div>
                  <div className="p-4 rounded-lg bg-[#F8FAF9] border border-[#E2E8E5] space-y-1">
                    <div className="text-xs text-[#5A6D63]">Safaricom Daraja API</div>
                    <div
                      className={`font-semibold ${
                        overview.integrations.darajaConfigured
                          ? 'text-[#007A38]'
                          : 'text-[#B45309]'
                      }`}
                    >
                      {overview.integrations.darajaConfigured
                        ? `Configured (${overview.integrations.darajaEnvironment})`
                        : 'Requires Environment Configuration'}
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-[#F8FAF9] border border-[#E2E8E5] space-y-1">
                    <div className="text-xs text-[#5A6D63]">Automated Supplier API</div>
                    <div
                      className={`font-semibold ${
                        overview.integrations.supplierConfigured
                          ? 'text-[#007A38]'
                          : 'text-[#B45309]'
                      }`}
                    >
                      {overview.integrations.supplierConfigured
                        ? 'Configured'
                        : 'Requires SUPPLIER_API_URL & Key'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PRODUCTS TAB */}
          {activeTab === 'products' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h1 className="font-display text-2xl font-bold text-[#0F1F17]">
                  Bundle &amp; Airtime Catalog
                </h1>
                <button
                  type="button"
                  onClick={() =>
                    setEditingProduct({
                      name: '',
                      category: 'daily',
                      dataAllocation: '',
                      validityLabel: '24 Hours',
                      description: '',
                      priceKes: 50,
                      supplierSku: '',
                      isActive: true,
                      isFeatured: false,
                      isSample: true,
                      sortOrder: products.length * 10 + 10,
                    })
                  }
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#009E49] hover:bg-[#007A38] rounded-lg cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add Package
                </button>
              </div>

              {editingProduct && (
                <form
                  onSubmit={handleSaveProduct}
                  className="bg-white border border-[#E2E8E5] rounded-xl p-6 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-base font-bold text-[#0F1F17]">
                      {editingProduct.id ? 'Edit Package' : 'New Package'}
                    </h2>
                    <button
                      type="button"
                      onClick={() => setEditingProduct(null)}
                      className="text-xs text-[#475950] hover:text-[#0F1F17] cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-[#0F1F17] mb-1">
                        Package Name
                      </label>
                      <input
                        type="text"
                        required
                        value={editingProduct.name || ''}
                        onChange={(e) =>
                          setEditingProduct({ ...editingProduct, name: e.target.value })
                        }
                        className="w-full px-3 py-2 text-sm border border-[#D4DDD8] rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#0F1F17] mb-1">
                        Category
                      </label>
                      <select
                        value={editingProduct.category || 'daily'}
                        onChange={(e) =>
                          setEditingProduct({
                            ...editingProduct,
                            category: e.target.value as ProductCategory,
                          })
                        }
                        className="w-full px-3 py-2 text-sm border border-[#D4DDD8] rounded-lg bg-white"
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="special">Special Offer</option>
                        <option value="airtime">Airtime</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#0F1F17] mb-1">
                        Price (KES)
                      </label>
                      <input
                        type="number"
                        required
                        min={1}
                        max={100000}
                        value={editingProduct.priceKes || 1}
                        onChange={(e) =>
                          setEditingProduct({
                            ...editingProduct,
                            priceKes: Number(e.target.value),
                          })
                        }
                        className="w-full px-3 py-2 text-sm font-mono border border-[#D4DDD8] rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#0F1F17] mb-1">
                        Data Allocation / Value
                      </label>
                      <input
                        type="text"
                        value={editingProduct.dataAllocation || ''}
                        onChange={(e) =>
                          setEditingProduct({
                            ...editingProduct,
                            dataAllocation: e.target.value,
                          })
                        }
                        placeholder="e.g. 1 GB"
                        className="w-full px-3 py-2 text-sm border border-[#D4DDD8] rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#0F1F17] mb-1">
                        Validity Label
                      </label>
                      <input
                        type="text"
                        value={editingProduct.validityLabel || ''}
                        onChange={(e) =>
                          setEditingProduct({
                            ...editingProduct,
                            validityLabel: e.target.value,
                          })
                        }
                        placeholder="e.g. 24 Hours"
                        className="w-full px-3 py-2 text-sm border border-[#D4DDD8] rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#0F1F17] mb-1">
                        Supplier SKU
                      </label>
                      <input
                        type="text"
                        required
                        value={editingProduct.supplierSku || ''}
                        onChange={(e) =>
                          setEditingProduct({ ...editingProduct, supplierSku: e.target.value })
                        }
                        placeholder="SKU_SAFARICOM_1GB"
                        className="w-full px-3 py-2 text-sm font-mono border border-[#D4DDD8] rounded-lg"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#0F1F17] mb-1">
                      Description
                    </label>
                    <input
                      type="text"
                      value={editingProduct.description || ''}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, description: e.target.value })
                      }
                      className="w-full px-3 py-2 text-sm border border-[#D4DDD8] rounded-lg"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-6 text-sm">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingProduct.isActive !== false}
                        onChange={(e) =>
                          setEditingProduct({ ...editingProduct, isActive: e.target.checked })
                        }
                        className="accent-[#009E49]"
                      />
                      Active in Storefront
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingProduct.isSample !== false}
                        onChange={(e) =>
                          setEditingProduct({ ...editingProduct, isSample: e.target.checked })
                        }
                        className="accent-[#009E49]"
                      />
                      Label as Sample Product
                    </label>
                  </div>

                  <div className="flex justify-end gap-3">
                    <button
                      type="submit"
                      disabled={savingProduct}
                      className="px-5 py-2.5 text-sm font-semibold text-white bg-[#009E49] hover:bg-[#007A38] rounded-lg cursor-pointer"
                    >
                      {savingProduct ? 'Saving...' : 'Save Package'}
                    </button>
                  </div>
                </form>
              )}

              <div className="bg-white border border-[#E2E8E5] rounded-xl overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#F8FAF9] border-b border-[#E2E8E5] text-xs text-[#5A6D63]">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Package</th>
                      <th className="py-3 px-4 font-semibold">Category</th>
                      <th className="py-3 px-4 font-semibold">Supplier SKU</th>
                      <th className="py-3 px-4 font-semibold text-right">Price (KES)</th>
                      <th className="py-3 px-4 font-semibold">Status</th>
                      <th className="py-3 px-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8E5]">
                    {products.map((p) => (
                      <tr key={p.id} className="hover:bg-[#F8FAF9]">
                        <td className="py-3 px-4">
                          <div className="font-medium text-[#0F1F17]">{p.name}</div>
                          <div className="text-xs text-[#5A6D63]">
                            {p.dataAllocation} · {p.validityLabel}
                          </div>
                        </td>
                        <td className="py-3 px-4 capitalize text-[#475950]">{p.category}</td>
                        <td className="py-3 px-4 font-mono text-xs text-[#475950]">
                          {p.supplierSku}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums">
                          {p.priceKes.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-xs">
                          {p.isActive ? (
                            <span className="text-[#007A38] font-medium">Active</span>
                          ) : (
                            <span className="text-[#5A6D63]">Hidden</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap space-x-3">
                          <button
                            type="button"
                            onClick={() => setEditingProduct(p)}
                            className="text-xs font-medium text-[#007A38] hover:underline cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteProduct(p.id)}
                            aria-label={`Delete ${p.name}`}
                            className="text-xs font-medium text-[#B91C1C] hover:underline cursor-pointer inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ORDERS TAB */}
          {activeTab === 'orders' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h1 className="font-display text-2xl font-bold text-[#0F1F17]">
                  Orders &amp; Delivery Investigation
                </h1>
                <div className="flex items-center gap-1 p-1 bg-[#EDF2EF] rounded-lg border border-[#E2E8E5]">
                  {(['all', 'paid', 'pending', 'failed'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setOrderFilter(f)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md capitalize cursor-pointer ${
                        orderFilter === f ? 'bg-white text-[#0F1F17] shadow-xs' : 'text-[#475950]'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {inspectingOrder && (
                <div className="bg-white border border-[#E2E8E5] rounded-xl p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display font-bold text-base text-[#0F1F17]">
                      Investigate Order {inspectingOrder.orderRef}
                    </h2>
                    <button
                      type="button"
                      onClick={() => setInspectingOrder(null)}
                      className="text-xs text-[#475950] cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div>
                      <span className="text-[#5A6D63]">Recipient:</span>{' '}
                      <span className="font-mono">{inspectingOrder.recipientPhone}</span>
                    </div>
                    <div>
                      <span className="text-[#5A6D63]">SKU:</span>{' '}
                      <span className="font-mono">{inspectingOrder.supplierSku}</span>
                    </div>
                    <div>
                      <span className="text-[#5A6D63]">M-Pesa Ref:</span>{' '}
                      <span className="font-mono">
                        {inspectingOrder.mpesaReceiptNumber ||
                          inspectingOrder.customerSubmittedRef ||
                          'None'}
                      </span>
                    </div>
                  </div>
                  {inspectingOrder.failureReason && (
                    <p className="text-xs text-[#B91C1C]">
                      Failure Reason: {inspectingOrder.failureReason}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-3 pt-2">
                    {inspectingOrder.paymentStatus === 'paid' && (
                      <button
                        type="button"
                        onClick={() => handleRetryDelivery(inspectingOrder.id)}
                        className="px-4 py-2 text-xs font-semibold text-white bg-[#009E49] hover:bg-[#007A38] rounded-lg cursor-pointer"
                      >
                        Retry Automated Supplier Delivery
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateOrderStatus(inspectingOrder.id, {
                          deliveryStatus: 'delivered',
                          failureReason: '',
                        })
                      }
                      className="px-4 py-2 text-xs font-semibold text-[#0F1F17] bg-[#F8FAF9] border border-[#D4DDD8] hover:bg-[#EDF2EF] rounded-lg cursor-pointer"
                    >
                      Mark Manually Delivered
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateOrderStatus(inspectingOrder.id, {
                          paymentStatus: 'failed',
                          deliveryStatus: 'failed',
                        })
                      }
                      className="px-4 py-2 text-xs font-semibold text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-lg cursor-pointer"
                    >
                      Mark Failed
                    </button>
                  </div>
                </div>
              )}

              <div className="bg-white border border-[#E2E8E5] rounded-xl overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#F8FAF9] border-b border-[#E2E8E5] text-xs text-[#5A6D63]">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Ref</th>
                      <th className="py-3 px-4 font-semibold">Recipient</th>
                      <th className="py-3 px-4 font-semibold">Package</th>
                      <th className="py-3 px-4 font-semibold text-right">Amount</th>
                      <th className="py-3 px-4 font-semibold">Payment</th>
                      <th className="py-3 px-4 font-semibold">Delivery</th>
                      <th className="py-3 px-4 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8E5]">
                    {filteredOrders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-sm text-[#5A6D63]">
                          No orders match this filter yet.
                        </td>
                      </tr>
                    ) : (
                      filteredOrders.map((o) => (
                        <tr key={o.id} className="hover:bg-[#F8FAF9]">
                          <td className="py-3 px-4 font-mono text-xs font-semibold text-[#0F1F17]">
                            {o.orderRef}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-[#475950]">
                            {formatKenyanPhoneDisplay(o.recipientPhone)}
                          </td>
                          <td className="py-3 px-4 text-xs text-[#0F1F17]">{o.productName}</td>
                          <td className="py-3 px-4 text-right font-mono text-xs font-semibold tabular-nums">
                            KES {o.amountKes.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-xs capitalize">{o.paymentStatus}</td>
                          <td className="py-3 px-4 text-xs capitalize">
                            {o.deliveryStatus.replace('_', ' ')}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => setInspectingOrder(o)}
                              className="text-xs font-medium text-[#007A38] hover:underline cursor-pointer"
                            >
                              Investigate
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PAYMENTS & CALLBACKS TAB */}
          {activeTab === 'payments' && (
            <div className="space-y-8">
              <div className="space-y-4">
                <h1 className="font-display text-2xl font-bold text-[#0F1F17]">
                  M-Pesa Payment Records
                </h1>
                <div className="bg-white border border-[#E2E8E5] rounded-xl overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#F8FAF9] border-b border-[#E2E8E5] text-xs text-[#5A6D63]">
                      <tr>
                        <th className="py-3 px-4 font-semibold">Order Ref</th>
                        <th className="py-3 px-4 font-semibold">Method</th>
                        <th className="py-3 px-4 font-semibold">Payer</th>
                        <th className="py-3 px-4 font-semibold text-right">Amount</th>
                        <th className="py-3 px-4 font-semibold">Status</th>
                        <th className="py-3 px-4 font-semibold">Receipt / Ref</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8E5]">
                      {payments.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-sm text-[#5A6D63]">
                            No payment attempts recorded yet.
                          </td>
                        </tr>
                      ) : (
                        payments.map((p) => (
                          <tr key={p.id}>
                            <td className="py-3 px-4 font-mono text-xs font-semibold">
                              {p.orderRef}
                            </td>
                            <td className="py-3 px-4 text-xs capitalize">
                              {p.method.replace('_', ' ')}
                            </td>
                            <td className="py-3 px-4 font-mono text-xs text-[#475950]">
                              {p.payerPhone || '—'}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">
                              KES {p.amountKes.toLocaleString()}
                            </td>
                            <td className="py-3 px-4 text-xs capitalize">{p.status}</td>
                            <td className="py-3 px-4 font-mono text-xs text-[#475950]">
                              {p.mpesaReceiptNumber || p.customerSubmittedRef || '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="font-display text-lg font-bold text-[#0F1F17]">
                  Daraja Callback Audit Log
                </h2>
                <div className="bg-white border border-[#E2E8E5] rounded-xl overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#F8FAF9] border-b border-[#E2E8E5] text-xs text-[#5A6D63]">
                      <tr>
                        <th className="py-3 px-4 font-semibold">Type</th>
                        <th className="py-3 px-4 font-semibold">Idempotency Key</th>
                        <th className="py-3 px-4 font-semibold">Trans ID</th>
                        <th className="py-3 px-4 font-semibold text-right">Amount</th>
                        <th className="py-3 px-4 font-semibold">Received</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8E5]">
                      {callbacks.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-sm text-[#5A6D63]">
                            No Daraja webhooks received yet.
                          </td>
                        </tr>
                      ) : (
                        callbacks.map((cb) => (
                          <tr key={cb.id}>
                            <td className="py-3 px-4 text-xs">{cb.callbackType}</td>
                            <td className="py-3 px-4 font-mono text-xs">{cb.idempotencyKey}</td>
                            <td className="py-3 px-4 font-mono text-xs">{cb.transId || '—'}</td>
                            <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">
                              {cb.amountKes ? `KES ${cb.amountKes}` : '—'}
                            </td>
                            <td className="py-3 px-4 font-mono text-xs text-[#5A6D63]">
                              {new Date(cb.receivedAt).toLocaleString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* SUPPLIER TRANSACTIONS TAB */}
          {activeTab === 'supplier' && (
            <div className="space-y-4">
              <h1 className="font-display text-2xl font-bold text-[#0F1F17]">
                Supplier Fulfilment Records
              </h1>
              <div className="bg-white border border-[#E2E8E5] rounded-xl overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#F8FAF9] border-b border-[#E2E8E5] text-xs text-[#5A6D63]">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Order Ref</th>
                      <th className="py-3 px-4 font-semibold">Recipient</th>
                      <th className="py-3 px-4 font-semibold">SKU</th>
                      <th className="py-3 px-4 font-semibold">Status</th>
                      <th className="py-3 px-4 font-semibold">Supplier Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8E5]">
                    {supplierTxs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-sm text-[#5A6D63]">
                          No supplier fulfilment attempts recorded yet.
                        </td>
                      </tr>
                    ) : (
                      supplierTxs.map((tx) => (
                        <tr key={tx.id}>
                          <td className="py-3 px-4 font-mono text-xs font-semibold">
                            {tx.orderRef}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs">{tx.recipientPhone}</td>
                          <td className="py-3 px-4 font-mono text-xs">{tx.supplierSku}</td>
                          <td className="py-3 px-4 text-xs capitalize">
                            {tx.status.replace('_', ' ')}
                          </td>
                          <td className="py-3 px-4 text-xs text-[#475950]">
                            {tx.responseMessage}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SUPPORT INBOX TAB */}
          {activeTab === 'contact' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h1 className="font-display text-2xl font-bold text-[#0F1F17]">
                  Customer Support Inbox
                </h1>
                <div className="flex items-center gap-1 p-1 bg-[#EDF2EF] rounded-lg border border-[#E2E8E5]">
                  {(['all', 'open', 'in_progress', 'resolved'] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setContactFilter(status)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md capitalize cursor-pointer ${
                        contactFilter === status
                          ? 'bg-white text-[#0F1F17] shadow-xs'
                          : 'text-[#475950]'
                      }`}
                    >
                      {status.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {inspectingTicket && (
                <form
                  onSubmit={handleSaveTicketUpdate}
                  className="bg-white border border-[#E2E8E5] rounded-xl p-6 space-y-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="font-display font-bold text-base text-[#0F1F17]">
                      Ticket {inspectingTicket.ticketRef} · {inspectingTicket.name}
                    </h2>
                    <button
                      type="button"
                      onClick={() => setInspectingTicket(null)}
                      className="text-xs text-[#475950] hover:text-[#0F1F17] cursor-pointer"
                    >
                      Close
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div>
                      <span className="text-[#5A6D63]">Email:</span>{' '}
                      <span className="font-medium text-[#0F1F17]">{inspectingTicket.email}</span>
                    </div>
                    <div>
                      <span className="text-[#5A6D63]">Phone:</span>{' '}
                      <span className="font-mono text-[#0F1F17]">
                        {inspectingTicket.phone || 'Not provided'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#5A6D63]">Order Ref:</span>{' '}
                      <span className="font-mono text-[#0F1F17]">
                        {inspectingTicket.orderRef || 'None'}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-[#F8FAF9] border border-[#E2E8E5] text-sm text-[#0F1F17] whitespace-pre-wrap">
                    {inspectingTicket.message}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-[#0F1F17] mb-1">
                        Ticket Status
                      </label>
                      <select
                        value={ticketStatusDraft}
                        onChange={(e) => setTicketStatusDraft(e.target.value as ContactStatus)}
                        className="w-full px-3 py-2 text-sm border border-[#D4DDD8] rounded-lg bg-white"
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-[#0F1F17] mb-1">
                        Internal Admin Notes
                      </label>
                      <input
                        type="text"
                        maxLength={500}
                        value={ticketNotesDraft}
                        onChange={(e) => setTicketNotesDraft(e.target.value)}
                        placeholder="Record resolution steps or callback notes..."
                        className="w-full px-3 py-2 text-sm border border-[#D4DDD8] rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={savingTicket}
                      className="px-5 py-2 text-xs font-semibold text-white bg-[#009E49] hover:bg-[#007A38] disabled:opacity-60 rounded-lg cursor-pointer"
                    >
                      {savingTicket ? 'Saving...' : 'Save Ticket Update'}
                    </button>
                  </div>
                </form>
              )}

              <div className="bg-white border border-[#E2E8E5] rounded-xl overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#F8FAF9] border-b border-[#E2E8E5] text-xs text-[#5A6D63]">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Ticket</th>
                      <th className="py-3 px-4 font-semibold">Customer</th>
                      <th className="py-3 px-4 font-semibold">Topic / Order</th>
                      <th className="py-3 px-4 font-semibold">Status</th>
                      <th className="py-3 px-4 font-semibold">Received</th>
                      <th className="py-3 px-4 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8E5]">
                    {filteredContactMessages.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-sm text-[#5A6D63]">
                          No support inquiries match this filter yet.
                        </td>
                      </tr>
                    ) : (
                      filteredContactMessages.map((msg) => (
                        <tr key={msg.id} className="hover:bg-[#F8FAF9]">
                          <td className="py-3 px-4 font-mono text-xs font-semibold text-[#0F1F17]">
                            {msg.ticketRef}
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-xs font-medium text-[#0F1F17]">{msg.name}</div>
                            <div className="text-xs text-[#5A6D63]">{msg.email}</div>
                          </td>
                          <td className="py-3 px-4 text-xs text-[#475950]">
                            <div className="capitalize">{msg.topic.replace('_', ' ')}</div>
                            {msg.orderRef && (
                              <div className="font-mono text-[#007A38]">{msg.orderRef}</div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs capitalize">
                            {msg.status.replace('_', ' ')}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-[#5A6D63]">
                            {new Date(msg.createdAt).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => openTicketInspector(msg)}
                              className="text-xs font-medium text-[#007A38] hover:underline cursor-pointer"
                            >
                              Manage
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SETTINGS TAB */}
          {activeTab === 'settings' && settings && (
            <form
              onSubmit={handleSaveSettings}
              className="bg-white border border-[#E2E8E5] rounded-xl p-6 sm:p-8 space-y-6"
            >
              <div className="flex items-center gap-2.5 pb-4 border-b border-[#E2E8E5]">
                <Settings className="w-5 h-5 text-[#009E49]" />
                <h1 className="font-display text-xl font-bold text-[#0F1F17]">
                  Business Payment &amp; Support Settings
                </h1>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#0F1F17] mb-1">
                    Business Display Name
                  </label>
                  <input
                    type="text"
                    value={settings.businessName}
                    onChange={(e) => setSettings({ ...settings, businessName: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm border border-[#D4DDD8] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#0F1F17] mb-1">
                    Manual Payment Mode
                  </label>
                  <select
                    value={settings.paymentMode}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        paymentMode: e.target.value as 'till' | 'paybill',
                      })
                    }
                    className="w-full px-3.5 py-2 text-sm border border-[#D4DDD8] rounded-lg bg-white"
                  >
                    <option value="paybill">Paybill</option>
                    <option value="till">Buy Goods Till</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#0F1F17] mb-1">
                    Paybill Number
                  </label>
                  <input
                    type="text"
                    value={settings.paybillNumber}
                    onChange={(e) => setSettings({ ...settings, paybillNumber: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm font-mono border border-[#D4DDD8] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#0F1F17] mb-1">
                    Till Number
                  </label>
                  <input
                    type="text"
                    value={settings.tillNumber}
                    onChange={(e) => setSettings({ ...settings, tillNumber: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm font-mono border border-[#D4DDD8] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#0F1F17] mb-1">
                    Support Phone
                  </label>
                  <input
                    type="text"
                    value={settings.supportPhone}
                    onChange={(e) => setSettings({ ...settings, supportPhone: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm border border-[#D4DDD8] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#0F1F17] mb-1">
                    Support WhatsApp
                  </label>
                  <input
                    type="text"
                    value={settings.supportWhatsapp}
                    onChange={(e) => setSettings({ ...settings, supportWhatsapp: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm border border-[#D4DDD8] rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[#0F1F17] mb-1">
                    Support Email
                  </label>
                  <input
                    type="email"
                    required
                    value={settings.supportEmail}
                    onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm border border-[#D4DDD8] rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[#0F1F17] mb-1">
                    Catalog Disclaimer / Sample Notice
                  </label>
                  <textarea
                    rows={2}
                    value={settings.sampleNotice}
                    onChange={(e) => setSettings({ ...settings, sampleNotice: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm border border-[#D4DDD8] rounded-lg"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-6 text-sm">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.stkPushEnabled}
                    onChange={(e) => setSettings({ ...settings, stkPushEnabled: e.target.checked })}
                    className="accent-[#009E49]"
                  />
                  Enable M-Pesa STK Push Checkout
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.tillPaybillEnabled}
                    onChange={(e) =>
                      setSettings({ ...settings, tillPaybillEnabled: e.target.checked })
                    }
                    className="accent-[#009E49]"
                  />
                  Enable Till / Paybill Checkout
                </label>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-[#009E49] hover:bg-[#007A38] rounded-lg cursor-pointer"
                >
                  Save Settings
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
