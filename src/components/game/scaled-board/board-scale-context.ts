"use client";

import { createContext } from "react";

export interface BoardScaleContextValue {
  scale: number;
  designWidth: number;
  designHeight: number;
}

export const BoardScaleContext = createContext<BoardScaleContextValue | null>(null);
