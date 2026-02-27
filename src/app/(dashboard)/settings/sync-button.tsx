"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export function SyncButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSync() {
    setLoading(true);
    try {
      await fetch("/api/sync/trigger", { method: "POST" });
      router.refresh();
    } catch {
      // Sync results visible in log table after refresh
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={handleSync} disabled={loading}>
      {loading ? "Sincronizzando..." : "Sincronizza Ora"}
    </Button>
  );
}
