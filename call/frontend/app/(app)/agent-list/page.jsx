"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, Search, ArrowDown, Loader2, Trash2, Edit } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

/* ---------- API ---------- */
const api = axios.create({ baseURL: "http://localhost:8000" });

const listAgents = () => api.get("/agents/").then((r) => r.data.agents);
const listVoices = () => api.get("/voices").then((r) => r.data.voices);
const updateAgent = ({ id, payload }) => api.put(`/agents/${id}`, payload).then((r) => r.data);
const deleteAgent = (id) => api.delete(`/agents/${id}`).then((r) => r.data);
const createAgent = (name) => api.post("/agents/", { name }).then((r) => r.data);

/* ---------- helpers ---------- */
const buildAgentPayload = ({ name, tags, systemPrompt, firstMessage, voiceId }) => ({
  name,
  tags,
  conversation_config: {
    asr: {}, turn: {}, tts: {},
    conversation: {
      system_prompt: systemPrompt || "",
      first_message: firstMessage || "",
      language: "en",
      voice_id: voiceId || "",
    },
    language_presets: {}, agent: {},
  },
  platform_settings: {}, workflow: {},
});

/* ---------- MAIN PAGE ---------- */
export default function AgentsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [drawerAgent, setDrawerAgent] = React.useState(null);

  /* ---- queries ---- */
  const { data: agents = [], isLoading, error, refetch } = useQuery({ queryKey: ["agents"], queryFn: listAgents, staleTime: 30_000 });
  const { data: voices = [] } = useQuery({ queryKey: ["voices"], queryFn: listVoices, staleTime: 30_000 });

  /* ---- mutations ---- */
  const updateMutation = useMutation({ mutationFn: updateAgent, onSuccess: () => { queryClient.invalidateQueries(["agents"]); toast.success("Agent updated"); setDrawerAgent(null); }, onError: (e) => toast.error(e?.response?.data?.detail || "Update failed") });
  const deleteMutation = useMutation({ mutationFn: deleteAgent, onSuccess: () => { queryClient.invalidateQueries(["agents"]); toast.success("Agent deleted"); }, onError: (e) => toast.error(e?.response?.data?.detail || "Delete failed") });

  /* ---- filters ---- */
  const filtered = agents.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="w-full mx-auto min-h-[var(--h-screen-dvh)] flex flex-col max-w-5xl px-4 py-5 lg:py-8 xl:py-20">
      {/* Header */}
      <header className="flex items-center justify-between gap-4">
        <div className="pt-4">
          <h1 className="font-waldenburg-ht text-2xl text-foreground font-semibold">Agents</h1>
          <p className="text-md text-subtle font-normal mt-1">Create and manage your AI agents</p>
        </div>
        <CreateAgentButton onCreate={(name) => createAgent(name).then(() => refetch())} />
      </header>

      <main className="relative flex-1 mt-6">
        <div className="grid gap-x-8 px-4 lg:px-0 pb-5 lg:pb-8 xl:pb-20 grid-cols-[auto_min-content] sm:grid-cols-[auto_auto_min-content] md:grid-cols-[auto_auto_auto_min-content]">
          {/* Sticky search & headers */}
          <div className="sticky top-[calc(var(--eleven-header-height)+var(--eleven-banner-height))] bg-background z-[1] col-span-full grid grid-cols-[subgrid]">
            <div className="relative flex col-span-full mt-4">
              <Search className="w-[18px] h-[18px] text-foreground opacity-50 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input placeholder="Search agents..." className="h-10 w-full bg-background rounded-xl border pl-9 text-sm font-medium placeholder:text-subtle focus-ring" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="h-11 grid col-span-full grid-cols-[subgrid] grid-rows-1 items-center py-2 border-b">
              <p className="text-sm text-subtle font-medium">Name</p>
              <p className="text-sm text-subtle font-medium whitespace-nowrap max-md:hidden">Created by</p>
              <p className="text-sm text-subtle font-medium whitespace-nowrap max-sm:hidden">Created at <ArrowDown className="w-3 h-3 ml-1.5 inline-block text-gray-500" /></p>
              <p className="text-sm text-foreground font-normal w-0"><span className="sr-only">Actions</span></p>
            </div>
          </div>

          {/* Rows */}
          <div className="col-span-full grid grid-cols-[subgrid] gap-y-2 py-3 transition-opacity duration-200">
            {isLoading ? (
              <div className="col-span-full flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-subtle" /></div>
            ) : error ? (
              <div className="col-span-full flex justify-center py-8"><p className="text-sm text-red-500">{String(error)}</p></div>
            ) : filtered.length === 0 ? (
              <div className="col-span-full flex justify-center py-8"><p className="text-sm text-subtle">No agents found</p></div>
            ) : (
              filtered.map((agent) => (
                <AgentRow key={agent.agent_id} agent={agent} voices={voices} onEdit={() => setDrawerAgent(agent)} onDelete={() => deleteMutation.mutate(agent.agent_id)} deleting={deleteMutation.isLoading && deleteMutation.variables === agent.agent_id} />
              ))
            )}
          </div>
        </div>
      </main>

      {/* Edit Drawer */}
      {drawerAgent && <EditAgentDrawer agent={drawerAgent} voices={voices} open onClose={() => setDrawerAgent(null)} onSave={(payload) => updateMutation.mutate({ id: drawerAgent.agent_id, payload })} loading={updateMutation.isLoading} />}
    </div>
  );
}

