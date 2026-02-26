"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { api, Client, CreateProspectRequest } from "@/lib/api";
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
  ShoppingCart,
  Calendar,
  AlertTriangle,
  Target,
} from "lucide-react";
import Link from "next/link";
import { ClickToCall } from "@/components/click-to-call";
import { toast } from "sonner";

const PAGE_SIZE = 50;

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
  { value: "churn", label: "Risque churn", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  { value: "upsell", label: "Potentiel upsell", icon: <Target className="w-3.5 h-3.5" /> },
  { value: "priority", label: "Priorité globale", icon: <Target className="w-3.5 h-3.5" /> },
];

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
  const [clients, setClients] = useState<Client[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [churnFilter, setChurnFilter] = useState<string>("all");
  const [hasOrders, setHasOrders] = useState<string>("all");
  const [commercialFilter, setCommercialFilter] = useState<string>("all");
  const [salesUsers, setSalesUsers] = useState<{ id: string; name: string }[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>("ca_total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
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
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchClients = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = {
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
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

    api
      .getClients(params)
      .then((res) => {
        setClients(res.clients);
        setTotal(res.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [debouncedSearch, filter, statusFilter, churnFilter, hasOrders, commercialFilter, sortBy, sortDir, page]);

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
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir(key === "name" ? "asc" : "desc");
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

  const totalPages = Math.ceil(total / PAGE_SIZE);

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
    { key: "all", label: "Tout churn" },
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
            placeholder="Rechercher par nom, ville, email, téléphone, code sage..."
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
              setStatusFilter(v);
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
              setChurnFilter(v);
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
              setCommercialFilter(v);
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
                  setHasOrders(f.key);
                  setPage(0);
                }}
              >
                {f.label}
              </Button>
            ))}
          </div>

          <div className="w-px h-6 bg-border" />

          {/* Sort selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Trier par :</span>
            <Select
              value={sortBy}
              onValueChange={(v) => {
                setSortBy(v as SortKey);
                setSortDir(v === "name" ? "asc" : "desc");
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
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
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
            <div className="text-center py-12 text-muted-foreground">
              Aucun client trouvé
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
                    <TableHead className="hidden xl:table-cell">Statut</TableHead>
                    <TableHead
                      className="hidden xl:table-cell text-center cursor-pointer select-none"
                      onClick={() => toggleSort("churn")}
                    >
                      <span className="flex items-center justify-center">
                        Churn
                        <SortIcon col="churn" />
                      </span>
                    </TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => (
                    <TableRow key={client.id} className="group">
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
                        </div>
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
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} sur{" "}
            {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Précédent
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page + 1}/{totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              Suivant
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
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
