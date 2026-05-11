"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, Search, Loader2, AlertCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { motion } from "framer-motion";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────
   Types
────────────────────────────────────────────── */
type BatchCall = {
  id: string;
  name: string;
  agent_name: string;
  created_at_unix: number;
  scheduled_time_unix: number | null;
  total_calls_scheduled: number;
  total_calls_dispatched: number;
  status: "pending" | "in_progress" | "completed" | "failed";
};

type Agent = { agent_id: string; name: string };
type PhoneNumber = {
  phone_number_id: string;
  phone_number: string;
  label?: string;
  assigned_agent: { agent_id: string; agent_name: string } | null;
};

/* ──────────────────────────────────────────────
   Zod schema
────────────────────────────────────────────── */
const schema = z.object({
  call_name: z.string().min(1, "Required"),
  agent_id: z.string().min(1, "Required"),
  phone_number_id: z.string().min(1, "Required"),
  scheduled_date: z.string().optional(),
  scheduled_time: z.string().optional(),
  recipients: z.string().min(1, "At least one phone number required"),
});
type FormValues = z.infer<typeof schema>;

/* ──────────────────────────────────────────────
   Hooks
────────────────────────────────────────────── */
function useBatchCalls() {
  const [data, setData] = React.useState<BatchCall[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchData = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("http://localhost:8000/batch-calling/workspace?limit=100");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json.batch_calls);
    } catch {
      setError("Could not load batches");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

function useAgents() {
  const [agents, setAgents] = React.useState<Agent[]>([]);
  React.useEffect(() => {
    fetch("http://localhost:8000/agents/?page_size=30")
      .then((r) => r.json())
      .then((d) => setAgents(d.agents))
      .catch(() => {});
  }, []);
  return agents;
}

function usePhoneNumbers() {
  const [phones, setPhones] = React.useState<PhoneNumber[]>([]);
  React.useEffect(() => {
    fetch("http://localhost:8000/phone-numbers?page_size=30")
      .then((r) => r.json())
      .then(setPhones)
      .catch(() => {});
  }, []);
  return phones;
}

/* ──────────────────────────────────────────────
   Orange Input
────────────────────────────────────────────── */
const OrangeInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>((props, ref) => (
  <Input
    {...props}
    ref={ref}
    className={cn(
      props.className,
      "[&::-webkit-calendar-picker-indicator]:filter-[invert(39%)_sepia(92%)_saturate(1431%)_hue-rotate(359deg)_brightness(102%)_contrast(105%)]"
    )}
  />
));
OrangeInput.displayName = "OrangeInput";

/* ──────────────────────────────────────────────
   Page
────────────────────────────────────────────── */
export default function BatchCallingPage() {
  const { data: batches, loading, error, refetch } = useBatchCalls();
  const agents = useAgents();
  const phoneNumbers = usePhoneNumbers();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  /* form */
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      call_name: "",
      agent_id: "",
      phone_number_id: "",
      scheduled_date: "",
      scheduled_time: "",
      recipients: "",
    },
  });

  /* submit */
  const onSubmit = async (vals: FormValues) => {
    const date = vals.scheduled_date;
    const time = vals.scheduled_time;
    let epoch = null;
    if (date && time) epoch = Math.floor(new Date(`${date}T${time}`).getTime() / 1000);

    const payload = {
      call_name: vals.call_name,
      agent_id: vals.agent_id,
      agent_phone_number_id: vals.phone_number_id,
      scheduled_time_unix: epoch,
      recipients: vals.recipients
        .split("\n")
        .map((p) => ({ phone_number: p.trim() }))
        .filter((p) => p),
    };

    try {
      const res = await fetch("http://localhost:8000/batch-calling/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      setOpen(false);
      form.reset();
      refetch();
    } catch (e: any) {
      alert(e.message);
    }
  };

  /* search */
  const filtered = React.useMemo(
    () =>
      batches.filter((b) =>
        b.name.toLowerCase().includes(query.toLowerCase())
      ),
    [batches, query]
  );

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Batch Calling</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create and manage bulk AI calls
          </p>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create batch
            </Button>
          </SheetTrigger>

          <SheetContent side="right" className="w-full max-w-2xl overflow-y-auto">
            <div className="pl-8 pr-8 pt-6 pb-10 space-y-8">
              <SheetHeader>
                <SheetTitle className="text-2xl">Create Batch Call</SheetTitle>
                <SheetDescription>
                  Add one phone per line or paste a CSV with a{" "}
                  <code className="text-xs">phone_number</code> column.
                </SheetDescription>
              </SheetHeader>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                  {/* Batch name */}
                  <FormField
                    control={form.control}
                    name="call_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Batch name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. Q3 re-engagement"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Agent & Phone side-by-side */}
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="agent_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Agent</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value ?? ""}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select agent" />
                            </SelectTrigger>
                            <SelectContent>
                              {agents.map((a) => (
                                <SelectItem key={a.agent_id} value={a.agent_id}>
                                  {a.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
  <br />
                    <FormField
                      control={form.control}
                      name="phone_number_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone Number</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value ?? ""}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select number" />
                            </SelectTrigger>
                            <SelectContent>
                              {phoneNumbers.map((p) => (
                                <SelectItem
                                  key={p.phone_number_id}
                                  value={p.phone_number_id}
                                >
                                  {p.phone_number} {p.label && `(${p.label})`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Date & Time */}
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="scheduled_date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Date (optional)</FormLabel>
                          <OrangeInput type="date" {...field} value={field.value ?? ""} />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="scheduled_time"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Time (optional)</FormLabel>
                          <OrangeInput type="time" {...field} value={field.value ?? ""} />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Recipients */}
                  <FormField
                    control={form.control}
                    name="recipients"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Recipients</FormLabel>
                        <FormControl>
                          <Textarea
                            rows={8}
                            placeholder="+1234567890&#10;+1987654321"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormDescription>One phone number per line</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <SheetFooter>
                    <SheetClose asChild>
                      <Button variant="outline">Cancel</Button>
                    </SheetClose>
                    <Button type="submit" disabled={form.formState.isSubmitting}>
                      {form.formState.isSubmitting && (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      )}
                      Create
                    </Button>
                  </SheetFooter>
                </form>
              </Form>
            </div>
          </SheetContent>
        </Sheet>
      </header>

      {/* Search */}
      <main>
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Search batches..."
            className="pl-10 max-w-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-9 h-9 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center gap-2 text-destructive py-12">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            Oops — no batches match “{query}”.
          </div>
        ) : (
          <div className="border rounded-lg">
            <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_120px] gap-4 px-4 py-3 text-sm font-medium text-muted-foreground border-b">
              <span>Name</span>
              <span>Agent</span>
              <span>Created</span>
              <span>Scheduled</span>
              <span>Calls</span>
              <span>Status</span>
            </div>

     {filtered.map((bc, i) => (
  <motion.div
    key={bc.id}
    initial={{ opacity: 0, y: 2 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: i * 0.08, duration: 0.3, ease: "easeOut" }}
    className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_120px] items-center gap-4 px-4 py-3 text-sm hover:bg-gray-100/50 dark:hover:bg-natural-100/50 bg- transition-colors"
  >
    <Link href={`/batch-calling/${bc.id}`} className="contents">
      <span className="font-medium truncate">{bc.name}</span>
      <span className="truncate">{bc.agent_name}</span>
      <span>{new Date(bc.created_at_unix * 1000).toLocaleDateString()}</span>
      <span>
        {bc.scheduled_time_unix
          ? new Date(bc.scheduled_time_unix * 1000).toLocaleDateString()
          : "Immediate"}
      </span>
      <span>
        {bc.total_calls_dispatched} / {bc.total_calls_scheduled}
      </span>
      <Badge
        variant={
          bc.status === "completed"
            ? "default"
            : bc.status === "failed"
            ? "destructive"
            : "secondary"
        }
        className="capitalize"
      >
        {bc.status.replace("_", " ")}
      </Badge>
    </Link>
  </motion.div>
))}
          </div>
        )}
      </main>
    </div>
  );
}