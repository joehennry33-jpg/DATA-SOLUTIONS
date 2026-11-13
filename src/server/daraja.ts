import crypto from 'node:crypto';
import type { Request } from 'express';

export interface DarajaConfigStatus {
  configured: boolean;
  environment: 'sandbox' | 'production' | 'unconfigured';
  missingVars: string[];
}

export interface StkPushRequestParams {
  orderRef: string;
  mpesaPhone: string;
  amountKes: number;
  accountReference: string;
  transactionDesc: string;
  callbackUrl: string;
}

export interface StkPushResult {
  configured: boolean;
  success: boolean;
  merchantRequestId?: string;
  checkoutRequestId?: string;
  customerMessage?: string;
  responseCode?: string;
  errorMessage?: string;
}

export interface ParsedStkCallback {
  merchantRequestId: string;
  checkoutRequestId: string;
  resultCode: number;
  resultDesc: string;
  amountKes?: number;
  mpesaReceiptNumber?: string;
  phoneNumber?: string;
  transactionDate?: string;
}

export interface ParsedC2bConfirmation {
  transactionType: string;
  transId: string;
  transTime: string;
  transAmount: number;
  businessShortCode: string;
  billRefNumber: string;
  msisdn: string;
  firstName?: string;
}

function getDarajaEnv(): 'sandbox' | 'production' {
  return process.env.DARAJA_ENV === 'production' ? 'production' : 'sandbox';
}

function getDarajaBaseUrl(): string {
  return getDarajaEnv() === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
}

export function getDarajaConfigStatus(): DarajaConfigStatus {
  const required = [
    'DARAJA_CONSUMER_KEY',
    'DARAJA_CONSUMER_SECRET',
    'DARAJA_SHORTCODE',
    'DARAJA_PASSKEY',
  ];
  const missingVars = required.filter((key) => !process.env[key]?.trim());

  if (missingVars.length > 0) {
    return {
      configured: false,
      environment: 'unconfigured',
      missingVars,
    };
  }

  return {
    configured: true,
    environment: getDarajaEnv(),
    missingVars: [],
  };
}

function formatDarajaTimestamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  // Daraja expects EAT (UTC+3) YYYYMMDDHHmmss
  const eatDate = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  return [
    eatDate.getUTCFullYear(),
    pad(eatDate.getUTCMonth() + 1),
    pad(eatDate.getUTCDate()),
    pad(eatDate.getUTCHours()),
    pad(eatDate.getUTCMinutes()),
    pad(eatDate.getUTCSeconds()),
  ].join('');
}

