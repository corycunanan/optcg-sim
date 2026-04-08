/**
 * Deck list text parser.
 *
 * Supports common deck-list formats:
 *   - "Nx CARDID", "NxCARDID", "N CARDID"
 *   - "N Card Name (CARD-ID)"
 *   - "Leader: CARDID" / "Ldr: CARDID"
 *   - Bare "CARDID" (quantity defaults to 1)
 *
 * Skips blank lines, comments (// or #), and section headers.
 */

export interface ParsedLine {
  line: number;
  raw: string;
  cardId: string | null;
  quantity: number;
  error: string | null;
}

export function parseDeckList(text: string): ParsedLine[] {
  const lines = text.split("\n").map((l) => l.trim());
  const results: ParsedLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

    // Skip empty lines and comments
    if (!raw || raw.startsWith("//") || raw.startsWith("#")) continue;

    // Skip section headers: "Leader", "Character (40)", "Event (10)", etc.
    // These are lines with no card ID — either a bare word/phrase or word with (count)
    if (/^[A-Za-z][A-Za-z\s!!]*(?:\s*\(\d+\))?$/.test(raw)) continue;

    // Format: "N Card Name (CARD-ID)" — e.g. "4 Izo (ST22-002)"
    const namedMatch = raw.match(
      /^(\d+)\s+.+\(([A-Z]{2,}\d+-\d+)\)\s*$/i,
    );
    if (namedMatch) {
      const quantity = parseInt(namedMatch[1]);
      const cardId = namedMatch[2].toUpperCase();
      if (quantity < 1 || quantity > 4) {
        results.push({ line: i + 1, raw, cardId, quantity, error: `Invalid quantity: ${quantity} (must be 1-4)` });
      } else {
        results.push({ line: i + 1, raw, cardId, quantity, error: null });
      }
      continue;
    }

    // Try to parse: "Nx CARDID", "NxCARDID", "N CARDID", or just "CARDID"
    const match = raw.match(
      /^(?:(\d+)\s*[xX×]\s*)?([A-Z]{2,}\d+-\d+)(?:\s.*)?$/i,
    );

    if (!match) {
      // Try leader line format: "Leader: CARDID"
      const leaderMatch = raw.match(
        /^(?:leader|ldr)\s*[:=]\s*([A-Z]{2,}\d+-\d+)/i,
      );
      if (leaderMatch) {
        results.push({
          line: i + 1,
          raw,
          cardId: leaderMatch[1].toUpperCase(),
          quantity: 1,
          error: null,
        });
      } else {
        results.push({
          line: i + 1,
          raw,
          cardId: null,
          quantity: 0,
          error: `Could not parse line: "${raw}"`,
        });
      }
      continue;
    }

    const quantity = match[1] ? parseInt(match[1]) : 1;
    const cardId = match[2].toUpperCase();

    if (quantity < 1 || quantity > 4) {
      results.push({
        line: i + 1,
        raw,
        cardId,
        quantity,
        error: `Invalid quantity: ${quantity} (must be 1-4)`,
      });
      continue;
    }

    results.push({ line: i + 1, raw, cardId, quantity, error: null });
  }

  return results;
}
