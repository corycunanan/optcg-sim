/** Read-only operator capture. Never call a reader/converter or the session writer. */

const EXPORT_PATH = /^\/game\/([^/]+)\/export$/;
const EXPORT_TTL_SECONDS = 300;
const encoder = new TextEncoder();

export function exportResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Same domain-separated signed GET at the public Worker and DO boundary. */
export async function authorizeSessionExport(
  request: Request,
  secret: string
): Promise<Response | null> {
  if (request.method !== "GET")
    return exportResponse("Method not allowed", 405);
  const url = new URL(request.url);
  if (!EXPORT_PATH.test(url.pathname) || url.search)
    return exportResponse("Bad request", 400);
  if (!secret) return exportResponse("Server misconfigured", 500);
  const match = /^SessionExport ([1-9]\d{0,11}):([0-9a-f]{64})$/.exec(
    request.headers.get("Authorization") ?? ""
  );
  if (!match) return exportResponse("Unauthorized", 401);
  const expires = Number(match[1]);
  const now = Math.floor(Date.now() / 1000);
  if (expires <= now || expires > now + EXPORT_TTL_SECONDS)
    return exportResponse("Unauthorized", 401);
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const signature = Uint8Array.from(match[2].match(/../g)!, (byte) =>
      parseInt(byte, 16)
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      encoder.encode(
        `optcg-session-export-v1\nGET\n${url.pathname}\n${match[1]}`
      )
    );
    return valid ? null : exportResponse("Unauthorized", 401);
  } catch {
    return exportResponse("Unauthorized", 401);
  }
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
function record(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

// Preserve the string-valued identity fields required by historical readers,
// but never their real values. The mapping is local to this export, not a hash
// that can correlate people across games. Traverse every nested snapshot/root.
const PERSON_KEYS = new Set(["playerId", "userId", "winnerId", "spectatorId"]);
const PRIVATE_KEYS = new Set([
  "consumedTokenJtis",
  "tokenLedger",
  "accessToken",
  "refreshToken",
  "authorization",
  "Authorization",
  "jwt",
  "secret",
  "GAME_WORKER_SECRET",
  "cardDb",
]);
const ART_KEYS = new Set(["sleeveUrl", "donArtUrl", "imageUrl"]);
const NAME_KEYS = new Set(["displayName", "spectatorName", "email"]);
function isBlindSlot(value: unknown): boolean {
  return (
    record(value) &&
    Object.keys(value).length === 2 &&
    typeof value.instanceId === "string" &&
    typeof value.token === "string" &&
    /^blind_[0-9a-z]{8}-\d+$/.test(value.token)
  );
}

export function sanitizeSessionCapture(
  state: unknown,
  undoHistory: unknown
): { state: Json; undoHistory: Json[] } {
  if (
    !record(state) ||
    typeof state.id !== "string" ||
    !Array.isArray(undoHistory) ||
    !undoHistory.every((value) => record(value) && typeof value.id === "string")
  )
    throw new Error("Invalid capture shape");
  const aliases = new Map<string, string>();
  let players = 0;
  let games = 0;
  const remember = (value: unknown, alias: () => string) => {
    if (typeof value === "string" && value.length && !aliases.has(value))
      aliases.set(value, alias());
  };
  for (const snapshot of [state, ...undoHistory])
    remember(snapshot.id, () => `captured-game-${games++}`);
  const active = new Set<object>();
  let visited = 0;
  // Bound malformed graphs rather than exposing raw parser errors or partial data.
  function inspect(value: unknown, depth: number): void {
    if (++visited > 1_000_000 || depth > 100)
      throw new Error("Unsupported capture graph");
    if (
      value === undefined ||
      value === null ||
      typeof value === "boolean" ||
      typeof value === "string" ||
      (typeof value === "number" && Number.isFinite(value))
    )
      return;
    if (
      typeof value !== "object" ||
      (!Array.isArray(value) && !record(value)) ||
      active.has(value)
    )
      throw new Error("Unsupported capture graph");
    active.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (PERSON_KEYS.has(key))
        remember(child, () => `captured-player-${players++}`);
      if (key === "gameId") remember(child, () => `captured-game-${games++}`);
      if (
        (key === "consumedTokenJtis" || key === "tokenLedger") &&
        record(child)
      ) {
        for (const tokenId of Object.keys(child))
          remember(tokenId, () => "redacted");
      }
      if (
        ART_KEYS.has(key) ||
        PRIVATE_KEYS.has(key) ||
        NAME_KEYS.has(key) ||
        (key === "token" && !isBlindSlot(value))
      )
        remember(child, () => "redacted");
      inspect(child, depth + 1);
    }
    active.delete(value);
  }
  inspect([state, ...undoHistory], 0);
  // Longest first avoids a shorter ID consuming the prefix of another ID.
  const replacements = [...aliases.keys()].sort((a, b) => b.length - a.length);
  const privatePattern = new RegExp(
    replacements
      .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|"),
    "g"
  );
  function text(value: string): string {
    // One pass: a replacement must never be reinterpreted as another raw ID.
    const sanitized = value
      .replace(privatePattern, (original) => aliases.get(original)!)
      .replace(/https?:\/\/[^\s"<>]+/gi, "redacted-url");
    if (replacements.some((original) => sanitized.includes(original)))
      throw new Error("Private alias collision");
    return sanitized;
  }
  function clean(value: unknown): Json {
    if (typeof value === "string") return text(value);
    if (value === undefined) return null; // JSON array semantics; absent object fields stay absent below.
    if (
      value === null ||
      typeof value === "number" ||
      typeof value === "boolean"
    )
      return value;
    if (Array.isArray(value)) return value.map(clean);
    const entries: [string, Json][] = [];
    for (const [key, child] of Object.entries(
      value as Record<string, unknown>
    )) {
      if (child === undefined || PRIVATE_KEYS.has(key)) continue;
      // Card identity and blind-choice tokens are structural, not credentials.
      // Refuse a collision with private data rather than silently corrupting it.
      if (
        (key === "instanceId" || key === "cardId") &&
        typeof child === "string" &&
        text(child) !== child
      )
        throw new Error("Private structural identity collision");
      const blindToken = key === "token" && isBlindSlot(value);
      if (key === "token" && !blindToken) continue;
      const sanitizedKey = text(key);
      if (entries.some(([existing]) => existing === sanitizedKey))
        throw new Error("Private key collision");
      entries.push([
        sanitizedKey,
        ART_KEYS.has(key)
          ? null
          : NAME_KEYS.has(key)
            ? "redacted"
            : clean(child),
      ]);
    }
    return Object.fromEntries(entries);
  }
  return { state: clean(state), undoHistory: undoHistory.map(clean) };
}

/** Read raw storage atomically, including embedded-undo precedence of old writers. */
export async function handleSessionExportRequest(
  request: Request,
  secret: string,
  storage: DurableObjectStorage
): Promise<Response> {
  const rejected = await authorizeSessionExport(request, secret);
  if (rejected) return rejected;
  try {
    const values = await storage.transaction((tx) =>
      tx.get<unknown>(["session", "session:undo-history"])
    );
    const raw = values.get("session");
    if (raw === undefined) return exportResponse("Session absent", 404);
    if (
      !record(raw) ||
      !record(raw.state) ||
      raw.state.id !== new URL(request.url).pathname.match(EXPORT_PATH)![1]
    )
      return exportResponse("Unsupported stored session", 422);
    const embedded = raw.undoHistory !== undefined;
    const undo = embedded
      ? raw.undoHistory
      : (values.get("session:undo-history") ?? []);
    const sanitized = sanitizeSessionCapture(raw.state, undo);
    return Response.json(
      {
        provenance: {
          source: "durable-object-storage",
          sanitizationVersion: 1,
          exportedAt: new Date(Date.now()).toISOString(),
          undoSource: embedded
            ? "embedded"
            : values.has("session:undo-history")
              ? "separate"
              : "absent",
          // Do not copy arbitrary storage metadata into the response.
          ...(typeof raw.formatVersion === "number"
            ? { storageFormatVersion: raw.formatVersion }
            : {}),
        },
        ...sanitized,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  } catch {
    // No exception text, raw values, game IDs or credentials enter logs/errors.
    return exportResponse("Unable to export stored session", 422);
  }
}
