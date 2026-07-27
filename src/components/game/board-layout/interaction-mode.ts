"use client";

// BoardLayout interaction mode (OPT-290). Read by leaf components that own
// their own user-input affordances (right-click menu, attacker drag) so the
// sandbox's input gate can suppress them without prop-drilling. Production
// callers don't pass `interactionMode`, so the default ("full") leaves
// behavior unchanged.

import { createContext, useContext } from "react";

export type InteractionMode = "full" | "spectator" | "responseOnly";

/** True only when the current viewer cannot perform any game action.
 *  `responseOnly` deliberately remains false because sandbox prompt responses
 *  must stay keyboard- and assistive-technology-accessible. */
export function isReadOnlyViewer(interactionMode: InteractionMode): boolean {
  return interactionMode === "spectator";
}

const InteractionModeContext = createContext<InteractionMode>("full");

export const InteractionModeProvider = InteractionModeContext.Provider;

export function useInteractionMode(): InteractionMode {
  return useContext(InteractionModeContext);
}
