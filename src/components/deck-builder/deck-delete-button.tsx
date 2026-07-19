"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EllipsisVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiDelete } from "@/lib/api-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DeckDeleteButtonProps {
  deckId: string;
  deckName: string;
}

export function DeckDeleteButton({ deckId, deckName }: DeckDeleteButtonProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await apiDelete(`/api/decks/${deckId}`);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? `Delete failed: ${error.message}`
          : "Couldn't delete that deck. Try again."
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label={`More actions for ${deckName}`}
            className="absolute top-2 right-2 size-12 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100 [@media(hover:hover)]:data-[state=open]:opacity-100"
          >
            <EllipsisVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem
              variant="destructive"
              className="min-h-12 min-w-12"
              onSelect={() => setConfirmationOpen(true)}
            >
              <Trash2 />
              Delete deck
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmationOpen} onOpenChange={setConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Deck</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deckName}&rdquo;? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
