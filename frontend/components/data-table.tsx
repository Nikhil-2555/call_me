"use client";
/* ------------------------------------------------------------------ */
/* 0.  imports (unchanged)                                            */
/* ------------------------------------------------------------------ */
import * as React from "react";
import axios from "axios";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { formatDistanceToNow } from "date-fns";
import { Play, Pause, Rewind, FastForward, X } from "lucide-react";
import { cn } from "@/lib/utils";

import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconCircleCheckFilled,
  IconLayoutColumns,
  IconLoader,
} from "@tabler/icons-react";
import {
  ColumnDef,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  Row,
  SortingState,
  useReactTable,
  VisibilityState,
} from "@tanstack/react-table";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/* ------------------------------------------------------------------ */
/* 1.  Zod schema                                                     */
/* ------------------------------------------------------------------ */
export const schema = z.object({
  id: z.string(),
  date: z.string(),
  agent: z.string(),
  duration: z.string(),
  messages: z.number(),
  evaluation: z.enum(["Successful", "Failed", "In Progress"]),
  transcript: z.string(),
  recordingUrl: z.string(),
  client: z.object({ name: z.string(), phone: z.string() }),
  tags: z.array(z.string()),
  creditsCall: z.number(),
  creditsLLM: z.number(),
  costPerMin: z.number(),
  totalUSD: z.number(),
  status: z.enum(["Done", "In Progress", "Not Started"]).optional(),
  type: z.string().optional(),
  reviewer: z.string().optional(),
  header: z.string().optional(),
  turns: z.array(
    z.object({
      speaker: z.enum(["user", "agent"]),
      text: z.string(),
      time: z.string(),
    })
  ),
  clientOverrides: z.object({
    language: z.string().default("English"),
  }),
});

/* ------------------------------------------------------------------ */
/* 2.  helpers                                                        */
/* ------------------------------------------------------------------ */
function SafeDate({ iso }: { iso: string }) {
  const [dateStr, setDateStr] = React.useState("");
  React.useEffect(() => {
    setDateStr(new Date(iso).toLocaleString());
  }, [iso]);
  return <>{dateStr || <span className="w-32 h-4 bg-slate-200 animate-pulse rounded" />}</>;
}

const fmt = (sec: number) => {
  if (!sec) return "0:00";
  const m = Math.floor(sec / 60);
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
};

/* ------------------------------------------------------------------ */
/* 3.  columns                                                        */
/* ------------------------------------------------------------------ */
const columns: ColumnDef<z.infer<typeof schema>>[] = [
  {
    accessorKey: "date",
    header: "Date",
    cell: ({ row }) => <TableCellViewer item={row.original} field="date" />,
    enableHiding: false,
  },
  {
    accessorKey: "agent",
    header: "Agent",
    cell: ({ row }) => <TableCellViewer item={row.original} field="agent" />,
    enableHiding: false,
  },
  {
    accessorKey: "duration",
    header: "Duration",
    cell: ({ row }) => <TableCellViewer item={row.original} field="duration" />,
    enableHiding: false,
  },
  {
    accessorKey: "messages",
    header: "Messages",
    cell: ({ row }) => <TableCellViewer item={row.original} field="messages" />,
    enableHiding: false,
  },
  {
    accessorKey: "evaluation",
    header: "Status",
    cell: ({ row }) => {
      const status = row.original.evaluation;
      return (
        <Badge
          variant="outline"
          className={cn(
            "px-1.5",
            status === "Successful" && "border-green-500 text-green-700 dark:text-green-400",
            status === "In Progress" && "border-gray-400 text-gray-600 dark:text-gray-300",
            status === "Failed" && "border-red-500 text-red-700 dark:text-red-400"
          )}
        >
          {status === "Successful" && <IconCircleCheckFilled className="mr-1 size-4 fill-green-500 dark:fill-green-400" />}
          {status === "In Progress" && <IconLoader className="mr-1 size-4 animate-spin" />}
          {status === "Failed" && <X className="mr-1 size-4 stroke-red-500 dark:stroke-red-400" />}
          {status}
        </Badge>
      );
    },
  },
];

