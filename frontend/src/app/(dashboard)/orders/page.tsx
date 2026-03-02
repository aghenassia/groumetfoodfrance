"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  api,
  OrderListItem,
  OrderListResponse,
  OrderDetailResponse,
  User,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
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
import {
  Search,
  ShoppingCart,
  ChevronRight,
  ChevronLeft,
  ArrowUp,
  ArrowDown,
  Users,
  X,
  SlidersHorizontal,
  BarChart3,
  FileText,
  Truck,
  Receipt,
  Package,
  CalendarDays,
} from "lucide-react";
import Link from "next/link";

const PAGE_SIZE = 50;

type DatePreset = "7d" | "30d" | "90d" | "ytd" | "12m" | "all" | "custom";
const PRESETS: DatePreset[] = ["7d", "30d", "90d", "ytd", "12m", "all"];

function toISO(d: Date): string {
  return d.toISOString().split("T")[0];
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function presetLabel(p: DatePreset): string {
  switch (p) {
    case "7d": return "7j";
    case "30d": return "30j";
    case "90d": return "90j";
    case "ytd": return "YTD";
    case "12m": return "12 mois";
    case "all": return "Tout";
    case "custom": return "Période";
  }
}
function presetRange(p: DatePreset): { from: Date; to: Date } | null {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  switch (p) {
    case "7d": return { from: addDays(today, -6), to: today };
    case "30d": return { from: addDays(today, -29), to: today };
    case "90d": return { from: addDays(today, -89), to: today };
    case "ytd": return { from: new Date(today.getFullYear(), 0, 1), to: today };
    case "12m": return { from: addDays(today, -364), to: today };
    case "all": return null;
    default: return { from: addDays(today, -29), to: today };
  }
}
function formatDateRange(from: Date, to: Date): string {
  const f = from.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  const t = to.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  if (toISO(from) === toISO(to)) return f;
  return `${f} → ${t}`;
}

type SortKey = "date" | "ca" | "client" | "type";

const DOC_TYPES = [
  { key: "BC", label: "Bon de commande", color: "text-amber-700", bg: "bg-amber-50 border-amber-200", icon: FileText },
  { key: "BL", label: "Bon de livraison", color: "text-blue-700", bg: "bg-blue-50 border-blue-200", icon: Truck },
  { key: "FA", label: "Facture", color: "text-green-700", bg: "bg-green-50 border-green-200", icon: Receipt },
  { key: "AV", label: "Avoir", color: "text-red-700", bg: "bg-red-50 border-red-200", icon: Receipt },
];

function docTypeConfig(dt: string) {
  return DOC_TYPES.find((d) => d.key === dt) || DOC_TYPES[2];
}

function formatCurrency(v: number | null | undefined): string {
  if (v == null || v === 0) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v);
}

