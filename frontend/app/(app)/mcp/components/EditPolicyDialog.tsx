"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const policies = [
  "auto_approve_all",
  "require_approval_all",
  "require_approval_per_tool",
] as const;

export function EditPolicyDialog({
  serverId,
  initialPolicy,
  onMutate,
}: {
  serverId: string;
  initialPolicy: string;
  onMutate: (updated: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  const [policy, setPolicy] = useState<string>(initialPolicy);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `http://localhost:8000/mcp/servers/${serverId}/approval-policy`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approval_policy: policy }),
        }
      );
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      onMutate(updated);
      console.log({ title: "Policy updated" });
      setOpen(false);
    } catch (e: unknown) {
      console.log({ title: "Update error", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Policy
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approval Policy</DialogTitle>
        </DialogHeader>
        <Select value={policy} onValueChange={setPolicy}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {policies.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button disabled={loading} onClick={handleSave}>
          Save
        </Button>
      </DialogContent>
    </Dialog>
  );
}