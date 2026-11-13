import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import { isValidKenyanMpesaPhone, normalizeSafaricomPhone } from './src/lib/phone.ts';
import {
  getDarajaConfigStatus,
  initiateDarajaStkPush,
  parseDarajaC2bConfirmation,
  parseDarajaStkCallback,
  verifyDarajaWebhookRequest,
} from './src/server/daraja.ts';
import { requireAdmin, type AdminRequest } from './src/server/firebaseAdmin.ts';
import { createRateLimiter } from './src/server/rateLimit.ts';
import { DEFAULT_PAYMENT_CONFIG, ensureSeededDatabase } from './src/server/seed.ts';
import {
  checkStoreHealth,
  createContactMessage,
  createOrderRecord,
  createPaymentRecord,
  deleteProductById,
  findOrderByCheckoutRequestId,
  findOrderById,
  findOrderByIdempotencyKey,
  findOrderByRef,
  findOrderBySubmittedRef,
  getPaymentConfig,
  getProductById,
  incrementCustomerSpend,
  listCallbacks,
  listContactMessages,
  listOrders,
  listPayments,
  listProducts,
  listSupplierTransactions,
  recordCallbackIdempotent,
  saveCallbackRecord,
  savePaymentConfig,
  saveProduct,
  updateContactMessage,
  updateOrderRecord,
  updatePaymentByCheckoutRequestId,
  updatePaymentByOrderId,
  upsertCustomerOrderCount,
} from './src/server/store.ts';
import { dispatchSupplierDelivery, getSupplierConfigStatus } from './src/server/supplier.ts';
import type {
  BusinessPaymentConfig,
  ContactMessage,
  ContactTopic,
  DashboardOverview,
  OrderRecord,
  PaymentMethod,
  Product,
  ProductCategory,
} from './src/types/safbundle.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '1mb' }));

// Security headers (preserve iframe embedding in AI Studio preview)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

const orderLimiter = createRateLimiter({
  keyPrefix: 'orders',
  windowMs: 60 * 1000,
  maxRequests: 15,
  message: 'Too many order attempts. Please wait a minute before trying again.',
});

const paymentLimiter = createRateLimiter({
  keyPrefix: 'payments',
  windowMs: 60 * 1000,
  maxRequests: 15,
  message: 'Too many payment requests. Please wait a minute before retrying.',
});

const trackLimiter = createRateLimiter({
  keyPrefix: 'track',
  windowMs: 60 * 1000,
  maxRequests: 30,
  message: 'Too many order lookup requests. Please wait a moment.',
});

const adminLimiter = createRateLimiter({
  keyPrefix: 'admin',
  windowMs: 60 * 1000,
  maxRequests: 120,
});

const contactLimiter = createRateLimiter({
  keyPrefix: 'contact',
  windowMs: 60 * 1000,
  maxRequests: 10,
  message: 'Too many contact requests. Please wait a minute before sending another message.',
});

