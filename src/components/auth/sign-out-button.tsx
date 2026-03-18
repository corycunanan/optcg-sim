"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="rounded px-2 py-1 text-[11px] font-medium uppercase tracking-wider transition-colors hover:bg-white/5"
      style={{ color: "var(--text-tertiary)" }}
    >
      Sign out
    </button>
  );
}
