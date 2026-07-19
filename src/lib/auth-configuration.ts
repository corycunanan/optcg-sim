export const AUTH_UNAVAILABLE_RESPONSE_MESSAGE =
  "Authentication is temporarily unavailable.";

export const AUTH_UNAVAILABLE_ALERT_MESSAGE =
  "Sign-in is temporarily unavailable because this deployment is missing its authentication configuration.";

type AuthDegradationSite = "session-read" | "proxy" | "mutation-guard";

const AUTH_DEGRADATION_LOG_INTERVAL_MS = 5 * 60 * 1000;
const lastLogAtBySite = new Map<AuthDegradationSite, number>();

export function hasAuthSecret() {
  return Boolean(process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET);
}

export function logAuthConfigurationDegraded(site: AuthDegradationSite) {
  const now = Date.now();
  const lastLogAt = lastLogAtBySite.get(site);

  if (
    lastLogAt !== undefined &&
    now >= lastLogAt &&
    now - lastLogAt < AUTH_DEGRADATION_LOG_INTERVAL_MS
  ) {
    return;
  }

  lastLogAtBySite.set(site, now);
  console.error(
    `[AUTH_CONFIG] AUTH_SECRET missing — auth degraded to signed-out (site=${site})`
  );
}

export function authUnavailableResponse() {
  return Response.json(
    { message: AUTH_UNAVAILABLE_RESPONSE_MESSAGE },
    { status: 503 }
  );
}
