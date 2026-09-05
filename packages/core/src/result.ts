/**
 * The SDK's single error-reporting convention.
 *
 * Spire is headless: it never throws for expected failures and never logs. Every
 * operation that can fail for a reason the caller might handle returns a
 * `Result`, so the host decides what to do. Exceptions stay reserved for
 * programmer errors (a bug in Spire itself).
 */
export type Result<T, E> = Ok<T> | Err<E>;

export interface Ok<T> {
	readonly ok: true;
	readonly value: T;
}

export interface Err<E> {
	readonly ok: false;
	readonly error: E;
}

export function ok<T>(value: T): Ok<T> {
	return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
	return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
	return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
	return !result.ok;
}

/** Transform the success value, leaving an error untouched. */
export function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
	return result.ok ? ok(fn(result.value)) : result;
}

/** Transform the error, leaving a success untouched. */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
	return result.ok ? result : err(fn(result.error));
}

export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
	return result.ok ? result.value : fallback;
}

/**
 * Collect a list of results into a result of a list. Errors accumulate: the
 * failure case carries *every* error, not just the first, because validation
 * callers want the whole list at once.
 */
export function collect<T, E>(results: readonly Result<T, E>[]): Result<T[], E[]> {
	const values: T[] = [];
	const errors: E[] = [];
	for (const result of results) {
		if (result.ok) {
			values.push(result.value);
		} else {
			errors.push(result.error);
		}
	}
	return errors.length > 0 ? err(errors) : ok(values);
}