function formatCurrencyCompact(v: number | null | undefined): string {
  if (v == null || v === 0) return "—";
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(".", ",")} M€`;
  if (abs >= 10_000) return `${(v / 1_000).toFixed(1).replace(".", ",")} K€`;
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
}

function formatCurrencyPrecise(v: number | null | undefined): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(v);
}

function formatQty(v: number | null | undefined): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(v);
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateShort(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

function MarginBadge({ value }: { value?: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={
        value >= 20
          ? "text-green-600"
          : value >= 0
          ? "text-amber-600"
          : "text-red-600"
      }
    >
      {value.toFixed(1)}%
    </span>
  );
}

export default function OrdersPage() {
  return (
    <Suspense>
      <OrdersPageInner />
    </Suspense>
  );
}

function OrdersPageInner() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<OrderListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [docFilter, setDocFilter] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [animKey, setAnimKey] = useState(0);
  const [preset, setPreset] = useState<DatePreset>("all");
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date } | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [salesFilter, setSalesFilter] = useState<string>("all");
  const [allUsers, setAllUsers] = useState<{ id: string; name: string }[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [detail, setDetail] = useState<OrderDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.me().then((u) => {
      setCurrentUser(u);
      if (u.role === "admin" || u.role === "manager") {
        api.getUsers().then((users) => {
          setAllUsers(users.filter((x) => x.is_active).map((x) => ({ id: x.id, name: x.name })));
        }).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const pieceId = searchParams.get("piece_id");
    if (pieceId) {
      openDetail(pieceId);
    }
  }, [searchParams]);

  const fetchOrders = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = {
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
      sort_by: sortBy,
      sort_dir: sortDir,
    };
    if (debouncedSearch) params.search = debouncedSearch;
    if (docFilter.length > 0) params.doc_type = docFilter.join(",");
    if (dateRange) {
      params.date_from = toISO(dateRange.from);
      params.date_to = toISO(dateRange.to);
    }
    if (salesFilter && salesFilter !== "all") {
      params.user_id = salesFilter;
    }

    api
      .getOrders(params)
      .then((res) => {
        setData(res);
        setAnimKey((k) => k + 1);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [debouncedSearch, sortBy, sortDir, docFilter, page, dateRange, salesFilter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const openDetail = (pieceId: string) => {
    setSelectedPieceId(pieceId);
    setLoadingDetail(true);
    setMobileDetailOpen(true);
    api
      .getOrderDetail(pieceId)
      .then(setDetail)
      .catch(() => {})
      .finally(() => setLoadingDetail(false));
  };

  const closeDetail = () => {
    setDetail(null);
    setSelectedPieceId(null);
    setMobileDetailOpen(false);
  };

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir(key === "client" ? "asc" : "desc");
    }
    setPage(0);
  };

  const toggleDocFilter = (dt: string) => {
    setDocFilter((prev) =>
      prev.includes(dt) ? prev.filter((d) => d !== dt) : [...prev, dt]
    );
    setPage(0);
  };

  const handlePreset = (p: DatePreset) => {
    setPreset(p);
    setDateRange(presetRange(p));
    setPage(0);
  };

  const handleCalendarSelect = (range: { from?: Date; to?: Date } | undefined) => {
    if (range?.from) {
      setDateRange({ from: range.from, to: range.to || range.from });
      setPreset("custom");
      if (range.to) setCalendarOpen(false);
      setPage(0);
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortBy !== col) return null;
    return sortDir === "asc" ? (
      <ArrowUp className="w-3 h-3 inline ml-0.5" />
    ) : (
      <ArrowDown className="w-3 h-3 inline ml-0.5" />
    );
  };

  const total = data?.total ?? 0;
  const orders = data?.orders ?? [];
  const summary = data?.summary;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const activeFilterCount = docFilter.length + (salesFilter !== "all" ? 1 : 0);
  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "manager";
  const hasDetail = !!(detail || loadingDetail);

  return (
    <div className="relative">
      {/* Main list */}
      <div className={hasDetail ? "lg:pr-[420px] xl:pr-[460px]" : ""}>
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6" />
                Commandes
              </h2>
              <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
                {total} pièce{total > 1 ? "s" : ""} commerciale{total > 1 ? "s" : ""}
                {debouncedSearch && ` · "${debouncedSearch}"`}
                {preset !== "all" && dateRange && ` · ${preset === "custom" ? formatDateRange(dateRange.from, dateRange.to) : presetLabel(preset)}`}
              </p>
            </div>
          </div>
        </div>

        {/* Date presets */}
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          {PRESETS.map((p) => (
            <Button
              key={p}
              variant={preset === p ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => handlePreset(p)}
            >
              {presetLabel(p)}
            </Button>
          ))}
          <div className="w-px h-5 bg-border" />
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant={preset === "custom" ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => { setPreset("custom"); setCalendarOpen(true); }}
              >
                <CalendarDays className="w-3 h-3 mr-1" />
                {preset === "custom" && dateRange ? formatDateRange(dateRange.from, dateRange.to) : "Période"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={dateRange ? { from: dateRange.from, to: dateRange.to } : undefined}
                onSelect={handleCalendarSelect}
                numberOfMonths={2}
                disabled={{ after: new Date() }}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* KPI cards */}
        {summary && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <CardContent className="pt-5 pb-4">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">CA total</p>
                <p className="text-2xl font-extrabold mt-1">{formatCurrencyCompact(summary.total_ca)}</p>
              </CardContent>
            </Card>
            <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <CardContent className="pt-5 pb-4">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Commandes</p>
                <p className="text-2xl font-extrabold mt-1">{summary.total_orders.toLocaleString("fr-FR")}</p>
              </CardContent>
            </Card>
            <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <CardContent className="pt-5 pb-4">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Clients</p>
                <p className="text-2xl font-extrabold mt-1">{summary.total_clients.toLocaleString("fr-FR")}</p>
              </CardContent>
            </Card>
            <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <CardContent className="pt-5 pb-4">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Panier moyen</p>
                <p className="text-2xl font-extrabold mt-1">
                  {summary.total_orders > 0 ? formatCurrencyCompact(summary.total_ca / summary.total_orders) : "—"}
                </p>
                {summary.avg_margin != null && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Marge moy. : <MarginBadge value={summary.avg_margin} />
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Search + filter toggle */}
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher par n° de pièce, client, produit..."
              className="pl-9 h-9 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            variant={showFilters || activeFilterCount > 0 ? "default" : "outline"}
            size="sm"
            className="h-9 gap-1.5 shrink-0"
            onClick={() => setShowFilters(!showFilters)}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">Filtres</span>
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="h-5 w-5 p-0 flex items-center justify-center text-xs rounded-full">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </div>

        {/* Filter bar */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-2 mb-3 p-3 rounded-lg border bg-card animate-in slide-in-from-top-2 duration-200">
            <span className="text-xs text-muted-foreground">Type :</span>
            {DOC_TYPES.map((dt) => (
              <Button
                key={dt.key}
                variant={docFilter.includes(dt.key) ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs px-2.5 gap-1"
                onClick={() => toggleDocFilter(dt.key)}
              >
                <dt.icon className="w-3 h-3" />
                {dt.key}
              </Button>
            ))}
            {isAdmin && allUsers.length > 0 && (
              <>
                <div className="w-px h-6 bg-border" />
                <span className="text-xs text-muted-foreground">Commercial :</span>
                <Select value={salesFilter} onValueChange={(v) => { setSalesFilter(v); setPage(0); }}>
                  <SelectTrigger className="w-[160px] h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    {allUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
            {activeFilterCount > 0 && (
              <>
                <div className="w-px h-6 bg-border" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={() => { setDocFilter([]); setSalesFilter("all"); setPage(0); }}
                >
                  <X className="w-3 h-3 mr-1" />
                  Réinitialiser
                </Button>
              </>
            )}
          </div>
        )}

        {/* Desktop table */}
        <Card className="hidden md:block">
          <CardContent className="p-0">
            {loading ? (
              <div className="text-center py-12 text-muted-foreground text-sm">Chargement...</div>
            ) : orders.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">Aucune commande trouvée</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-background">
                      <TableHead className="cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("type")}>
                        Type <SortIcon col="type" />
                      </TableHead>
                      <TableHead className="min-w-[120px]">Pièce</TableHead>
                      <TableHead className="cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("date")}>
                        Date <SortIcon col="date" />
                      </TableHead>
                      <TableHead className="cursor-pointer hover:text-foreground select-none min-w-[160px]" onClick={() => toggleSort("client")}>
                        Client <SortIcon col="client" />
                      </TableHead>
                      <TableHead className="text-center">Lignes</TableHead>
                      <TableHead className="text-right hidden lg:table-cell">Qté</TableHead>
                      <TableHead className="cursor-pointer hover:text-foreground text-right select-none" onClick={() => toggleSort("ca")}>
                        Montant HT <SortIcon col="ca" />
                      </TableHead>
                      <TableHead className="text-right hidden lg:table-cell">Marge</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody key={animKey}>
                    {orders.map((o, i) => {
                      const cfg = docTypeConfig(o.doc_type);
                      const Icon = cfg.icon;
                      return (
                        <TableRow
                          key={`${o.piece_id}-${i}`}
                          className={`stagger-row group cursor-pointer transition-colors ${
                            selectedPieceId === o.piece_id
                              ? "bg-primary/5 border-l-2 border-l-primary"
                              : "hover:bg-muted/40"
                          }`}
                          style={{ animationDelay: `${i * 30}ms` }}
                          onClick={() => openDetail(o.piece_id)}
                        >
                          <TableCell>
                            <Badge variant="outline" className={`text-xs gap-1 ${cfg.color} ${cfg.bg}`}>
                              <Icon className="w-3 h-3" />
                              {o.doc_type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm font-mono text-muted-foreground">{o.piece_id}</span>
                          </TableCell>
                          <TableCell className="text-sm">{formatDateShort(o.date)}</TableCell>
                          <TableCell>
                            <div className="min-w-0">
                              {o.client_id ? (
                                <Link
                                  href={`/clients/${o.client_id}`}
                                  className="text-sm font-medium truncate block max-w-[200px] hover:underline hover:text-primary transition-colors"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {o.client_name}
                                </Link>
                              ) : (
                                <span className="text-sm font-medium truncate block max-w-[200px]">{o.client_name}</span>
                              )}
                              {o.sales_rep && (
                                <span className="text-xs text-muted-foreground">{o.sales_rep}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center text-sm tabular-nums">
                            {o.nb_articles} art.
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums hidden lg:table-cell">
                            {formatQty(o.total_qty)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={`font-semibold text-sm tabular-nums ${
                              o.total_ht > 0 ? "text-foreground" : o.total_ht < 0 ? "text-red-600" : "text-muted-foreground"
                            }`}>
                              {formatCurrency(o.total_ht)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums hidden lg:table-cell">
                            <MarginBadge value={o.avg_margin} />
                          </TableCell>
                          <TableCell className="pr-3">
                            <ChevronRight className="w-4 h-4 opacity-30 group-hover:opacity-100 transition-opacity" />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Mobile cards */}
        <div className="md:hidden space-y-2">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Chargement...</div>
          ) : orders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Aucune commande trouvée</div>
          ) : (
            orders.map((o, i) => {
              const cfg = docTypeConfig(o.doc_type);
              const Icon = cfg.icon;
              return (
                <Card
                  key={`${o.piece_id}-${i}`}
                  className={`cursor-pointer transition-colors active:bg-muted/50 ${
                    selectedPieceId === o.piece_id ? "border-primary/50 bg-primary/5" : ""
                  }`}
                  onClick={() => openDetail(o.piece_id)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Badge variant="outline" className={`text-xs gap-1 ${cfg.color} ${cfg.bg}`}>
                            <Icon className="w-3 h-3" />
                            {o.doc_type}
                          </Badge>
                          <span className="text-xs text-muted-foreground font-mono">{o.piece_id}</span>
                        </div>
                        {o.client_id ? (
                          <Link
                            href={`/clients/${o.client_id}`}
                            className="text-sm font-medium truncate block hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {o.client_name}
                          </Link>
                        ) : (
                          <p className="text-sm font-medium truncate">{o.client_name}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`font-bold text-sm tabular-nums ${
                          o.total_ht > 0 ? "text-foreground" : o.total_ht < 0 ? "text-red-600" : "text-muted-foreground"
                        }`}>
                          {formatCurrency(o.total_ht)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span>{formatDateShort(o.date)}</span>
                      <span>{o.nb_articles} art.</span>
                      <span>Qté {formatQty(o.total_qty)}</span>
                      <MarginBadge value={o.avg_margin} />
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-xs sm:text-sm text-muted-foreground">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)}/{total}
            </p>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                <ChevronLeft className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">Précédent</span>
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">{page + 1}/{totalPages}</span>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                <span className="hidden sm:inline">Suivant</span>
                <ChevronRight className="w-4 h-4 sm:ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Desktop detail panel (fixed right) */}
      {hasDetail && (
        <div
          ref={panelRef}
          className="hidden lg:flex flex-col fixed top-0 right-0 bottom-0 w-[400px] xl:w-[440px] border-l bg-background z-30"
        >
          <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
            <OrderDetailPanel
              detail={detail}
              loading={loadingDetail}
              onClose={closeDetail}
            />
          </div>
        </div>
      )}

      {/* Mobile detail sheet */}
      {mobileDetailOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-background">
          <div className="flex items-center justify-between p-3 border-b bg-card">
            <h3 className="font-semibold text-sm truncate">
              Commande {detail?.sage_piece_id || "..."}
            </h3>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={closeDetail}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <OrderDetailPanel
              detail={detail}
              loading={loadingDetail}
              onClose={closeDetail}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function OrderDetailPanel({
  detail,
  loading,
  onClose,
}: {
  detail: OrderDetailResponse | null;
  loading: boolean;
  onClose: () => void;
}) {
  if (loading && !detail) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          Chargement...
        </CardContent>
      </Card>
    );
  }

  if (!detail) return null;

  const cfg = docTypeConfig(
    detail.lines?.[0]
      ? ["", "BC", "", "BL", "", "", "FA", "AV"][
          (detail as any).doc_type_raw ?? 6
        ] || "FA"
      : "FA"
  );

  const totalMargin = detail.lines.reduce((sum, l) => {
    if (l.margin_percent != null) return sum + l.margin_percent;
    return sum;
  }, 0);
  const countWithMargin = detail.lines.filter((l) => l.margin_percent != null).length;
  const avgMargin = countWithMargin > 0 ? totalMargin / countWithMargin : null;

  const totalQty = detail.lines.reduce((sum, l) => sum + (l.quantity ?? 0), 0);
  const articleCount = new Set(detail.lines.map((l) => l.article_ref).filter(Boolean)).size;

  return (
    <>
      {/* Header card */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base leading-tight flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 shrink-0" />
              {detail.sage_piece_id}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{formatDate(detail.date)}</p>
            {detail.client_name && (
              <div className="mt-1.5">
                {detail.client_id ? (
                  <Link
                    href={`/clients/${detail.client_id}`}
                    className="text-sm font-medium hover:underline hover:text-primary transition-colors"
                  >
                    {detail.client_name}
                  </Link>
                ) : (
                  <span className="text-sm font-medium">{detail.client_name}</span>
                )}
              </div>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 hidden lg:flex" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </CardHeader>
        <CardContent className="pt-1">
          <div className="grid grid-cols-2 gap-2">
            <KpiTile
              value={formatCurrency(detail.total_ht)}
              label="Total HT"
              icon={<BarChart3 className="w-3.5 h-3.5" />}
            />
            <KpiTile
              value={formatQty(totalQty)}
              label="Qté totale"
              icon={<Package className="w-3.5 h-3.5" />}
            />
            <KpiTile
              value={String(articleCount)}
              label="Articles"
              icon={<ShoppingCart className="w-3.5 h-3.5" />}
            />
            <KpiTile
              value={String(detail.lines.length)}
              label="Lignes"
              icon={<FileText className="w-3.5 h-3.5" />}
            />
          </div>
          {avgMargin != null && (
            <div className="flex items-center justify-center mt-2 text-xs text-muted-foreground">
              Marge moy. : <MarginBadge value={avgMargin} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lines */}
      <Card>
        <CardHeader className="pb-1.5 pt-3">
          <CardTitle className="text-base flex items-center gap-1.5">
            <Package className="w-4 h-4 text-primary" />
            Détail des lignes
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 px-0">
          <div className="divide-y divide-border">
            {detail.lines.map((l, i) => {
              const inner = (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">
                      {l.designation || l.article_ref || "—"}
                    </p>
                    {l.article_ref && (
                      <p className="text-[11px] text-muted-foreground font-mono">{l.article_ref}</p>
                    )}
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                      {l.quantity != null && <span>Qté : {formatQty(l.quantity)}</span>}
                      {l.unit_price != null && <span>PU : {formatCurrencyPrecise(l.unit_price)}</span>}
                      {l.net_weight != null && l.net_weight > 0 && <span>{formatQty(l.net_weight)} kg</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <p className="text-xs font-bold tabular-nums">{formatCurrency(l.amount_ht)}</p>
                    {l.margin_percent != null && (
                      <p className="text-[11px]"><MarginBadge value={l.margin_percent} /></p>
                    )}
                  </div>
                  {l.article_ref && (
                    <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground/40" />
                  )}
                </>
              );
              return l.article_ref ? (
                <Link
                  key={i}
                  href={`/products?ref=${encodeURIComponent(l.article_ref)}`}
                  className="flex items-center gap-2.5 px-4 py-2 hover:bg-accent/40 transition-colors cursor-pointer"
                >
                  {inner}
                </Link>
              ) : (
                <div key={i} className="flex items-center gap-2.5 px-4 py-2">
                  {inner}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function KpiTile({ value, label, icon }: { value: string; label: string; icon: React.ReactNode }) {
  return (
    <div className="text-center p-2.5 rounded-lg bg-accent/50 border border-border/50">
      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-base font-bold tabular-nums">{value}</p>
    </div>
  );
}
