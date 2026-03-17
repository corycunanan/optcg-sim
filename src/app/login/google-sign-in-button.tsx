"use client";

import { useEffect, useState } from "react";

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
export function GoogleSignInButton({
  callbackUrl,
}: {
  callbackUrl: string;
}) {
  const [csrfToken, setCsrfToken] = useState<string>("");

  useEffect(() => {
    fetch("/api/auth/csrf")
      .then((res) => res.json())
      .then((data) => setCsrfToken(data.csrfToken))
      .catch(console.error);
  }, []);

  return (
    <form action="/api/auth/signin/google" method="POST">
      <input type="hidden" name="csrfToken" value={csrfToken} />
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <button
        type="submit"
        disabled={!csrfToken}
        className="flex w-full items-center justify-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold transition-all hover:brightness-110 disabled:opacity-50"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
        }}
      >
        <GoogleIcon />
        Continue with Google
      </button>
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