/* ------------------------------------------------------------------ */
/* 4.  draggable row                                                  */
/* ------------------------------------------------------------------ */
function DraggableRow({ row }: { row: Row<z.infer<typeof schema>> }) {
  const { transform, transition, setNodeRef, isDragging } = useSortable({ id: row.original.id });
  return (
    <TableRow
      data-state={row.getIsSelected() && "selected"}
      data-dragging={isDragging}
      ref={setNodeRef}
      className="relative z-0 data-[dragging=true]:z-10 data-[dragging=true]:opacity-80"
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {row.getVisibleCells().map((cell) => (
        <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
      ))}
    </TableRow>
  );
}

/* ------------------------------------------------------------------ */
/* 5.  main table                                                     */
/* ------------------------------------------------------------------ */
export function DataTable() {
  const [data, setData] = React.useState<z.infer<typeof schema>[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [rowSelection, setRowSelection] = React.useState({});
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 10 });

  React.useEffect(() => {
    axios
      .get("http://localhost:8000/conversations", { params: { page_size: 100 } })
      .then(({ data: res }) => {
        const mapped = (Array.isArray(res) ? res : []).map((c: {
          id?: string;
          date?: string | number;
          agent?: string;
          duration?: string;
          messages?: number;
          evaluation?: "Successful" | "Failed" | "In Progress";
          transcript?: string;
          recordingUrl?: string;
          client?: { name?: string; phone?: string };
          tags?: string[];
          creditsCall?: number;
          creditsLLM?: number;
          costPerMin?: number;
          totalUSD?: number;
          turns?: unknown[];
          clientOverrides?: { language?: string };
        }) =>
          schema.parse({
            id: c.id,
            date: new Date(c.date || Date.now()).toISOString(),
            agent: c.agent ?? "Unnamed agent",
            duration: String(c.duration ?? "0:00"),
            messages: c.messages ?? 0,
            evaluation: c.evaluation ?? "In Progress",
            transcript: c.transcript ?? "",
            recordingUrl: c.recordingUrl ?? "",
            client: { name: c.client?.name ?? "Client", phone: c.client?.phone ?? "" },
            tags: c.tags ?? [],
            creditsCall: c.creditsCall ?? 0,
            creditsLLM: c.creditsLLM ?? 0,
            costPerMin: c.costPerMin ?? 0,
            totalUSD: c.totalUSD ?? 0,
            turns: c.turns ?? [],
            clientOverrides: c.clientOverrides ?? { language: "English" },
          })
        );
        setData(mapped);
      })
      .finally(() => setLoading(false));
  }, []);

  const sortableId = React.useId();
  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {})
  );
  const dataIds = React.useMemo(() => data.map((r) => r.id), [data]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnVisibility, rowSelection, columnFilters, pagination },
    getRowId: (row) => row.id,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      const oldIndex = dataIds.indexOf(active.id as string);
      const newIndex = dataIds.indexOf(over.id as string);
      setData((rows) => arrayMove(rows, oldIndex, newIndex));
    }
  };

  if (loading) return <div className="p-8 text-sm">Loading…</div>;

  return (
    <Tabs defaultValue="outline" className="w-full flex-col justify-start gap-6">
      {/* header controls - unchanged */}
      <div className="flex items-center justify-between px-4 lg:px-6">
        <Label htmlFor="view-selector" className="sr-only">
          View
        </Label>
        <Select defaultValue="outline" />
        <TabsList className="hidden @4xl/main:flex">
          <TabsTrigger value="outline">Outline</TabsTrigger>
          <TabsTrigger value="past-performance">
            Past Performance <Badge variant="secondary">3</Badge>
          </TabsTrigger>
          <TabsTrigger value="key-personnel">
            Key Personnel <Badge variant="secondary">2</Badge>
          </TabsTrigger>
          <TabsTrigger value="focus-documents">Focus Documents</TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <IconLayoutColumns />
                <span className="hidden lg:inline">Customize Columns</span>
                <span className="lg:hidden">Columns</span>
                <IconChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {table
                .getAllColumns()
                .filter((col) => typeof col.accessorFn !== "undefined" && col.getCanHide())
                .map((col) => (
                  <DropdownMenuCheckboxItem
                    key={col.id}
                    className="capitalize"
                    checked={col.getIsVisible()}
                    onCheckedChange={(v) => col.toggleVisibility(!!v)}
                  >
                    {col.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <TabsContent value="outline" className="relative flex flex-col gap-4 overflow-auto px-4 lg:px-6">
        <div className="overflow-hidden rounded-lg border">
          <DndContext
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleDragEnd}
            sensors={sensors}
            id={sortableId}
          >
            <Table>
              <TableHeader className="bg-muted sticky top-0 z-10">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id} colSpan={header.colSpan}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows?.length ? (
                  <SortableContext items={dataIds} strategy={verticalListSortingStrategy}>
                    {table.getRowModel().rows.map((row) => (
                      <DraggableRow key={row.id} row={row} />
                    ))}
                  </SortableContext>
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                      No results.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </DndContext>
        </div>

        {/* Pagination - unchanged */}
        <div className="flex items-center justify-between px-4">
          <div className="text-muted-foreground hidden flex-1 text-sm lg:flex">
            {table.getFilteredRowModel().rows.length} row(s)
          </div>
          <div className="flex w-full items-center gap-8 lg:w-fit">
            <div className="hidden items-center gap-2 lg:flex">
              <Label htmlFor="rows-per-page" className="text-sm font-medium">
                Rows per page
              </Label>
              <Select
                value={`${table.getState().pagination.pageSize}`}
                onValueChange={(v) => table.setPageSize(Number(v))}
              >
                <SelectTrigger size="sm" className="w-20" id="rows-per-page">
                  <SelectValue placeholder={table.getState().pagination.pageSize} />
                </SelectTrigger>
                <SelectContent side="top">
                  {[10, 20, 30, 40, 50].map((ps) => (
                    <SelectItem key={ps} value={`${ps}`}>
                      {ps}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex w-fit items-center justify-center text-sm font-medium">
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            </div>
            <div className="ml-auto flex items-center gap-2 lg:ml-0">
              <Button
                variant="outline"
                className="hidden h-8 w-8 p-0 lg:flex"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
              >
                <IconChevronsLeft />
              </Button>
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <IconChevronLeft />
              </Button>
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <IconChevronRight />
              </Button>
              <Button
                variant="outline"
                className="hidden size-8 lg:flex"
                size="icon"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
              >
                <IconChevronsRight />
              </Button>
            </div>
          </div>
        </div>
      </TabsContent>

      {/* Additional tabs */}
      <TabsContent value="past-performance" className="flex flex-col px-4 lg:px-6">
        <div className="flex h-40 w-full flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <p className="mb-2 text-lg font-medium">Past Performance Data</p>
          <p className="text-sm">Historical comparison metrics will be populated here once sufficient call volume is reached.</p>
        </div>
      </TabsContent>
      <TabsContent value="key-personnel" className="flex flex-col px-4 lg:px-6">
        <div className="flex h-40 w-full flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <p className="mb-2 text-lg font-medium">Key Personnel</p>
          <p className="text-sm">Agents and supervisors associated with these calls will appear here.</p>
        </div>
      </TabsContent>
      <TabsContent value="focus-documents" className="flex flex-col px-4 lg:px-6">
        <div className="flex h-40 w-full flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <p className="mb-2 text-lg font-medium">Focus Documents</p>
          <p className="text-sm">Knowledge base articles and scripts referenced during these calls will be listed here.</p>
        </div>
      </TabsContent>
    </Tabs>
  );
}

/* ------------------------------------------------------------------ */
/* 6.  drawer + voice preview player                                  */
/* ------------------------------------------------------------------ */
function TableCellViewer({
  item,
  field,
}: {
  item: z.infer<typeof schema>;
  field: keyof z.infer<typeof schema>;
}) {
  const [tab, setTab] = React.useState("overview");
  const [detail, setDetail] = React.useState<z.infer<typeof schema> | null>(null);
  const [voicePreview, setVoicePreview] = React.useState<string | null>(null);

  /* fetch conversation + voice preview */
  const fetchDetail = () => {
    if (detail || !item.id) return;

    /* 1. conversation details */
    axios.get(`http://localhost:8000/conversations/${item.id}`).then(({ data }) => {
      const turns = (data.transcript ?? []).map((t: { role?: string; message?: string; time_in_call_secs?: number }) => ({
        speaker: t.role as "user" | "agent",
        text: t.message ?? "",
        time: fmt(t.time_in_call_secs ?? 0),
      }));

      setDetail({
        ...item,
        transcript: data.analysis?.transcript_summary ?? "—",
        recordingUrl: data.has_audio
          ? `http://localhost:8000/conversations/${item.id}/audio`
          : "",
        turns,
        creditsCall: data.metadata?.call_charge ?? 0,
        creditsLLM: data.metadata?.llm_charge ?? 0,
        totalUSD: data.metadata?.llm_price ?? 0,
        client: {
          name: "Client",
          phone: data.phone_call?.external_number ?? "—",
        },
      });
    });

    /* 2. voice preview (agent → voice) */
    /* NOTE: You must map agent → voice_id in real life. For demo we hard-code an example voice. */
    const voiceId = "MF4J4IDTRo0AxOO4dpFR"; // ← replace with real mapping
    axios.get(`http://localhost:8000/voices/${voiceId}`).then(({ data }) => {
      setVoicePreview(data.preview_url);
    });
  };

  /* helper to show column value */
  const display = React.useMemo(() => {
    if (field === "date") return <SafeDate iso={item.date} />;
    return String(item[field] ?? "");
  }, [item, field]);

  return (
    <Drawer direction="right">
      <DrawerTrigger asChild>
        <Button
          variant="link"
          className="text-foreground w-fit truncate px-0 text-left"
          onClick={fetchDetail}
        >
          {display}
        </Button>
      </DrawerTrigger>

      <DrawerContent className="fixed inset-y-0 right-0 z-50 h-full w-4/5 !max-w-full bg-background shadow-lg border-l flex flex-col !p-0">
        <DrawerClose className="absolute top-4 right-4 z-20">
          <X className="w-5 h-5" />
        </DrawerClose>

        <DrawerHeader className="border-b px-6 py-4 shrink-0">
          <DrawerTitle className="text-lg font-semibold">
            Conversation with <span className="underline">{item.agent}</span>
          </DrawerTitle>
          <DrawerDescription className="text-sm text-muted-foreground">{item.id}</DrawerDescription>
        </DrawerHeader>

        {/* ---------- VOICE PREVIEW PLAYER ---------- */}
        <div className="px-6 py-3 border-b shrink-0">
          <VoicePreviewPlayer src={voicePreview} />
        </div>

        {/* ---------- TABS ---------- */}
        <Tabs value={tab} onValueChange={setTab} className="flex flex-col flex-1 min-h-0">
          <TabsList className="border-b px-6 w-full justify-start shrink-0">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="transcription">Transcription</TabsTrigger>
            <TabsTrigger value="client">Client data</TabsTrigger>
          </TabsList>

          <div className="flex flex-1 min-h-0">
            {/* LEFT */}
            <div className="flex-1 overflow-y-auto">
              {tab === "overview" && (
                <div className="space-y-6 px-6 py-6">
                  <section>
                    <h3 className="mb-2 text-sm font-medium">Summary</h3>
                    <p className="text-sm whitespace-pre-wrap">{detail?.transcript || "—"}</p>
                  </section>
                  <section>
                    <h3 className="mb-2 text-sm font-medium">Call status</h3>
                    <Badge
                      variant="outline"
                      className={cn(
                        "px-1.5",
                        item.evaluation === "Successful" && "border-green-500 text-green-700 dark:text-green-400",
                        item.evaluation === "In Progress" && "border-gray-400 text-gray-600 dark:text-gray-300",
                        item.evaluation === "Failed" && "border-red-500 text-red-700 dark:text-red-400"
                      )}
                    >
                      {item.evaluation}
                    </Badge>
                  </section>
                </div>
              )}

              {tab === "transcription" && (
                <div className="space-y-4 px-6 py-6">
                  {(detail?.turns ?? []).map((t, i) => (
                    <div key={i} className="text-sm">
                      <div className="flex justify-between">
                        <span className="font-medium">
                          {t.speaker === "user" ? detail?.client?.name : item.agent}
                        </span>
                        <span className="text-muted-foreground">{t.time}</span>
                      </div>
                      <p className="text-muted-foreground whitespace-pre-wrap">{t.text}</p>
                    </div>
                  ))}
                </div>
              )}

              {tab === "client" && (
                <div className="space-y-4 px-6 py-6">
                  <section>
                    <h3 className="mb-2 text-sm font-medium">Client overrides</h3>
                    <p>Language: {detail?.clientOverrides.language ?? "English"}</p>
                  </section>
                  <section>
                    <h3 className="mb-2 text-sm font-medium">Contact</h3>
                    <p>Name: {detail?.client.name ?? "Client"}</p>
                    <p>Phone: {detail?.client.phone ?? "—"}</p>
                  </section>
                </div>
              )}
            </div>

            {/* RIGHT SIDEBAR */}
            <aside className="w-[300px] shrink-0 border-l overflow-y-auto">
              <div className="p-6 space-y-6">
                <h3 className="text-lg font-medium">Metadata</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Date</span>
                    <span>{formatDistanceToNow(new Date(item.date), { addSuffix: true })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Duration</span>
                    <span>{detail?.duration ?? item.duration}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Credits (call)</span>
                    <span>{(detail?.creditsCall ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Credits (LLM)</span>
                    <span>{detail?.creditsLLM ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">LLM cost</span>
                    <span>US${detail?.costPerMin ?? 0}/min</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>Total</span>
                    <span>US${detail?.totalUSD ?? 0}</span>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </Tabs>
      </DrawerContent>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* 7.  tiny inline voice player                                       */
/* ------------------------------------------------------------------ */
function VoicePreviewPlayer({ src }: { src: string | null }) {
  const [audio, setAudio] = React.useState<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    if (!src) return;
    const a = new Audio(src);
    a.crossOrigin = "anonymous";
    setAudio(a);

    const onLoaded = () => setDuration(a.duration || 0);
    const onErr = () => setError(true);
    const onTime = () => setCurrentTime(a.currentTime || 0);
    const onEnd = () => setPlaying(false);

    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("error", onErr);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);

    return () => {
      a.pause();
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("error", onErr);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnd);
      setAudio(null);
    };
  }, [src]);

  const togglePlay = () => {
    if (!audio) return;
    if (playing) audio.pause();
    else audio.play();
    setPlaying(!playing);
  };
  const seek = (offset: number) => {
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(audio.currentTime + offset, duration));
  };

  if (!src) return null;

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="ghost" onClick={() => seek(-10)} disabled={error}>
        <Rewind className="w-3 h-3" />
      </Button>
      <Button size="sm" variant="outline" onClick={togglePlay} disabled={error}>
        {playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => seek(10)} disabled={error}>
        <FastForward className="w-3 h-3" />
      </Button>
      <span className="text-xs">
        {error ? "Preview unavailable" : `${fmt(currentTime)} / ${fmt(duration)}`}
      </span>
    </div>
  );
}