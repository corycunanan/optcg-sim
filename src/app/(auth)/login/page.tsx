import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CredentialsForm } from "./credentials-form";
import { GoogleSignInButton } from "./google-sign-in-button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; mode?: string }>;
}) {
  const session = await auth();
  const { callbackUrl, mode } = await searchParams;

  if (session) {
    redirect(callbackUrl || "/decks");
  }

  return (
    <main className="bg-background flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-10 text-center">
          <Link href="/">
            <h1 className="font-display text-content-primary text-5xl leading-none font-bold tracking-tight">
              OPTCG <span className="text-gold-500">Simulator</span>
            </h1>
          </Link>
          <p className="text-content-tertiary mt-2 text-sm">
            Sign in to manage decks, play games, and more
          </p>
        </div>

        {/* Sign in card */}
        <div className="border-border bg-card rounded border p-6">
          <CredentialsForm
            callbackUrl={callbackUrl || "/decks"}
            initialMode={mode === "signup" ? "signup" : "signin"}
          />

          {/* Divider */}
          <div className="my-5 flex items-center gap-3">
            <div className="border-border flex-1 border-t" />
            <span className="text-content-tertiary text-xs">or</span>
            <div className="border-border flex-1 border-t" />
          </div>

          <GoogleSignInButton callbackUrl={callbackUrl || "/decks"} />

          <p className="text-content-tertiary mt-4 text-center text-xs">
            By signing in, you agree to our terms of use
          </p>
        </div>

        {/* Back to home */}
        <div className="mt-6 text-center">
          <Link
            href="/"
            className="text-content-tertiary hover:text-content-secondary text-sm transition-colors hover:underline"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
