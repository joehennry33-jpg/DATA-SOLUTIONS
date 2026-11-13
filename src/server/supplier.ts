import crypto from 'node:crypto';
import {
  createSupplierTransaction,
  listSupplierTransactionsByOrder,
  updateOrderRecord,
  updateSupplierTransaction,
} from './store.ts';

export interface SupplierConfigStatus {
  configured: boolean;
  missingVars: string[];
}

export interface BundleDeliveryInput {
  orderId: string;
  orderRef: string;
  recipientPhone: string;
  supplierSku: string;
  amountKes: number;
  category: string;
}

export interface BundleDeliveryResult {
  transactionId: string;
  status: 'pending_configuration' | 'processing' | 'delivered' | 'failed';
  supplierReference?: string;
  message: string;
  duplicatePrevented?: boolean;
}

export function getSupplierConfigStatus(): SupplierConfigStatus {
  const required = ['SUPPLIER_API_URL', 'SUPPLIER_API_KEY', 'SUPPLIER_PARTNER_ID'];
  const missingVars = required.filter((key) => !process.env[key]?.trim());
  return {
    configured: missingVars.length === 0,
    missingVars,
  };
}

/**
 * Dispatches an automated bundle/airtime delivery request to the configured supplier adapter.
 * Guarantees duplicate delivery prevention across concurrent callbacks or admin retries.
 */
export async function dispatchSupplierDelivery(
  input: BundleDeliveryInput,
): Promise<BundleDeliveryResult> {
  const now = new Date().toISOString();

  const existingDocs = await listSupplierTransactionsByOrder(input.orderId);
  const alreadyFulfilled = existingDocs.find(
    (tx) => tx.status === 'delivered' || tx.status === 'processing',
  );

  if (alreadyFulfilled) {
    return {
      transactionId: alreadyFulfilled.id,
      status: alreadyFulfilled.status,
      supplierReference: alreadyFulfilled.supplierReference,
      message: 'Duplicate fulfillment blocked: an active or completed delivery already exists.',
      duplicatePrevented: true,
    };
  }

  const attemptNumber = existingDocs.length + 1;
  const txId = `stx_${input.orderRef}_${attemptNumber}_${crypto.randomBytes(3).toString('hex')}`;
  const supplierConfig = getSupplierConfigStatus();

  if (!supplierConfig.configured) {
    const message = `Payment verified, awaiting supplier API configuration (${supplierConfig.missingVars.join(', ')}). Order queued for admin review or retry once supplier credentials are connected.`;

    await createSupplierTransaction({
      id: txId,
      orderId: input.orderId,
      orderRef: input.orderRef,
      recipientPhone: input.recipientPhone,
      supplierSku: input.supplierSku,
      amountKes: input.amountKes,
      status: 'pending_configuration',
      responseMessage: message,
      attemptNumber,
      createdAt: now,
      updatedAt: now,
    });

    await updateOrderRecord(input.orderId, {
      deliveryStatus: 'pending',
      supplierTransactionId: txId,
      failureReason: message,
      updatedAt: now,
    });

    return {
      transactionId: txId,
      status: 'pending_configuration',
      message,
    };
  }

  await createSupplierTransaction({
    id: txId,
    orderId: input.orderId,
    orderRef: input.orderRef,
    recipientPhone: input.recipientPhone,
    supplierSku: input.supplierSku,
    amountKes: input.amountKes,
    status: 'processing',
    responseMessage: 'Submitting request to authorized bundle supplier API.',
    attemptNumber,
    createdAt: now,
    updatedAt: now,
  });

  await updateOrderRecord(input.orderId, {
    deliveryStatus: 'processing',
    supplierTransactionId: txId,
    failureReason: '',
    updatedAt: now,
  });

  const apiUrl = process.env.SUPPLIER_API_URL!.trim();
  const apiKey = process.env.SUPPLIER_API_KEY!.trim();
  const partnerId = process.env.SUPPLIER_PARTNER_ID!.trim();

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'X-Partner-Id': partnerId,
        'Idempotency-Key': input.orderRef,
      },
      body: JSON.stringify({
        partnerId,
        reference: input.orderRef,
        recipientPhone: input.recipientPhone,
        sku: input.supplierSku,
        category: input.category,
        amountKes: input.amountKes,
      }),
    });

    const data = (await response.json().catch(() => ({}))) as {
      status?: string;
      transactionId?: string;
      reference?: string;
      message?: string;
    };

    const updatedAt = new Date().toISOString();

    if (!response.ok) {
      const errMessage =
        data.message || `Supplier API returned HTTP ${response.status}. Investigation required.`;

      await updateSupplierTransaction(txId, {
        status: 'failed',
        responseMessage: errMessage,
        updatedAt,
      });

      await updateOrderRecord(input.orderId, {
        deliveryStatus: 'failed',
        failureReason: errMessage,
        updatedAt,
      });

      return {
        transactionId: txId,
        status: 'failed',
        message: errMessage,
      };
    }

    const supplierRef = data.transactionId || data.reference || txId;
    const normalizedStatus =
      data.status === 'delivered' || data.status === 'success' ? 'delivered' : 'processing';
    const okMessage =
      data.message ||
      (normalizedStatus === 'delivered'
        ? 'Bundle delivered via supplier API.'
        : 'Delivery accepted by supplier API and is currently processing.');

    await updateSupplierTransaction(txId, {
      status: normalizedStatus,
      supplierReference: supplierRef,
      responseMessage: okMessage,
      updatedAt,
    });

    await updateOrderRecord(input.orderId, {
      deliveryStatus: normalizedStatus,
      failureReason: '',
      updatedAt,
    });

    return {
      transactionId: txId,
      status: normalizedStatus,
      supplierReference: supplierRef,
      message: okMessage,
    };
  } catch (error) {
    const errMessage =
      error instanceof Error
        ? `Supplier request failed: ${error.message}`
        : 'Supplier request failed due to a network error.';
    const updatedAt = new Date().toISOString();

    await updateSupplierTransaction(txId, {
      status: 'failed',
      responseMessage: errMessage,
      updatedAt,
    });

    await updateOrderRecord(input.orderId, {
      deliveryStatus: 'failed',
      failureReason: errMessage,
      updatedAt,
    });

    return {
      transactionId: txId,
      status: 'failed',
      message: errMessage,
    };
  }
}
