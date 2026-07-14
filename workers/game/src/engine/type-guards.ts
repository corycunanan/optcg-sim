/** Narrow nullable zone slots without assertions at each call site. */
export function isPresent<T>(value: T | null | undefined): value is T {
  return value != null;
}
