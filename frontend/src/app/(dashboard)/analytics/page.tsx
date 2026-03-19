"use client";

import { useEffect, useState, useCallback } from "react";
import {
  api,
  ReceivablesData,
  ProductsAnalyticsData,
  GeoAnalyticsData,
  FunnelAnalyticsData,
  AiInsightsData,
  AnalyticsSummaryData,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Loader2, TrendingUp, TrendingDown, AlertTriangle, DollarSign, Users,
  ShoppingCart, Package, MapPin, Brain, BarChart3, PieChart, Target,
  Lightbulb, Clock, AlertCircle, Star, Download, CalendarDays, Phone,
  PhoneOutgoing, PhoneIncoming, Smile, Frown, Meh, CheckCircle,
} from "lucide-react";
import Link from "next/link";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPie,
  Pie, Cell, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";

// ── Date utilities ──

type DatePreset = "month" | "7d" | "30d" | "90d" | "year" | "custom";

function toISO(d: Date): string { return d.toISOString().split("T")[0]; }
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

function presetLabel(p: DatePreset): string {
  switch (p) {
    case "month": return "Mois en cours";
    case "7d": return "7 jours";
    case "30d": return "30 jours";
    case "90d": return "90 jours";
    case "year": return "12 mois";
    case "custom": return "Personnalisé";
  }
}

function presetRange(p: DatePreset): { from: Date; to: Date } {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  switch (p) {
    case "month": return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: today };
    case "7d": return { from: addDays(today, -6), to: today };
    case "30d": return { from: addDays(today, -29), to: today };
    case "90d": return { from: addDays(today, -89), to: today };
    case "year": return { from: addDays(today, -364), to: today };
    default: return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: today };
  }
}

function formatDateRange(from: Date, to: Date): string {
  const f = from.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  const t = to.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  return toISO(from) === toISO(to) ? f : `${f} → ${t}`;
}

// ── Formatting ──

const TABS = [
  { key: "summary", label: "Vue d'ensemble", icon: BarChart3 },
  { key: "receivables", label: "Impayés", icon: AlertCircle },
  { key: "products", label: "Produits", icon: Package },
  { key: "geo", label: "Géographie", icon: MapPin },
  { key: "funnel", label: "Clients", icon: Users },
  { key: "ai", label: "Intelligence IA", icon: Brain },
] as const;
type TabKey = (typeof TABS)[number]["key"];
const PIE_COLORS = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#f43f5e", "#84cc16"];

