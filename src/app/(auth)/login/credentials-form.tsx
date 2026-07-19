"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ApiError, apiPost } from "@/lib/api-client";
import { RegisterResponseSchema } from "@/lib/validators/auth";
import { AuthUnavailableAlert } from "./auth-unavailable-alert";

type Mode = "signin" | "signup";

export function CredentialsForm({
  callbackUrl,
  initialMode = "signin",
}: {
  callbackUrl: string;
  initialMode?: Mode;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setSuccess(null);
    setPassword("");
    setConfirm("");
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email,
        password,
        callbackUrl,
        redirect: false,
      });
      if (result?.status === 503) {
        setError("auth-unavailable");
      } else if (result?.error) {
        setError("Invalid email or password.");
      } else if (result?.url) {
        window.location.href = result.url;
      }
    } catch {
      setError("auth-unavailable");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await apiPost(
        "/api/auth/register",
        { email, username, password },
        RegisterResponseSchema
      );
      // Auto sign-in after registration
      const result = await signIn("credentials", {
        email,
        password,
        callbackUrl,
        redirect: false,
      });
      if (result?.status === 503) {
        setError("auth-unavailable");
      } else if (result?.url) {
        window.location.href = result.url;
      }
    } catch (error) {
      if (error instanceof ApiError) {
        setError(
          error.status === 503
            ? "auth-unavailable"
            : error.message || "Registration failed."
        );
        return;
      }
      setError("auth-unavailable");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* Tab switcher */}
      <div className="border-border bg-secondary mb-5 flex rounded-md border p-1">
        <button
          type="button"
          onClick={() => switchMode("signin")}
          className={cn(
            "flex-1 rounded py-2 text-sm font-semibold transition-colors",
            mode === "signin"
              ? "bg-card text-content-primary shadow-sm"
              : "text-content-tertiary hover:text-content-secondary"
          )}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => switchMode("signup")}
          className={cn(
            "flex-1 rounded py-2 text-sm font-semibold transition-colors",
            mode === "signup"
              ? "bg-card text-content-primary shadow-sm"
              : "text-content-tertiary hover:text-content-secondary"
          )}
        >
          Create Account
        </button>
      </div>

      {error === "auth-unavailable" ? (
        <div className="mb-4">
          <AuthUnavailableAlert />
        </div>
      ) : error ? (
        <div className="border-error bg-error-soft text-error mb-4 rounded-md border px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}
      {success && (
        <div className="border-success bg-success-soft text-success mb-4 rounded-md border px-4 py-3 text-sm">
          {success}
        </div>
      )}

      {mode === "signin" ? (
        <form onSubmit={handleSignIn} className="space-y-3">
          <div>
            <label className="text-content-secondary mb-1 block text-xs font-semibold">
              Email
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="text-content-secondary mb-1 block text-xs font-semibold">
              Password
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Signing in..." : "Sign In"}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleSignUp} className="space-y-3">
          <div>
            <label className="text-content-secondary mb-1 block text-xs font-semibold">
              Email
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="text-content-secondary mb-1 block text-xs font-semibold">
              Username
            </label>
            <Input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              placeholder="3-20 chars, letters/numbers/_"
            />
          </div>
          <div>
            <label className="text-content-secondary mb-1 block text-xs font-semibold">
              Password
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="Minimum 8 characters"
            />
          </div>
          <div>
            <label className="text-content-secondary mb-1 block text-xs font-semibold">
              Confirm Password
            </label>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Creating account..." : "Create Account"}
          </Button>
        </form>
      )}
    </div>
  );
}
