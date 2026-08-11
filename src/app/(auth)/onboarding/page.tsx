"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button, Label } from "@/components/ui";
import { apiPost } from "@/lib/api-client";
import { SetUsernameResponseSchema } from "@/lib/validators/user";

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
      await apiPost(
        "/api/user/username",
        { username: trimmed },
        SetUsernameResponseSchema
      );

      router.push("/decks");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="bg-background flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl text-content-primary">
            Welcome aboard!
          </h1>
          <p className="text-content-tertiary mt-2 text-sm">
            Choose a username to get started
          </p>
        </div>

        {/* Form card */}
        <div className="border-border bg-card rounded border p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="border-error/20 bg-error-soft text-error rounded border p-3 text-sm font-medium">
                {error}
              </div>
            )}

            <div>
              <Label
                htmlFor="username"
                className="mb-2 block"
              >
                Username
              </Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="pirate_king"
                autoFocus
              />
              <p className="text-content-tertiary mt-2 text-xs">
                3–20 characters. Letters, numbers, hyphens, underscores.
              </p>
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={saving || !username.trim()}
              className="w-full"
            >
              {saving ? "Setting up…" : "Set Username"}
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