/* ---------- ROW ---------- */
function AgentRow({ agent, voices, onEdit, onDelete, deleting }) {
  return (
    <div className="col-span-full grid grid-cols-[subgrid] grid-rows-1 items-center px-2.5 py-1.5 rounded-lg hover:bg-gray-alpha-50 focus-ring">
      <div className="flex items-center gap-2">
        <p className="text-sm text-foreground font-normal line-clamp-2">{agent.name}</p>
        {agent.tags.length > 0 && (
          <div className="flex gap-1">{agent.tags.map((t) => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}</div>
        )}
      </div>
      <p className="text-sm text-foreground font-normal whitespace-nowrap truncate max-md:hidden">{agent.access_info.creator_name}</p>
      <p className="text-sm text-foreground font-normal whitespace-nowrap max-sm:hidden">{new Date(agent.created_at_unix_secs * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
      <div className="flex items-center justify-end gap-1">
        <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Edit"><Edit className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" onClick={onDelete} disabled={deleting} aria-label="Delete">{deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}</Button>
      </div>
    </div>
  );
}

/* ---------- DRAWER ---------- */
function EditAgentDrawer({ agent, voices, open, onClose, onSave, loading }) {
  const [name, setName] = React.useState(agent.name);
  const [tags, setTags] = React.useState(agent.tags.join(", "));
  const [systemPrompt, setSystemPrompt] = React.useState(agent.conversation_config?.conversation?.system_prompt || "");
  const [firstMessage, setFirstMessage] = React.useState(agent.conversation_config?.conversation?.first_message || "");
  const [voiceId, setVoiceId] = React.useState(agent.conversation_config?.conversation?.voice_id || "");

  React.useEffect(() => {
    setName(agent.name);
    setTags(agent.tags.join(", "));
    setSystemPrompt(agent.conversation_config?.conversation?.system_prompt || "");
    setFirstMessage(agent.conversation_config?.conversation?.first_message || "");
    setVoiceId(agent.conversation_config?.conversation?.voice_id || "");
  }, [agent]);

  const handleSave = () => {
    const parsedTags = tags.split(",").map((t) => t.trim()).filter(Boolean);
    onSave(buildAgentPayload({ name, tags: parsedTags, systemPrompt, firstMessage, voiceId }));
  };

  return (
    <Drawer open={open} onOpenChange={onClose} direction="right">
      <DrawerContent className="h-full w-full max-w-lg">
        <DrawerHeader><DrawerTitle>Edit agent</DrawerTitle></DrawerHeader>
        <div className="px-4 space-y-4 overflow-y-auto pb-6">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Tags (comma separated)</Label><Input value={tags} onChange={(e) => setTags(e.target.value)} /></div>
          <Separator />
          <div><Label>System Prompt</Label><textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} className="w-full h-20 p-2 text-sm border rounded-md resize-none" /></div>
          <div><Label>First Message</Label><textarea value={firstMessage} onChange={(e) => setFirstMessage(e.target.value)} className="w-full h-20 p-2 text-sm border rounded-md resize-none" /></div>
          <div>
            <Label>Voice</Label>
            <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)} className="w-full h-10 px-3 text-sm border rounded-md bg-background">
              <option value="">— Select a voice —</option>
              {voices.map((v) => <option key={v.voice_id} value={v.voice_id}>{v.name}</option>)}
            </select>
          </div>
          <Separator />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={loading || !name.trim()}>
              {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Save
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/* ---------- CREATE BUTTON ---------- */
function CreateAgentButton({ onCreate }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const handleCreate = () => { if (!name.trim()) return; onCreate(name.trim()); setName(""); setOpen(false); };
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-2" />New agent</Button>
      {open && (
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent className="h-full w-full max-w-md">
            <DrawerHeader><DrawerTitle>Create agent</DrawerTitle></DrawerHeader>
            <div className="px-4 space-y-6">
              <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCreate()} /></div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={!name.trim()}>Create</Button>
              </div>
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </>
  );
}