import { DomainError } from './errors.js';

export function toPaise(rupees: number): number {
  if (!Number.isFinite(rupees)) throw new DomainError('Amount must be a number.');
  return Math.round(rupees * 100);
}

export function fromPaise(paise: number): number {
  return Math.round(paise) / 100;
}

export function formatInr(rupees: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees || 0);
}

export function roundRate(rate: number): number {
  if (!Number.isFinite(rate)) throw new DomainError('GST rate must be a number.');
  return Math.round(rate * 100) / 100;
}
