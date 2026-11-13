export type ProductCategory = 'daily' | 'weekly' | 'monthly' | 'special' | 'airtime';

export type PaymentMethod = 'stk_push' | 'till_paybill';

export type PaymentStatus = 'pending' | 'initiated' | 'paid' | 'failed' | 'cancelled';

export type DeliveryStatus = 'awaiting_payment' | 'pending' | 'processing' | 'delivered' | 'failed';

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  dataAllocation: string;
  validityLabel: string;
  description: string;
  priceKes: number;
  supplierSku: string;
  isActive: boolean;
  isFeatured: boolean;
  isSample: boolean;
  sortOrder: number;
  updatedAt: string;
}

export interface OrderRecord {
  id: string;
  orderRef: string;
  trackingToken?: string;
  customerId: string;
  productId: string;
  productName: string;
  category: ProductCategory;
  supplierSku: string;
  recipientPhone: string;
  mpesaPhone?: string;
  amountKes: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  deliveryStatus: DeliveryStatus;
  mpesaReceiptNumber?: string;
  checkoutRequestId?: string;
  customerSubmittedRef?: string;
  supplierTransactionId?: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentRecord {
  id: string;
  orderId: string;
  orderRef: string;
  method: PaymentMethod;
  payerPhone?: string;
  amountKes: number;
  status: PaymentStatus;
  merchantRequestId?: string;
  checkoutRequestId?: string;
  mpesaReceiptNumber?: string;
  customerSubmittedRef?: string;
  resultCode?: string;
  resultDesc?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierTransactionRecord {
  id: string;
  orderId: string;
  orderRef: string;
  recipientPhone: string;
  supplierSku: string;
  amountKes: number;
  status: 'pending_configuration' | 'processing' | 'delivered' | 'failed';
  supplierReference?: string;
  responseMessage: string;
  attemptNumber: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentCallbackRecord {
  id: string;
  callbackType: 'stk_callback' | 'c2b_validation' | 'c2b_confirmation';
  idempotencyKey: string;
  checkoutRequestId?: string;
  transId?: string;
  amountKes?: number;
  resultCode?: string;
  processed: boolean;
  receivedAt: string;
}

export interface BusinessPaymentConfig {
  businessName: string;
  paymentMode: 'till' | 'paybill';
  tillNumber: string;
  paybillNumber: string;
  accountPrefix: string;
  stkPushEnabled: boolean;
  tillPaybillEnabled: boolean;
  supportPhone: string;
  supportWhatsapp: string;
  supportEmail: string;
  sampleNotice: string;
  updatedAt: string;
}

export interface IntegrationStatus {
  databaseConnected: boolean;
  darajaConfigured: boolean;
  darajaEnvironment: 'sandbox' | 'production' | 'unconfigured';
  supplierConfigured: boolean;
}

export interface DashboardOverview {
  totalSalesKes: number;
  totalOrders: number;
  successfulPayments: number;
  pendingPayments: number;
  failedOrders: number;
  deliveredOrders: number;
  failedDeliveries: number;
  integrations: IntegrationStatus;
}

export type ContactTopic =
  | 'order_issue'
  | 'mpesa_payment'
  | 'bundle_delivery'
  | 'partnership'
  | 'general';

export type ContactStatus = 'open' | 'in_progress' | 'resolved';

export interface ContactMessage {
  id: string;
  ticketRef: string;
  name: string;
  email: string;
  phone?: string;
  topic: ContactTopic;
  orderRef?: string;
  message: string;
  status: ContactStatus;
  adminNotes?: string;
  createdAt: string;
  updatedAt: string;
}
