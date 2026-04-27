"use client";

import { EdgeStoreProvider } from "../lib/edgestore";

export default function EdgeStoreProviderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return <EdgeStoreProvider>{children}</EdgeStoreProvider>;
}