function getAppBaseUrl(req: express.Request): string {
  if (process.env.APP_URL?.trim()) {
    return process.env.APP_URL.trim().replace(/\/+$/, '');
  }
  const proto = req.header('x-forwarded-proto') || req.protocol || 'http';
  const host = req.header('x-forwarded-host') || req.header('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

function generateOrderRef(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    suffix += chars[bytes[i] % chars.length];
  }
  return `SB-${suffix}`;
}

function getIntegrationStatus() {
  const daraja = getDarajaConfigStatus();
  const supplier = getSupplierConfigStatus();
  return {
    databaseConnected: true,
    darajaConfigured: daraja.configured,
    darajaEnvironment: daraja.environment,
    supplierConfigured: supplier.configured,
  };
}

// =============================================================================
// PUBLIC API ROUTES
// =============================================================================

app.get('/api/health', async (_req, res) => {
  try {
    await ensureSeededDatabase();
    await checkStoreHealth();
    res.json({
      ok: true,
      integrations: getIntegrationStatus(),
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      ok: false,
      error: 'Database connectivity check failed.',
    });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    await ensureSeededDatabase();
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    let products = await listProducts(true);

    if (category && ['daily', 'weekly', 'monthly', 'special', 'airtime'].includes(category)) {
      products = products.filter((p) => p.category === category);
    }

    res.json({ products });
  } catch (error) {
    console.error('Failed to load products:', error);
    res.status(500).json({ error: 'Unable to load bundle catalog right now.' });
  }
});

app.get('/api/config/public', async (_req, res) => {
  try {
    await ensureSeededDatabase();
    const config = (await getPaymentConfig()) || DEFAULT_PAYMENT_CONFIG;
    res.json({
      config,
      integrations: getIntegrationStatus(),
    });
  } catch (error) {
    console.error('Failed to load public config:', error);
    res.status(500).json({ error: 'Unable to load payment configuration.' });
  }
});

app.post('/api/orders', orderLimiter, async (req, res) => {
  try {
    await ensureSeededDatabase();
    const body = req.body as {
      productId?: string;
      recipientPhone?: string;
      confirmPhone?: string;
      paymentMethod?: PaymentMethod;
      mpesaPhone?: string;
      customAmountKes?: number;
      idempotencyKey?: string;
    };

    const productId = String(body.productId || '').trim();
    const paymentMethod = body.paymentMethod;
    const idempotencyKey = body.idempotencyKey
      ? String(body.idempotencyKey).trim().slice(0, 128)
      : '';

    if (!productId) {
      res.status(400).json({ error: 'Please select a bundle or airtime package.' });
      return;
    }

    if (paymentMethod !== 'stk_push' && paymentMethod !== 'till_paybill') {
      res
        .status(400)
        .json({ error: 'Select a valid payment method (M-Pesa STK Push or Till/Paybill).' });
      return;
    }

    const recipientResult = normalizeSafaricomPhone(String(body.recipientPhone || ''));
    if (!recipientResult.valid || !recipientResult.normalized) {
      res.status(400).json({ error: recipientResult.error || 'Invalid Safaricom recipient number.' });
      return;
    }

    const confirmResult = normalizeSafaricomPhone(String(body.confirmPhone || ''));
    if (!confirmResult.valid || !confirmResult.normalized) {
      res
        .status(400)
        .json({ error: confirmResult.error || 'Please confirm the Safaricom recipient number.' });
      return;
    }

    if (recipientResult.normalized !== confirmResult.normalized) {
      res
        .status(400)
        .json({ error: 'Recipient phone number and confirmation phone number do not match.' });
      return;
    }

    let normalizedMpesaPhone: string | undefined;
    if (paymentMethod === 'stk_push') {
      const mpesaResult = isValidKenyanMpesaPhone(
        String(body.mpesaPhone || body.recipientPhone || ''),
      );
      if (!mpesaResult.valid || !mpesaResult.normalized) {
        res.status(400).json({ error: mpesaResult.error || 'Enter a valid M-Pesa phone number.' });
        return;
      }
      normalizedMpesaPhone = mpesaResult.normalized;
    }

    if (idempotencyKey) {
      const existingOrder = await findOrderByIdempotencyKey(idempotencyKey);
      if (existingOrder) {
        res.status(200).json({
          order: existingOrder,
          duplicate: true,
        });
        return;
      }
    }

    let resolvedProductName = '';
    let resolvedCategory: ProductCategory = 'daily';
    let resolvedSku = '';
    let resolvedAmountKes = 0;

    if (productId === 'custom_airtime') {
      const amt = Math.round(Number(body.customAmountKes));
      if (!Number.isFinite(amt) || amt < 10 || amt > 10000) {
        res.status(400).json({ error: 'Custom airtime amount must be between KES 10 and KES 10,000.' });
        return;
      }
      resolvedProductName = `Sample Custom Airtime KES ${amt}`;
      resolvedCategory = 'airtime';
      resolvedSku = 'SKU_SAMPLE_AIRTIME_CUSTOM';
      resolvedAmountKes = amt;
    } else {
      const product = await getProductById(productId);
      if (!product) {
        res.status(404).json({ error: 'Selected bundle package was not found.' });
        return;
      }
      if (!product.isActive) {
        res.status(400).json({ error: 'Selected bundle package is currently unavailable.' });
        return;
      }
      resolvedProductName = product.name;
      resolvedCategory = product.category;
      resolvedSku = product.supplierSku;
      resolvedAmountKes = product.priceKes;
    }

    const now = new Date().toISOString();
    const orderRef = generateOrderRef();
    const orderId = `ord_${crypto.randomBytes(8).toString('hex')}`;
    const trackingToken = crypto.randomBytes(16).toString('hex');
    const customerId = recipientResult.normalized;

    await upsertCustomerOrderCount(customerId, now);

    const orderDoc: OrderRecord & { idempotencyKey?: string } = {
      id: orderId,
      orderRef,
      trackingToken,
      customerId,
      productId,
      productName: resolvedProductName,
      category: resolvedCategory,
      supplierSku: resolvedSku,
      recipientPhone: recipientResult.normalized,
      ...(normalizedMpesaPhone ? { mpesaPhone: normalizedMpesaPhone } : {}),
      amountKes: resolvedAmountKes,
      paymentMethod,
      paymentStatus: 'pending',
      deliveryStatus: 'awaiting_payment',
      ...(idempotencyKey ? { idempotencyKey } : {}),
      createdAt: now,
      updatedAt: now,
    };

    await createOrderRecord(orderDoc);

    let stkOutcome: {
      configured: boolean;
      success: boolean;
      message: string;
      checkoutRequestId?: string;
    } | null = null;

    if (paymentMethod === 'stk_push' && normalizedMpesaPhone) {
      const callbackUrl =
        process.env.DARAJA_CALLBACK_URL?.trim() ||
        `${getAppBaseUrl(req)}/api/webhooks/daraja/stk-callback`;

      const stkResult = await initiateDarajaStkPush({
        orderRef,
        mpesaPhone: normalizedMpesaPhone,
        amountKes: resolvedAmountKes,
        accountReference: orderRef,
        transactionDesc: `SafBundle ${orderRef}`,
        callbackUrl,
      });

      const paymentId = `pay_${crypto.randomBytes(8).toString('hex')}`;
      if (stkResult.success && stkResult.checkoutRequestId) {
        await createPaymentRecord({
          id: paymentId,
          orderId,
          orderRef,
          method: 'stk_push',
          payerPhone: normalizedMpesaPhone,
          amountKes: resolvedAmountKes,
          status: 'initiated',
          merchantRequestId: stkResult.merchantRequestId || '',
          checkoutRequestId: stkResult.checkoutRequestId,
          resultDesc: stkResult.customerMessage || 'STK Push sent',
          createdAt: now,
          updatedAt: now,
        });

        await updateOrderRecord(orderId, {
          paymentStatus: 'initiated',
          checkoutRequestId: stkResult.checkoutRequestId,
          updatedAt: new Date().toISOString(),
        });

        orderDoc.paymentStatus = 'initiated';
        orderDoc.checkoutRequestId = stkResult.checkoutRequestId;
      } else {
        await createPaymentRecord({
          id: paymentId,
          orderId,
          orderRef,
          method: 'stk_push',
          payerPhone: normalizedMpesaPhone,
          amountKes: resolvedAmountKes,
          status: 'pending',
          resultDesc: stkResult.errorMessage || 'Daraja STK Push unavailable',
          createdAt: now,
          updatedAt: now,
        });
      }

      stkOutcome = {
        configured: stkResult.configured,
        success: stkResult.success,
        message:
          stkResult.customerMessage || stkResult.errorMessage || 'STK Push request processed.',
        checkoutRequestId: stkResult.checkoutRequestId,
      };
    } else {
      const paymentId = `pay_${crypto.randomBytes(8).toString('hex')}`;
      await createPaymentRecord({
        id: paymentId,
        orderId,
        orderRef,
        method: 'till_paybill',
        payerPhone: recipientResult.normalized,
        amountKes: resolvedAmountKes,
        status: 'pending',
        resultDesc: 'Awaiting Daraja C2B payment confirmation callback',
        createdAt: now,
        updatedAt: now,
      });
    }

    res.status(201).json({
      order: orderDoc,
      stkPush: stkOutcome,
    });
  } catch (error) {
    console.error('Order creation error:', error);
    res.status(500).json({ error: 'Unable to create order. Please try again.' });
  }
});

app.post('/api/payments/stk-push', paymentLimiter, async (req, res) => {
  try {
    const body = req.body as {
      orderRef?: string;
      trackingToken?: string;
      mpesaPhone?: string;
    };

    const orderRef = String(body.orderRef || '').trim().toUpperCase();
    const trackingToken = String(body.trackingToken || '').trim();
    if (!orderRef || !trackingToken) {
      res.status(400).json({ error: 'Order reference and tracking token are required.' });
      return;
    }

    const order = await findOrderByRef(orderRef);
    if (!order) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }

    if (order.trackingToken !== trackingToken) {
      res.status(403).json({ error: 'Invalid tracking credentials for this order.' });
      return;
    }

    if (order.paymentStatus === 'paid') {
      res.status(400).json({ error: 'This order has already been paid.' });
      return;
    }

    const phoneInput = String(body.mpesaPhone || order.mpesaPhone || order.recipientPhone);
    const phoneCheck = isValidKenyanMpesaPhone(phoneInput);
    if (!phoneCheck.valid || !phoneCheck.normalized) {
      res.status(400).json({ error: phoneCheck.error || 'Invalid M-Pesa phone number.' });
      return;
    }

    const callbackUrl =
      process.env.DARAJA_CALLBACK_URL?.trim() ||
      `${getAppBaseUrl(req)}/api/webhooks/daraja/stk-callback`;

    const stkResult = await initiateDarajaStkPush({
      orderRef: order.orderRef,
      mpesaPhone: phoneCheck.normalized,
      amountKes: order.amountKes,
      accountReference: order.orderRef,
      transactionDesc: `SafBundle ${order.orderRef}`,
      callbackUrl,
    });

    const now = new Date().toISOString();
    const paymentId = `pay_${crypto.randomBytes(8).toString('hex')}`;

    await createPaymentRecord({
      id: paymentId,
      orderId: order.id,
      orderRef: order.orderRef,
      method: 'stk_push',
      payerPhone: phoneCheck.normalized,
      amountKes: order.amountKes,
      status: stkResult.success ? 'initiated' : 'pending',
      merchantRequestId: stkResult.merchantRequestId || '',
      checkoutRequestId: stkResult.checkoutRequestId || '',
      resultDesc: stkResult.customerMessage || stkResult.errorMessage || '',
      createdAt: now,
      updatedAt: now,
    });

    if (stkResult.success && stkResult.checkoutRequestId) {
      await updateOrderRecord(order.id, {
        paymentMethod: 'stk_push',
        mpesaPhone: phoneCheck.normalized,
        paymentStatus: 'initiated',
        checkoutRequestId: stkResult.checkoutRequestId,
        updatedAt: now,
      });
    }

    res.status(stkResult.configured ? (stkResult.success ? 200 : 502) : 200).json({
      configured: stkResult.configured,
      success: stkResult.success,
      message: stkResult.customerMessage || stkResult.errorMessage,
      checkoutRequestId: stkResult.checkoutRequestId,
    });
  } catch (error) {
    console.error('STK retry failed:', error);
    res.status(500).json({ error: 'Unable to initiate STK Push right now.' });
  }
});

