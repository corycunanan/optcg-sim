"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api-client";
import { CsrfTokenResponseSchema } from "@/lib/validators/auth";
import { ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { AuthUnavailableAlert } from "./auth-unavailable-alert";

/**
 * Google sign-in button using direct form POST to the NextAuth route handler.
 *
 * Workaround for NextAuth v5 beta.30 + Next.js 16 compatibility issue:
 * The `signIn` server action fails because `createActionURL` can't read
 * `x-forwarded-proto` from headers in Next.js 16's server action context.
 * Direct form POST to `/api/auth/signin/google` bypasses this entirely.
 *
 * See: https://github.com/nextauthjs/next-auth/issues/13388
 */
export function GoogleSignInButton({ callbackUrl }: { callbackUrl: string }) {
  const [csrfToken, setCsrfToken] = useState<string>("");
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    apiGet("/api/auth/csrf", CsrfTokenResponseSchema)
      .then((data) => setCsrfToken(data.csrfToken))
      .catch((error) => {
        if (error instanceof ApiError && error.status === 503) {
          setUnavailable(true);
          return;
        }
        console.error(error);
      });
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUnavailable(false);

    try {
      const response = await fetch("/api/auth/signin/google", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Auth-Return-Redirect": "1",
        },
        body: new URLSearchParams({ csrfToken, callbackUrl }),
      });

      if (response.status === 503) {
        setUnavailable(true);
        return;
      }

      const data: unknown = await response.json().catch(() => null);
      if (
        response.ok &&
        typeof data === "object" &&
        data !== null &&
        "url" in data &&
        typeof data.url === "string"
      ) {
        window.location.href = data.url;
        return;
      }

      setUnavailable(true);
    } catch {
      setUnavailable(true);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {unavailable && (
        <div className="mb-4">
          <AuthUnavailableAlert />
        </div>
      )}
      <input type="hidden" name="csrfToken" value={csrfToken} />
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <Button type="submit" size="lg" disabled={!csrfToken} className="w-full">
        <GoogleIcon />
        Continue with Google
      </Button>
    </form>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 2.58 9 2.58z"
        fill="#EA4335"
      />
    </svg>
  );
}
