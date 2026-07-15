export const MIN_SUBSTRING_SEARCH_LENGTH = 3;

export function normalizeSubstringSearchQuery(value?: string | null) {
  return value?.trim() ?? "";
}

export function isSubstringSearchQueryTooShort(value?: string | null) {
  const query = normalizeSubstringSearchQuery(value);
  return query.length > 0 && query.length < MIN_SUBSTRING_SEARCH_LENGTH;
}
