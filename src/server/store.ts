import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  BusinessPaymentConfig,
  ContactMessage,
  OrderRecord,
  PaymentCallbackRecord,
  PaymentRecord,
  Product,
  SupplierTransactionRecord,
} from '../types/safbundle.ts';
import { adminDb } from './firebaseAdmin.ts';

export interface CustomerRecord {
  id: string;
  phone: string;
  totalOrders: number;
  totalSpentKes: number;
  createdAt: string;
  lastOrderAt: string;
}

interface LocalStoreState {
  products: Record<string, Product>;
  customers: Record<string, CustomerRecord>;
  orders: Record<string, OrderRecord & { idempotencyKey?: string }>;
  payments: Record<string, PaymentRecord>;
  supplierTransactions: Record<string, SupplierTransactionRecord>;
  paymentCallbackRecords: Record<string, PaymentCallbackRecord>;
  contactMessages: Record<string, ContactMessage>;
  settings: {
    paymentConfig?: BusinessPaymentConfig;
  };
}

const DATA_DIR = process.env.VERCEL
  ? path.join('/tmp', '.data')
  : path.resolve(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'safbundle-store.json');

let firestoreAvailable: boolean | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function createEmptyState(): LocalStoreState {
  return {
    products: {},
    customers: {},
    orders: {},
    payments: {},
    supplierTransactions: {},
    paymentCallbackRecords: {},
    contactMessages: {},
    settings: {},
  };
}

async function detectFirestoreAvailability(): Promise<boolean> {
  if (firestoreAvailable !== null) return firestoreAvailable;
  try {
    await adminDb.collection('settings').doc('paymentConfig').get();
    firestoreAvailable = true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('PERMISSION_DENIED') || msg.includes('Could not load the default credentials')) {
      firestoreAvailable = false;
    } else {
      firestoreAvailable = false;
    }
  }
  return firestoreAvailable;
}

async function readLocalState(): Promise<LocalStoreState> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<LocalStoreState>;
    return {
      products: parsed.products || {},
      customers: parsed.customers || {},
      orders: parsed.orders || {},
      payments: parsed.payments || {},
      supplierTransactions: parsed.supplierTransactions || {},
      paymentCallbackRecords: parsed.paymentCallbackRecords || {},
      contactMessages: parsed.contactMessages || {},
      settings: parsed.settings || {},
    };
  } catch {
    return createEmptyState();
  }
}

