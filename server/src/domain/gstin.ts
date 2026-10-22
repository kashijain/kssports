import { findState, isKnownStateCode, normalizeStateCode } from './states.js';

const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * GSTIN check character, Luhn mod 36 as published for GSTIN.
 * `body` is the first 14 characters.
 */
export function gstinCheckCharacter(body: string): string {
  const mod = CHARSET.length;
  let factor = 2;
  let sum = 0;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    const codePoint = CHARSET.indexOf(body[i] ?? '');
    if (codePoint < 0) return '';
    let digit = factor * codePoint;
    factor = factor === 2 ? 1 : 2;
    digit = Math.floor(digit / mod) + (digit % mod);
    sum += digit;
  }
  return CHARSET[(mod - (sum % mod)) % mod] ?? '';
}

export type GstinResult = { ok: true; gstin: string } | { ok: false; message: string };

export function validateGstin(
  input: string,
  opts?: { expectedStateCode?: string; expectedPan?: string },
): GstinResult {
  const gstin = input.trim().toUpperCase();
  if (!gstin) return { ok: false, message: 'Enter a GSTIN or leave it blank.' };
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
    return { ok: false, message: 'GSTIN must be 15 characters, for example 27ABCDE1234F1Z5.' };
  }
  const stateCode = gstin.slice(0, 2);
  if (!isKnownStateCode(stateCode)) {
    return { ok: false, message: `GSTIN starts with ${stateCode}, which is not a known state code.` };
  }
  const expected = gstinCheckCharacter(gstin.slice(0, 14));
  if (!expected || expected !== gstin[14]) {
    return { ok: false, message: 'That GSTIN checksum does not match. Check the last character.' };
  }
  if (opts?.expectedStateCode) {
    const selected = normalizeStateCode(opts.expectedStateCode);
    if (selected && selected !== stateCode) {
      const fromGstin = findState(stateCode)?.name ?? stateCode;
      const selectedName = findState(selected)?.name ?? selected;
      return {
        ok: false,
        message: `This GSTIN is registered in ${fromGstin} (${stateCode}), but the selected state is ${selectedName} (${selected}).`,
      };
    }
  }
  if (opts?.expectedPan) {
    const pan = opts.expectedPan.trim().toUpperCase();
    if (pan && gstin.slice(2, 12) !== pan) {
      return { ok: false, message: 'The GSTIN does not contain the PAN you entered.' };
    }
  }
  return { ok: true, gstin };
}

export type PanResult = { ok: true; pan: string } | { ok: false; message: string };

export function validatePan(input: string): PanResult {
  const pan = input.trim().toUpperCase();
  if (!pan) return { ok: false, message: 'Enter a PAN or leave it blank.' };
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
    return { ok: false, message: 'PAN must be 10 characters, for example ABCDE1234F.' };
  }
  return { ok: true, pan };
}

export function validateIfsc(input: string): { ok: true; ifsc: string } | { ok: false; message: string } {
  const ifsc = input.trim().toUpperCase();
  if (!ifsc) return { ok: false, message: 'Enter an IFSC or leave bank details blank.' };
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
    return { ok: false, message: 'IFSC should look like SBIN0001234.' };
  }
  return { ok: true, ifsc };
}

export function validateUpi(input: string): { ok: true; upiId: string } | { ok: false; message: string } {
  const upiId = input.trim();
  if (!upiId) return { ok: false, message: 'Enter a UPI ID or leave it blank.' };
  if (!/^[\w.\-]{2,64}@[\w.\-]{2,64}$/.test(upiId)) {
    return { ok: false, message: 'UPI ID should look like shop@okbank.' };
  }
  return { ok: true, upiId };
}

export function normalizeMobile(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (!digits) return '';
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  if (/^[6-9][0-9]{9}$/.test(local)) return local;
  return null;
}
