"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { usePersistedFilters } from "@/hooks/use-persisted-filters";
import {
  api,
  ProductListItem,
  ProductDetailResponse,
  ProductOrderHistoryResponse,
  OrderDetailResponse,
  StockDepotItem,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Search,
  Package,
  ChevronRight,
  ChevronLeft,
  ArrowUp,
  ArrowDown,
  Users,
  ShoppingCart,
  TrendingUp,
  X,
  Link2,
  Filter,
  SlidersHorizontal,
  BarChart3,
  Tag,
  Warehouse,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  Truck,
  Receipt,
  History,
  Hash,
  CalendarDays,
  Weight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import Link from "next/link";

const PAGE_SIZE_OPTIONS = [
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: 500, label: "500" },
  { value: 0, label: "Tous" },
] as const;

type SortKey =
  | "ca"
  | "qty"
  | "clients"
  | "orders"
  | "last_sale"
  | "name"
  | "margin"
  | "stock";

type StockFilter = "" | "in_stock" | "low" | "out" | "no_data";

const STOCK_FILTER_OPTIONS: { value: StockFilter; label: string }[] = [
  { value: "", label: "Tous" },
  { value: "in_stock", label: "En stock" },
  { value: "out", label: "Rupture / 0" },
  { value: "no_data", label: "Sans stock" },
];

const SORT_OPTIONS: { value: SortKey; label: string; shortLabel: string }[] = [
  { value: "ca", label: "CA total", shortLabel: "CA" },
  { value: "qty", label: "Quantité vendue", shortLabel: "Qté" },
  { value: "stock", label: "Stock dispo", shortLabel: "Stock" },
  { value: "clients", label: "Nb clients", shortLabel: "Clients" },
  { value: "orders", label: "Nb commandes", shortLabel: "Cmd" },
  { value: "last_sale", label: "Dernière vente", shortLabel: "Dern." },
  { value: "name", label: "Désignation", shortLabel: "Nom" },
  { value: "margin", label: "Marge %", shortLabel: "Marge" },
];

function formatCurrency(v: number | null | undefined): string {
  if (v == null || v === 0) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v);
}

function formatQty(v: number | null | undefined): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(v);
}