app.post('/api/payments/till-reference', paymentLimiter, async (req, res) => {
  try {
    const body = req.body as {
      orderRef?: string;
      trackingToken?: string;
      transactionRef?: string;
    };

    const orderRef = String(body.orderRef || '').trim().toUpperCase();
    const trackingToken = String(body.trackingToken || '').trim();
    const transactionRef = String(body.transactionRef || '').trim().toUpperCase();

    if (!orderRef || !trackingToken) {
      res.status(400).json({ error: 'Order reference and tracking token are required.' });
      return;
    }

    if (!/^[A-Z0-9]{8,16}$/.test(transactionRef)) {
      res.status(400).json({
        error:
          'Enter a valid M-Pesa transaction code (8 to 16 alphanumeric characters, e.g. UBC4K92X1P).',
      });
      return;
    }

    const order = await findOrderByRef(orderRef);
    if (!order) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }

    if (order.trackingToken !== trackingToken) {
      res.status(403).json({ error: 'Unauthorized order reference update.' });
      return;
    }

    if (order.paymentStatus === 'paid') {
      res.status(400).json({ error: 'Order payment has already been verified.' });
      return;
    }

    const now = new Date().toISOString();
    await updateOrderRecord(order.id, {
      customerSubmittedRef: transactionRef,
      updatedAt: now,
    });

    await updatePaymentByOrderId(order.id, {
      customerSubmittedRef: transactionRef,
      updatedAt: now,
    });

    res.json({
      recorded: true,
      customerSubmittedRef: transactionRef,
      paymentStatus: order.paymentStatus,
      message:
        'Your M-Pesa reference has been saved. Payment verification completes automatically once Safaricom Daraja C2B confirmation is received.',
    });
  } catch (error) {
    console.error('Failed to record Till reference:', error);
    res.status(500).json({ error: 'Unable to save M-Pesa reference right now.' });
  }
});

