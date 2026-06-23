"use client";

import * as React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Phone,
  Calendar,
  Clock,
  RefreshCw,
  StopCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { OrangeSpinner } from "@/components/orange-spinner";

/* ──────────────────────────────
   Types
────────────────────────────── */
type Recipient = {
  id: string;
  phone_number: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
  created_at_unix: number;
  updated_at_unix: number;
  conversation_id: string;
  conversation_initiation_client_data?: Record<string, unknown>;
};

type Status = "pending" | "in_progress" | "completed" | "failed" | "cancelled";

type BatchStatus = {
  id: string;
  name: string;
  status: Status;
  total_calls_dispatched: number;
  total_calls_scheduled: number;
  last_updated_at_unix: number;
  created_at_unix: number;
};

/* ──────────────────────────────
   Page
────────────────────────────── */
export default function BatchCallDetailPage({ params }: { params: Promise<{ batchId: string }> }) {
  /* unwrap async params */
  const { batchId } = React.use(params);

 const [status, setStatus] = React.useState<BatchStatus | null>(null);
const [recipients, setRecipients] = React.useState<Recipient[]>([]);
const [loading, setLoading] = React.useState(true);
  const [actionLoading, setActionLoading] = React.useState(false);

  /* ---------- fetch status ---------- */
  const fetchStatus = React.useCallback(async () => {
    try {
      const res = await fetch(`http://localhost:8000/batch-calling/${batchId}/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setStatus(json);
    } catch (err) {
      console.error(err);
    }
  }, [batchId]);

  /* ---------- fetch recipients ---------- */
  const fetchRecipients = React.useCallback(async () => {
    try {
      const res = await fetch(`http://localhost:8000/batch-calling/${batchId}/recipients`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setRecipients(json.recipients);
    } catch (err) {
      console.error(err);
    }
  }, [batchId]);

  /* ---------- initial load + polling ---------- */
  React.useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all([fetchStatus(), fetchRecipients()]);
      setLoading(false);
    };
    
    loadAll();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus, fetchRecipients]);

  /* ---------- helpers ---------- */
  const format = (unix: number) =>
    new Date(unix * 1000).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const statusBadge = (s: Status) => {
    switch (s) {
      case "completed":
        return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case "pending":
      case "in_progress":
        return <Badge className="bg-yellow-100 text-yellow-800">{s}</Badge>;
      case "failed":
        return <Badge className="bg-red-100 text-red-800">Failed</Badge>;
      case "cancelled":
        return <Badge className="bg-gray-100 text-gray-800">Cancelled</Badge>;
    }
  };

  /* ---------- actions ---------- */
  const handleAction = async (type: "cancel" | "retry") => {
    setActionLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/batch-calling/${batchId}/${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error(await res.text());
      fetchStatus();
      fetchRecipients();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setActionLoading(false);
    }
  };

  /* ---------- loading / not-found ---------- */
 if (loading)
  return (
    <div className="flex items-center justify-center h-screen">
      <OrangeSpinner />
    </div>
  );

  if (!status) return notFound();

  /* ---------- render ---------- */
  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-8 lg:py-12">
      {/* centered header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" asChild>
            <Link href="/batch-calling">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Link>
          </Button>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">{status.name}</h1>
        </div>

        <div className="flex items-center gap-2 mt-4 sm:mt-0">
          <Button
            variant="outline"
            disabled={actionLoading || status.status !== "in_progress"}
            onClick={() => handleAction("cancel")}
          >
            <StopCircle className="w-4 h-4 mr-2" />
            Cancel
          </Button>
          <Button
            variant="outline"
            disabled={actionLoading || !["failed", "completed"].includes(status.status)}
            onClick={() => handleAction("retry")}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </div>
      </header>

      {/* Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 text-sm">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              Created: {format(status.created_at_unix)}
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Last updated: {format(status.last_updated_at_unix)}
            </div>
            <div className="flex items-center gap-2">{statusBadge(status.status)}</div>
          </div>
          <div className="space-y-2">
            <div>
              Calls: {status.total_calls_dispatched} / {status.total_calls_scheduled} dispatched
            </div>
          </div>
        </CardContent>
      </Card>

      <Separator className="my-8" />

      {/* Recipients */}
      <Card>
        <CardHeader>
          <CardTitle>Recipients ({recipients.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {recipients.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <p>Oops — no recipients found!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium text-muted-foreground">Phone</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">Status</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">Updated</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">Conversation</th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 flex items-center gap-2">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        {r.phone_number}
                      </td>
                      <td className="py-2">{statusBadge(r.status)}</td>
                      <td className="py-2">{format(r.updated_at_unix)}</td>
                      <td className="py-2">
                        <Button variant="link" size="sm" asChild>
                          <Link href={`/conversations/${r.conversation_id}`}>View</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}