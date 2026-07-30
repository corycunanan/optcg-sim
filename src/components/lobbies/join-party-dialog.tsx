"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { ApiError, apiPost } from "@/lib/api-client";
import { normalizeLobbyCode } from "@/lib/lobbies";
import { JoinLobbyResponseSchema } from "@/lib/validators/lobbies";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  PartySwitchConfirmation,
  partySwitchDetailsFromError,
  type PartySwitchDetails,
} from "./party-switch-confirmation";

export function JoinPartyDialog({
  disabled = false,
  initialCode,
}: {
  disabled?: boolean;
  initialCode?: string;
}) {
  const router = useRouter();
  const normalizedInitialCode = initialCode
    ? normalizeLobbyCode(initialCode).slice(0, 6)
    : "";
  const [open, setOpen] = useState(
    Boolean(normalizedInitialCode) && !disabled
  );
  const [code, setCode] = useState(normalizedInitialCode);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [switchDetails, setSwitchDetails] = useState<PartySwitchDetails | null>(
    null
  );

  useEffect(() => {
    if (!disabled) return;
    setOpen(false);
    setSwitchDetails(null);
  }, [disabled]);

  const submit = async (confirmDisbandLobbyId?: string) => {
    if (disabled) return;

    const normalizedCode = normalizeLobbyCode(code);
    if (normalizedCode.length !== 6) {
      setError("Enter a valid 6-character party code");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await apiPost(
        "/api/lobbies/join",
        {
          code: normalizedCode,
          ...(confirmDisbandLobbyId ? { confirmDisbandLobbyId } : {}),
        },
        JoinLobbyResponseSchema
      );
      setSwitchDetails(null);
      setOpen(false);
      router.push(`/lobbies/${response.data.lobbyId}`);
    } catch (caught) {
      if (caught instanceof ApiError) {
        const details = partySwitchDetailsFromError(caught.body);
        if (details) {
          setOpen(false);
          setSwitchDetails(details);
          return;
        }
        if (confirmDisbandLobbyId) setSwitchDetails(null);
        setError(caught.message);
        if (confirmDisbandLobbyId) setOpen(true);
      } else {
        if (confirmDisbandLobbyId) setSwitchDetails(null);
        setError("Could not join party");
        if (confirmDisbandLobbyId) setOpen(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit();
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (busy || (disabled && nextOpen)) return;
          setOpen(nextOpen);
          if (nextOpen) setError(null);
        }}
      >
        <DialogTrigger asChild>
          <Button className="h-12" variant="outline" disabled={disabled}>
            <LogIn data-icon="inline-start" />
            Join lobby
          </Button>
        </DialogTrigger>
        <DialogContent>
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>Join by code</DialogTitle>
              <DialogDescription>
                Enter a friend&apos;s party code to switch over to their lobby.
                Your party stays put until you intentionally join.
              </DialogDescription>
            </DialogHeader>
            <div className="py-6">
              <Input
                value={code}
                onChange={(event) => {
                  setCode(normalizeLobbyCode(event.target.value).slice(0, 6));
                  setError(null);
                }}
                placeholder="ABC123"
                aria-label="Party code"
                aria-invalid={Boolean(error)}
                autoComplete="off"
                autoFocus
              />
              {error && (
                <p className="text-error mt-2 text-sm" role="alert">
                  {error}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy || code.length !== 6}>
                {busy ? "Joining…" : "Join party"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <PartySwitchConfirmation
        open={Boolean(switchDetails)}
        details={switchDetails}
        busy={busy}
        onStay={() => setSwitchDetails(null)}
        onConfirm={() => void submit(switchDetails?.currentLobbyId)}
      />
    </>
  );
}
