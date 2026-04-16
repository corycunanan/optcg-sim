"use client";

import dynamic from "next/dynamic";

export const CardEditForm = dynamic(
  () =>
    import("@/components/admin/card-edit-form").then(
      (mod) => mod.CardEditForm
    ),
  { ssr: false }
);
