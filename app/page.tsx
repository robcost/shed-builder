"use client";

import { ConfiguratorShell } from "@/components/configurator/ConfiguratorShell";
import { ShedConfigProvider } from "@/hooks/useShedConfig";

/** The shed configurator app. */
export default function Home() {
  return (
    <ShedConfigProvider>
      <ConfiguratorShell />
    </ShedConfigProvider>
  );
}
