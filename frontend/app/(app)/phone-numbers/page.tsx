"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, ChevronLeft, Phone, Settings, Send, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import Link from "next/link";

/* ------------------------------------------------------------------ */
/* 1. Types                                                           */
/* ------------------------------------------------------------------ */
interface PhoneNumberRecord {
  phone_number: string;
  label: string;
  supports_inbound: boolean;
  supports_outbound: boolean;
  phone_number_id: string;
  assigned_agent: { agent_id: string; agent_name: string } | null;
  provider: "twilio";
}

interface Agent {
  agent_id: string;
  name: string;
}

/* ------------------------------------------------------------------ */
/* 2. API helpers                                                     */
/* ------------------------------------------------------------------ */
const fetchNumbers = async (): Promise<PhoneNumberRecord[]> => {
  const res = await fetch("http://localhost:8000/phone-numbers?page_size=100");
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
};

const importNumber = async (body: {
  phone_number: string;
  label: string;
  sid: string;
  token: string;
}) => {
  const res = await fetch("http://localhost:8000/phone-numbers/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Unknown error");
  }
  return res.json();
};

const updateNumber = async (body: {
  phone_number_id: string;
  assigned_agent_id?: string;
  supports_inbound?: boolean;
  supports_outbound?: boolean;
}) => {
  const res = await fetch(
    `http://localhost:8000/phone-numbers/${body.phone_number_id}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

/** ----------------------------------------------------------
 *  NEW: calls exactly the endpoint you posted in the swagger
 * ---------------------------------------------------------- */
const fetchAgents = async (): Promise<Agent[]> => {
  const res = await fetch("http://localhost:8000/agents/?page_size=30");
  if (!res.ok) throw new Error(res.statusText);
  // { agents: [...] } ➜ return the array
  return (await res.json()).agents;
};

const startOutboundCall = async (body: {
  agent_id: string;
  agent_phone_number_id: string;
  to_number: string;
}) => {
  const res = await fetch("http://localhost:8000/call/outbound", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

/* ------------------------------------------------------------------ */
/* 3. Import drawer                                                   */
/* ------------------------------------------------------------------ */
function ImportDrawer() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: importNumber,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["phoneNumbers"] });
      setOpen(false);
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    mutation.mutate({
      phone_number: fd.get("phone") as string,
      label: fd.get("label") as string,
      sid: fd.get("sid") as string,
      token: fd.get("token") as string,
    });
  };

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Import number
        </Button>
      </DrawerTrigger>
      <DrawerContent className="max-w-md mx-auto">
        <DrawerHeader>
          <DrawerTitle>Import phone number from Twilio</DrawerTitle>
          <DrawerDescription className="sr-only">Form to import a new Twilio phone number</DrawerDescription>
        </DrawerHeader>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <Label>Phone number</Label>
            <Input name="phone" placeholder="+1 415 555 0100" required />
          </div>
          <div>
            <Label>Label</Label>
            <Input name="label" placeholder="Sales hotline" required />
          </div>
          <div>
            <Label>Twilio Account SID</Label>
            <Input name="sid" required />
          </div>
          <div>
            <Label>Twilio Auth Token</Label>
            <Input name="token" type="password" autoComplete="off" required />
          </div>
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? "Importing…" : "Import"}
          </Button>
          {mutation.isError && (
            <p className="text-sm text-red-500">{(mutation.error as Error).message}</p>
          )}
        </form>
      </DrawerContent>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Detail drawer                                                   */
/* ------------------------------------------------------------------ */
function NumberDetailDrawer({
  number,
  open,
  onOpenChange,
}: {
  number: PhoneNumberRecord;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const queryClient = useQueryClient();

  /* ----------------------------------------------------------
   * Fetch agents only when the drawer is open
   * ---------------------------------------------------------- */
  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: fetchAgents,
    enabled: open,
  });

  const updateMutation = useMutation({
    mutationFn: updateNumber,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["phoneNumbers"] }),
  });

  const outboundMutation = useMutation({
    mutationFn: startOutboundCall,
    onSuccess: () => toast.success("Call initiated!"),
    onError: (e) => toast.error(e.message),
  });

  const [outboundNumber, setOutboundNumber] = useState("");
  const [selectedAgent, setSelectedAgent] = useState("");

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="fixed inset-y-0 right-0 z-50 h-full w-full max-w-2xl !max-w-full bg-background shadow-lg border-l flex flex-col !p-0">
        <DrawerClose className="absolute top-4 right-4 z-20">
          <X className="w-5 h-5" />
        </DrawerClose>

        <DrawerHeader className="border-b px-6 py-4 shrink-0">
          <Link
            href="/phone-numbers"
            className="inline-flex items-center gap-2 mb-2 text-sm text-muted-foreground hover:underline"
            onClick={() => onOpenChange(false)}
          >
            <ChevronLeft className="w-4 h-4" />
            Back to all numbers
          </Link>
          <DrawerTitle className="text-2xl font-bold">{number.label}</DrawerTitle>
          <DrawerDescription className="sr-only">Details for {number.phone_number}</DrawerDescription>
          <p className="text-lg text-muted-foreground">{number.phone_number}</p>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {/* Inbound / Outbound toggles */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="inbound">Accept inbound calls</Label>
              <Switch
                id="inbound"
                checked={number.supports_inbound}
                onCheckedChange={(val) =>
                  updateMutation.mutate({
                    phone_number_id: number.phone_number_id,
                    supports_inbound: val,
                  })
                }
                disabled={updateMutation.isPending}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="outbound">Allow outbound calls</Label>
              <Switch
                id="outbound"
                checked={number.supports_outbound}
                onCheckedChange={(val) =>
                  updateMutation.mutate({
                    phone_number_id: number.phone_number_id,
                    supports_outbound: val,
                  })
                }
                disabled={updateMutation.isPending}
              />
            </div>
          </section>

          {/* Assigned agent */}
          <section>
            <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Assigned agent
            </h2>
            <Select
              value={number.assigned_agent?.agent_id ?? ""}
              onValueChange={(agentId) =>
                updateMutation.mutate({
                  phone_number_id: number.phone_number_id,
                  assigned_agent_id: agentId,
                })
              }
              disabled={updateMutation.isPending}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose an agent" />
              </SelectTrigger>
              <SelectContent>
                      {agents.map((a) => (
                        <SelectItem key={a.agent_id} value={a.agent_id}>
                          {a.name || "Unnamed Agent"}
                        </SelectItem>
                      ))}
              </SelectContent>
            </Select>
          </section>

          {/* Test outbound call */}
          <section>
            <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <Phone className="w-4 h-4" />
              Test outbound call
            </h2>
            <Dialog>
              <DialogTrigger asChild>
                <Button>Send Test Call</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Outbound call</DialogTitle>
                  <DialogDescription>
                    Destination number & agent to speak.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                  <Input
                    placeholder="+1 415 555 0100"
                    value={outboundNumber}
                    onChange={(e) => setOutboundNumber(e.target.value)}
                  />
                  <Select
                    value={selectedAgent}
                    onValueChange={setSelectedAgent}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pick agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {agents.map((a) => (
                        <SelectItem key={a.agent_id} value={a.agent_id}>
                          {a.name || "Unnamed Agent"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <DialogFooter>
                  <Button
                    disabled={
                      outboundMutation.isPending ||
                      !outboundNumber ||
                      !selectedAgent
                    }
                    onClick={() =>
                      outboundMutation.mutate({
                        agent_id: selectedAgent,
                        agent_phone_number_id: number.phone_number_id,
                        to_number: outboundNumber,
                      })
                    }
                  >
                    {outboundMutation.isPending ? (
                      <>
                        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                        Calling…
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Call
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </section>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* 5. Table columns                                                   */
/* ------------------------------------------------------------------ */
const columns: ColumnDef<PhoneNumberRecord>[] = [
  {
    accessorKey: "label",
    header: "Label",
    cell: ({ row }) => (
      <div>
        <p className="font-medium">{row.original.label}</p>
        <p className="text-sm text-muted-foreground">{row.original.phone_number}</p>
      </div>
    ),
  },
  {
    accessorKey: "assigned_agent",
    header: "Agent",
    cell: ({ row }) => row.original.assigned_agent?.agent_name ?? "—",
  },
  {
    accessorKey: "provider",
    header: "Provider",
    cell: ({ row }) => <Badge variant="outline">{row.original.provider}</Badge>,
  },
];

/* ------------------------------------------------------------------ */
/* 6. Main page                                                       */
/* ------------------------------------------------------------------ */
export default function PhoneNumbersPage() {
  const [globalFilter, setGlobalFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data = [], isLoading, error } = useQuery({
    queryKey: ["phoneNumbers"],
    queryFn: fetchNumbers,
  });

  const filteredData = useMemo(
    () =>
      data.filter(
        (p) =>
          p.phone_number.includes(globalFilter) ||
          p.label.toLowerCase().includes(globalFilter.toLowerCase())
      ),
    [data, globalFilter]
  );

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
  });

  const selectedNumber = data.find((d) => d.phone_number_id === selectedId);

  return (
    <div className="w-full mx-auto min-h-[var(--h-screen-dvh)] flex flex-col max-w-5xl px-4 py-5 lg:py-8 xl:py-20">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Phone Numbers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Import and manage your Twilio numbers
          </p>
        </div>
        <ImportDrawer />
      </header>

      <main className="flex-1 mt-6">
        <div className="relative">
          {/* Search */}
          <div className="relative mb-4">
            <Search className="w-4 h-4 absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search numbers..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id}>
                    {hg.headers.map((header) => (
                      <TableHead key={header.id}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="text-center py-8">
                      Loading…
                    </TableCell>
                  </TableRow>
                )}
                {error && (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="text-center py-8 text-red-500">
                      {(error as Error).message}
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && !filteredData.length && (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="text-center py-8">
                      No phone numbers yet
                    </TableCell>
                  </TableRow>
                )}
                {table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.original.phone_number_id}
                    className="cursor-pointer"
                    onClick={() => setSelectedId(row.original.phone_number_id)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </main>

      {selectedNumber && (
        <NumberDetailDrawer
          number={selectedNumber}
          open={!!selectedId}
          onOpenChange={(o) => !o && setSelectedId(null)}
        />
      )}
    </div>
  );
}