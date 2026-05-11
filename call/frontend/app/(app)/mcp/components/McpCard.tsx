"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditPolicyDialog } from "./EditPolicyDialog";
import Link from "next/link";
import type { McpServerSummary } from "../page";

export function McpCard({
  server,
  onMutate,
}: {
  server: McpServerSummary;
  onMutate: () => void;
}) {

  const handleDelete = async () => {
    if (!confirm("Delete MCP server?")) return;
    try {
      const res = await fetch(`http://localhost:8000/mcp/servers/${server.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      console.log({ title: "Deleted" });
      onMutate();
    } catch {
      console.log({ title: "Delete error", variant: "destructive" });
    }
  };

  return (
    <div className="border rounded-md p-4 flex justify-between items-start">
      <div>
        <Link href={`/mcp/${server.id}`} className="font-bold hover:underline">
          {server.name}
        </Link>
        <p className="text-sm text-muted-foreground">{server.url}</p>
        <p className="text-xs text-muted-foreground">
          Policy: {server?.approval_policy} · Created{" "}
          {new Date(server.created_at * 1000).toLocaleDateString()}
        </p>
      </div>
      <div className="flex gap-2">
        <EditPolicyDialog server={server} onMutate={onMutate} />
        <Button variant="ghost" size="icon" onClick={handleDelete} className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}