app.get('/api/orders/track', trackLimiter, async (req, res) => {
  try {
    const ref = String(req.query.ref || '').trim().toUpperCase();
    const token = String(req.query.token || '').trim();
    const rawPhone = String(req.query.phone || '').trim();

    if (!ref) {
      res.status(400).json({ error: 'Provide your Order Reference (e.g. SB-XXXXXX).' });
      return;
    }

    if (!token && !rawPhone) {
      res.status(400).json({
        error: 'Provide the recipient Safaricom phone number to verify order ownership.',
      });
      return;
    }

    const order = await findOrderByRef(ref);
    if (!order) {
      res.status(404).json({ error: 'No order found matching those details.' });
      return;
    }

    let authorized = false;
    if (token && order.trackingToken && token === order.trackingToken) {
      authorized = true;
    } else if (rawPhone) {
      const normalized = normalizeSafaricomPhone(rawPhone);
      if (normalized.valid && normalized.normalized === order.recipientPhone) {
        authorized = true;
      }
    }

    if (!authorized) {
      res.status(404).json({ error: 'No order found matching that reference and phone number.' });
      return;
    }

    res.json({
      order: {
        orderRef: order.orderRef,
        productName: order.productName,
        category: order.category,
        recipientPhone: order.recipientPhone,
        amountKes: order.amountKes,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        deliveryStatus: order.deliveryStatus,
        mpesaReceiptNumber: order.mpesaReceiptNumber || null,
        customerSubmittedRef: order.customerSubmittedRef || null,
        failureReason: order.failureReason || null,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        trackingToken: token ? order.trackingToken : undefined,
      },
    });
  } catch (error) {
    console.error('Order tracking lookup error:', error);
    res.status(500).json({ error: 'Unable to check order status right now.' });
  }
});

app.post('/api/contact', contactLimiter, async (req, res) => {
  try {
    const body = req.body as {
      name?: string;
      email?: string;
      phone?: string;
      topic?: ContactTopic;
      orderRef?: string;
      message?: string;
    };

    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const rawPhone = String(body.phone || '').trim();
    const topic = body.topic || 'general';
    const orderRef = String(body.orderRef || '').trim().toUpperCase().slice(0, 32);
    const message = String(body.message || '').trim();

    if (name.length < 2 || name.length > 100) {
      res.status(400).json({ error: 'Please enter your full name (2 to 100 characters).' });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }

    const validTopics: ContactTopic[] = [
      'order_issue',
      'mpesa_payment',
      'bundle_delivery',
      'partnership',
      'general',
    ];
    if (!validTopics.includes(topic)) {
      res.status(400).json({ error: 'Select a valid inquiry topic.' });
      return;
    }

    if (message.length < 10 || message.length > 2000) {
      res.status(400).json({ error: 'Message must be between 10 and 2000 characters.' });
      return;
    }

    let normalizedPhone = '';
    if (rawPhone) {
      const check = normalizeSafaricomPhone(rawPhone);
      if (check.valid && check.normalized) {
        normalizedPhone = check.normalized;
      } else if (/^\+?[0-9\s\-]{7,20}$/.test(rawPhone)) {
        normalizedPhone = rawPhone.slice(0, 25);
      } else {
        res.status(400).json({ error: 'Enter a valid phone number or leave the phone field blank.' });
        return;
      }
    }

    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.randomBytes(6);
    let ticketSuffix = '';
    for (let i = 0; i < 6; i++) {
      ticketSuffix += chars[bytes[i] % chars.length];
    }

    const now = new Date().toISOString();
    const ticket: ContactMessage = {
      id: `msg_${crypto.randomBytes(8).toString('hex')}`,
      ticketRef: `TKT-${ticketSuffix}`,
      name,
      email,
      ...(normalizedPhone ? { phone: normalizedPhone } : {}),
      topic,
      ...(orderRef ? { orderRef } : {}),
      message,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    };

    await createContactMessage(ticket);

    res.status(201).json({
      ticket: {
        ticketRef: ticket.ticketRef,
        status: ticket.status,
        createdAt: ticket.createdAt,
      },
      message: 'Your inquiry has been received. Our support team will respond using your email or phone.',
    });
  } catch (error) {
    console.error('Contact form submission failed:', error);
    res.status(500).json({ error: 'Unable to submit your message right now. Please try again.' });
  }
});

