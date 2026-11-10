/**
 * What every data function returns: the data, or an error with a message
 * (and a code where one is meaningful, e.g. '23505' for "already exists").
 * The same shape will come back once a module reads from the API instead.
 */
export interface DataError {
  message: string;
  code?: string;
}

export type DataResult<T> = { data: T; error: null } | { data: null; error: DataError };

export function ok<T>(data: T): DataResult<T> {
  return { data, error: null };
}

export function fail(error: { message: string; code?: string } | null | undefined, fallback = 'Something went wrong.'): DataResult<never> {
  return { data: null, error: { message: error?.message ?? fallback, code: error?.code } };
}

/** Wraps a backend response ({ data, error }) as a DataResult. */
export function fromResponse<T>(res: { data: unknown; error: { message: string; code?: string } | null }): DataResult<T> {
  if (res.error) return fail(res.error);
  if (res.data === null || res.data === undefined) return fail(null, 'Not found.');
  return ok(res.data as T);
}