async function mutateLocalState<T>(mutator: (state: LocalStoreState) => T | Promise<T>): Promise<T> {
  let result!: T;
  const run = async () => {
    const state = await readLocalState();
    result = await mutator(state);
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tempFile = `${DATA_FILE}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(state, null, 2), 'utf8');
    await fs.rename(tempFile, DATA_FILE);
  };
  writeQueue = writeQueue.then(run, run);
  await writeQueue;
  return result;
}

export async function checkStoreHealth(): Promise<{ mode: 'firestore' | 'local-persistent' }> {
  const useFs = await detectFirestoreAvailability();
  if (useFs) {
    await adminDb.collection('settings').doc('paymentConfig').get();
    return { mode: 'firestore' };
  }
  await readLocalState();
  return { mode: 'local-persistent' };
}

export async function getPaymentConfig(): Promise<BusinessPaymentConfig | null> {
  if (await detectFirestoreAvailability()) {
    const snap = await adminDb.collection('settings').doc('paymentConfig').get();
    return snap.exists ? (snap.data() as BusinessPaymentConfig) : null;
  }
  const state = await readLocalState();
  return state.settings.paymentConfig || null;
}

export async function savePaymentConfig(config: BusinessPaymentConfig): Promise<void> {
  if (await detectFirestoreAvailability()) {
    await adminDb.collection('settings').doc('paymentConfig').set(config);
    return;
  }
  await mutateLocalState((state) => {
    state.settings.paymentConfig = config;
  });
}

export async function listProducts(onlyActive = false): Promise<Product[]> {
  if (await detectFirestoreAvailability()) {
    const snap = onlyActive
      ? await adminDb.collection('products').where('isActive', '==', true).get()
      : await adminDb.collection('products').get();
    return snap.docs
      .map((d) => d.data() as Product)
      .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
  }
  const state = await readLocalState();
  return Object.values(state.products)
    .filter((p) => (onlyActive ? p.isActive : true))
    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
}

export async function getProductById(id: string): Promise<Product | null> {
  if (await detectFirestoreAvailability()) {
    const snap = await adminDb.collection('products').doc(id).get();
    return snap.exists ? (snap.data() as Product) : null;
  }
  const state = await readLocalState();
  return state.products[id] || null;
}

export async function saveProduct(product: Product): Promise<void> {
  if (await detectFirestoreAvailability()) {
    await adminDb.collection('products').doc(product.id).set(product);
    return;
  }
  await mutateLocalState((state) => {
    state.products[product.id] = product;
  });
}

export async function deleteProductById(id: string): Promise<boolean> {
  if (await detectFirestoreAvailability()) {
    const ref = adminDb.collection('products').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return false;
    await ref.delete();
    return true;
  }
  return mutateLocalState((state) => {
    if (!state.products[id]) return false;
    delete state.products[id];
    return true;
  });
}

export async function upsertCustomerOrderCount(phone: string, now: string): Promise<void> {
  if (await detectFirestoreAvailability()) {
    const customerRef = adminDb.collection('customers').doc(phone);
    const customerSnap = await customerRef.get();
    if (customerSnap.exists) {
      const current = customerSnap.data() as { totalOrders?: number };
      await customerRef.update({
        totalOrders: (current.totalOrders || 0) + 1,
        lastOrderAt: now,
      });
    } else {
      await customerRef.set({
        id: phone,
        phone,
        totalOrders: 1,
        totalSpentKes: 0,
        createdAt: now,
        lastOrderAt: now,
      });
    }
    return;
  }

  await mutateLocalState((state) => {
    const existing = state.customers[phone];
    if (existing) {
      existing.totalOrders += 1;
      existing.lastOrderAt = now;
    } else {
      state.customers[phone] = {
        id: phone,
        phone,
        totalOrders: 1,
        totalSpentKes: 0,
        createdAt: now,
        lastOrderAt: now,
      };
    }
  });
}

export async function incrementCustomerSpend(phone: string, amountKes: number): Promise<void> {
  if (await detectFirestoreAvailability()) {
    const custRef = adminDb.collection('customers').doc(phone);
    const custSnap = await custRef.get();
    if (custSnap.exists) {
      const prev = Number(custSnap.data()?.totalSpentKes || 0);
      await custRef.update({ totalSpentKes: prev + amountKes });
    }
    return;
  }
  await mutateLocalState((state) => {
    const existing = state.customers[phone];
    if (existing) {
      existing.totalSpentKes = (existing.totalSpentKes || 0) + amountKes;
    }
  });
}

export async function createOrderRecord(
  order: OrderRecord & { idempotencyKey?: string },
): Promise<void> {
  if (await detectFirestoreAvailability()) {
    await adminDb.collection('orders').doc(order.id).set(order);
    return;
  }
  await mutateLocalState((state) => {
    state.orders[order.id] = order;
  });
}

export async function updateOrderRecord(
  id: string,
  patch: Partial<OrderRecord>,
): Promise<OrderRecord | null> {
  if (await detectFirestoreAvailability()) {
    const ref = adminDb.collection('orders').doc(id);
    await ref.update(patch);
    const snap = await ref.get();
    return snap.exists ? (snap.data() as OrderRecord) : null;
  }
  return mutateLocalState((state) => {
    const existing = state.orders[id];
    if (!existing) return null;
    const updated = { ...existing, ...patch };
    state.orders[id] = updated;
    return updated;
  });
}

export async function findOrderById(id: string): Promise<OrderRecord | null> {
  if (await detectFirestoreAvailability()) {
    const snap = await adminDb.collection('orders').doc(id).get();
    return snap.exists ? (snap.data() as OrderRecord) : null;
  }
  const state = await readLocalState();
  return state.orders[id] || null;
}

export async function findOrderByRef(orderRef: string): Promise<OrderRecord | null> {
  if (await detectFirestoreAvailability()) {
    const snap = await adminDb
      .collection('orders')
      .where('orderRef', '==', orderRef)
      .limit(1)
      .get();
    return snap.empty ? null : (snap.docs[0].data() as OrderRecord);
  }
  const state = await readLocalState();
  return Object.values(state.orders).find((o) => o.orderRef === orderRef) || null;
}

export async function findOrderByIdempotencyKey(key: string): Promise<OrderRecord | null> {
  if (await detectFirestoreAvailability()) {
    const snap = await adminDb
      .collection('orders')
      .where('idempotencyKey', '==', key)
      .limit(1)
      .get();
    return snap.empty ? null : (snap.docs[0].data() as OrderRecord);
  }
  const state = await readLocalState();
  return Object.values(state.orders).find((o) => o.idempotencyKey === key) || null;
}

export async function findOrderByCheckoutRequestId(id: string): Promise<OrderRecord | null> {
  if (await detectFirestoreAvailability()) {
    const snap = await adminDb
      .collection('orders')
      .where('checkoutRequestId', '==', id)
      .limit(1)
      .get();
    return snap.empty ? null : (snap.docs[0].data() as OrderRecord);
  }
  const state = await readLocalState();
  return Object.values(state.orders).find((o) => o.checkoutRequestId === id) || null;
}

export async function findOrderBySubmittedRef(ref: string): Promise<OrderRecord | null> {
  if (await detectFirestoreAvailability()) {
    const snap = await adminDb
      .collection('orders')
      .where('customerSubmittedRef', '==', ref)
      .limit(1)
      .get();
    return snap.empty ? null : (snap.docs[0].data() as OrderRecord);
  }
  const state = await readLocalState();
  return Object.values(state.orders).find((o) => o.customerSubmittedRef === ref) || null;
}

export async function listOrders(): Promise<OrderRecord[]> {
  if (await detectFirestoreAvailability()) {
    const snap = await adminDb.collection('orders').get();
    return snap.docs
      .map((d) => d.data() as OrderRecord)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const state = await readLocalState();
  return Object.values(state.orders).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createPaymentRecord(payment: PaymentRecord): Promise<void> {
  if (await detectFirestoreAvailability()) {
    await adminDb.collection('payments').doc(payment.id).set(payment);
    return;
  }
  await mutateLocalState((state) => {
    state.payments[payment.id] = payment;
  });
}

export async function updatePaymentByOrderId(
  orderId: string,
  patch: Partial<PaymentRecord>,
): Promise<void> {
  if (await detectFirestoreAvailability()) {
    const snap = await adminDb
      .collection('payments')
      .where('orderId', '==', orderId)
      .limit(1)
      .get();
    if (!snap.empty) {
      await snap.docs[0].ref.update(patch);
    }
    return;
  }
  await mutateLocalState((state) => {
    const match = Object.values(state.payments).find((p) => p.orderId === orderId);
    if (match) {
      state.payments[match.id] = { ...match, ...patch };
    }
  });
}

export async function updatePaymentByCheckoutRequestId(
  checkoutRequestId: string,
  patch: Partial<PaymentRecord>,
): Promise<void> {
  if (await detectFirestoreAvailability()) {
    const snap = await adminDb
      .collection('payments')
      .where('checkoutRequestId', '==', checkoutRequestId)
      .limit(1)
      .get();
    if (!snap.empty) {
      await snap.docs[0].ref.update(patch);
    }
    return;
  }
  await mutateLocalState((state) => {
    const match = Object.values(state.payments).find(
      (p) => p.checkoutRequestId === checkoutRequestId,
    );
    if (match) {
      state.payments[match.id] = { ...match, ...patch };
    }
  });
}

export async function listPayments(): Promise<PaymentRecord[]> {
  if (await detectFirestoreAvailability()) {
    const snap = await adminDb.collection('payments').get();
    return snap.docs
      .map((d) => d.data() as PaymentRecord)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const state = await readLocalState();
  return Object.values(state.payments).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listSupplierTransactionsByOrder(
  orderId: string,
): Promise<SupplierTransactionRecord[]> {
  if (await detectFirestoreAvailability()) {
    const snap = await adminDb
      .collection('supplierTransactions')
      .where('orderId', '==', orderId)
      .get();
    return snap.docs.map((d) => d.data() as SupplierTransactionRecord);
  }
  const state = await readLocalState();
  return Object.values(state.supplierTransactions).filter((tx) => tx.orderId === orderId);
}

export async function listSupplierTransactions(): Promise<SupplierTransactionRecord[]> {
  if (await detectFirestoreAvailability()) {
    const snap = await adminDb.collection('supplierTransactions').get();
    return snap.docs
      .map((d) => d.data() as SupplierTransactionRecord)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const state = await readLocalState();
  return Object.values(state.supplierTransactions).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export async function createSupplierTransaction(
  tx: SupplierTransactionRecord,
): Promise<void> {
  if (await detectFirestoreAvailability()) {
    await adminDb.collection('supplierTransactions').doc(tx.id).set(tx);
    return;
  }
  await mutateLocalState((state) => {
    state.supplierTransactions[tx.id] = tx;
  });
}

export async function updateSupplierTransaction(
  id: string,
  patch: Partial<SupplierTransactionRecord>,
): Promise<void> {
  if (await detectFirestoreAvailability()) {
    await adminDb.collection('supplierTransactions').doc(id).update(patch);
    return;
  }
  await mutateLocalState((state) => {
    const existing = state.supplierTransactions[id];
    if (existing) {
      state.supplierTransactions[id] = { ...existing, ...patch };
    }
  });
}

export async function recordCallbackIdempotent(
  record: PaymentCallbackRecord,
): Promise<boolean> {
  if (await detectFirestoreAvailability()) {
    const cbRef = adminDb.collection('paymentCallbackRecords').doc(record.id);
    return adminDb.runTransaction(async (tx) => {
      const existing = await tx.get(cbRef);
      if (existing.exists && existing.data()?.processed === true) {
        return true;
      }
      tx.set(cbRef, record);
      return false;
    });
  }
  return mutateLocalState((state) => {
    const existing = state.paymentCallbackRecords[record.id];
    if (existing && existing.processed) {
      return true;
    }
    state.paymentCallbackRecords[record.id] = record;
    return false;
  });
}

export async function saveCallbackRecord(record: PaymentCallbackRecord): Promise<void> {
  if (await detectFirestoreAvailability()) {
    await adminDb.collection('paymentCallbackRecords').doc(record.id).set(record);
    return;
  }
  await mutateLocalState((state) => {
    state.paymentCallbackRecords[record.id] = record;
  });
}

export async function listCallbacks(): Promise<PaymentCallbackRecord[]> {
  if (await detectFirestoreAvailability()) {
    const snap = await adminDb.collection('paymentCallbackRecords').get();
    return snap.docs
      .map((d) => d.data() as PaymentCallbackRecord)
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  }
  const state = await readLocalState();
  return Object.values(state.paymentCallbackRecords).sort((a, b) =>
    b.receivedAt.localeCompare(a.receivedAt),
  );
}

export async function createContactMessage(msg: ContactMessage): Promise<void> {
  if (await detectFirestoreAvailability()) {
    await adminDb.collection('contactMessages').doc(msg.id).set(msg);
    return;
  }
  await mutateLocalState((state) => {
    state.contactMessages[msg.id] = msg;
  });
}

export async function listContactMessages(): Promise<ContactMessage[]> {
  if (await detectFirestoreAvailability()) {
    const snap = await adminDb.collection('contactMessages').get();
    return snap.docs
      .map((d) => d.data() as ContactMessage)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const state = await readLocalState();
  return Object.values(state.contactMessages).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export async function updateContactMessage(
  id: string,
  patch: Partial<Pick<ContactMessage, 'status' | 'adminNotes' | 'updatedAt'>>,
): Promise<ContactMessage | null> {
  if (await detectFirestoreAvailability()) {
    const ref = adminDb.collection('contactMessages').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return null;
    await ref.update(patch);
    const updated = await ref.get();
    return updated.data() as ContactMessage;
  }
  return mutateLocalState((state) => {
    const existing = state.contactMessages[id];
    if (!existing) return null;
    const updated = { ...existing, ...patch };
    state.contactMessages[id] = updated;
    return updated;
  });
}
