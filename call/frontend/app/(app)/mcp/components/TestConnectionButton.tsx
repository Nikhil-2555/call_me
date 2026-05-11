"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function TestConnectionButton({ serverId }: { serverId: string }) {
  const [testing, setTesting] = useState(false);

  const test = async () => {
    setTesting(true);
    try {
      const res = await fetch(
        `http://localhost:8000/mcp/servers/${serverId}/test-connection`,
        { method: "POST" }
      );
      const data = await res.json();
      if (data.connection_status === "ok") {
        console.log({ title: "Connection OK" });
      } else {
        console.log({ title: "Connection failed", description: data.error_message, variant: "destructive" });
      }
    } catch {
      console.log({ title: "Test error", variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Button size="sm" variant="outline" disabled={testing} onClick={test}>
      {testing ? "Testing…" : "Test Connection"}
    </Button>
  );
}