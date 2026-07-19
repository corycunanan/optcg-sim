import { searchLimiter } from "@/lib/rate-limit";

type RequestHeaders = Pick<Headers, "get">;

export const PUBLIC_CARD_BROWSE_RATE_LIMIT_HEADER =
  "x-optcg-card-browse-rate-limit";

export function consumePublicCardBrowseRateLimit(
  requestHeaders: RequestHeaders
) {
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0] ?? "unknown";

  return searchLimiter.check(`card-search:${ip}`);
}

export async function checkPublicCardBrowseRateLimit(
  requestHeaders: RequestHeaders
) {
  if (requestHeaders.get(PUBLIC_CARD_BROWSE_RATE_LIMIT_HEADER) === "allowed") {
    return { limited: false, remaining: null };
  }

  return consumePublicCardBrowseRateLimit(requestHeaders);
}
