import { ZodError } from 'zod';
import { HttpError } from './http.js';

export function parseBody<T>(schema: { parse: (body: unknown) => T }, body: unknown): T {
  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of error.issues) fields[issue.path.join('.') || 'form'] = issue.message;
      throw new HttpError(400, error.issues[0]?.message || 'Check the highlighted fields.', fields);
    }
    throw error;
  }
}
