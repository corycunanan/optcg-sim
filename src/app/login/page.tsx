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
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-8">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-10 text-center">
          <Link href="/">
            <h1 className="font-display text-5xl font-bold leading-none tracking-tight text-content-primary">
              OPTCG{" "}
              <span className="text-navy-900">Simulator</span>
            </h1>
          </Link>
          <p className="mt-2 text-sm text-content-tertiary">
            Sign in to manage decks, play games, and more
          </p>
        </div>

        {/* Sign in card */}
        <div className="rounded border border-border bg-surface-1 p-6">
          <GoogleSignInButton callbackUrl={callbackUrl || "/admin"} />

          <div className="mt-4 text-center">
            <p className="text-xs text-content-tertiary">
              By signing in, you agree to our terms of use
            </p>
          </div>
        </div>

        {/* Back to home */}
        <div className="mt-6 text-center">
          <Link
            href="/"
            className="text-sm text-content-tertiary transition-colors hover:text-content-secondary hover:underline"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
