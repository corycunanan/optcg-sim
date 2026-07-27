/**
 * Unforgeable marker for trusted in-process callers that already charged the
 * notification action limiter before delegating to the friend-request route.
 */
export const NOTIFICATION_ACTION_RATE_LIMIT_CHARGED = Symbol(
  "notification-action-rate-limit-charged",
);
