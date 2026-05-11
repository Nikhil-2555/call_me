"use client";

import { useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TestConnectionButton } from "../components/TestConnectionButton";
import { EditPolicyDialog } from "../components/EditPolicyDialog";
import Link from "next/link";

export type McpServer = {
  id: string;
  config: {
    url: string;
    name: string;
    approval_policy: string;
    description: string;
    transport: string;
    request_headers: Record<string, string>;
    secret_token?: { secret_id: string };
  };
  metadata: { created_at: number; owner_user_id: string };
  access_info: { is_creator: boolean; creator_email: string; role: string };
  dependent_agents: string[];
};

export default function McpDetailPage({ params }: { params: { id: string } }) {
  const [server, setServer] = useState<McpServer | null>(null);
  const [tools, setTools] = useState<Array<{ name: string; description: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchServer = async () => {
      try {
        const [resS, resT] = await Promise.all([
          fetch(`http://localhost:8000/mcp/servers/${params.id}`),
          fetch(`http://localhost:8000/mcp/servers/${params.id}/tools`).catch(() => null),
        ]);
        if (!resS.ok) throw new Error("Server not found");
        setServer(await resS.json());
        if (resT?.ok) {
          const t = await resT.json();
          setTools(t.tools || []);
        }
      } catch (e) {
        console.log({ title: "Error loading server", variant: "destructive" });
        notFound();
      } finally {
        setLoading(false);
      }
    };
    fetchServer();
  }, [params.id]);

  if (loading) return <p className="p-6">Loading…</p>;
  if (!server) return notFound();

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/mcp">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">{server.config.name}</h1>
      </div>

      <section className="border rounded-md p-4 space-y-2">
        <p>
          <strong>URL:</strong>{" "}
          <a href={server.config.url} target="_blank" rel="noreferrer" className="link">
            {server.config.url}
          </a>
        </p>
        <p><strong>Approval Policy:</strong> {server.config.approval_policy}</p>
        <p><strong>Transport:</strong> {server.config.transport}</p>
        <p><strong>Description:</strong> {server.config.description || "-"}</p>
      </section>

      <section className="flex gap-2">
        <TestConnectionButton serverId={server.id} />
        {server.access_info.is_creator && (
          <EditPolicyDialog server={server} onMutate={(s) => setServer(s)} />
        )}
      </section>

      <section>
        <h2 className="font-semibold mb-2">Tools ({tools.length})</h2>
        {tools.length ? (
          <ul className="list-disc list-inside space-y-1">
            {tools.map((t) => (
              <li key={t.name}>
                <strong>{t.name}</strong>: {t.description}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No tools exposed.</p>
        )}
      </section>
    </div>
  );
}