import { searchLimiter } from "@/lib/rate-limit";

type RequestHeaders = Pick<Headers, "get">;

export async function checkPublicCardBrowseRateLimit(
  requestHeaders: RequestHeaders
) {
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0] ?? "unknown";

  return searchLimiter.check(`card-search:${ip}`);
}
