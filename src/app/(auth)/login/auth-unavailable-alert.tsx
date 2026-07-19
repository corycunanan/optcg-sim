import { AUTH_UNAVAILABLE_ALERT_MESSAGE } from "@/lib/auth-configuration";

export function AuthUnavailableAlert() {
  return (
    <div
      role="alert"
      className="border-error bg-error-soft text-error rounded-md border px-4 py-3 text-sm"
    >
      {AUTH_UNAVAILABLE_ALERT_MESSAGE}
    </div>
  );
}