// =============================================================================
// SAFARICOM DARAJA WEBHOOK CALLBACK ROUTES
// =============================================================================

app.post('/api/webhooks/daraja/stk-callback', async (req, res) => {
  if (!verifyDarajaWebhookRequest(req)) {
    res.status(401).json({ ResultCode: 1, ResultDesc: 'Invalid webhook credentials' });
    return;
  }

  const parsed = parseDarajaStkCallback(req.body);
  if (!parsed) {
    res.status(400).json({ ResultCode: 1, ResultDesc: 'Malformed STK callback payload' });
    return;
  }

  const callbackId = `stk_${parsed.checkoutRequestId}`
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .slice(0, 120);
  const now = new Date().toISOString();

  try {
    const alreadyProcessed = await recordCallbackIdempotent({
      id: callbackId,
      callbackType: 'stk_callback',
      idempotencyKey: callbackId,
      checkoutRequestId: parsed.checkoutRequestId,
      transId: parsed.mpesaReceiptNumber || '',
      amountKes: parsed.amountKes ?? 0,
      resultCode: String(parsed.resultCode),
      processed: true,
      receivedAt: now,
    });

    if (alreadyProcessed) {
      res.json({ ResultCode: 0, ResultDesc: 'Callback already processed' });
      return;
    }

    const order = await findOrderByCheckoutRequestId(parsed.checkoutRequestId);
    if (!order) {
      res.json({ ResultCode: 0, ResultDesc: 'Accepted (no matching order)' });
      return;
    }

    if (parsed.resultCode === 0) {
      const paidAmount = parsed.amountKes ?? 0;
      if (paidAmount < order.amountKes) {
        const mismatchMsg = `Payment amount mismatch: expected KES ${order.amountKes}, received KES ${paidAmount}.`;
        await updateOrderRecord(order.id, {
          paymentStatus: 'failed',
          failureReason: mismatchMsg,
          updatedAt: now,
        });
        await updatePaymentByCheckoutRequestId(parsed.checkoutRequestId, {
          status: 'failed',
          resultCode: String(parsed.resultCode),
          resultDesc: mismatchMsg,
          updatedAt: now,
        });
        res.json({ ResultCode: 0, ResultDesc: 'Recorded amount mismatch' });
        return;
      }

      if (order.paymentStatus !== 'paid') {
        await updateOrderRecord(order.id, {
          paymentStatus: 'paid',
          mpesaReceiptNumber: parsed.mpesaReceiptNumber || '',
          deliveryStatus: 'pending',
          failureReason: '',
          updatedAt: now,
        });

        await updatePaymentByCheckoutRequestId(parsed.checkoutRequestId, {
          status: 'paid',
          mpesaReceiptNumber: parsed.mpesaReceiptNumber || '',
          resultCode: '0',
          resultDesc: parsed.resultDesc,
          updatedAt: now,
        });

        await incrementCustomerSpend(order.customerId, order.amountKes);

        await dispatchSupplierDelivery({
          orderId: order.id,
          orderRef: order.orderRef,
          recipientPhone: order.recipientPhone,
          supplierSku: order.supplierSku,
          amountKes: order.amountKes,
          category: order.category,
        });
      }
    } else {
      const nextStatus = parsed.resultCode === 1032 ? 'cancelled' : 'failed';
      await updateOrderRecord(order.id, {
        paymentStatus: nextStatus,
        failureReason: parsed.resultDesc || 'M-Pesa payment was not completed.',
        updatedAt: now,
      });

      await updatePaymentByCheckoutRequestId(parsed.checkoutRequestId, {
        status: nextStatus,
        resultCode: String(parsed.resultCode),
        resultDesc: parsed.resultDesc,
        updatedAt: now,
      });
    }

    res.json({ ResultCode: 0, ResultDesc: 'Callback processed successfully' });
  } catch (error) {
    console.error('STK callback processing error:', error);
    res.status(500).json({ ResultCode: 1, ResultDesc: 'Internal callback error' });
  }
});

