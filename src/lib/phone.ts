/**
 * Kenyan Safaricom phone number validation and MSISDN normalization.
 * Normalizes valid inputs (07..., 01..., 7..., 1..., +254..., 254...) to 254XXXXXXXXX.
 */

const SAFARICOM_MSISDN_REGEX =
  /^254(?:7(?:0[0-9]|1[0-9]|2[0-9]|4[0-3568]|5[7-9]|6[89]|9[0-9])|1(?:1[0-5]))[0-9]{6}$/;

const GENERAL_KENYAN_MSISDN_REGEX = /^254(?:7[0-9]{8}|1[0-9]{8})$/;

export interface PhoneValidationResult {
  valid: boolean;
  normalized: string | null;
  formatted: string | null;
  error?: string;
}

export function normalizeSafaricomPhone(rawInput: string): PhoneValidationResult {
  const cleaned = rawInput.replace(/[\s\-().]/g, '').trim();

  if (!cleaned) {
    return {
      valid: false,
      normalized: null,
      formatted: null,
      error: 'Enter a Safaricom phone number (e.g. 0712 345 678 or 0112 345 678).',
    };
  }

  let candidate = cleaned;
  if (candidate.startsWith('+')) {
    candidate = candidate.slice(1);
  }

  if (candidate.startsWith('0') && candidate.length === 10) {
    candidate = `254${candidate.slice(1)}`;
  } else if ((candidate.startsWith('7') || candidate.startsWith('1')) && candidate.length === 9) {
    candidate = `254${candidate}`;
  }

  if (!/^[0-9]+$/.test(candidate)) {
    return {
      valid: false,
      normalized: null,
      formatted: null,
      error: 'Phone number must contain digits only.',
    };
  }

  if (!GENERAL_KENYAN_MSISDN_REGEX.test(candidate)) {
    return {
      valid: false,
      normalized: null,
      formatted: null,
      error: 'Enter a valid 10-digit Kenyan mobile number starting with 07 or 01.',
    };
  }

  if (!SAFARICOM_MSISDN_REGEX.test(candidate)) {
    return {
      valid: false,
      normalized: null,
      formatted: null,
      error:
        'This prefix does not match a Safaricom number. Supported Safaricom prefixes include 070x, 071x, 072x, 0740–0743, 0745–0746, 0748, 0757–0759, 0768–0769, 079x, and 0110–0115.',
    };
  }

  return {
    valid: true,
    normalized: candidate,
    formatted: formatKenyanPhoneDisplay(candidate),
  };
}

export function isValidKenyanMpesaPhone(rawInput: string): PhoneValidationResult {
  const cleaned = rawInput.replace(/[\s\-().]/g, '').trim();
  if (!cleaned) {
    return {
      valid: false,
      normalized: null,
      formatted: null,
      error: 'Enter your M-Pesa phone number.',
    };
  }

  let candidate = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;
  if (candidate.startsWith('0') && candidate.length === 10) {
    candidate = `254${candidate.slice(1)}`;
  } else if ((candidate.startsWith('7') || candidate.startsWith('1')) && candidate.length === 9) {
    candidate = `254${candidate}`;
  }

  if (!SAFARICOM_MSISDN_REGEX.test(candidate)) {
    return {
      valid: false,
      normalized: null,
      formatted: null,
      error: 'M-Pesa STK Push requires a valid Safaricom M-Pesa number (07xx or 011x).',
    };
  }

  return {
    valid: true,
    normalized: candidate,
    formatted: formatKenyanPhoneDisplay(candidate),
  };
}

export function formatKenyanPhoneDisplay(msisdn: string): string {
  const digits = msisdn.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('254')) {
    const local = `0${digits.slice(3)}`;
    return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
  }
  return msisdn;
}

export function maskKenyanPhone(msisdn: string): string {
  const digits = msisdn.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('254')) {
    const local = `0${digits.slice(3)}`;
    return `${local.slice(0, 4)} *** ${local.slice(7)}`;
  }
  return '***';
}
