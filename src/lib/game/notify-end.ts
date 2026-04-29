export type NotifyEndPayload = {
  winnerIndex: 0 | 1;
  reason: string;
};

export function buildNotifyEndPayload(winnerIndex: 0 | 1, reason: string): NotifyEndPayload {
  return { winnerIndex, reason };
}