function formatWeight(kg: number | null | undefined): string {
  if (kg == null || kg === 0) return "—";
  const abs = Math.abs(kg);
  if (abs >= 1000) {
    return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(kg / 1000) + " t";
  }
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(kg) + " kg";
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

export default function ProductsPage() {
  return (
    <Suspense>
      <ProductsPageInner />
    </Suspense>
  );
}

function ProductsPageInner() {
  const searchParams = useSearchParams();
  const [savedFilters, setFilters] = usePersistedFilters("products", {
    sortBy: "ca" as SortKey,
    sortDir: "desc" as "asc" | "desc",
    hasSales: "all",
    family: "all",
    stockFilter: "" as StockFilter,
    depotFilter: "all",
    pageSize: 50,
  });
  const { sortBy, sortDir, hasSales, family, stockFilter, depotFilter, pageSize } = savedFilters;

  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [animKey, setAnimKey] = useState(0);
  const [families, setFamilies] = useState<{ family: string; label: string; count: number }[]>(
    []
  );
  const [depots, setDepots] = useState<{ depot_id: number; depot_name: string; nb_articles: number }[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const [detail, setDetail] = useState<ProductDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const [order, setOrder] = useState<OrderDetailResponse | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getProductFamilies().then(setFamilies).catch(() => {});
    api.getProductDepots().then(setDepots).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const effectivePageSize = pageSize === 0 ? 5000 : pageSize;

  const fetchProducts = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = {
      limit: String(effectivePageSize),
      offset: String(page * effectivePageSize),
      sort_by: sortBy,
      sort_dir: sortDir,
    };
    if (debouncedSearch) params.search = debouncedSearch;
    if (hasSales === "yes") params.has_sales = "true";
    if (hasSales === "no") params.has_sales = "false";
    if (family !== "all") params.family = family;
    if (stockFilter) params.stock_filter = stockFilter;
    if (depotFilter !== "all") params.depot_id = depotFilter;

    api
      .getProducts(params)
      .then((res) => {
        setProducts(res.products);
        setTotal(res.total);
        setAnimKey((k) => k + 1);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [debouncedSearch, sortBy, sortDir, hasSales, family, stockFilter, depotFilter, page, effectivePageSize]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    const refParam = searchParams.get("ref");
    if (refParam) {
      openDetail(refParam);
    }
  }, [searchParams]);

  const openDetail = (ref: string) => {
    setLoadingDetail(true);
    setMobileDetailOpen(true);
    api
      .getProduct(ref)
      .then(setDetail)
      .catch(() => {})
      .finally(() => setLoadingDetail(false));
  };

  const closeDetail = () => {
    setDetail(null);
    setMobileDetailOpen(false);
  };

  const openOrder = (pieceId: string) => {
    api
      .getOrderDetail(pieceId)
      .then(setOrder)
      .catch(() => {});
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
    if (sortBy !== col) return null;
    return sortDir === "asc" ? (
      <ArrowUp className="w-3 h-3 inline ml-0.5" />
    ) : (
      <ArrowDown className="w-3 h-3 inline ml-0.5" />
    );
  };

  const totalPages = pageSize === 0 ? 1 : Math.ceil(total / pageSize);
  const activeFilterCount =
    (hasSales !== "all" ? 1 : 0) + (family !== "all" ? 1 : 0) + (stockFilter ? 1 : 0) + (depotFilter !== "all" ? 1 : 0);

  const hasDetail = !!(detail || loadingDetail);

  return (
    <div className="relative">
      {/* ─── Main list ─── */}
      <div className={hasDetail ? "lg:pr-[420px] xl:pr-[460px]" : ""}>
        {/* Header */}
        <div className="mb-4">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
            <Package className="w-5 h-5 sm:w-6 sm:h-6" />
            Catalogue Produits
          </h2>
          <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
            {total} produit{total > 1 ? "s" : ""}
            {debouncedSearch && ` · "${debouncedSearch}"`}
            {family !== "all" && ` · ${families.find(f => f.family === family)?.label || family}`}
          </p>
        </div>

        {/* Search + filter toggle */}
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom, référence, famille..."
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
              <Badge
                variant="secondary"
                className="h-5 w-5 p-0 flex items-center justify-center text-xs rounded-full"
              >
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </div>

        {/* Filter bar (collapsible) */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-2 mb-3 p-3 rounded-lg border bg-card animate-in slide-in-from-top-2 duration-200">
            {/* Ventes */}
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Ventes :</span>
              <div className="flex gap-1">
                {[
                  { key: "all", label: "Tous" },
                  { key: "yes", label: "Avec ventes" },
                  { key: "no", label: "Sans ventes" },
                ].map((f) => (
                  <Button
                    key={f.key}
                    variant={hasSales === f.key ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs px-2.5"
                    onClick={() => {
                      setFilters({ hasSales: f.key });
                      setPage(0);
                    }}
                  >
                    {f.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="hidden sm:block w-px h-6 bg-border" />

            {/* Family */}
            <div className="flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Famille :</span>
              <Select
                value={family}
                onValueChange={(v) => {
                  setFilters({ family: v });
                  setPage(0);
                }}
              >
                <SelectTrigger className="h-7 w-[180px] text-xs">
                  <SelectValue placeholder="Toutes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les familles</SelectItem>
                  {families.map((f) => (
                    <SelectItem key={f.family} value={f.family}>
                      {f.label} ({f.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Depot filter */}
            <div className="hidden sm:block w-px h-6 bg-border" />
            <div className="flex items-center gap-1.5">
              <Warehouse className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Entrepôt :</span>
              <Select
                value={depotFilter}
                onValueChange={(v) => {
                  setFilters({ depotFilter: v });
                  setPage(0);
                }}
              >
                <SelectTrigger className="h-7 w-[180px] text-xs">
                  <SelectValue placeholder="Tous" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les entrepôts</SelectItem>
                  {depots.map((d) => (
                    <SelectItem key={d.depot_id} value={String(d.depot_id)}>
                      {d.depot_name} ({d.nb_articles})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Stock filter */}
            <div className="hidden sm:block w-px h-6 bg-border" />
            <div className="flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Stock :</span>
              <div className="flex gap-1">
                {STOCK_FILTER_OPTIONS.map((f) => (
                  <Button
                    key={f.value}
                    variant={stockFilter === f.value ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs px-2.5"
                    onClick={() => {
                      setFilters({ stockFilter: f.value });
                      setPage(0);
                    }}
                  >
                    {f.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Reset */}
            {activeFilterCount > 0 && (
              <>
                <div className="hidden sm:block w-px h-6 bg-border" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={() => {
                    setFilters({ hasSales: "all", family: "all", stockFilter: "" as StockFilter, depotFilter: "all" });
                    setPage(0);
                  }}
                >
                  <X className="w-3 h-3 mr-1" />
                  Réinitialiser
                </Button>
              </>
            )}
          </div>
        )}

        {/* ─── Desktop table ─── */}
        <Card className="hidden md:block">
          <CardContent className="p-0">
            {loading ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Chargement...
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Aucun produit trouvé
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-background">
                      <TableHead
                        className="cursor-pointer hover:text-foreground select-none min-w-[200px]"
                        onClick={() => toggleSort("name")}
                      >
                        Produit <SortIcon col="name" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-foreground text-right select-none"
                        onClick={() => toggleSort("ca")}
                      >
                        CA total <SortIcon col="ca" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-foreground text-right select-none"
                        onClick={() => toggleSort("qty")}
                      >
                        Qté <SortIcon col="qty" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-foreground text-center select-none"
                        onClick={() => toggleSort("clients")}
                      >
                        Clients <SortIcon col="clients" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-foreground text-center select-none hidden lg:table-cell"
                        onClick={() => toggleSort("orders")}
                      >
                        Cmd <SortIcon col="orders" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-foreground text-right select-none hidden lg:table-cell"
                        onClick={() => toggleSort("margin")}
                      >
                        Marge <SortIcon col="margin" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-foreground text-center select-none hidden xl:table-cell"
                        onClick={() => toggleSort("stock")}
                      >
                        Stock <SortIcon col="stock" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-foreground select-none hidden xl:table-cell"
                        onClick={() => toggleSort("last_sale")}
                      >
                        Dern. vente <SortIcon col="last_sale" />
                      </TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody key={animKey}>
                    {products.map((p, _i) => (
                      <TableRow
                        key={p.id}
                        className={`stagger-row group cursor-pointer transition-colors ${
                          detail?.article_ref === p.article_ref
                            ? "bg-primary/5 border-l-2 border-l-primary"
                            : "hover:bg-muted/40"
                        }`}
                        style={{ animationDelay: `${_i * 40}ms` }}
                        onClick={() => openDetail(p.article_ref)}
                      >
                        <TableCell>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">
                              {p.designation || p.article_ref}
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-xs text-muted-foreground font-mono">
                                {p.article_ref}
                              </span>
                              {p.family && (
                                <Badge
                                  variant="outline"
                                  className="text-xs h-4 px-1 py-0 max-w-[120px] truncate"
                                  title={p.family_label || p.family}
                                >
                                  {p.family_label || p.family}
                                </Badge>
                              )}
                              {!p.is_active && (
                                <Badge
                                  variant="secondary"
                                  className="text-xs h-4 px-1 py-0 bg-red-50 text-red-600"
                                >
                                  Inactif
                                </Badge>
                              )}
                              {(p.pipeline_qty ?? 0) > 0 && (
                                <Badge
                                  variant="outline"
                                  className="text-xs h-4 px-1.5 py-0 text-amber-700 bg-amber-50 border-amber-200"
                                >
                                  Commandé
                                </Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={`font-semibold text-sm tabular-nums ${
                              (p.total_ca ?? 0) > 0
                                ? "text-foreground"
                                : "text-muted-foreground"
                            }`}
                          >
                            {formatCurrency(p.total_ca)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {formatQty(p.total_qty)}
                        </TableCell>
                        <TableCell className="text-center text-sm tabular-nums">
                          {p.nb_clients || "—"}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-center text-sm tabular-nums">
                          {p.nb_orders || "—"}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-right text-sm tabular-nums">
                          {p.avg_margin_percent != null ? (
                            <span
                              className={
                                p.avg_margin_percent >= 20
                                  ? "text-green-600"
                                  : p.avg_margin_percent >= 0
                                  ? "text-amber-600"
                                  : "text-red-600"
                              }
                            >
                              {p.avg_margin_percent.toFixed(1)}%
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="hidden xl:table-cell text-center text-sm">
                          <StockBadge product={p} />
                        </TableCell>
                        <TableCell className="hidden xl:table-cell text-sm text-muted-foreground">
                          {formatDateShort(p.last_sale_date)}
                        </TableCell>
                        <TableCell className="pr-3">
                          <ChevronRight className="w-4 h-4 opacity-30 group-hover:opacity-100 transition-opacity" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ─── Mobile cards ─── */}
        <div className="md:hidden space-y-2">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Chargement...
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Aucun produit trouvé
            </div>
          ) : (
            products.map((p) => (
              <Card
                key={p.id}
                className={`cursor-pointer transition-colors active:bg-muted/50 ${
                  detail?.article_ref === p.article_ref
                    ? "border-primary/50 bg-primary/5"
                    : ""
                }`}
                onClick={() => openDetail(p.article_ref)}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm leading-tight truncate">
                        {p.designation || p.article_ref}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-xs text-muted-foreground font-mono">
                          {p.article_ref}
                        </span>
                        {p.family && (
                          <Badge
                            variant="outline"
                            className="text-xs h-4 px-1 py-0 max-w-[120px] truncate"
                            title={p.family_label || p.family}
                          >
                            {p.family_label || p.family}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className={`font-bold text-sm tabular-nums ${
                          (p.total_ca ?? 0) > 0
                            ? "text-foreground"
                            : "text-muted-foreground"
                        }`}
                      >
                        {formatCurrency(p.total_ca)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span>
                      <Users className="w-3 h-3 inline mr-0.5" />
                      {p.nb_clients || 0}
                    </span>
                    <span>
                      <ShoppingCart className="w-3 h-3 inline mr-0.5" />
                      {p.nb_orders || 0} cmd
                    </span>
                    <span>Qté {formatQty(p.total_qty)}</span>
                    {p.avg_margin_percent != null && (
                      <span
                        className={
                          p.avg_margin_percent >= 20
                            ? "text-green-600"
                            : p.avg_margin_percent >= 0
                            ? "text-amber-600"
                            : "text-red-600"
                        }
                      >
                        {p.avg_margin_percent.toFixed(1)}%
                      </span>
                    )}
                    {(p.pipeline_qty ?? 0) > 0 && (
                      <Badge
                        variant="outline"
                        className="text-xs h-4 px-1.5 py-0 text-amber-700 bg-amber-50 border-amber-200"
                      >
                        Commandé
                      </Badge>
                    )}
                    <span className="ml-auto"><StockBadge product={p} /></span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Pagination */}
        {total > 0 && (
          <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <p className="text-xs sm:text-sm text-muted-foreground">
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
      </div>

      {/* ─── Desktop detail panel (fixed right) ─── */}
      {hasDetail && (
        <div
          ref={panelRef}
          className="hidden lg:flex flex-col fixed top-0 right-0 bottom-0 w-[400px] xl:w-[440px] border-l bg-background z-30"
        >
          <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
            <DetailPanel
              detail={detail}
              loading={loadingDetail}
              onClose={closeDetail}
              onOpenProduct={openDetail}
              onOpenOrder={openOrder}
            />
          </div>
        </div>
      )}

      {/* ─── Mobile detail sheet ─── */}
      {mobileDetailOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-background">
          <div className="flex items-center justify-between p-3 border-b bg-card">
            <h3 className="font-semibold text-sm truncate">
              {detail?.designation || detail?.article_ref || "Chargement..."}
            </h3>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={closeDetail}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <DetailPanel
              detail={detail}
              loading={loadingDetail}
              onClose={closeDetail}
              onOpenProduct={(ref) => {
                openDetail(ref);
              }}
              onOpenOrder={openOrder}
            />
          </div>
        </div>
      )}

      {/* ─── Order detail modal ─── */}
      <Dialog open={!!order} onOpenChange={() => setOrder(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="w-4 h-4" />
              Commande {order?.sage_piece_id}
            </DialogTitle>
          </DialogHeader>
          {order && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                <span>{formatDate(order.date)}</span>
                {order.client_name && (
                  <>
                    <span>·</span>
                    {order.client_id ? (
                      <Link
                        href={`/clients/${order.client_id}`}
                        className="hover:underline font-medium text-foreground"
                      >
                        {order.client_name}
                      </Link>
                    ) : (
                      <span>{order.client_name}</span>
                    )}
                  </>
                )}
                <span>·</span>
                <span className="font-semibold text-foreground">
                  {formatCurrency(order.total_ht)}
                </span>
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produit</TableHead>
                      <TableHead className="text-right">Qté</TableHead>
                      <TableHead className="text-right">PU</TableHead>
                      <TableHead className="text-right">HT</TableHead>
                      <TableHead className="text-right">Marge</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.lines.map((l, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <div>
                            <p className="text-sm">
                              {l.designation || l.article_ref || "—"}
                            </p>
                            {l.article_ref && (
                              <p className="text-xs text-muted-foreground font-mono">
                                {l.article_ref}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {l.quantity != null ? formatQty(l.quantity) : "—"}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {l.unit_price != null
                            ? formatCurrency(l.unit_price)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium tabular-nums">
                          {formatCurrency(l.amount_ht)}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          <MarginBadge value={l.margin_percent} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile order lines */}
              <div className="sm:hidden space-y-2">
                {order.lines.map((l, i) => (
                  <div key={i} className="p-2.5 rounded-lg bg-muted border">
                    <p className="text-sm font-medium leading-tight">
                      {l.designation || l.article_ref || "—"}
                    </p>
                    {l.article_ref && (
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">
                        {l.article_ref}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-1.5 text-xs text-muted-foreground">
                      <span>
                        Qté {l.quantity != null ? formatQty(l.quantity) : "—"} ×{" "}
                        {l.unit_price != null
                          ? formatCurrency(l.unit_price)
                          : "—"}
                      </span>
                      <span className="font-semibold text-foreground">
                        {formatCurrency(l.amount_ht)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
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

type DetailTab = "overview" | "orders" | "kg";

function DetailPanel({
  detail,
  loading,
  onClose,
  onOpenProduct,
  onOpenOrder,
}: {
  detail: ProductDetailResponse | null;
  loading: boolean;
  onClose: () => void;
  onOpenProduct: (ref: string) => void;
  onOpenOrder: (pieceId: string) => void;
}) {
  const [tab, setTab] = useState<DetailTab>("overview");
  const [orderHistory, setOrderHistory] = useState<ProductOrderHistoryResponse | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const prevRef = useRef<string | null>(null);

  useEffect(() => {
    if (detail && detail.article_ref !== prevRef.current) {
      prevRef.current = detail.article_ref;
      setTab("overview");
      setOrderHistory(null);
    }
  }, [detail]);

  useEffect(() => {
    if (tab === "orders" && detail && !orderHistory && !loadingOrders) {
      setLoadingOrders(true);
      api
        .getProductOrders(detail.article_ref)
        .then(setOrderHistory)
        .catch(() => {})
        .finally(() => setLoadingOrders(false));
    }
  }, [tab, detail, orderHistory, loadingOrders]);

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

  return (
    <>
      {/* Header */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base leading-tight">
              {detail.designation || detail.article_ref}
            </CardTitle>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              {detail.article_ref}
            </p>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {detail.family && (
                <Badge variant="outline" className="text-xs" title={detail.family}>
                  {detail.family_label || detail.family}
                </Badge>
              )}
              {detail.sub_family && (
                <Badge variant="outline" className="text-xs">
                  {detail.sub_family}
                </Badge>
              )}
              {detail.is_active === false && (
                <Badge
                  variant="secondary"
                  className="text-xs bg-red-50 text-red-600"
                >
                  Inactif
                </Badge>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 hidden lg:flex"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </CardHeader>
        <CardContent className="pt-1 pb-2">
          {/* Tab buttons */}
          <div className="flex items-center gap-1.5 mt-1">
            <Button
              variant={tab === "overview" ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs px-2.5 gap-1"
              onClick={() => setTab("overview")}
            >
              <BarChart3 className="w-3 h-3" />
              Aperçu
            </Button>
            <Button
              variant={tab === "kg" ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs px-2.5 gap-1"
              onClick={() => setTab("kg")}
            >
              <Weight className="w-3 h-3" />
              Kg
            </Button>
            <Button
              variant={tab === "orders" ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs px-2.5 gap-1"
              onClick={() => setTab("orders")}
            >
              <History className="w-3 h-3" />
              Commandes
              {detail.nb_orders != null && detail.nb_orders > 0 && (
                <Badge variant="secondary" className="h-4 px-1 py-0 text-[10px] rounded-full ml-0.5">
                  {detail.nb_orders}
                </Badge>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {tab === "overview" && (
        <OverviewTab detail={detail} onOpenProduct={onOpenProduct} />
      )}

      {tab === "kg" && (
        <KgTab detail={detail} onOpenProduct={onOpenProduct} />
      )}

      {tab === "orders" && (
        <OrdersTab
          history={orderHistory}
          loading={loadingOrders}
          articleRef={detail?.article_ref}
        />
      )}
    </>
  );
}

function OverviewTab({
  detail,
  onOpenProduct,
}: {
  detail: ProductDetailResponse;
  onOpenProduct: (ref: string) => void;
}) {
  return (
    <>
      {/* KPI grid */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="grid grid-cols-2 gap-2">
            <KpiTile
              value={formatCurrency(detail.total_ca)}
              label="CA total"
              icon={<BarChart3 className="w-3.5 h-3.5" />}
            />
            <KpiTile
              value={formatQty(detail.total_qty)}
              label="Qté vendue"
              icon={<Package className="w-3.5 h-3.5" />}
            />
            <KpiTile
              value={String(detail.nb_clients ?? 0)}
              label="Clients"
              icon={<Users className="w-3.5 h-3.5" />}
            />
            <KpiTile
              value={String(detail.nb_orders ?? 0)}
              label="Commandes"
              icon={<ShoppingCart className="w-3.5 h-3.5" />}
            />
          </div>
          <div className="flex items-center justify-between mt-2.5 text-xs text-muted-foreground px-1">
            {detail.avg_margin_percent != null && (
              <span>
                Marge moy. :{" "}
                <MarginBadge value={detail.avg_margin_percent} />
              </span>
            )}
            {detail.sale_price != null && detail.sale_price > 0 && (
              <span>PV : {formatCurrency(detail.sale_price)}</span>
            )}
            {detail.unit && <span>Unité : {detail.unit}</span>}
          </div>
        </CardContent>
      </Card>

      {/* Stock */}
      {detail.stock_available != null && (
        <StockSection product={detail} depots={detail.stock_depots ?? []} />
      )}

      {/* Top clients */}
      {detail.top_clients.length > 0 && (
        <ExpandableClientList
          title="Top clients"
          clients={detail.top_clients}
          renderValue={(c) => formatCurrency(c.ca)}
          renderSub={(c) => `${c.orders} cmd · qté ${formatQty(c.qty)}`}
        />
      )}

      {/* Co-purchased */}
      {detail.co_purchased.length > 0 && (
        <Card>
          <CardHeader className="pb-1.5 pt-3">
            <CardTitle className="text-base flex items-center gap-1.5">
              <Link2 className="w-4 h-4 text-ume" />
              Souvent acheté avec
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="divide-y divide-border">
              {detail.co_purchased.slice(0, 8).map((cp, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-xs py-1.5 cursor-pointer hover:bg-accent rounded px-1.5 -mx-1.5 transition-colors"
                  onClick={() => onOpenProduct(cp.article_ref)}
                >
                  <span className="truncate max-w-[240px]">
                    {cp.designation || cp.article_ref}
                  </span>
                  <Badge
                    variant="outline"
                    className="text-xs shrink-0 ml-2"
                  >
                    {cp.co_orders} cmd
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Monthly sales chart */}
      {detail.monthly_sales.length > 0 && (
        <Card>
          <CardHeader className="pb-1.5 pt-3">
            <CardTitle className="text-base flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-green-600" />
              Ventes mensuelles
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1">
              {detail.monthly_sales.slice(-12).map((m, i) => {
                const maxCa = Math.max(
                  ...detail.monthly_sales.slice(-12).map((x) => x.ca)
                );
                const pct = maxCa > 0 ? (m.ca / maxCa) * 100 : 0;
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-xs group/bar"
                  >
                    <span className="w-14 text-xs text-muted-foreground shrink-0 tabular-nums">
                      {m.month}
                    </span>
                    <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
                      <div
                        className="h-full bg-primary/70 rounded-full transition-all duration-300"
                        style={{ width: `${Math.max(pct, 1)}%` }}
                      />
                    </div>
                    <span className="w-14 text-right shrink-0 font-medium tabular-nums text-xs">
                      {formatCurrency(m.ca)}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function KgTab({
  detail,
  onOpenProduct,
}: {
  detail: ProductDetailResponse;
  onOpenProduct: (ref: string) => void;
}) {
  const sortedClients = [...detail.top_clients].sort((a, b) => b.qty - a.qty);

  return (
    <>
      {/* KPI grid - vue poids */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="grid grid-cols-2 gap-2">
            <KpiTile
              value={formatWeight(detail.total_qty)}
              label="Poids total vendu"
              icon={<Weight className="w-3.5 h-3.5" />}
            />
            <KpiTile
              value={detail.total_qty != null && detail.nb_orders
                ? formatWeight(detail.total_qty / detail.nb_orders)
                : "—"}
              label="Moy. / commande"
              icon={<Package className="w-3.5 h-3.5" />}
            />
            <KpiTile
              value={String(detail.nb_clients ?? 0)}
              label="Clients"
              icon={<Users className="w-3.5 h-3.5" />}
            />
            <KpiTile
              value={detail.total_qty != null && detail.nb_clients
                ? formatWeight(detail.total_qty / detail.nb_clients)
                : "—"}
              label="Moy. / client"
              icon={<Users className="w-3.5 h-3.5" />}
            />
          </div>
          <div className="flex items-center justify-between mt-2.5 text-xs text-muted-foreground px-1">
            {detail.unit && <span>Unité : {detail.unit}</span>}
            {detail.sale_price != null && detail.sale_price > 0 && (
              <span>PV : {formatCurrency(detail.sale_price)}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Top clients par poids */}
      {sortedClients.length > 0 && (
        <ExpandableClientList
          title="Top clients (poids)"
          clients={sortedClients}
          renderValue={(c) => formatWeight(c.qty)}
          renderSub={(c) => `${c.orders} cmd · CA ${formatCurrency(c.ca)}`}
        />
      )}

      {/* Co-purchased */}
      {detail.co_purchased.length > 0 && (
        <Card>
          <CardHeader className="pb-1.5 pt-3">
            <CardTitle className="text-base flex items-center gap-1.5">
              <Link2 className="w-4 h-4 text-ume" />
              Souvent acheté avec
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="divide-y divide-border">
              {detail.co_purchased.slice(0, 8).map((cp, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-xs py-1.5 cursor-pointer hover:bg-accent rounded px-1.5 -mx-1.5 transition-colors"
                  onClick={() => onOpenProduct(cp.article_ref)}
                >
                  <span className="truncate max-w-[240px]">
                    {cp.designation || cp.article_ref}
                  </span>
                  <Badge
                    variant="outline"
                    className="text-xs shrink-0 ml-2"
                  >
                    {cp.co_orders} cmd
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Poids mensuel */}
      {detail.monthly_sales.length > 0 && (
        <Card>
          <CardHeader className="pb-1.5 pt-3">
            <CardTitle className="text-base flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-green-600" />
              Poids mensuel
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1">
              {detail.monthly_sales.slice(-12).map((m, i) => {
                const maxQty = Math.max(
                  ...detail.monthly_sales.slice(-12).map((x) => x.qty)
                );
                const pct = maxQty > 0 ? (m.qty / maxQty) * 100 : 0;
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-xs group/bar"
                  >
                    <span className="w-14 text-xs text-muted-foreground shrink-0 tabular-nums">
                      {m.month}
                    </span>
                    <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500/70 rounded-full transition-all duration-300"
                        style={{ width: `${Math.max(pct, 1)}%` }}
                      />
                    </div>
                    <span className="w-16 text-right shrink-0 font-medium tabular-nums text-xs">
                      {formatWeight(m.qty)}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

const DOC_TYPE_CONFIG: Record<string, { icon: typeof FileText; color: string; bg: string; label: string }> = {
  BC: { icon: FileText, color: "text-amber-700", bg: "bg-amber-50 border-amber-200", label: "Bon de commande" },
  BL: { icon: Truck, color: "text-blue-700", bg: "bg-blue-50 border-blue-200", label: "Bon de livraison" },
  FA: { icon: Receipt, color: "text-green-700", bg: "bg-green-50 border-green-200", label: "Facture" },
  AV: { icon: Receipt, color: "text-red-700", bg: "bg-red-50 border-red-200", label: "Avoir" },
};

function OrdersTab({
  history,
  loading,
  articleRef,
}: {
  history: ProductOrderHistoryResponse | null;
  loading: boolean;
  onOpenOrder?: (pieceId: string) => void;
  articleRef?: string;
}) {
  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          Chargement des commandes...
        </CardContent>
      </Card>
    );
  }

  if (!history || history.orders.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          Aucune commande trouvée pour ce produit
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Order list */}
      <Card>
        <CardHeader className="pb-1.5 pt-3">
          <CardTitle className="text-base flex items-center gap-1.5">
            <CalendarDays className="w-4 h-4 text-primary" />
            Historique ({history.total} pièce{history.total > 1 ? "s" : ""})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 px-0">
          <div className="divide-y divide-border">
            {history.orders.map((o, i) => {
              const cfg = DOC_TYPE_CONFIG[o.doc_type] || DOC_TYPE_CONFIG.FA;
              const Icon = cfg.icon;
              return (
                <Link
                  key={`${o.piece_id}-${i}`}
                  href={`/orders?piece_id=${encodeURIComponent(o.piece_id)}`}
                  className="flex items-center gap-2.5 px-4 py-2 hover:bg-accent/40 cursor-pointer transition-colors"
                >
                  <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${cfg.bg}`}>
                    <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {o.client_id ? (
                        <button
                          type="button"
                          className="text-xs font-medium truncate hover:underline hover:text-primary transition-colors text-left"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.location.href = `/clients/${o.client_id}`; }}
                        >
                          {o.client_name}
                        </button>
                      ) : (
                        <span className="text-xs font-medium truncate">
                          {o.client_name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge
                        variant="outline"
                        className={`text-[10px] h-4 px-1 py-0 ${cfg.color} ${cfg.bg}`}
                      >
                        {o.doc_type}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {o.piece_id}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {formatDateShort(o.date)}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <p className="text-xs font-bold tabular-nums">
                      {formatCurrency(o.total_ht)}
                    </p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      {formatQty(o.qty)} {o.unit_price ? `× ${formatCurrency(o.unit_price)}` : ""}
                    </p>
                  </div>
                  {o.margin_pct != null && (
                    <div className="shrink-0 w-10 text-right text-[11px]">
                      <MarginBadge value={o.margin_pct} />
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
          {history.orders.length < history.total && (
            <div className="px-4 py-2 text-center">
              <Link
                href={articleRef ? `/orders?search=${encodeURIComponent(articleRef)}` : "/orders"}
                className="text-xs text-primary hover:underline"
              >
                Voir les {history.total} commandes →
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

const PRODUCT_TOP_PAGE_SIZE = 5;

function ExpandableClientList({
  title,
  clients,
  renderValue,
  renderSub,
}: {
  title: string;
  clients: { client_id?: string; client_name: string; ca: number; qty: number; orders: number }[];
  renderValue: (c: { ca: number; qty: number; orders: number }) => string;
  renderSub: (c: { ca: number; qty: number; orders: number }) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? clients : clients.slice(0, PRODUCT_TOP_PAGE_SIZE);
  const hasMore = clients.length > PRODUCT_TOP_PAGE_SIZE;

  return (
    <Card>
      <CardHeader className="pb-1.5 pt-3">
        <CardTitle className="text-base flex items-center gap-1.5">
          <Users className="w-4 h-4 text-sora" />
          {title}
          {clients.length > 0 && (
            <span className="text-[10px] font-normal text-muted-foreground ml-auto">{clients.length}</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className={expanded ? "max-h-[360px] overflow-y-auto scrollbar-thin" : ""}>
          <div className="divide-y divide-border">
            {visible.map((c, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 text-xs">
                <div className="min-w-0 flex-1">
                  {c.client_id ? (
                    <Link
                      href={`/clients/${c.client_id}`}
                      className="hover:underline font-medium truncate block max-w-[220px]"
                    >
                      {c.client_name}
                    </Link>
                  ) : (
                    <span className="truncate block max-w-[220px]">{c.client_name}</span>
                  )}
                  <span className="text-xs text-muted-foreground">{renderSub(c)}</span>
                </div>
                <span className="font-semibold shrink-0 ml-2 tabular-nums">{renderValue(c)}</span>
              </div>
            ))}
          </div>
        </div>
        {hasMore && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-7 text-xs text-muted-foreground hover:text-foreground mt-1"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <>
                <ChevronUp className="w-3 h-3 mr-1" />
                Voir moins
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3 mr-1" />
                Voir les {clients.length} ({clients.length - PRODUCT_TOP_PAGE_SIZE} de plus)
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}


function KpiTile({
  value,
  label,
  icon,
}: {
  value: string;
  label: string;
  icon: React.ReactNode;
}) {
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

function getStockLevel(p: ProductListItem): "ok" | "low" | "out" | "unknown" {
  if (p.stock_available == null) return "unknown";
  if (p.stock_available <= 0) return "out";
  if (p.stock_min != null && p.stock_available <= p.stock_min) return "low";
  return "ok";
}

function StockBadge({ product }: { product: ProductListItem }) {
  const level = getStockLevel(product);
  if (level === "unknown") return <span className="text-muted-foreground text-xs">—</span>;

  const config = {
    ok: { icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50", label: "En stock" },
    low: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50", label: "Stock bas" },
    out: { icon: XCircle, color: "text-red-600", bg: "bg-red-50", label: "Rupture" },
  }[level];

  const Icon = config.icon;

  return (
    <Badge variant="outline" className={`text-xs h-5 gap-0.5 px-1.5 py-0 ${config.color} ${config.bg} border-transparent`}>
      <Icon className="w-3 h-3" />
      {product.stock_available != null ? formatQty(product.stock_available) : config.label}
    </Badge>
  );
}

function StockSection({
  product,
  depots,
}: {
  product: ProductListItem;
  depots: StockDepotItem[];
}) {
  const [showDepots, setShowDepots] = useState(false);
  const level = getStockLevel(product);
  const levelConfig = {
    ok: { color: "text-green-600", bg: "bg-green-50", label: "En stock" },
    low: { color: "text-amber-600", bg: "bg-amber-50", label: "Stock bas" },
    out: { color: "text-red-600", bg: "bg-red-50", label: "Rupture" },
    unknown: { color: "text-muted-foreground", bg: "bg-muted", label: "N/A" },
  }[level];

  const stockPct =
    product.stock_max && product.stock_max > 0
      ? Math.min(((product.stock_available ?? 0) / product.stock_max) * 100, 100)
      : null;

  const barColor =
    level === "ok" ? "bg-green-500" : level === "low" ? "bg-amber-500" : "bg-red-500";

  const activeDepots = depots.filter(
    (d) => (d.stock_quantity ?? 0) > 0 || (d.stock_available ?? 0) > 0
  );
  const allDepots = depots;

  return (
    <Card>
      <CardHeader className="pb-1.5 pt-3">
        <CardTitle className="text-base flex items-center gap-1.5">
          <Warehouse className="w-4 h-4 text-cyan-700" />
          Stock total
          <Badge
            variant="outline"
            className={`text-xs ml-auto ${levelConfig.color} ${levelConfig.bg} border-transparent`}
          >
            {levelConfig.label}
          </Badge>
          {depots.length > 0 && (
            <Badge variant="outline" className="text-xs border-transparent text-muted-foreground bg-muted">
              {depots.length} dépôt{depots.length > 1 ? "s" : ""}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-2.5">
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="p-2 rounded-md bg-accent/50">
            <p className="text-xs text-muted-foreground">Disponible</p>
            <p className={`font-bold text-sm tabular-nums ${levelConfig.color}`}>
              {formatQty(product.stock_available)}
            </p>
          </div>
          <div className="p-2 rounded-md bg-accent/50">
            <p className="text-xs text-muted-foreground">En stock</p>
            <p className="font-bold text-sm tabular-nums">
              {formatQty(product.stock_quantity)}
            </p>
          </div>
          <div className="p-2 rounded-md bg-accent/50">
            <p className="text-xs text-muted-foreground">Prévisionnel</p>
            <p className="font-bold text-sm tabular-nums">
              {formatQty(product.stock_forecast)}
            </p>
          </div>
        </div>

        {stockPct != null && (
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-0.5">
              <span>0</span>
              <span>Max : {formatQty(product.stock_max)}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${barColor}`}
                style={{ width: `${Math.max(stockPct, 1)}%` }}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {product.stock_reserved != null && product.stock_reserved > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Réservé</span>
              <span className="tabular-nums">{formatQty(product.stock_reserved)}</span>
            </div>
          )}
          {product.stock_preparing != null && product.stock_preparing > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">En prépa</span>
              <span className="tabular-nums">
                {formatQty(product.stock_preparing)}
              </span>
            </div>
          )}
          {product.stock_ordered != null && product.stock_ordered > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Commandé fourn.</span>
              <span className="tabular-nums">
                {formatQty(product.stock_ordered)}
              </span>
            </div>
          )}
          {product.stock_min != null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Seuil mini</span>
              <span className="tabular-nums">{formatQty(product.stock_min)}</span>
            </div>
          )}
          {product.stock_value != null && product.stock_value > 0 && (
            <div className="flex justify-between col-span-2 pt-1 border-t border-border/30 mt-1">
              <span className="text-muted-foreground">Valeur stock</span>
              <span className="font-medium tabular-nums">
                {formatCurrency(product.stock_value)}
              </span>
            </div>
          )}
        </div>

        {/* Détail par dépôt */}
        {allDepots.length > 0 && (
          <div className="pt-1">
            <button
              className="flex items-center gap-1.5 text-xs text-cyan-700 hover:text-cyan-600 transition-colors w-full"
              onClick={() => setShowDepots(!showDepots)}
            >
              <Warehouse className="w-3 h-3" />
              {showDepots ? "Masquer" : "Voir"} le détail par dépôt
              ({activeDepots.length} actif{activeDepots.length > 1 ? "s" : ""})
              <ChevronRight
                className={`w-3 h-3 ml-auto transition-transform ${showDepots ? "rotate-90" : ""}`}
              />
            </button>

            {showDepots && (
              <div className="mt-2 space-y-1.5">
                {allDepots.map((d) => {
                  const dAvail = d.stock_available ?? 0;
                  const dQty = d.stock_quantity ?? 0;
                  const dLevel =
                    dAvail > 0
                      ? d.stock_min && dAvail <= d.stock_min
                        ? "low"
                        : "ok"
                      : dQty > 0
                        ? "low"
                        : "out";
                  const dColor = {
                    ok: "text-green-600 border-green-200 bg-green-50",
                    low: "text-amber-600 border-amber-200 bg-amber-50",
                    out: "text-red-600 border-border bg-muted",
                  }[dLevel];
                  const isEmpty = dQty === 0 && dAvail <= 0;

                  return (
                    <div
                      key={d.depot_id}
                      className={`rounded-lg border p-2 ${dColor} ${isEmpty ? "opacity-50" : ""}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium truncate max-w-[60%]">
                          {d.depot_name || `Dépôt #${d.depot_id}`}
                        </span>
                        <span className={`text-xs font-bold tabular-nums`}>
                          {formatQty(dAvail)} dispo
                        </span>
                      </div>
                      {!isEmpty && (
                        <div className="grid grid-cols-3 gap-x-2 text-xs text-muted-foreground">
                          <span>Stock : {formatQty(dQty)}</span>
                          {(d.stock_reserved ?? 0) > 0 && (
                            <span>Rés : {formatQty(d.stock_reserved)}</span>
                          )}
                          {(d.stock_ordered ?? 0) > 0 && (
                            <span>Cmd : {formatQty(d.stock_ordered)}</span>
                          )}
                          {(d.stock_preparing ?? 0) > 0 && (
                            <span>Prépa : {formatQty(d.stock_preparing)}</span>
                          )}
                          {(d.stock_value ?? 0) > 0 && (
                            <span>Val : {formatCurrency(d.stock_value!)}</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {product.stock_synced_at && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Maj : {new Date(product.stock_synced_at).toLocaleString("fr-FR")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
