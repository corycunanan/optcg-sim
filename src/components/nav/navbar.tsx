"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={cn("h-3 w-3", className)}>
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DropdownMenu({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <div
      className={cn(
        "absolute top-full mt-1 z-50 min-w-40 rounded-lg border border-border bg-background shadow-lg py-1",
        align === "right" ? "right-0" : "left-0",
      )}
    >
      {children}
    </div>
  );
}

function DropdownLink({ href, onClick, children }: { href: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="block mx-1 rounded-md px-3 py-2 text-sm text-content-primary transition-colors hover:bg-surface-2"
    >
      {children}
    </Link>
  );
}

export function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpen(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Close dropdowns on navigation
  useEffect(() => { setOpen(null); }, [pathname]);

  if (!session?.user) return null;

  const toggle = (name: string) => setOpen((v) => (v === name ? null : name));

  const cardsActive = pathname.startsWith("/admin/cards") || pathname.startsWith("/admin/sets");
  const decksActive = pathname.startsWith("/decks");
  const playActive = pathname.startsWith("/lobbies") || pathname.startsWith("/game");

  return (
    <nav
      ref={navRef}
      className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-8 border-b border-black/20 bg-surface-nav px-6"
    >
      {/* Logo */}
      <Link
        href="/"
        className="shrink-0 font-display text-lg font-bold tracking-tight text-content-inverse"
      >
        OPTCG
      </Link>

      {/* Nav links */}
      <div className="flex items-center gap-1">
        {/* Home */}
        <Link
          href="/"
          className={cn(
            "rounded px-3 py-2 text-sm font-medium transition-colors",
            pathname === "/"
              ? "bg-white/10 text-content-inverse"
              : "text-content-inverse/70 hover:bg-white/10 hover:text-content-inverse",
          )}
        >
          Home
        </Link>

        {/* Cards dropdown */}
        <div className="relative">
          <button
            onClick={() => toggle("cards")}
            className={cn(
              "flex items-center gap-1 rounded px-3 py-2 text-sm font-medium transition-colors",
              cardsActive || open === "cards"
                ? "bg-white/10 text-content-inverse"
                : "text-content-inverse/70 hover:bg-white/10 hover:text-content-inverse",
            )}
          >
            Cards
            <ChevronDown className={cn("transition-transform", open === "cards" && "rotate-180")} />
          </button>
          {open === "cards" && (
            <DropdownMenu>
              <DropdownLink href="/admin/cards" onClick={() => setOpen(null)}>All Cards</DropdownLink>
              <DropdownLink href="/admin/sets" onClick={() => setOpen(null)}>Sets</DropdownLink>
            </DropdownMenu>
          )}
        </div>

        {/* Play */}
        <Link
          href="/lobbies"
          className={cn(
            "rounded px-3 py-2 text-sm font-medium transition-colors",
            playActive
              ? "bg-white/10 text-content-inverse"
              : "text-content-inverse/70 hover:bg-white/10 hover:text-content-inverse",
          )}
        >
          Play
        </Link>

        {/* Decks dropdown */}
        <div className="relative">
          <button
            onClick={() => toggle("decks")}
            className={cn(
              "flex items-center gap-1 rounded px-3 py-2 text-sm font-medium transition-colors",
              decksActive || open === "decks"
                ? "bg-white/10 text-content-inverse"
                : "text-content-inverse/70 hover:bg-white/10 hover:text-content-inverse",
            )}
          >
            Decks
            <ChevronDown className={cn("transition-transform", open === "decks" && "rotate-180")} />
          </button>
          {open === "decks" && (
            <DropdownMenu>
              <DropdownLink href="/decks" onClick={() => setOpen(null)}>My Decks</DropdownLink>
              <DropdownLink href="/decks/new" onClick={() => setOpen(null)}>+ New Deck</DropdownLink>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Account */}
      <div className="relative ml-auto">
        <button
          onClick={() => toggle("account")}
          className="flex items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-white/10"
        >
          {session.user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={session.user.image}
              alt=""
              className="h-7 w-7 rounded-full border border-white/20"
            />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gold-500 text-xs font-bold text-navy-900">
              {(session.user.username || session.user.name || "?").charAt(0).toUpperCase()}
            </div>
          )}
          <span className="text-sm font-medium text-content-inverse/80">
            {session.user.username || session.user.name}
          </span>
          <ChevronDown
            className={cn("text-content-inverse/50 transition-transform", open === "account" && "rotate-180")}
          />
        </button>
        {open === "account" && (
          <DropdownMenu align="right">
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="mx-1 block w-[calc(100%-0.5rem)] rounded-md px-3 py-2 text-left text-sm text-content-primary transition-colors hover:bg-surface-2"
            >
              Sign Out
            </button>
          </DropdownMenu>
        )}
      </div>
    </nav>
  );
}
