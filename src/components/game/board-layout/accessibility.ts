export function getBoardZoneLabel(
  zoneKey: string | undefined,
  zoneName: string,
  detail: string
): string {
  const owner = zoneKey?.startsWith("p-")
    ? "Your"
    : zoneKey?.startsWith("o-")
      ? "Opponent's"
      : "Game";

  return `${owner} ${zoneName} area, ${detail}`;
}
