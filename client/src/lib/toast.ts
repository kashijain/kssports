import { toast } from 'sonner';
import { ApiError } from './api';

export function fail(error: unknown) {
  if (error instanceof ApiError) toast.error(error.message);
  else toast.error('Something went wrong. Please try again.');
}

export function fieldErrors(error: unknown): Record<string, string> {
  return error instanceof ApiError && error.fields ? error.fields : {};
}
