import { auth, signIn } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  const { callbackUrl } = await searchParams;

  // Already logged in — redirect to callback or admin
  if (session) {
    redirect(callbackUrl || "/admin");
  }

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center p-8"
      style={{ background: "var(--surface-0)" }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-10 text-center">
          <Link href="/">
            <h1
              className="text-4xl font-bold tracking-tight"
              style={{ color: "var(--text-primary)" }}
            >
              OPTCG{" "}
              <span style={{ color: "var(--accent)" }}>Simulator</span>
            </h1>
          </Link>
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--text-tertiary)" }}
          >
            Sign in to manage decks, play games, and more
          </p>
        </div>

        {/* Sign in card */}
        <div
          className="rounded-xl p-6"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <form
            action={async () => {
              "use server";
              await signIn("google", {
                redirectTo: callbackUrl || "/admin",
              });
            }}
          >
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold transition-all hover:brightness-110"
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

          <div className="mt-4 text-center">
            <p
              className="text-xs"
              style={{ color: "var(--text-tertiary)" }}
            >
              By signing in, you agree to our terms of use
            </p>
          </div>
        </div>

        {/* Back to home */}
        <div className="mt-6 text-center">
          <Link
            href="/"
            className="text-sm transition-colors hover:underline"
            style={{ color: "var(--text-tertiary)" }}
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </main>
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
