"use client";

import { useContext } from "react";
import {
  BoardScaleContext,
  type BoardScaleContextValue,
} from "./board-scale-context";

export function useBoardScale(): BoardScaleContextValue {
  const ctx = useContext(BoardScaleContext);
  if (!ctx) {
    throw new Error("useBoardScale must be used within a <ScaledBoard>.");
  }
  return ctx;
}
