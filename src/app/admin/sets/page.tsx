import { SetBrowser } from "@/components/cards/set-browser";

export const dynamic = "force-dynamic";

export default function AdminSetsPage() {
  return <SetBrowser cardsRoute="/admin/cards" />;
}