async function fetchDarajaAccessToken(): Promise<string> {
  const key = process.env.DARAJA_CONSUMER_KEY?.trim() || '';
  const secret = process.env.DARAJA_CONSUMER_SECRET?.trim() || '';
  const credentials = Buffer.from(`${key}:${secret}`).toString('base64');

  const response = await fetch(
    `${getDarajaBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`,
    {
      method: 'GET',
      headers: {
        Authorization: `Basic ${credentials}`,
      },
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Daraja OAuth failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error('Daraja OAuth response did not include an access_token.');
  }

  return data.access_token;
}

export async function initiateDarajaStkPush(params: StkPushRequestParams): Promise<StkPushResult> {
  const status = getDarajaConfigStatus();
  if (!status.configured) {
    return {
      configured: false,
      success: false,
      errorMessage: `Safaricom Daraja STK Push is not configured yet. Missing environment variables: ${status.missingVars.join(', ')}.`,
    };
  }

  const shortcode = process.env.DARAJA_SHORTCODE!.trim();
  const passkey = process.env.DARAJA_PASSKEY!.trim();
  const timestamp = formatDarajaTimestamp();
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

  const webhookSecret = process.env.DARAJA_WEBHOOK_SECRET?.trim();
  const callbackUrl = webhookSecret
    ? `${params.callbackUrl}?token=${encodeURIComponent(webhookSecret)}`
    : params.callbackUrl;

  try {
    const accessToken = await fetchDarajaAccessToken();
    const transactionType =
      process.env.DARAJA_TRANSACTION_TYPE === 'CustomerBuyGoodsOnline'
        ? 'CustomerBuyGoodsOnline'
        : 'CustomerPayBillOnline';

    const payload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: transactionType,
      Amount: Math.round(params.amountKes),
      PartyA: params.mpesaPhone,
      PartyB: process.env.DARAJA_PARTY_B?.trim() || shortcode,
      PhoneNumber: params.mpesaPhone,
      CallBackURL: callbackUrl,
      AccountReference: params.accountReference.slice(0, 12),
      TransactionDesc: params.transactionDesc.slice(0, 13),
    };

    const response = await fetch(`${getDarajaBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as {
      MerchantRequestID?: string;
      CheckoutRequestID?: string;
      ResponseCode?: string;
      ResponseDescription?: string;
      CustomerMessage?: string;
      errorMessage?: string;
    };

    if (!response.ok || data.ResponseCode !== '0') {
      return {
        configured: true,
        success: false,
        responseCode: data.ResponseCode,
        errorMessage:
          data.errorMessage ||
          data.ResponseDescription ||
          'Daraja rejected the STK Push request.',
      };
    }

    return {
      configured: true,
      success: true,
      merchantRequestId: data.MerchantRequestID,
      checkoutRequestId: data.CheckoutRequestID,
      responseCode: data.ResponseCode,
      customerMessage:
        data.CustomerMessage || 'Check your phone and enter your M-Pesa PIN to complete payment.',
    };
  } catch (error) {
    console.error('Daraja STK Push error:', error);
    return {
      configured: true,
      success: false,
      errorMessage:
        error instanceof Error ? error.message : 'Unable to reach Safaricom Daraja API.',
    };
  }
}

export function verifyDarajaWebhookRequest(req: Request): boolean {
  const configuredSecret = process.env.DARAJA_WEBHOOK_SECRET?.trim();
  if (!configuredSecret) {
    // If no custom webhook secret is configured, allow standard Daraja callback delivery
    return true;
  }

  const provided =
    (typeof req.query.token === 'string' ? req.query.token : '') ||
    (req.header('x-daraja-webhook-secret') || '');

  if (!provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(configuredSecret);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function parseDarajaStkCallback(body: unknown): ParsedStkCallback | null {
  if (!body || typeof body !== 'object') return null;
  const root = body as { Body?: { stkCallback?: Record<string, unknown> } };
  const stk = root.Body?.stkCallback;
  if (!stk || typeof stk !== 'object') return null;

  const merchantRequestId = String(stk.MerchantRequestID || '').trim();
  const checkoutRequestId = String(stk.CheckoutRequestID || '').trim();
  const resultCode = Number(stk.ResultCode);
  const resultDesc = String(stk.ResultDesc || '').trim();

  if (!checkoutRequestId || Number.isNaN(resultCode)) {
    return null;
  }

  const metadataItems = (
    (stk.CallbackMetadata as { Item?: Array<{ Name?: string; Value?: unknown }> } | undefined)
      ?.Item || []
  );

  const lookup = new Map<string, unknown>();
  for (const item of metadataItems) {
    if (item?.Name) {
      lookup.set(item.Name, item.Value);
    }
  }

  const rawAmount = lookup.get('Amount');
  const parsedAmount = rawAmount !== undefined ? Number(rawAmount) : undefined;

  return {
    merchantRequestId,
    checkoutRequestId,
    resultCode,
    resultDesc,
    amountKes: parsedAmount !== undefined && !Number.isNaN(parsedAmount) ? parsedAmount : undefined,
    mpesaReceiptNumber: lookup.get('MpesaReceiptNumber')
      ? String(lookup.get('MpesaReceiptNumber'))
      : undefined,
    phoneNumber: lookup.get('PhoneNumber') ? String(lookup.get('PhoneNumber')) : undefined,
    transactionDate: lookup.get('TransactionDate')
      ? String(lookup.get('TransactionDate'))
      : undefined,
  };
}

export function parseDarajaC2bConfirmation(body: unknown): ParsedC2bConfirmation | null {
  if (!body || typeof body !== 'object') return null;
  const data = body as Record<string, unknown>;

  const transId = String(data.TransID || '').trim();
  const transAmount = Number(data.TransAmount);
  const billRefNumber = String(data.BillRefNumber || '').trim();
  const msisdn = String(data.MSISDN || '').trim();

  if (!transId || Number.isNaN(transAmount) || transAmount <= 0) {
    return null;
  }

  return {
    transactionType: String(data.TransactionType || 'Pay Bill / Till'),
    transId,
    transTime: String(data.TransTime || ''),
    transAmount,
    businessShortCode: String(data.BusinessShortCode || ''),
    billRefNumber,
    msisdn,
    firstName: data.FirstName ? String(data.FirstName) : undefined,
  };
}
