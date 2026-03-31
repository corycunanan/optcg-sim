"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-white/10 text-content-inverse"
          : "text-content-inverse/70 hover:bg-white/10 hover:text-content-inverse",
      )}
    >
      {children}
    </Link>
  );
}

function NavDropdown({
  label,
  active,
  children,
}: {
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            active
              ? "bg-white/10 text-content-inverse"
              : "text-content-inverse/70 hover:bg-white/10 hover:text-content-inverse",
          )}
        >
          {label}
          <ChevronDown className="size-3 transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();

  if (!session?.user) return null;
  if (pathname.startsWith("/game/")) return null;

  const cardsActive = pathname.startsWith("/admin/cards") || pathname.startsWith("/admin/sets");
  const decksActive = pathname.startsWith("/decks");
  const playActive = pathname.startsWith("/lobbies") || pathname.startsWith("/game");

  return (
    <nav className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-8 border-b border-black/20 bg-surface-nav px-6">
      {/* Logo */}
      <Link
        href="/"
        className="shrink-0 font-display text-lg font-bold tracking-tight text-content-inverse"
      >
        OPTCG
      </Link>

      {/* Nav links */}
      <div className="flex items-center gap-1">
        <NavLink href="/" active={pathname === "/"}>
          Home
        </NavLink>

        <NavDropdown label="Cards" active={cardsActive}>
          <DropdownMenuItem asChild>
            <Link href="/admin/cards">All Cards</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/admin/sets">Sets</Link>
          </DropdownMenuItem>
        </NavDropdown>

        <NavLink href="/lobbies" active={playActive}>
          Play
        </NavLink>

        <NavDropdown label="Decks" active={decksActive}>
          <DropdownMenuItem asChild>
            <Link href="/decks">My Decks</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/decks/new">+ New Deck</Link>
          </DropdownMenuItem>
        </NavDropdown>
      </div>
    </nav>
  );
}
