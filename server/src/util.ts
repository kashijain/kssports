import mongoose from 'mongoose';
import { HttpError } from './http.js';

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function oid(id: string): mongoose.Types.ObjectId {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'That record was not found.');
  return new mongoose.Types.ObjectId(id);
}

export function pageQuery(query: { page?: unknown; limit?: unknown }): { page: number; limit: number; skip: number } {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

export function isDuplicate(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: number }).code === 11000);
}

export function roundMoney(value: number): number {
  return Math.round((value || 0) * 100) / 100;
}
