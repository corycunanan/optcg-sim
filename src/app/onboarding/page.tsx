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
    <main
      className="flex min-h-screen flex-col items-center justify-center p-8"
      style={{ background: "var(--surface-0)" }}
    >
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1
            className="text-3xl font-bold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            Welcome aboard!
          </h1>
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--text-tertiary)" }}
          >
            Choose a username to get started
          </p>
        </div>

        {/* Form card */}
        <div
          className="rounded-xl p-6"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div
                className="rounded-lg p-3 text-sm font-medium"
                style={{
                  background: "oklch(60% 0.18 25 / 0.1)",
                  color: "var(--error)",
                  border: "1px solid oklch(60% 0.18 25 / 0.2)",
                }}
              >
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="username"
                className="mb-1.5 block text-sm font-medium"
                style={{ color: "var(--text-secondary)" }}
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
                className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
              />
              <p
                className="mt-1.5 text-xs"
                style={{ color: "var(--text-tertiary)" }}
              >
                3–20 characters. Letters, numbers, hyphens, underscores.
              </p>
            </div>

            <button
              type="submit"
              disabled={saving || !username.trim()}
              className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50"
              style={{
                background: "var(--accent)",
                color: "var(--surface-0)",
              }}
            >
              {saving ? "Setting up…" : "Set Username"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