app.post('/api/webhooks/daraja/c2b-validation', async (req, res) => {
  if (!verifyDarajaWebhookRequest(req)) {
    res.status(401).json({ ResultCode: 'C2B00016', ResultDesc: 'Rejected' });
    return;
  }

  const parsed = parseDarajaC2bConfirmation(req.body);
  if (!parsed) {
    res.json({ ResultCode: 'C2B00013', ResultDesc: 'Invalid Amount or Transaction' });
    return;
  }

  const now = new Date().toISOString();
  const cbId = `val_${parsed.transId}`.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 120);
  await saveCallbackRecord({
    id: cbId,
    callbackType: 'c2b_validation',
    idempotencyKey: cbId,
    transId: parsed.transId,
    amountKes: parsed.transAmount,
    resultCode: '0',
    processed: true,
    receivedAt: now,
  });

  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

app.post('/api/webhooks/daraja/c2b-confirmation', async (req, res) => {
  if (!verifyDarajaWebhookRequest(req)) {
    res.status(401).json({ ResultCode: 1, ResultDesc: 'Invalid webhook credentials' });
    return;
  }

  const parsed = parseDarajaC2bConfirmation(req.body);
  if (!parsed) {
    res.status(400).json({ ResultCode: 1, ResultDesc: 'Malformed C2B confirmation payload' });
    return;
  }

  const callbackId = `c2b_${parsed.transId}`.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 120);
  const now = new Date().toISOString();

  try {
    const alreadyProcessed = await recordCallbackIdempotent({
      id: callbackId,
      callbackType: 'c2b_confirmation',
      idempotencyKey: callbackId,
      transId: parsed.transId,
      amountKes: parsed.transAmount,
      resultCode: '0',
      processed: true,
      receivedAt: now,
    });

    if (alreadyProcessed) {
      res.json({ ResultCode: 0, ResultDesc: 'C2B transaction already processed' });
      return;
    }

    const billRef = parsed.billRefNumber.toUpperCase();
    const transIdUpper = parsed.transId.toUpperCase();

    let order = billRef ? await findOrderByRef(billRef) : null;
    if (!order) {
      order = await findOrderBySubmittedRef(transIdUpper);
    }

    if (order) {
      if (parsed.transAmount < order.amountKes) {
        await updateOrderRecord(order.id, {
          paymentStatus: 'failed',
          failureReason: `C2B underpayment: received KES ${parsed.transAmount}, required KES ${order.amountKes}.`,
          updatedAt: now,
        });
      } else if (order.paymentStatus !== 'paid') {
        await updateOrderRecord(order.id, {
          paymentStatus: 'paid',
          mpesaReceiptNumber: parsed.transId,
          deliveryStatus: 'pending',
          failureReason: '',
          updatedAt: now,
        });

        await updatePaymentByOrderId(order.id, {
          status: 'paid',
          mpesaReceiptNumber: parsed.transId,
          resultCode: '0',
          resultDesc: 'Verified via Daraja C2B confirmation',
          updatedAt: now,
        });

        await incrementCustomerSpend(order.customerId, order.amountKes);

        await dispatchSupplierDelivery({
          orderId: order.id,
          orderRef: order.orderRef,
          recipientPhone: order.recipientPhone,
          supplierSku: order.supplierSku,
          amountKes: order.amountKes,
          category: order.category,
        });
      }
    }

    res.json({ ResultCode: 0, ResultDesc: 'C2B confirmation received' });
  } catch (error) {
    console.error('C2B confirmation processing error:', error);
    res.status(500).json({ ResultCode: 1, ResultDesc: 'Internal C2B callback error' });
  }
});

// =============================================================================
// PROTECTED ADMIN API ROUTES
// =============================================================================

app.use('/api/admin', adminLimiter, requireAdmin);

app.get('/api/admin/me', (req: AdminRequest, res) => {
  res.json({
    uid: req.adminUser?.uid,
    email: req.adminUser?.email,
    name: req.adminUser?.name || req.adminUser?.email,
  });
});

app.get('/api/admin/overview', async (_req, res) => {
  try {
    await ensureSeededDatabase();
    const [orders, payments] = await Promise.all([listOrders(), listPayments()]);

    let totalSalesKes = 0;
    let failedOrders = 0;
    let deliveredOrders = 0;
    let failedDeliveries = 0;

    for (const o of orders) {
      if (o.paymentStatus === 'paid') {
        totalSalesKes += Number(o.amountKes || 0);
      }
      if (o.paymentStatus === 'failed' || o.deliveryStatus === 'failed') {
        failedOrders += 1;
      }
      if (o.deliveryStatus === 'delivered') {
        deliveredOrders += 1;
      }
      if (o.deliveryStatus === 'failed') {
        failedDeliveries += 1;
      }
    }

    const successfulPayments = payments.filter((p) => p.status === 'paid').length;
    const pendingPayments = payments.filter(
      (p) => p.status === 'pending' || p.status === 'initiated',
    ).length;

    const overview: DashboardOverview = {
      totalSalesKes,
      totalOrders: orders.length,
      successfulPayments,
      pendingPayments,
      failedOrders,
      deliveredOrders,
      failedDeliveries,
      integrations: getIntegrationStatus(),
    };

    res.json({ overview });
  } catch (error) {
    console.error('Admin overview failed:', error);
    res.status(500).json({ error: 'Unable to load dashboard overview.' });
  }
});

app.get('/api/admin/products', async (_req, res) => {
  try {
    await ensureSeededDatabase();
    const products = await listProducts(false);
    res.json({ products });
  } catch (error) {
    console.error('Admin products list failed:', error);
    res.status(500).json({ error: 'Unable to load products.' });
  }
});

