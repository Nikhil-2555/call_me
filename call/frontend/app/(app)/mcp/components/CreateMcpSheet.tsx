"use client";

import { ReactNode, useState } from "react";
import { Plus, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils"; // shadcn helper

export function CreateMcpSheet({
  open,
  onOpenChange,
  onCreated,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
  children?: ReactNode;
}) {
  const [loading, setLoading] = useState(false);

  /* --- form state --- */
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [approvalPolicy, setApprovalPolicy] = useState("require_approval_all");
  const [transport, setTransport] = useState("SSE");
  const [description, setDescription] = useState("");
  const [secretId, setSecretId] = useState("");
  const [headers, setHeaders] = useState("");
  const [toolHashes, setToolHashes] = useState("");

  /* --- inline validation errors --- */
  const [urlError, setUrlError] = useState("");
  const [nameError, setNameError] = useState("");
  const [headersError, setHeadersError] = useState("");
  const [toolsError, setToolsError] = useState("");

  /* --- helpers --- */
  const resetErrors = () => {
    setUrlError("");
    setNameError("");
    setHeadersError("");
    setToolsError("");
  };

  const isValidUrl = (s: string) => {
    try {
      new URL(s);
      return true;
    } catch {
      return false;
    }
  };

  const handleSubmit = async () => {
    resetErrors();
    let ok = true;

    /* Required */
    if (!name.trim()) {
      setNameError("Name is required");
      ok = false;
    }
    if (!url.trim()) {
      setUrlError("URL is required");
      ok = false;
    } else if (!isValidUrl(url)) {
      setUrlError("Invalid URL");
      ok = false;
    }

    /* Optional JSON fields */
    let parsedHeaders: Record<string, string> = {};
    if (headers.trim()) {
      try {
        parsedHeaders = JSON.parse(headers);
        if (typeof parsedHeaders !== "object" || Array.isArray(parsedHeaders)) {
          throw new Error("Must be a JSON object");
        }
      } catch {
        setHeadersError("Headers must be a valid JSON object");
        ok = false;
      }
    }

    let parsedTools: any[] = [];
    if (toolHashes.trim()) {
      try {
        parsedTools = JSON.parse(toolHashes);
        if (!Array.isArray(parsedTools)) {
          throw new Error("Must be a JSON array");
        }
      } catch {
        setToolsError("Tool hashes must be a valid JSON array");
        ok = false;
      }
    }

    if (!ok) return;

    const payload = {
      config: {
        url,
        name,
        approval_policy: approvalPolicy,
        transport,
        description,
        request_headers: parsedHeaders,
        tool_approval_hashes: parsedTools,
        ...(secretId.trim() && { secret_token: { secret_id: secretId.trim() } }),
      },
    };

    setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/mcp/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      console.log({ title: "MCP server created" });
      onOpenChange(false);
      onCreated();
    } catch (e: any) {
      console.log({ title: "Create error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  /* --- small reusable input wrapper --- */
  const Field = ({
    label,
    error,
    children,
  }: {
    label: string;
    error?: string;
    children: React.ReactNode;
  }) => (
    <div className="grid gap-1.5">
      <Label className="text-xs font-semibold text-slate-700">{label}</Label>
      {children}
      {error && (
        <p className="flex items-center text-xs text-red-600">
          <AlertCircle className="mr-1 h-3 w-3" />
          {error}
        </p>
      )}
    </div>
  );

  return (
    <>
      {children ? (
        <div onClick={() => onOpenChange(true)}>{children}</div>
      ) : (
        <Button onClick={() => onOpenChange(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add MCP Server
        </Button>
      )}

      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Add MCP Server</SheetTitle>
            <SheetDescription>
              Provide the mandatory fields and any optional configuration.
            </SheetDescription>
          </SheetHeader>

          <div className="grid gap-5 py-6">
            {/* Required */}
            <Field label="Name *" error={nameError}>
              <Input
                placeholder="e.g. Production MCP"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (nameError) setNameError("");
                }}
              />
            </Field>

            <Field label="URL *" error={urlError}>
              <Input
                placeholder="https://example.com/mcp"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (urlError) setUrlError("");
                }}
              />
            </Field>

            {/* Optional strings */}
            <Field label="Description">
              <Textarea
                rows={2}
                placeholder="Short description of the server"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>

            <Field label="Transport">
              <Input
                placeholder="SSE"
                value={transport}
                onChange={(e) => setTransport(e.target.value)}
              />
            </Field>

            <Field label="Secret ID">
              <Input
                placeholder="secret_token_123"
                value={secretId}
                onChange={(e) => setSecretId(e.target.value)}
              />
            </Field>

            {/* Optional JSON */}
            <Field label="Request Headers (JSON object)" error={headersError}>
              <Textarea
                rows={3}
                placeholder='{"Authorization":"Bearer xyz"}'
                value={headers}
                onChange={(e) => {
                  setHeaders(e.target.value);
                  if (headersError) setHeadersError("");
                }}
              />
              <p className="text-xs text-slate-500">
                Valid JSON object with string keys & values.
              </p>
            </Field>

            <Field label="Tool Approval Hashes (JSON array)" error={toolsError}>
              <Textarea
                rows={4}
                placeholder='[{"tool_name":"search","tool_hash":"abc123","approval_policy":"auto_approved"}]'
                value={toolHashes}
                onChange={(e) => {
                  setToolHashes(e.target.value);
                  if (toolsError) setToolsError("");
                }}
              />
              <p className="text-xs text-slate-500">
                Valid JSON array of tool approval objects.
              </p>
            </Field>

            <Button
              disabled={loading}
              onClick={handleSubmit}
              className="mt-2 w-full"
            >
              {loading ? (
                <>
                  <CheckCircle className="mr-2 h-4 w-4 animate-spin" />
                  Creating…
                </>
              ) : (
                "Create MCP Server"
              )}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}