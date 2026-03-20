// app/create-agent/page.jsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion } from "framer-motion";
import { Sparkles, Loader2 } from "lucide-react";

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

/* ---------- Zod schema (unchanged) ---------- */
const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  language: z.string().default("English"),
  additionalLanguages: z.array(z.string()).optional(),
  firstMessage: z.string().min(1, "First message is required"),
  systemPrompt: z.string().min(1, "System prompt is required"),
  llmProvider: z.string().default("Gemini 1.5 Flash"),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().min(-1).default(-1),
  enableLanguageDetection: z.boolean().default(true),
  tools: z.object({
    endCall: z.boolean().default(false),
    detectLanguage: z.boolean().default(false),
    skipTurn: z.boolean().default(false),
    transferToAgent: z.boolean().default(false),
    transferToNumber: z.boolean().default(false),
    playKeypadTouchTone: z.boolean().default(false),
  }),
});

/* ---------- safeMerge helper ---------- */
function safeMerge(llmData) {
  const defaults = {
    name: "",
    language: "English",
    additionalLanguages: [],
    firstMessage: "",
    systemPrompt: "",
    llmProvider: "Gemini 1.5 Flash",
    temperature: 0.7,
    maxTokens: -1,
    enableLanguageDetection: true,
    tools: {
      endCall: false,
      detectLanguage: false,
      skipTurn: false,
      transferToAgent: false,
      transferToNumber: false,
      playKeypadTouchTone: false,
    },
  };
  return {
    ...defaults,
    ...llmData,
    tools: { ...defaults.tools, ...(llmData.tools || {}) },
  };
}

/* ---------- main page ---------- */
export default function CreateAgentPage() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: safeMerge({}),
  });

  /* ---------- AI generation via internal route ---------- */
  async function handleGenerate() {
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/generate-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unknown error");
      form.reset(safeMerge(data));
    } catch (err) {
      console.error(err);
      alert(err.message || "Could not generate agent.");
    } finally {
      setLoading(false);
    }
  }

  /* ---------- Submit to FastAPI ---------- */
  async function onSubmit(values) {
    // Map the front-end shape to the exact keys FastAPI expects
    const payload = {
      name: values.name,
      system_prompt: values.systemPrompt,
      voice_id: "", // optional, adjust if you have a UI for it
      language: values.language.toLowerCase().slice(0, 2), // "English" -> "en"
      first_message: values.firstMessage,
      llm_model: values.llmProvider === "Gemini 1.5 Flash"
        ? "gemini-2.0-flash"
        : values.llmProvider === "GPT-4o-mini"
        ? "gpt-4o-mini"
        : "claude-3-5-sonnet",
      temperature: values.temperature,
      max_tokens: values.maxTokens,
      tts_model: "eleven_turbo_v2_5",
      stability: 0.5,
      similarity_boost: 0.8,
      style: 0,
      use_speaker_boost: true,
      asr_quality: "high",
      asr_provider: "elevenlabs",
      turn_timeout: 7,
      max_duration_seconds: 600,
      text_only: false,
      knowledge_base: [],
      twilio_phone_number_id: "",
      tags: [],
    };

    try {
      const res = await fetch("http://localhost:8000/agents/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`Server returned ${res.status}: ${detail}`);
      }
      const agentId = await res.json(); // FastAPI returns the created agent id
      alert(`Agent created 🎉  id: ${agentId}`);
    } catch (err) {
      console.error(err);
      alert(err.message || "Could not create agent.");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8"
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Create Support Agent</CardTitle>
          <CardDescription>
            Describe what you need and let AI build the agent for you.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              {/* ------------- GENERATE WITH AI ------------- */}
              <Section title="Generate with AI">
                <div className="flex items-start gap-2">
                  <Input
                    placeholder="e.g. A friendly bilingual agent for airline refunds"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !loading && handleGenerate()}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    onClick={handleGenerate}
                    disabled={loading || !prompt.trim()}
                    className="shrink-0"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    <span className="ml-2 hidden sm:inline">Generate</span>
                  </Button>
                </div>
              </Section>

              {/* ------------- BASIC INFO ------------- */}
              <Section title="Basic Info">
                <FormField
                  name="name"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Agent Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g. Eric Support" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  name="language"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Language</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="English">English</SelectItem>
                          <SelectItem value="Hindi">Hindi</SelectItem>
                          <SelectItem value="Spanish">Spanish</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  name="additionalLanguages"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Additional Languages (comma-separated)</FormLabel>
                      <FormControl>
                        <Input
                          value={field.value?.join(", ") ?? ""}
                          onChange={(e) =>
                            field.onChange(e.target.value.split(",").map((l) => l.trim()))
                          }
                          placeholder="e.g. Hindi, Spanish"
                        />
                      </FormControl>
                      <FormDescription>User can switch between these.</FormDescription>
                    </FormItem>
                  )}
                />
              </Section>

              {/* ------------- MESSAGES ------------- */}
              <Section title="Messages">
                <FormField
                  name="firstMessage"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Message</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} placeholder="Hi, I'm Eric. How can I help?" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  name="systemPrompt"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>System Prompt</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={4} placeholder="You are a support agent named Eric..." />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </Section>

              {/* ------------- LLM SETTINGS ------------- */}
              <Section title="LLM Settings">
                <FormField
                  name="llmProvider"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Provider / Model</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Gemini 1.5 Flash">Gemini 1.5 Flash</SelectItem>
                          <SelectItem value="GPT-4o-mini">GPT-4o-mini</SelectItem>
                          <SelectItem value="Claude-3.5-Sonnet">Claude-3.5-Sonnet</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />

                <FormField
                  name="temperature"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Temperature: {field.value}</FormLabel>
                      <FormControl>
                        <Slider
                          min={0}
                          max={2}
                          step={0.1}
                          value={[field.value]}
                          onValueChange={(val) => field.onChange(val[0])}
                        />
                      </FormControl>
                      <FormDescription>0 = deterministic, 2 = very creative</FormDescription>
                    </FormItem>
                  )}
                />

                <FormField
                  name="maxTokens"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Tokens</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormDescription>-1 = no limit</FormDescription>
                    </FormItem>
                  )}
                />

                <FormField
                  name="enableLanguageDetection"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between">
                      <FormLabel>Auto-detect caller language</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </Section>

              {/* ------------- TOOLS ------------- */}
              <Section title="Tools">
                {[
                  "endCall",
                  "detectLanguage",
                  "skipTurn",
                  "transferToAgent",
                  "transferToNumber",
                  "playKeypadTouchTone",
                ].map((key) => (
                  <FormField
                    key={key}
                    name={`tools.${key}`}
                    control={form.control}
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between">
                        <Label className="capitalize">{key.replace(/([A-Z])/g, " $1")}</Label>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormItem>
                    )}
                  />
                ))}
              </Section>

              <Button type="submit" className="w-full h-[50px] cursor-pointer">
                Create Agent
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function Section({ title, children }) {
  return (
    <fieldset className="space-y-4">
      <legend className="text-lg font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}