app.post('/api/admin/products', async (req, res) => {
  try {
    const body = req.body as Partial<Product>;
    const name = String(body.name || '').trim();
    const category = body.category as ProductCategory;
    const supplierSku = String(body.supplierSku || '').trim();
    const priceKes = Number(body.priceKes);

    if (!name || name.length < 2 || name.length > 120) {
      res.status(400).json({ error: 'Product name must be between 2 and 120 characters.' });
      return;
    }
    if (!['daily', 'weekly', 'monthly', 'special', 'airtime'].includes(category)) {
      res.status(400).json({ error: 'Invalid product category.' });
      return;
    }
    if (!supplierSku || supplierSku.length < 2 || supplierSku.length > 80) {
      res.status(400).json({ error: 'Supplier SKU is required (2–80 characters).' });
      return;
    }
    if (!Number.isFinite(priceKes) || priceKes < 1 || priceKes > 100000) {
      res.status(400).json({ error: 'Price must be between KES 1 and KES 100,000.' });
      return;
    }

    const id = `prod_${crypto.randomBytes(6).toString('hex')}`;
    const product: Product = {
      id,
      name,
      category,
      dataAllocation: String(body.dataAllocation || '').trim().slice(0, 64),
      validityLabel: String(body.validityLabel || '').trim().slice(0, 64),
      description: String(body.description || '').trim().slice(0, 400),
      priceKes: Math.round(priceKes),
      supplierSku,
      isActive: body.isActive !== false,
      isFeatured: Boolean(body.isFeatured),
      isSample: body.isSample !== false,
      sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 100,
      updatedAt: new Date().toISOString(),
    };

    await saveProduct(product);
    res.status(201).json({ product });
  } catch (error) {
    console.error('Create product failed:', error);
    res.status(500).json({ error: 'Failed to create product.' });
  }
});

app.patch('/api/admin/products/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const current = await getProductById(id);
    if (!current) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }

    const body = req.body as Partial<Product>;
    const updated: Product = {
      ...current,
      name: body.name !== undefined ? String(body.name).trim().slice(0, 120) : current.name,
      category:
        body.category && ['daily', 'weekly', 'monthly', 'special', 'airtime'].includes(body.category)
          ? body.category
          : current.category,
      dataAllocation:
        body.dataAllocation !== undefined
          ? String(body.dataAllocation).trim().slice(0, 64)
          : current.dataAllocation,
      validityLabel:
        body.validityLabel !== undefined
          ? String(body.validityLabel).trim().slice(0, 64)
          : current.validityLabel,
      description:
        body.description !== undefined
          ? String(body.description).trim().slice(0, 400)
          : current.description,
      priceKes:
        body.priceKes !== undefined && Number.isFinite(Number(body.priceKes))
          ? Math.max(1, Math.min(100000, Math.round(Number(body.priceKes))))
          : current.priceKes,
      supplierSku:
        body.supplierSku !== undefined
          ? String(body.supplierSku).trim().slice(0, 80)
          : current.supplierSku,
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : current.isActive,
      isFeatured: body.isFeatured !== undefined ? Boolean(body.isFeatured) : current.isFeatured,
      isSample: body.isSample !== undefined ? Boolean(body.isSample) : current.isSample,
      sortOrder:
        body.sortOrder !== undefined && Number.isFinite(Number(body.sortOrder))
          ? Number(body.sortOrder)
          : current.sortOrder,
      updatedAt: new Date().toISOString(),
    };

    await saveProduct(updated);
    res.json({ product: updated });
  } catch (error) {
    console.error('Update product failed:', error);
    res.status(500).json({ error: 'Failed to update product.' });
  }
});

app.delete('/api/admin/products/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const deleted = await deleteProductById(id);
    if (!deleted) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }
    res.json({ deleted: true, id });
  } catch (error) {
    console.error('Delete product failed:', error);
    res.status(500).json({ error: 'Failed to delete product.' });
  }
});

app.get('/api/admin/orders', async (_req, res) => {
  try {
    const orders = await listOrders();
    res.json({ orders });
  } catch (error) {
    console.error('Admin orders failed:', error);
    res.status(500).json({ error: 'Unable to load orders.' });
  }
});

app.post('/api/admin/orders/:id/retry-delivery', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const order = await findOrderById(id);
    if (!order) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }

    if (order.paymentStatus !== 'paid') {
      res.status(400).json({
        error: 'Cannot dispatch supplier delivery before payment is verified as paid.',
      });
      return;
    }

    const result = await dispatchSupplierDelivery({
      orderId: order.id,
      orderRef: order.orderRef,
      recipientPhone: order.recipientPhone,
      supplierSku: order.supplierSku,
      amountKes: order.amountKes,
      category: order.category,
    });

    res.json({ result });
  } catch (error) {
    console.error('Retry delivery failed:', error);
    res.status(500).json({ error: 'Failed to retry bundle delivery.' });
  }
});

app.patch('/api/admin/orders/:id/status', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const current = await findOrderById(id);
    if (!current) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }

    const body = req.body as {
      paymentStatus?: OrderRecord['paymentStatus'];
      deliveryStatus?: OrderRecord['deliveryStatus'];
      mpesaReceiptNumber?: string;
      failureReason?: string;
    };

    const updates: Partial<OrderRecord> = {
      updatedAt: new Date().toISOString(),
    };

    if (
      body.paymentStatus &&
      ['pending', 'initiated', 'paid', 'failed', 'cancelled'].includes(body.paymentStatus)
    ) {
      updates.paymentStatus = body.paymentStatus;
    }
    if (
      body.deliveryStatus &&
      ['awaiting_payment', 'pending', 'processing', 'delivered', 'failed'].includes(
        body.deliveryStatus,
      )
    ) {
      updates.deliveryStatus = body.deliveryStatus;
    }
    if (body.mpesaReceiptNumber !== undefined) {
      updates.mpesaReceiptNumber = String(body.mpesaReceiptNumber).trim().slice(0, 64);
    }
    if (body.failureReason !== undefined) {
      updates.failureReason = String(body.failureReason).trim().slice(0, 300);
    }

    const updated = await updateOrderRecord(id, updates);
    res.json({ order: updated });
  } catch (error) {
    console.error('Update order status failed:', error);
    res.status(500).json({ error: 'Failed to update order.' });
  }
});

