import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { GoogleSignInButton } from "./google-sign-in-button";

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
          <GoogleSignInButton callbackUrl={callbackUrl || "/admin"} />

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
