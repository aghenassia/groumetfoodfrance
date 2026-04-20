"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { api, Client, CreateProspectRequest } from "@/lib/api";
import { usePersistedFilters } from "@/hooks/use-persisted-filters";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  Search,
  ChevronRight,
  ChevronLeft,
  Plus,
  Phone,
  Mail,
  MapPin,
  Building2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Calendar,
  Clock,
  AlertTriangle,
  Target,
  Truck,
  Swords,
  Package,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { ClickToCall } from "@/components/click-to-call";
import { toast } from "sonner";
import { NameItem } from "@/lib/api";
import { TypePicker } from "@/components/type-picker";

const PAGE_SIZE_OPTIONS = [
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: 500, label: "500" },
  { value: 0, label: "Tous" },
] as const;

type SortKey =
  | "name"
  | "ca_total"
  | "ca_12m"
  | "last_order"
  | "order_count"
  | "order_count_12m"
  | "avg_basket"
  | "margin"
  | "churn"
  | "upsell"
  | "priority";

const SORT_OPTIONS: { value: SortKey; label: string; icon: React.ReactNode }[] = [
  { value: "name", label: "Nom", icon: <Building2 className="w-3.5 h-3.5" /> },
  { value: "ca_total", label: "CA total", icon: <TrendingUp className="w-3.5 h-3.5" /> },
  { value: "ca_12m", label: "CA 12 mois", icon: <TrendingUp className="w-3.5 h-3.5" /> },
  { value: "last_order", label: "Dernière commande", icon: <Calendar className="w-3.5 h-3.5" /> },
  { value: "order_count", label: "Nb commandes", icon: <ShoppingCart className="w-3.5 h-3.5" /> },
  { value: "avg_basket", label: "Panier moyen", icon: <ShoppingCart className="w-3.5 h-3.5" /> },
  { value: "churn", label: "Risque de perte", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  { value: "upsell", label: "Potentiel upsell", icon: <Target className="w-3.5 h-3.5" /> },
  { value: "priority", label: "Priorité globale", icon: <Target className="w-3.5 h-3.5" /> },
];

function getOrderDelay(client: Client) {
  const freq = client.avg_frequency_days;
  const daysSince = client.days_since_last_order;
  if (freq == null || daysSince == null || freq <= 0 || (client.order_count_total ?? 0) < 3) {
    return null;
  }
  const delayDays = Math.max(0, daysSince - freq);
  const delayRatio = delayDays / freq;
  const basket = client.avg_basket ?? 0;
  const missedOrders = Math.ceil(delayDays / freq);
  const lateCA = missedOrders * basket;
  return { delayDays: Math.round(delayDays), delayRatio, lateCA, freq: Math.round(freq), daysSince };
}

function OrderDelayBadge({ client }: { client: Client }) {
  const delay = getOrderDelay(client);
  if (!delay) return <span className="text-xs text-muted-foreground">—</span>;

  if (delay.delayDays === 0) {
    return (
      <div className="flex items-center gap-1">
        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
        <span className="text-xs text-green-700">À jour</span>
      </div>
    );
  }

  const isWarning = delay.delayRatio < 1;
  const isCritical = delay.delayRatio >= 1;
  const color = isCritical
    ? "text-red-700 bg-red-50 border-red-200"
    : isWarning
      ? "text-amber-700 bg-amber-50 border-amber-200"
      : "";

  const formatCA = (v: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);

  return (
    <div className="flex flex-col items-start gap-0.5">
      <div className="flex items-center gap-1">
        {isCritical ? (
          <TrendingDown className="w-3.5 h-3.5 text-red-500" />
        ) : (
          <Clock className="w-3.5 h-3.5 text-amber-500" />
        )}
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${color}`}>
          +{delay.delayDays}j retard
        </Badge>
      </div>
      {delay.lateCA > 0 && (
        <span className={`text-[10px] font-medium ${isCritical ? "text-red-600" : "text-amber-600"}`}>
          ~{formatCA(delay.lateCA)} manquant
        </span>
      )}
    </div>
  );
}

function formatCurrency(v: number | null | undefined): string {
  if (v == null || v === 0) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v);
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function daysAgo(d: string | null | undefined): string {
  if (!d) return "";
  const diff = Math.floor(
    (Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diff === 0) return "aujourd'hui";
  if (diff === 1) return "hier";
  if (diff < 30) return `il y a ${diff}j`;
  if (diff < 365) return `il y a ${Math.floor(diff / 30)} mois`;
  return `il y a ${Math.floor(diff / 365)} an(s)`;
}

function churnBadge(score: number | null | undefined) {
  if (score == null) return null;
  const color =
    score >= 70
      ? "text-red-700 bg-red-100 border-red-300"
      : score >= 40
        ? "text-amber-700 bg-amber-100 border-amber-300"
        : "text-green-700 bg-green-100 border-green-300";
  return (
    <Badge variant="outline" className={`text-xs tabular-nums ${color}`}>
      {score}/100
    </Badge>
  );
}

export default function ClientsPage() {
  const [savedFilters, setFilters, resetFilters] = usePersistedFilters("clients", {
    sortBy: "ca_total" as SortKey,
    sortDir: "desc" as "asc" | "desc",
    statusFilter: "all",
    churnFilter: "all",
    hasOrders: "all",
    commercialFilter: "all",
    supplierFilter: "all",
    competitorFilter: "all",
    clientTypeFilter: "all",
    pageSize: 50,
  });
  const { sortBy, sortDir, statusFilter, churnFilter, hasOrders, commercialFilter, supplierFilter, competitorFilter, clientTypeFilter, pageSize } = savedFilters;

  const [clients, setClients] = useState<Client[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [animKey, setAnimKey] = useState(0);
  const [filter, setFilter] = useState<string>("all");
  const [allSuppliers, setAllSuppliers] = useState<NameItem[]>([]);
  const [allCompetitors, setAllCompetitors] = useState<NameItem[]>([]);
  const [salesUsers, setSalesUsers] = useState<{ id: string; name: string }[]>([]);
  const [allClientTypes, setAllClientTypes] = useState<string[]>([]);
  const [allClientSubtypes, setAllClientSubtypes] = useState<string[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<Partial<CreateProspectRequest>>({});
  const [adding, setAdding] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    const f = searchParams.get("filter");
    if (f) setFilter(f);
  }, [searchParams]);

  useEffect(() => {
    api.getUsers().then((users) => {
      setSalesUsers(
        users
          .filter((u) => u.is_active && ["sales", "manager", "admin"].includes(u.role))
          .map((u) => ({ id: u.id, name: u.name }))
      );
    }).catch(() => {});
    api.searchSuppliers().then(setAllSuppliers).catch(() => {});
    api.searchCompetitors().then(setAllCompetitors).catch(() => {});
    api.getClientTypes().then((r) => { setAllClientTypes(r.types); setAllClientSubtypes(r.subtypes); }).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const effectivePageSize = pageSize === 0 ? 5000 : pageSize;

  const fetchClients = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = {
      limit: String(effectivePageSize),
      offset: String(page * effectivePageSize),
      sort_by: sortBy,
      sort_dir: sortDir,
    };
    if (debouncedSearch) params.search = debouncedSearch;
    if (statusFilter !== "all") {
      params.status = statusFilter;
    } else {
      if (filter === "dormant") params.is_dormant = "true";
      if (filter === "prospect") params.is_prospect = "true";
    }
    if (churnFilter === "high") { params.churn_min = "70"; }
    else if (churnFilter === "medium") { params.churn_min = "40"; params.churn_max = "69"; }
    else if (churnFilter === "low") { params.churn_max = "39"; }
    if (hasOrders === "yes") params.has_orders = "true";
    if (hasOrders === "no") params.has_orders = "false";
    if (commercialFilter !== "all") params.assigned_user_id = commercialFilter;
    if (supplierFilter !== "all") params.supplier_id = supplierFilter;
    if (competitorFilter !== "all") params.competitor_id = competitorFilter;
    if (clientTypeFilter !== "all") params.client_type = clientTypeFilter;

    api
      .getClients(params)
      .then((res) => {
        setClients(res.clients);
        setTotal(res.total);
        setAnimKey((k) => k + 1);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [debouncedSearch, filter, statusFilter, churnFilter, hasOrders, commercialFilter, supplierFilter, competitorFilter, clientTypeFilter, sortBy, sortDir, page, effectivePageSize]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const handleAddProspect = async () => {
    if (!addForm.name?.trim()) {
      toast.error("Le nom est obligatoire");
      return;
    }
    setAdding(true);
    try {
      await api.createProspect(addForm as CreateProspectRequest);
      toast.success("Prospect créé !");
      setShowAdd(false);
      setAddForm({});
      fetchClients();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erreur de création");
    } finally {
      setAdding(false);
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      setFilters({ sortDir: sortDir === "asc" ? "desc" : "asc" });
    } else {
      setFilters({ sortBy: key, sortDir: key === "name" ? "asc" : "desc" });
    }
    setPage(0);
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortBy !== col)
      return <ArrowUpDown className="w-3 h-3 ml-1 opacity-30" />;
    return sortDir === "asc" ? (
      <ArrowUp className="w-3 h-3 ml-1 text-primary" />
    ) : (
      <ArrowDown className="w-3 h-3 ml-1 text-primary" />
    );
  };

  const totalPages = pageSize === 0 ? 1 : Math.ceil(total / pageSize);

  const statusOptions = [
    { key: "all", label: "Tous les statuts" },
    { key: "prospect", label: "Prospect" },
    { key: "lead", label: "Lead qualifié" },
    { key: "client", label: "Client actif" },
    { key: "at_risk", label: "À risque" },
    { key: "dormant", label: "Dormant" },
    { key: "dead", label: "Perdu" },
  ];

  const churnOptions = [
    { key: "all", label: "Tout risque" },
    { key: "high", label: "Élevé (≥70)" },
    { key: "medium", label: "Moyen (40-69)" },
    { key: "low", label: "Faible (<40)" },
  ];

  const orderFilters = [
    { key: "all", label: "Tous" },
    { key: "yes", label: "Avec commandes" },
    { key: "no", label: "Sans commandes" },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="w-6 h-6" />
            Clients
          </h2>
          <p className="text-muted-foreground text-sm">
            {total} client{total > 1 ? "s" : ""} en base
            {debouncedSearch && ` · recherche "${debouncedSearch}"`}
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nouveau prospect
        </Button>
      </div>

      {/* Filters bar */}
      <div className="flex flex-col gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, ville, produit acheté, fournisseur, concurrent, commercial..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Status filter */}
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setFilters({ statusFilter: v });
              setFilter("all");
              setPage(0);
            }}
          >
            <SelectTrigger className="h-8 w-[170px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((opt) => (
                <SelectItem key={opt.key} value={opt.key}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Churn filter */}
          <Select
            value={churnFilter}
            onValueChange={(v) => {
              setFilters({ churnFilter: v });
              setPage(0);
            }}
          >
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {churnOptions.map((opt) => (
                <SelectItem key={opt.key} value={opt.key}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Commercial filter */}
          <Select
            value={commercialFilter}
            onValueChange={(v) => {
              setFilters({ commercialFilter: v });
              setPage(0);
            }}
          >
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue placeholder="Commercial" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les commerciaux</SelectItem>
              <SelectItem value="__none__">Non attribués</SelectItem>
              {salesUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="w-px h-6 bg-border" />

          {/* Orders filter */}
          <div className="flex gap-1">
            {orderFilters.map((f) => (
              <Button
                key={f.key}
                variant={hasOrders === f.key ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setFilters({ hasOrders: f.key });
                  setPage(0);
                }}
              >
                {f.label}
              </Button>
            ))}
          </div>

          {/* Supplier filter */}
          {allSuppliers.length > 0 && (
            <>
              <div className="w-px h-6 bg-border" />
              <Select
                value={supplierFilter}
                onValueChange={(v) => { setFilters({ supplierFilter: v }); setPage(0); }}
              >
                <SelectTrigger className="h-8 w-[170px] text-xs">
                  <div className="flex items-center gap-1.5">
                    <Truck className="w-3 h-3 text-muted-foreground" />
                    <SelectValue placeholder="Fournisseur" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous fournisseurs</SelectItem>
                  {allSuppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}

          {/* Competitor filter */}
          {allCompetitors.length > 0 && (
            <>
              <Select
                value={competitorFilter}
                onValueChange={(v) => { setFilters({ competitorFilter: v }); setPage(0); }}
              >
                <SelectTrigger className="h-8 w-[170px] text-xs">
                  <div className="flex items-center gap-1.5">
                    <Swords className="w-3 h-3 text-muted-foreground" />
                    <SelectValue placeholder="Concurrent" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous concurrents</SelectItem>
                  {allCompetitors.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}

          {/* Client type filter */}
          {allClientTypes.length > 0 && (
            <Select
              value={clientTypeFilter}
              onValueChange={(v) => { setFilters({ clientTypeFilter: v }); setPage(0); }}
            >
              <SelectTrigger className="h-8 w-[170px] text-xs">
                <div className="flex items-center gap-1.5">
                  <Building2 className="w-3 h-3 text-muted-foreground" />
                  <SelectValue placeholder="Type" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous types</SelectItem>
                {allClientTypes.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {(statusFilter !== "all" || churnFilter !== "all" || hasOrders !== "all" || commercialFilter !== "all" || supplierFilter !== "all" || competitorFilter !== "all" || clientTypeFilter !== "all") && (
            <>
              <div className="w-px h-6 bg-border" />
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground hover:text-destructive"
                onClick={() => { resetFilters(); setPage(0); }}
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Réinitialiser
              </Button>
            </>
          )}

          <div className="w-px h-6 bg-border" />

          {/* Sort selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Trier par :</span>
            <Select
              value={sortBy}
              onValueChange={(v) => {
                setFilters({ sortBy: v as SortKey, sortDir: v === "name" ? "asc" : "desc" });
                setPage(0);
              }}
            >
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className="flex items-center gap-1.5">
                      {opt.icon}
                      {opt.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setFilters({ sortDir: sortDir === "asc" ? "desc" : "asc" })}
            >
              {sortDir === "asc" ? (
                <ArrowUp className="w-4 h-4" />
              ) : (
                <ArrowDown className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">
              Chargement...
            </div>
          ) : clients.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground space-y-3">
              <p>Aucun client trouvé</p>
              {(statusFilter !== "all" || churnFilter !== "all" || hasOrders !== "all" || commercialFilter !== "all" || supplierFilter !== "all" || competitorFilter !== "all" || clientTypeFilter !== "all") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { resetFilters(); setPage(0); }}
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  Réinitialiser les filtres
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead
                      className="text-right cursor-pointer select-none"
                      onClick={() => toggleSort("ca_total")}
                    >
                      <span className="flex items-center justify-end">
                        CA total
                        <SortIcon col="ca_total" />
                      </span>
                    </TableHead>
                    <TableHead
                      className="hidden lg:table-cell text-right cursor-pointer select-none"
                      onClick={() => toggleSort("ca_12m")}
                    >
                      <span className="flex items-center justify-end">
                        CA 12m
                        <SortIcon col="ca_12m" />
                      </span>
                    </TableHead>
                    <TableHead
                      className="hidden md:table-cell text-center cursor-pointer select-none"
                      onClick={() => toggleSort("order_count")}
                    >
                      <span className="flex items-center justify-center">
                        Cmd
                        <SortIcon col="order_count" />
                      </span>
                    </TableHead>
                    <TableHead
                      className="hidden lg:table-cell text-right cursor-pointer select-none"
                      onClick={() => toggleSort("avg_basket")}
                    >
                      <span className="flex items-center justify-end">
                        Panier moy.
                        <SortIcon col="avg_basket" />
                      </span>
                    </TableHead>
                    <TableHead
                      className="hidden md:table-cell cursor-pointer select-none"
                      onClick={() => toggleSort("last_order")}
                    >
                      <span className="flex items-center">
                        Dern. commande
                        <SortIcon col="last_order" />
                      </span>
                    </TableHead>
                    <TableHead className="hidden lg:table-cell">Rythme</TableHead>
                    <TableHead className="hidden xl:table-cell">Statut</TableHead>
                    <TableHead
                      className="hidden xl:table-cell text-center cursor-pointer select-none"
                      onClick={() => toggleSort("churn")}
                    >
                      <span className="flex items-center justify-center">
                        Risque
                        <SortIcon col="churn" />
                      </span>
                    </TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody key={animKey}>
                  {clients.map((client, _i) => (
                    <TableRow key={client.id} className="stagger-row group" style={{ animationDelay: `${_i * 40}ms` }}>
                      {/* Client info */}
                      <TableCell>
                        <div>
                          <Link
                            href={`/clients/${client.id}`}
                            className="font-medium text-sm hover:underline"
                          >
                            {client.name}
                          </Link>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground font-mono">
                              {client.sage_id}
                            </span>
                            {client.city && (
                              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                <MapPin className="w-2.5 h-2.5" />
                                {client.city}
                              </span>
                            )}
                            {(client.assigned_user_name || client.sales_rep) && (
                              <span className={`text-xs ${client.assigned_user_name ? "text-muted-foreground" : "text-amber-500"}`}>
                                {client.assigned_user_name || client.sales_rep}
                              </span>
                            )}
                          </div>
                          {((client.client_type && client.client_type.length > 0) || (client.client_subtype && client.client_subtype.length > 0)) && (
                            <div className="flex flex-wrap items-center gap-1 mt-1">
                              {client.client_type?.map((t) => (
                                <Badge key={t} variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-50 text-blue-700 border-blue-200">
                                  {t}
                                </Badge>
                              ))}
                              {client.client_subtype?.map((t) => (
                                <Badge key={t} variant="outline" className="text-[10px] px-1.5 py-0 bg-violet-50 text-violet-700 border-violet-200">
                                  {t}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </TableCell>

                      {/* CA total */}
                      <TableCell className="text-right">
                        <span
                          className={`font-semibold text-sm ${
                            (client.total_revenue_all ?? 0) > 0
                              ? "text-foreground"
                              : "text-muted-foreground"
                          }`}
                        >
                          {formatCurrency(client.total_revenue_all)}
                        </span>
                      </TableCell>

                      {/* CA 12m */}
                      <TableCell className="hidden lg:table-cell text-right">
                        <span className="text-sm text-muted-foreground">
                          {formatCurrency(client.total_revenue_12m)}
                        </span>
                      </TableCell>

                      {/* Nb commandes */}
                      <TableCell className="hidden md:table-cell text-center">
                        <span className="text-sm">
                          {client.order_count_total || "—"}
                        </span>
                        {(client.order_count_12m ?? 0) > 0 && (
                          <span className="text-xs text-muted-foreground block">
                            ({client.order_count_12m} 12m)
                          </span>
                        )}
                      </TableCell>

                      {/* Panier moyen */}
                      <TableCell className="hidden lg:table-cell text-right">
                        <span className="text-sm text-muted-foreground">
                          {formatCurrency(client.avg_basket)}
                        </span>
                      </TableCell>

                      {/* Dernière commande */}
                      <TableCell className="hidden md:table-cell">
                        <div>
                          <span className="text-sm">
                            {formatDate(client.last_order_date)}
                          </span>
                          {client.last_order_date && (
                            <span className="text-xs text-muted-foreground block">
                              {daysAgo(client.last_order_date)}
                            </span>
                          )}
                          {client.avg_frequency_days != null && client.avg_frequency_days > 0 && (client.order_count_total ?? 0) >= 3 && (
                            <span className="text-[10px] text-muted-foreground/70 block">
                              ~tous les {Math.round(client.avg_frequency_days)}j
                            </span>
                          )}
                        </div>
                      </TableCell>

                      {/* Rythme / Retard */}
                      <TableCell className="hidden lg:table-cell">
                        <OrderDelayBadge client={client} />
                      </TableCell>

                      {/* Statut */}
                      <TableCell className="hidden xl:table-cell">
                        <StatusBadge status={client.status} size="sm" />
                      </TableCell>

                      {/* Churn */}
                      <TableCell className="hidden xl:table-cell text-center">
                        {churnBadge(client.churn_risk_score)}
                      </TableCell>

                      {/* Actions */}
                      <TableCell>
                        <div className="flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                          {client.phone_e164 && (
                            <ClickToCall phoneNumber={client.phone_e164} />
                          )}
                          <Link href={`/clients/${client.id}`}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">
              {pageSize === 0
                ? `${total} résultat${total > 1 ? "s" : ""}`
                : `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, total)} sur ${total}`}
            </p>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Afficher :</span>
              <div className="flex gap-1">
                {PAGE_SIZE_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    variant={pageSize === opt.value ? "default" : "outline"}
                    size="sm"
                    className="h-7 px-2.5 text-xs"
                    onClick={() => {
                      setFilters({ pageSize: opt.value });
                      setPage(0);
                    }}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              {(() => {
                const pages: (number | "ellipsis")[] = [];
                if (totalPages <= 7) {
                  for (let i = 0; i < totalPages; i++) pages.push(i);
                } else {
                  pages.push(0);
                  if (page > 2) pages.push("ellipsis");
                  const start = Math.max(1, page - 1);
                  const end = Math.min(totalPages - 2, page + 1);
                  for (let i = start; i <= end; i++) pages.push(i);
                  if (page < totalPages - 3) pages.push("ellipsis");
                  pages.push(totalPages - 1);
                }
                return pages.map((p, idx) =>
                  p === "ellipsis" ? (
                    <span key={`e${idx}`} className="px-1 text-sm text-muted-foreground">…</span>
                  ) : (
                    <Button
                      key={p}
                      variant={page === p ? "default" : "outline"}
                      size="sm"
                      className="h-8 w-8 p-0 text-xs"
                      onClick={() => setPage(p)}
                    >
                      {p + 1}
                    </Button>
                  )
                );
              })()}
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Add Prospect Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nouveau prospect</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>
                Nom de l&apos;entreprise <span className="text-red-600">*</span>
              </Label>
              <Input
                value={addForm.name || ""}
                onChange={(e) =>
                  setAddForm((p) => ({ ...p, name: e.target.value }))
                }
                placeholder="Ex: Restaurant Le Boucher"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Nom du contact</Label>
                <Input
                  value={addForm.contact_name || ""}
                  onChange={(e) =>
                    setAddForm((p) => ({ ...p, contact_name: e.target.value }))
                  }
                  placeholder="Ex: Jean Dupont"
                />
              </div>
              <div className="space-y-2">
                <Label>Fonction</Label>
                <Input
                  value={addForm.contact_title || ""}
                  onChange={(e) =>
                    setAddForm((p) => ({ ...p, contact_title: e.target.value }))
                  }
                  placeholder="Ex: Chef de cuisine, Acheteur…"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type d&apos;entreprise</Label>
                <TypePicker
                  values={addForm.client_type || []}
                  options={allClientTypes}
                  onChange={(v) => setAddForm((p) => ({ ...p, client_type: v }))}
                  placeholder="Rechercher ou créer un type…"
                />
              </div>
              <div className="space-y-2">
                <Label>Précision</Label>
                <TypePicker
                  values={addForm.client_subtype || []}
                  options={allClientSubtypes}
                  onChange={(v) => setAddForm((p) => ({ ...p, client_subtype: v }))}
                  placeholder="Rechercher ou créer…"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Téléphone</Label>
                <Input
                  value={addForm.phone || ""}
                  onChange={(e) =>
                    setAddForm((p) => ({ ...p, phone: e.target.value }))
                  }
                  placeholder="06 12 34 56 78"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={addForm.email || ""}
                  onChange={(e) =>
                    setAddForm((p) => ({ ...p, email: e.target.value }))
                  }
                  placeholder="contact@..."
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Adresse</Label>
              <Input
                value={addForm.address || ""}
                onChange={(e) =>
                  setAddForm((p) => ({ ...p, address: e.target.value }))
                }
                placeholder="Rue..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Code postal</Label>
                <Input
                  value={addForm.postal_code || ""}
                  onChange={(e) =>
                    setAddForm((p) => ({ ...p, postal_code: e.target.value }))
                  }
                  placeholder="75001"
                />
              </div>
              <div className="space-y-2">
                <Label>Ville</Label>
                <Input
                  value={addForm.city || ""}
                  onChange={(e) =>
                    setAddForm((p) => ({ ...p, city: e.target.value }))
                  }
                  placeholder="Paris"
                />
              </div>
            </div>
            <Button
              className="w-full"
              onClick={handleAddProspect}
              disabled={adding}
            >
              {adding ? "Création..." : "Créer le prospect"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