app.get('/api/admin/payments', async (_req, res) => {
  try {
    const payments = await listPayments();
    res.json({ payments });
  } catch (error) {
    console.error('Admin payments failed:', error);
    res.status(500).json({ error: 'Unable to load payment records.' });
  }
});

app.get('/api/admin/supplier-transactions', async (_req, res) => {
  try {
    const transactions = await listSupplierTransactions();
    res.json({ transactions });
  } catch (error) {
    console.error('Admin supplier transactions failed:', error);
    res.status(500).json({ error: 'Unable to load supplier transactions.' });
  }
});

app.get('/api/admin/callbacks', async (_req, res) => {
  try {
    const callbacks = await listCallbacks();
    res.json({ callbacks });
  } catch (error) {
    console.error('Admin callbacks failed:', error);
    res.status(500).json({ error: 'Unable to load callback records.' });
  }
});

app.get('/api/admin/settings', async (_req, res) => {
  try {
    await ensureSeededDatabase();
    const config = (await getPaymentConfig()) || DEFAULT_PAYMENT_CONFIG;
    res.json({
      config,
      integrations: getIntegrationStatus(),
    });
  } catch (error) {
    console.error('Admin settings load failed:', error);
    res.status(500).json({ error: 'Unable to load settings.' });
  }
});

app.put('/api/admin/settings', async (req, res) => {
  try {
    const body = req.body as Partial<BusinessPaymentConfig>;
    const current = (await getPaymentConfig()) || DEFAULT_PAYMENT_CONFIG;

    const updated: BusinessPaymentConfig = {
      businessName:
        body.businessName !== undefined
          ? String(body.businessName).trim().slice(0, 100) || current.businessName
          : current.businessName,
      paymentMode:
        body.paymentMode === 'till' || body.paymentMode === 'paybill'
          ? body.paymentMode
          : current.paymentMode,
      tillNumber:
        body.tillNumber !== undefined
          ? String(body.tillNumber).trim().slice(0, 20)
          : current.tillNumber,
      paybillNumber:
        body.paybillNumber !== undefined
          ? String(body.paybillNumber).trim().slice(0, 20)
          : current.paybillNumber,
      accountPrefix:
        body.accountPrefix !== undefined
          ? String(body.accountPrefix).trim().slice(0, 20)
          : current.accountPrefix,
      stkPushEnabled:
        body.stkPushEnabled !== undefined ? Boolean(body.stkPushEnabled) : current.stkPushEnabled,
      tillPaybillEnabled:
        body.tillPaybillEnabled !== undefined
          ? Boolean(body.tillPaybillEnabled)
          : current.tillPaybillEnabled,
      supportPhone:
        body.supportPhone !== undefined
          ? String(body.supportPhone).trim().slice(0, 30)
          : current.supportPhone,
      supportWhatsapp:
        body.supportWhatsapp !== undefined
          ? String(body.supportWhatsapp).trim().slice(0, 30)
          : current.supportWhatsapp,
      supportEmail:
        body.supportEmail !== undefined
          ? String(body.supportEmail).trim().slice(0, 120) || current.supportEmail
          : current.supportEmail,
      sampleNotice:
        body.sampleNotice !== undefined
          ? String(body.sampleNotice).trim().slice(0, 300)
          : current.sampleNotice,
      updatedAt: new Date().toISOString(),
    };

    await savePaymentConfig(updated);
    res.json({ config: updated });
  } catch (error) {
    console.error('Admin settings update failed:', error);
    res.status(500).json({ error: 'Unable to save payment configuration.' });
  }
});

app.get('/api/admin/contact-messages', async (_req, res) => {
  try {
    const messages = await listContactMessages();
    res.json({ messages });
  } catch (error) {
    console.error('Admin contact messages failed:', error);
    res.status(500).json({ error: 'Unable to load contact inquiries.' });
  }
});

app.patch('/api/admin/contact-messages/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const body = req.body as {
      status?: ContactMessage['status'];
      adminNotes?: string;
    };

    const patch: Partial<Pick<ContactMessage, 'status' | 'adminNotes' | 'updatedAt'>> = {
      updatedAt: new Date().toISOString(),
    };

    if (body.status && ['open', 'in_progress', 'resolved'].includes(body.status)) {
      patch.status = body.status;
    }
    if (body.adminNotes !== undefined) {
      patch.adminNotes = String(body.adminNotes).trim().slice(0, 500);
    }

    const updated = await updateContactMessage(id, patch);
    if (!updated) {
      res.status(404).json({ error: 'Support ticket not found.' });
      return;
    }

    res.json({ message: updated });
  } catch (error) {
    console.error('Admin contact message update failed:', error);
    res.status(500).json({ error: 'Unable to update support ticket.' });
  }
});

// =============================================================================
// VITE DEV / PRODUCTION STATIC FRONTEND SERVING
// =============================================================================

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`SafBundle server running on http://0.0.0.0:${port}`);
  });
}

if (!process.env.VERCEL) {
  startServer().catch((err) => {
    console.error('Failed to start SafBundle server:', err);
    process.exit(1);
  });
}

export { app };
export default app;
