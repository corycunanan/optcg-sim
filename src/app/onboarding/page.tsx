"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OnboardingPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const trimmed = username.trim();

    // Client-side validation
    if (trimmed.length < 3) {
      setError("Username must be at least 3 characters.");
      setSaving(false);
      return;
    }

    if (trimmed.length > 20) {
      setError("Username must be 20 characters or fewer.");
      setSaving(false);
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      setError(
        "Username can only contain letters, numbers, hyphens, and underscores."
      );
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/user/username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmed }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to set username");
      }

      router.push("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-8">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-content-primary">
            Welcome aboard!
          </h1>
          <p className="mt-2 text-sm text-content-tertiary">
            Choose a username to get started
          </p>
        </div>

        {/* Form card */}
        <div className="rounded border border-border bg-surface-1 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded border border-error/20 bg-error-soft p-3 text-sm font-medium text-error">
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="username"
                className="mb-2 block text-sm font-medium text-content-secondary"
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="pirate_king"
                autoFocus
                className="w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm text-content-primary placeholder:text-content-tertiary focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-navy-900/10"
              />
              <p className="mt-2 text-xs text-content-tertiary">
                3–20 characters. Letters, numbers, hyphens, underscores.
              </p>
            </div>

            <button
              type="submit"
              disabled={saving || !username.trim()}
              className="w-full rounded bg-navy-900 px-4 py-2 text-sm font-semibold text-content-inverse transition-colors hover:bg-navy-800 active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? "Setting up…" : "Set Username"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
