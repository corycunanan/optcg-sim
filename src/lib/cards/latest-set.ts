import { prisma } from "@/lib/db";

const BOOSTER_PACK_ID_PREFIX = "5691";
const CACHE_TTL_MS = 10 * 60 * 1000;
const FAILURE_CACHE_TTL_MS = 30 * 1000;

let latestSetCache: { value: string; expiresAt: number } | undefined;
let latestSetLookup: Promise<string> | undefined;

export async function getLatestBoosterSet(): Promise<string> {
  const now = Date.now();
  if (latestSetCache && latestSetCache.expiresAt > now) {
    return latestSetCache.value;
  }

  if (latestSetLookup) {
    return latestSetLookup;
  }

  latestSetLookup = (async () => {
    let value = "";
    let ttl = CACHE_TTL_MS;

    try {
      const latestSet = await prisma.cardSet.findFirst({
        where: { packId: { startsWith: BOOSTER_PACK_ID_PREFIX } },
        orderBy: { packId: "desc" },
        select: { setLabel: true },
      });
      value = latestSet?.setLabel ?? "";
    } catch {
      // Browsing all cards remains available if the latest-set lookup fails.
      ttl = FAILURE_CACHE_TTL_MS;
    }

    latestSetCache = { value, expiresAt: Date.now() + ttl };
    return value;
  })();

  try {
    return await latestSetLookup;
  } finally {
    latestSetLookup = undefined;
  }
}
