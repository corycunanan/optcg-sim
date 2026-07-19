"use client";

import Link from "next/link";
import { CardBrowser } from "@/components/cards/card-browser";
import { Button } from "@/components/ui/button";
import type { CardBrowserData } from "@/lib/cards/browser";

export function AdminCardBrowser(props: CardBrowserData) {
  return (
    <CardBrowser
      {...props}
      routePath="/admin/cards"
      renderDetailActions={(card) =>
        card ? (
          <Button asChild>
            <Link href={`/admin/cards/${card.id}/edit`}>Edit Card</Link>
          </Button>
        ) : null
      }
    />
  );
}