function fmt(n: number | null | undefined, decimals = 0): string {
  if (n == null) return "—";
  return n.toLocaleString("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtCur(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function EvoBadge({ value }: { value: number | null | undefined }) {
  if (value == null) return null;
  const positive = value >= 0;
  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 gap-0.5 ${positive ? "text-green-700 bg-green-50 border-green-200" : "text-red-700 bg-red-50 border-red-200"}`}>
      {positive ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      {positive ? "+" : ""}{value}%
    </Badge>
  );
}
function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${m}min`;
}


// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════
export default function AnalyticsPage() {
  const [tab, setTab] = useState<TabKey>("summary");
  const [loading, setLoading] = useState(false);

  const [preset, setPreset] = useState<DatePreset>("30d");
  const [dateRange, setDateRange] = useState(presetRange("30d"));
  const [calendarOpen, setCalendarOpen] = useState(false);

  const [summary, setSummary] = useState<AnalyticsSummaryData | null>(null);
  const [receivables, setReceivables] = useState<ReceivablesData | null>(null);
  const [products, setProducts] = useState<ProductsAnalyticsData | null>(null);
  const [geo, setGeo] = useState<GeoAnalyticsData | null>(null);
  const [funnel, setFunnel] = useState<FunnelAnalyticsData | null>(null);
  const [aiInsights, setAiInsights] = useState<AiInsightsData | null>(null);

  const dateParams = { date_from: toISO(dateRange.from), date_to: toISO(dateRange.to) };

  const loadTab = useCallback(async (t: TabKey, dp: Record<string, string>) => {
    setLoading(true);
    try {
      switch (t) {
        case "summary": setSummary(await api.getAnalyticsSummary(dp)); break;
        case "receivables": setReceivables(await api.getReceivables(dp)); break;
        case "products": setProducts(await api.getProductsAnalytics(dp)); break;
        case "geo": setGeo(await api.getGeoAnalytics(dp)); break;
        case "funnel": setFunnel(await api.getFunnelAnalytics()); break;
        case "ai": setAiInsights(await api.getAiInsights(dp)); break;
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadTab(tab, dateParams); }, [tab, dateRange.from.getTime(), dateRange.to.getTime()]);

  const handlePreset = (p: DatePreset) => {
    if (p === "custom") { setPreset("custom"); setCalendarOpen(true); return; }
    setPreset(p); setDateRange(presetRange(p));
  };
  const handleCalendarSelect = (range: { from?: Date; to?: Date } | undefined) => {
    if (range?.from) {
      setDateRange({ from: range.from, to: range.to || range.from });
      setPreset("custom");
      if (range.to) setCalendarOpen(false);
    }
  };

  const presets: DatePreset[] = ["month", "7d", "30d", "90d", "year"];
  const periodLabel = preset !== "custom" ? presetLabel(preset) : formatDateRange(dateRange.from, dateRange.to);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">Pilotage stratégique · {periodLabel}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { const a = document.createElement("a"); a.href = api.getExportClientsUrl(); a.download = "clients.csv"; a.click(); }}>
            <Download className="w-3.5 h-3.5" /> Export Clients
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { const a = document.createElement("a"); a.href = api.getExportProductsUrl(); a.download = "produits.csv"; a.click(); }}>
            <Download className="w-3.5 h-3.5" /> Export Produits
          </Button>
        </div>
      </div>

      {/* Date filters */}
      <div className="flex flex-wrap items-center gap-1.5">
        {presets.map((p) => (
          <Button key={p} variant={preset === p ? "default" : "outline"} size="sm" className="h-7 text-xs px-2.5" onClick={() => handlePreset(p)}>
            {presetLabel(p)}
          </Button>
        ))}
        <div className="w-px h-5 bg-border" />
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button variant={preset === "custom" ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => { setPreset("custom"); setCalendarOpen(true); }}>
              <CalendarDays className="w-3 h-3 mr-1" />
              {preset === "custom" ? formatDateRange(dateRange.from, dateRange.to) : "Période"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="range" selected={{ from: dateRange.from, to: dateRange.to }} onSelect={handleCalendarSelect} numberOfMonths={2} disabled={{ after: new Date() }} />
          </PopoverContent>
        </Popover>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
        {TABS.map((t) => (
          <Button key={t.key} variant={tab === t.key ? "default" : "outline"} size="sm" className="shrink-0 gap-1.5" onClick={() => setTab(t.key)}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </Button>
        ))}
      </div>

      {loading && <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}

      {!loading && tab === "summary" && summary && <SummaryView data={summary} />}
      {!loading && tab === "receivables" && receivables && <ReceivablesView data={receivables} />}
      {!loading && tab === "products" && products && <ProductsView data={products} />}
      {!loading && tab === "geo" && geo && <GeoView data={geo} />}
      {!loading && tab === "funnel" && funnel && <FunnelView data={funnel} />}
      {!loading && tab === "ai" && aiInsights && <AiView data={aiInsights} />}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════
function SummaryView({ data }: { data: AnalyticsSummaryData }) {
  const kpis = [
    { label: "Chiffre d'affaires", value: fmtCur(data.current.ca), evo: data.evolution.ca, icon: DollarSign },
    { label: "Commandes", value: fmt(data.current.orders), evo: data.evolution.orders, icon: ShoppingCart },
    { label: "Clients actifs", value: fmt(data.current.clients), evo: data.evolution.clients, icon: Users },
    { label: "Marge moyenne", value: `${fmt(data.current.avg_margin, 1)}%`, evo: data.evolution.margin, icon: TrendingUp },
    { label: "Marge totale", value: fmtCur(data.current.total_margin), evo: null, icon: DollarSign },
    { label: "Appels", value: fmt(data.current.calls), evo: data.evolution.calls, icon: Phone },
  ];

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Période : {data.period.from} → {data.period.to} vs période précédente</p>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between mb-1"><k.icon className="w-4 h-4 text-muted-foreground" /><EvoBadge value={k.evo} /></div>
              <p className="text-xl font-bold">{k.value}</p>
              <p className="text-xs text-muted-foreground">{k.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Comparaison période actuelle vs précédente</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>KPI</TableHead><TableHead className="text-right">Actuel</TableHead><TableHead className="text-right">Précédent</TableHead><TableHead className="text-right">Évolution</TableHead></TableRow></TableHeader>
            <TableBody>
              {[
                { label: "CA", cur: fmtCur(data.current.ca), prev: fmtCur(data.previous.ca), evo: data.evolution.ca },
                { label: "Commandes", cur: fmt(data.current.orders), prev: fmt(data.previous.orders), evo: data.evolution.orders },
                { label: "Clients", cur: fmt(data.current.clients), prev: fmt(data.previous.clients), evo: data.evolution.clients },
                { label: "Marge %", cur: `${fmt(data.current.avg_margin, 1)}%`, prev: `${fmt(data.previous.avg_margin, 1)}%`, evo: data.evolution.margin },
                { label: "Appels", cur: fmt(data.current.calls), prev: fmt(data.previous.calls), evo: data.evolution.calls },
              ].map((row) => (
                <TableRow key={row.label}>
                  <TableCell className="text-xs font-medium">{row.label}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums">{row.cur}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums text-muted-foreground">{row.prev}</TableCell>
                  <TableCell className="text-right"><EvoBadge value={row.evo} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
// RECEIVABLES
// ═══════════════════════════════════════════════════════════════
function ReceivablesView({ data }: { data: ReceivablesData }) {
  const bucketData = [
    { name: "< 30j", count: data.buckets.current.count, total: data.buckets.current.total },
    { name: "30-60j", count: data.buckets.over_30.count, total: data.buckets.over_30.total },
    { name: "60-90j", count: data.buckets.over_60.count, total: data.buckets.over_60.total },
    { name: "> 90j", count: data.buckets.over_90.count, total: data.buckets.over_90.total },
  ];
  const BUCKET_COLORS = ["#3b82f6", "#f59e0b", "#f97316", "#ef4444"];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-red-200 bg-red-50/30"><CardContent className="pt-4 pb-3"><AlertCircle className="w-4 h-4 text-red-600 mb-1" /><p className="text-2xl font-bold text-red-700">{fmtCur(data.total_outstanding)}</p><p className="text-xs text-muted-foreground">Encours total</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><DollarSign className="w-4 h-4 text-muted-foreground mb-1" /><p className="text-2xl font-bold">{data.invoice_count}</p><p className="text-xs text-muted-foreground">Factures impayées</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><Clock className="w-4 h-4 text-muted-foreground mb-1" /><p className="text-2xl font-bold">{fmt(data.avg_days_overdue, 0)}j</p><p className="text-xs text-muted-foreground">Ancienneté moyenne</p></CardContent></Card>
        <Card className={data.buckets.over_90.count > 0 ? "border-red-200" : ""}><CardContent className="pt-4 pb-3"><AlertTriangle className="w-4 h-4 text-red-600 mb-1" /><p className="text-2xl font-bold text-red-700">{fmtCur(data.buckets.over_90.total)}</p><p className="text-xs text-muted-foreground">&gt; 90 jours ({data.buckets.over_90.count})</p></CardContent></Card>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Balance âgée</CardTitle></CardHeader>
          <CardContent><ResponsiveContainer width="100%" height={220}><BarChart data={bucketData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(v) => fmtCur(v as number)} /><Bar dataKey="total" name="Montant">{bucketData.map((_, i) => <Cell key={i} fill={BUCKET_COLORS[i]} />)}</Bar></BarChart></ResponsiveContainer></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Top débiteurs</CardTitle></CardHeader>
          <CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Client</TableHead><TableHead className="text-right">Reste dû</TableHead><TableHead className="text-right">Factures</TableHead></TableRow></TableHeader>
            <TableBody>{data.top_debtors.slice(0, 10).map((d, i) => (<TableRow key={i}><TableCell className="text-xs font-medium">{d.client_id ? <Link href={`/clients/${d.client_id}`} className="hover:underline text-primary">{d.client_name}</Link> : d.client_name}</TableCell><TableCell className="text-xs text-right tabular-nums text-red-600 font-medium">{fmtCur(d.total_remaining)}</TableCell><TableCell className="text-xs text-right">{d.invoice_count}</TableCell></TableRow>))}</TableBody></Table></CardContent></Card>
      </div>
      {data.monthly_trend.length > 0 && (
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Évolution de l&apos;encours</CardTitle></CardHeader>
          <CardContent><ResponsiveContainer width="100%" height={200}><AreaChart data={data.monthly_trend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip formatter={(v) => fmtCur(v as number)} /><Area type="monotone" dataKey="outstanding" name="Encours" stroke="#ef4444" fill="#fecaca" /></AreaChart></ResponsiveContainer></CardContent></Card>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
// PRODUCTS
// ═══════════════════════════════════════════════════════════════
function ProductsView({ data }: { data: ProductsAnalyticsData }) {
  const pieData = data.families.slice(0, 8).map((f) => ({ name: f.family_label, value: f.total_ca }));
  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-2 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><PieChart className="w-4 h-4" />Répartition CA par famille</CardTitle></CardHeader>
          <CardContent><ResponsiveContainer width="100%" height={280}><RechartsPie><Pie data={pieData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={{ strokeWidth: 1 }}>{pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}</Pie><Tooltip formatter={(v) => fmtCur(v as number)} /></RechartsPie></ResponsiveContainer></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Familles de produits</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-auto max-h-[340px]"><Table><TableHeader><TableRow><TableHead>Famille</TableHead><TableHead className="text-right">CA</TableHead><TableHead className="text-right">Marge %</TableHead><TableHead className="text-right">Produits</TableHead></TableRow></TableHeader>
            <TableBody>{data.families.map((f, i) => (<TableRow key={i}><TableCell className="text-xs font-medium">{f.family_label}</TableCell><TableCell className="text-xs text-right tabular-nums">{fmtCur(f.total_ca)}</TableCell><TableCell className="text-xs text-right"><Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${f.avg_margin >= 20 ? "text-green-700 bg-green-50" : f.avg_margin >= 10 ? "text-amber-700 bg-amber-50" : "text-red-700 bg-red-50"}`}>{fmt(f.avg_margin, 1)}%</Badge></TableCell><TableCell className="text-xs text-right">{f.product_count}</TableCell></TableRow>))}</TableBody></Table></CardContent></Card>
      </div>
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Top 20 produits par CA</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-auto"><Table><TableHeader><TableRow><TableHead>Réf</TableHead><TableHead>Désignation</TableHead><TableHead className="text-right">CA</TableHead><TableHead className="text-right">Qté</TableHead><TableHead className="text-right">Marge</TableHead><TableHead className="text-right">Clients</TableHead></TableRow></TableHeader>
          <TableBody>{data.top_products.slice(0, 20).map((p) => (<TableRow key={p.article_ref}><TableCell className="text-xs font-mono">{p.article_ref}</TableCell><TableCell className="text-xs font-medium max-w-[200px] truncate">{p.designation}</TableCell><TableCell className="text-xs text-right tabular-nums font-medium">{fmtCur(p.total_ca)}</TableCell><TableCell className="text-xs text-right tabular-nums">{fmt(p.total_qty, 0)}</TableCell><TableCell className="text-xs text-right"><Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${p.avg_margin >= 20 ? "text-green-700 bg-green-50" : p.avg_margin >= 10 ? "text-amber-700 bg-amber-50" : "text-red-700 bg-red-50"}`}>{fmt(p.avg_margin, 1)}%</Badge></TableCell><TableCell className="text-xs text-right">{p.client_count}</TableCell></TableRow>))}</TableBody></Table></CardContent></Card>
      <div className="grid lg:grid-cols-2 gap-4">
        {data.low_margin_products.length > 0 && (
          <Card className="border-red-200"><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-red-600" />Produits à faible marge (&lt;10%)</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-auto max-h-[300px]"><Table><TableHeader><TableRow><TableHead>Produit</TableHead><TableHead className="text-right">CA</TableHead><TableHead className="text-right">Marge</TableHead></TableRow></TableHeader>
              <TableBody>{data.low_margin_products.map((p) => (<TableRow key={p.article_ref}><TableCell className="text-xs"><span className="font-mono text-muted-foreground mr-1">{p.article_ref}</span>{p.designation}</TableCell><TableCell className="text-xs text-right tabular-nums">{fmtCur(p.total_ca)}</TableCell><TableCell className="text-xs text-right text-red-600 font-medium">{fmt(p.avg_margin, 1)}%</TableCell></TableRow>))}</TableBody></Table></CardContent></Card>
        )}
        {data.stock_alerts.length > 0 && (
          <Card className="border-amber-200"><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Package className="w-4 h-4 text-amber-600" />Alertes stock</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-auto max-h-[300px]"><Table><TableHeader><TableRow><TableHead>Produit</TableHead><TableHead className="text-right">Dispo</TableHead><TableHead className="text-right">Min</TableHead><TableHead className="text-right">Déficit</TableHead></TableRow></TableHeader>
              <TableBody>{data.stock_alerts.map((p) => (<TableRow key={p.article_ref}><TableCell className="text-xs"><span className="font-mono text-muted-foreground mr-1">{p.article_ref}</span>{p.designation}</TableCell><TableCell className="text-xs text-right tabular-nums">{fmt(p.stock_available, 0)}</TableCell><TableCell className="text-xs text-right tabular-nums">{fmt(p.stock_min, 0)}</TableCell><TableCell className="text-xs text-right text-red-600 font-medium">-{fmt(p.deficit, 0)}</TableCell></TableRow>))}</TableBody></Table></CardContent></Card>
        )}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
// GEO
// ═══════════════════════════════════════════════════════════════
function GeoView({ data }: { data: GeoAnalyticsData }) {
  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-2 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">CA par département (Top 15)</CardTitle></CardHeader>
          <CardContent><ResponsiveContainer width="100%" height={300}><BarChart data={data.departments.slice(0, 15)} layout="vertical"><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" tick={{ fontSize: 10 }} /><YAxis type="category" dataKey="dept" tick={{ fontSize: 11 }} width={35} /><Tooltip formatter={(v) => fmtCur(v as number)} /><Bar dataKey="total_ca" name="CA" fill="#3b82f6" /></BarChart></ResponsiveContainer></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">CA par région</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-auto max-h-[360px]"><Table><TableHeader><TableRow><TableHead>Région</TableHead><TableHead className="text-right">CA</TableHead><TableHead className="text-right">Clients</TableHead><TableHead className="text-right">Marge</TableHead></TableRow></TableHeader>
            <TableBody>{data.regions.map((r) => (<TableRow key={r.region}><TableCell className="text-xs font-medium">{r.region}</TableCell><TableCell className="text-xs text-right tabular-nums font-medium">{fmtCur(r.total_ca)}</TableCell><TableCell className="text-xs text-right">{r.client_count}</TableCell><TableCell className="text-xs text-right">{fmt(r.avg_margin, 1)}%</TableCell></TableRow>))}</TableBody></Table></CardContent></Card>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Top villes</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-auto max-h-[300px]"><Table><TableHeader><TableRow><TableHead>Ville</TableHead><TableHead>CP</TableHead><TableHead className="text-right">CA</TableHead><TableHead className="text-right">Clients</TableHead></TableRow></TableHeader>
            <TableBody>{data.top_cities.map((c, i) => (<TableRow key={i}><TableCell className="text-xs font-medium">{c.city}</TableCell><TableCell className="text-xs font-mono text-muted-foreground">{c.postal_code}</TableCell><TableCell className="text-xs text-right tabular-nums">{fmtCur(c.total_ca)}</TableCell><TableCell className="text-xs text-right">{c.client_count}</TableCell></TableRow>))}</TableBody></Table></CardContent></Card>
        {data.dormant_zones.length > 0 && (
          <Card className="border-amber-200"><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-amber-600" />Zones sans activité récente</CardTitle></CardHeader>
            <CardContent><div className="flex flex-wrap gap-2">{data.dormant_zones.map((z) => (<Badge key={z.dept} variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">Dept {z.dept} — {z.count} clients inactifs</Badge>))}</div></CardContent></Card>
        )}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
// FUNNEL
// ═══════════════════════════════════════════════════════════════
function FunnelView({ data }: { data: FunnelAnalyticsData }) {
  const funnelSteps = [
    { label: "Prospects", count: data.funnel.prospects, color: "bg-blue-500" },
    { label: "Clients actifs", count: data.funnel.clients, color: "bg-green-500" },
    { label: "À risque", count: data.funnel.at_risk, color: "bg-amber-500" },
    { label: "Dormants", count: data.funnel.dormant, color: "bg-orange-500" },
    { label: "Perdus", count: data.funnel.dead, color: "bg-red-500" },
  ];
  const maxCount = Math.max(...funnelSteps.map((s) => s.count), 1);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 pb-3"><DollarSign className="w-4 h-4 text-muted-foreground mb-1" /><p className="text-2xl font-bold">{fmtCur(data.ltv.avg)}</p><p className="text-xs text-muted-foreground">LTV moyenne</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><DollarSign className="w-4 h-4 text-muted-foreground mb-1" /><p className="text-2xl font-bold">{fmtCur(data.ltv.median)}</p><p className="text-xs text-muted-foreground">LTV médiane</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><ShoppingCart className="w-4 h-4 text-muted-foreground mb-1" /><p className="text-2xl font-bold">{fmtCur(data.ltv.avg_basket)}</p><p className="text-xs text-muted-foreground">Panier moyen</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><Clock className="w-4 h-4 text-muted-foreground mb-1" /><p className="text-2xl font-bold">{fmt(data.ltv.avg_frequency_days, 0)}j</p><p className="text-xs text-muted-foreground">Fréquence commande</p></CardContent></Card>
      </div>
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Target className="w-4 h-4" />Funnel clients</CardTitle></CardHeader>
        <CardContent className="space-y-3">{funnelSteps.map((step) => (
          <div key={step.label} className="flex items-center gap-3"><span className="text-xs w-28 shrink-0 font-medium">{step.label}</span><div className="flex-1 h-8 bg-muted rounded-lg overflow-hidden relative"><div className={`h-full ${step.color} rounded-lg transition-all flex items-center justify-end pr-2`} style={{ width: `${Math.max((step.count / maxCount) * 100, 5)}%` }}><span className="text-xs font-bold text-white">{fmt(step.count)}</span></div></div></div>
        ))}</CardContent></Card>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Cohortes de rétention (90j)</CardTitle></CardHeader>
          <CardContent><ResponsiveContainer width="100%" height={250}><BarChart data={data.cohorts}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="acquired" name="Acquis" fill="#93c5fd" /><Bar dataKey="still_active" name="Encore actifs" fill="#3b82f6" /><Legend wrapperStyle={{ fontSize: 11 }} /></BarChart></ResponsiveContainer></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Nouveaux clients vs churn</CardTitle></CardHeader>
          <CardContent>{(() => {
            const merged: Record<string, { month: string; new: number; lost: number }> = {};
            data.new_clients_trend.forEach((n) => { merged[n.month] = { month: n.month, new: n.new, lost: 0 }; });
            data.churn_trend.forEach((c) => { if (merged[c.month]) merged[c.month].lost = c.lost; else merged[c.month] = { month: c.month, new: 0, lost: c.lost }; });
            const chartData = Object.values(merged).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
            return (<ResponsiveContainer width="100%" height={250}><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="new" name="Nouveaux" fill="#10b981" /><Bar dataKey="lost" name="Perdus" fill="#ef4444" /><Legend wrapperStyle={{ fontSize: 11 }} /></BarChart></ResponsiveContainer>);
          })()}</CardContent></Card>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
// AI INSIGHTS (enriched)
// ═══════════════════════════════════════════════════════════════
function AiView({ data }: { data: AiInsightsData }) {
  const ck = data.call_kpis;
  const sc = data.avg_scores;
  const radarData = [
    { axis: "Politesse", value: sc.politeness },
    { axis: "Objections", value: sc.objection },
    { axis: "Closing", value: sc.closing },
    { axis: "Produit", value: sc.product },
    { axis: "Écoute", value: sc.listening },
  ];

  const outcomeEntries = Object.entries(data.qualification_outcomes);
  const totalOutcomes = outcomeEntries.reduce((s, [, v]) => s + v, 0);
  const outcomeLabels: Record<string, string> = {
    callback: "Rappel", sale: "Vente", interested: "Intéressé",
    not_interested: "Pas intéressé", no_answer: "Pas de réponse",
  };

  const moodEntries = Object.entries(data.mood_distribution);
  const totalMoods = moodEntries.reduce((s, [, v]) => s + v, 0);

  return (
    <div className="space-y-4">
      {/* KPIs appels */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <Card><CardContent className="pt-3 pb-2 text-center"><Phone className="w-4 h-4 mx-auto text-muted-foreground mb-1" /><p className="text-lg font-bold">{fmt(ck.total_calls)}</p><p className="text-[10px] text-muted-foreground">Total appels</p></CardContent></Card>
        <Card><CardContent className="pt-3 pb-2 text-center"><PhoneOutgoing className="w-4 h-4 mx-auto text-blue-600 mb-1" /><p className="text-lg font-bold">{fmt(ck.outbound)}</p><p className="text-[10px] text-muted-foreground">Sortants</p></CardContent></Card>
        <Card><CardContent className="pt-3 pb-2 text-center"><PhoneIncoming className="w-4 h-4 mx-auto text-green-600 mb-1" /><p className="text-lg font-bold">{fmt(ck.inbound)}</p><p className="text-[10px] text-muted-foreground">Entrants</p></CardContent></Card>
        <Card><CardContent className="pt-3 pb-2 text-center"><CheckCircle className="w-4 h-4 mx-auto text-green-600 mb-1" /><p className="text-lg font-bold">{ck.pickup_rate}%</p><p className="text-[10px] text-muted-foreground">Taux décroché</p></CardContent></Card>
        <Card><CardContent className="pt-3 pb-2 text-center"><Clock className="w-4 h-4 mx-auto text-muted-foreground mb-1" /><p className="text-lg font-bold">{fmtDuration(ck.total_duration_min * 60)}</p><p className="text-[10px] text-muted-foreground">Durée totale</p></CardContent></Card>
        <Card><CardContent className="pt-3 pb-2 text-center"><Clock className="w-4 h-4 mx-auto text-muted-foreground mb-1" /><p className="text-lg font-bold">{fmtDuration(ck.avg_duration_sec)}</p><p className="text-[10px] text-muted-foreground">Durée moy.</p></CardContent></Card>
        <Card><CardContent className="pt-3 pb-2 text-center"><Brain className="w-4 h-4 mx-auto text-violet-600 mb-1" /><p className="text-lg font-bold">{fmt(ck.analyzed_count)}</p><p className="text-[10px] text-muted-foreground">Analysés IA</p></CardContent></Card>
        <Card className="border-violet-200 bg-violet-50/30"><CardContent className="pt-3 pb-2 text-center"><Star className="w-4 h-4 mx-auto text-violet-600 mb-1" /><p className="text-lg font-bold text-violet-700">{sc.overall}/100</p><p className="text-[10px] text-muted-foreground">Score IA global</p></CardContent></Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Radar qualité */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Star className="w-4 h-4 text-amber-500" />Qualité commerciale</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 8 }} />
                <Radar dataKey="value" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Outcomes qualification */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Target className="w-4 h-4" />Résultats des qualifications</CardTitle></CardHeader>
          <CardContent className="space-y-2.5">
            {outcomeEntries.length === 0 && <p className="text-xs text-muted-foreground">Aucune qualification sur la période</p>}
            {outcomeEntries.map(([outcome, count]) => {
              const pct = totalOutcomes > 0 ? Math.round(count / totalOutcomes * 100) : 0;
              const label = outcomeLabels[outcome] || outcome;
              const color = outcome === "sale" ? "bg-green-500" : outcome === "interested" ? "bg-blue-500" : outcome === "callback" ? "bg-amber-500" : "bg-gray-400";
              return (
                <div key={outcome} className="flex items-center gap-2">
                  <span className="text-xs w-28 shrink-0">{label}</span>
                  <div className="flex-1"><Progress value={pct} className={`h-2.5 [&>div]:${color}`} /></div>
                  <span className="text-xs tabular-nums w-12 text-right font-medium">{count} ({pct}%)</span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Mood distribution */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Smile className="w-4 h-4 text-green-600" />Humeurs des appels</CardTitle></CardHeader>
          <CardContent className="space-y-2.5">
            {moodEntries.length === 0 && <p className="text-xs text-muted-foreground">Aucune donnée</p>}
            {moodEntries.map(([mood, count]) => {
              const pct = totalMoods > 0 ? Math.round(count / totalMoods * 100) : 0;
              const icon = mood === "hot" ? <Smile className="w-3.5 h-3.5 text-green-600" /> : mood === "cold" ? <Frown className="w-3.5 h-3.5 text-blue-600" /> : <Meh className="w-3.5 h-3.5 text-gray-500" />;
              const label = mood === "hot" ? "Chaud" : mood === "cold" ? "Froid" : "Neutre";
              return (
                <div key={mood} className="flex items-center gap-2">
                  {icon}
                  <span className="text-xs w-16 shrink-0">{label}</span>
                  <div className="flex-1"><Progress value={pct} className="h-2.5" /></div>
                  <span className="text-xs tabular-nums w-12 text-right font-medium">{count} ({pct}%)</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Trends */}
      <div className="grid lg:grid-cols-2 gap-4">
        {data.sentiment_trend.length > 0 && (
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Sentiment client (tendance)</CardTitle></CardHeader>
            <CardContent><ResponsiveContainer width="100%" height={220}><AreaChart data={data.sentiment_trend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Area type="monotone" dataKey="positive" name="Positif" stackId="1" stroke="#10b981" fill="#d1fae5" /><Area type="monotone" dataKey="neutral" name="Neutre" stackId="1" stroke="#6b7280" fill="#e5e7eb" /><Area type="monotone" dataKey="negative" name="Négatif" stackId="1" stroke="#ef4444" fill="#fecaca" /><Legend wrapperStyle={{ fontSize: 11 }} /></AreaChart></ResponsiveContainer></CardContent></Card>
        )}
        {data.quality_trend.length > 0 && (
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Score IA (tendance)</CardTitle></CardHeader>
            <CardContent><ResponsiveContainer width="100%" height={220}><LineChart data={data.quality_trend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 10 }} /><Tooltip /><Line type="monotone" dataKey="avg_score" name="Score global" stroke="#3b82f6" strokeWidth={2} /><Line type="monotone" dataKey="listening" name="Écoute" stroke="#10b981" strokeDasharray="4 4" /><Line type="monotone" dataKey="closing" name="Closing" stroke="#f59e0b" strokeDasharray="4 4" /><Legend wrapperStyle={{ fontSize: 11 }} /></LineChart></ResponsiveContainer></CardContent></Card>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {data.quality_by_rep.length > 0 && (
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Score IA par commercial</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-auto max-h-[300px]"><Table><TableHeader><TableRow><TableHead>Commercial</TableHead><TableHead className="text-right">Score</TableHead><TableHead className="text-right">Appels</TableHead></TableRow></TableHeader>
              <TableBody>{data.quality_by_rep.map((r) => (<TableRow key={r.user_id}><TableCell className="text-xs font-medium">{r.user_name}</TableCell><TableCell className="text-xs text-right"><Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${r.avg_score >= 70 ? "text-green-700 bg-green-50" : r.avg_score >= 50 ? "text-amber-700 bg-amber-50" : "text-red-700 bg-red-50"}`}>{fmt(r.avg_score, 1)}/100</Badge></TableCell><TableCell className="text-xs text-right">{r.call_count}</TableCell></TableRow>))}</TableBody></Table></CardContent></Card>
        )}
        {data.top_topics.length > 0 && (
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Lightbulb className="w-4 h-4 text-primary" />Sujets fréquents</CardTitle></CardHeader>
            <CardContent><div className="flex flex-wrap gap-2">{data.top_topics.map((t) => (<Badge key={t.topic} variant="outline" className="text-xs gap-1">{t.topic} <span className="text-muted-foreground font-normal">({t.count})</span></Badge>))}</div></CardContent></Card>
        )}
      </div>

      {data.opportunities.length > 0 && (
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Target className="w-4 h-4 text-green-600" />Opportunités détectées par l&apos;IA</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-auto max-h-[400px]"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Client</TableHead><TableHead>Commercial</TableHead><TableHead>Opportunité</TableHead><TableHead>Sentiment</TableHead></TableRow></TableHeader>
            <TableBody>{data.opportunities.map((o) => (<TableRow key={o.id}><TableCell className="text-xs text-muted-foreground whitespace-nowrap">{o.date}</TableCell><TableCell className="text-xs font-medium">{o.client_id ? <Link href={`/clients/${o.client_id}`} className="hover:underline text-primary">{o.client_name}</Link> : o.client_name || "—"}</TableCell><TableCell className="text-xs">{o.user_name || "—"}</TableCell><TableCell className="text-xs max-w-[300px]"><p className="line-clamp-2">{o.opportunity}</p></TableCell><TableCell className="text-xs">{o.sentiment && <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${o.sentiment.toLowerCase().includes("pos") ? "text-green-700 bg-green-50" : o.sentiment.toLowerCase().includes("neg") ? "text-red-700 bg-red-50" : "text-gray-700 bg-gray-50"}`}>{o.sentiment}</Badge>}</TableCell></TableRow>))}</TableBody></Table></CardContent></Card>
      )}
    </div>
  );
}
