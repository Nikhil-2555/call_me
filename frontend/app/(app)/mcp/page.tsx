"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { McpCard } from "./components/McpCard";
import { CreateMcpSheet } from "./components/CreateMcpSheet";

export type McpServerSummary = {
  id: string;
  name: string;
  url: string;
  approval_policy: string;
  created_at: number;
  is_creator: boolean;
  dependent_agents_count: number;
};

export default function McpIndexPage() {
  const [servers, setServers] = useState<McpServerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const fetchServers = async () => {
    setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/mcp/");
      if (!res.ok) throw new Error("Network");
      const data = await res.json();
      setServers(data.mcp_servers_summary);
    } catch {
      console.log({ title: "Error loading servers", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServers();
  }, []);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">MCP Servers</h1>
        <CreateMcpSheet open={open} onOpenChange={setOpen} onCreated={fetchServers}>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add MCP Server
          </Button>
        </CreateMcpSheet>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : servers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No MCP servers yet.</p>
      ) : (
        <div className="grid gap-4">
          {servers.map((s) => (
            <McpCard key={s.id} server={s} onMutate={fetchServers} />
          ))}
        </div>
      )}
    </div>
  );
}