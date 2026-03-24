"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { api, CallStats, PlaylistItem, Reminder, ReminderItem, MyStats, User, ObjectiveProgress, ChallengeEntry, ChallengeRankingEntry, MyMargins, MyTopProduct, MyTopClient, PipelineStats, SalesDashboardResponse, SalesRepStats } from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
  ListMusic,
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Timer,
  Target,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Euro,
  Users,
  Star,
  BarChart3,
  Trophy,
  Medal,
  TrendingUp as TrendingUpIcon,
  Weight,
  Percent,
  Gift,
  Flame,
  Package,
  FileText,
  Truck,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  PhoneOutgoing,
  Trash2,
  Pencil,
  Clock,
  Receipt,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import Link from "next/link";
import { ClickToCall } from "@/components/click-to-call";
import { SparkLine, THEME_COLORS } from "@/components/ui/spark-line";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Brush,
  ReferenceLine,
} from "recharts";

type DatePreset = "month" | "today" | "yesterday" | "7d" | "30d" | "90d" | "custom";

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function presetLabel(p: DatePreset): string {
  switch (p) {
    case "month": return "Mois";
    case "today": return "Aujourd'hui";
    case "yesterday": return "Hier";
    case "7d": return "7 jours";
    case "30d": return "30 jours";
    case "90d": return "90 jours";
    case "custom": return "Période";
  }
}

function presetRange(p: DatePreset): { from: Date; to: Date } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  switch (p) {
    case "month":
      return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: today };
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "90d":
      return { from: addDays(today, -89), to: today };
    default:
      return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: today };
  }
}

function formatDurationHM(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h${m.toString().padStart(2, "0")}`;
  return `${m}min`;
}

function formatDateRange(from: Date, to: Date): string {
  const f = from.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  const t = to.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  if (toISO(from) === toISO(to)) return f;
  return `${f} → ${t}`;
}

function formatCurrency(v: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v);
}

function ProgressGauge({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(Math.round((value / max) * 100), 100) : 0;
  const color = pct >= 100 ? "bg-green-500" : pct >= 70 ? "bg-sora" : pct >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-medium">{pct}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<CallStats | null>(null);
  const [myStats, setMyStats] = useState<MyStats | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);
  const [unqualCount, setUnqualCount] = useState(0);
  const [dormantCount, setDormantCount] = useState(0);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [playlistReminders, setPlaylistReminders] = useState<ReminderItem[]>([]);
  const [editingReminder, setEditingReminder] = useState<ReminderItem | null>(null);
  const [editReminderDate, setEditReminderDate] = useState("");
  const [editReminderTime, setEditReminderTime] = useState("");
  const [editReminderNote, setEditReminderNote] = useState("");
  const [savingReminder, setSavingReminder] = useState(false);
  const [remindersExpanded, setRemindersExpanded] = useState(false);
  const [objProgress, setObjProgress] = useState<ObjectiveProgress[]>([]);
  const [activeChallenges, setActiveChallenges] = useState<ChallengeEntry[]>([]);
  const [challengeRankings, setChallengeRankings] = useState<Record<string, ChallengeRankingEntry[]>>({});
  const [margins, setMargins] = useState<MyMargins | null>(null);
  const [topProducts, setTopProducts] = useState<MyTopProduct[]>([]);
  const [topClients, setTopClients] = useState<MyTopClient[]>([]);
  const [pipeline, setPipeline] = useState<PipelineStats | null>(null);
  const [salesDashboard, setSalesDashboard] = useState<SalesDashboardResponse | null>(null);

  const [preset, setPreset] = useState<DatePreset>("month");
  const [dateRange, setDateRange] = useState(presetRange("month"));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [viewAs, setViewAs] = useState<string>("me");
  const [allUsers, setAllUsers] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    api.me().then((u) => {
      setCurrentUser(u);
      if (u.role === "admin" || u.role === "manager") {
        api.getUsers().then((users) => {
          setAllUsers(users.filter((u) => u.is_active).map((u) => ({ id: u.id, name: u.name })));
        }).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  const fetchStats = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = {
      date_from: toISO(dateRange.from),
      date_to: toISO(dateRange.to),
    };

    if (viewAs === "all") {
      const rankParams: Record<string, string> = { ...params, limit: "20", user_id: "all" };
      api.getSalesDashboard("custom", toISO(dateRange.from), toISO(dateRange.to))
        .then(setSalesDashboard)
        .catch(() => {})
        .finally(() => setLoading(false));
      api.getMyTopProducts(rankParams).then(setTopProducts).catch(() => {});
      api.getMyTopClients(rankParams).then(setTopClients).catch(() => {});
      return;
    }

    const callParams = { ...params };
    const statsParams = { ...params };
    const marginParams = { ...params };
    if (viewAs === "me") {
      callParams.mine = "true";
    } else {
      callParams.user_id = viewAs;
      statsParams.user_id = viewAs;
      marginParams.user_id = viewAs;
    }

    const rankParams: Record<string, string> = { ...params, limit: "20" };
    if (viewAs !== "me") {
      rankParams.user_id = viewAs;
    }

    const pipelineParams = { ...params };
    if (viewAs !== "me") {
      pipelineParams.user_id = viewAs;
    }

    api.getCallStats(callParams).then(setStats).catch(() => {});
    api.getMyStats(statsParams).then(setMyStats).catch(() => {});
    api.getMyMargins(marginParams).then(setMargins).catch(() => {});
    api.getMyTopProducts(rankParams).then(setTopProducts).catch(() => {});
    api.getMyTopClients(rankParams).then(setTopClients).catch(() => {});
    api.getMyPipeline(pipelineParams).then(setPipeline).catch(() => {})
      .finally(() => setLoading(false));

    const objUserId = viewAs !== "me" ? viewAs : currentUser?.id;
    if (objUserId) {
      api.getObjectiveProgress(objUserId).then(setObjProgress).catch(() => {});
    }
  }, [dateRange, viewAs, currentUser]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    const playlistParams: Record<string, string> = {};
    const reminderParams: Record<string, string> = {};
    const unqualParams: Record<string, string> = {};
    const dormantParams: Record<string, string> = { is_dormant: "true", limit: "1" };

    if (viewAs === "me") {
      reminderParams.mine = "true";
      unqualParams.mine = "true";
    } else if (viewAs !== "all") {
      playlistParams.user_id = viewAs;
      reminderParams.user_id = viewAs;
      unqualParams.user_id = viewAs;
      dormantParams.assigned_user_id = viewAs;
    }

    api.getPlaylist(playlistParams).then((items) => setPlaylist(items.slice(0, 5))).catch(() => {});
    api.getUnqualifiedCalls(unqualParams).then((calls) => setUnqualCount(calls.length)).catch(() => {});
    api.getClients(dormantParams).then((res) => setDormantCount(res.total)).catch(() => {});
    api.getReminders(reminderParams).then((r) => setReminders(r.slice(0, 5))).catch(() => {});
    api.getRemindersPlaylist(viewAs !== "me" && viewAs !== "all" ? { user_id: viewAs } : {}).then(setPlaylistReminders).catch(() => {});

    api.getChallenges("active").then((chs) => {
      setActiveChallenges(chs);
      chs.forEach((ch) => {
        api.getChallengeRanking(ch.id).then((r) => {
          setChallengeRankings((prev) => ({ ...prev, [ch.id]: r }));
        }).catch(() => {});
      });
    }).catch(() => {});
  }, [viewAs]);

  const handlePreset = (p: DatePreset) => {
    if (p === "custom") {
      setPreset("custom");
      setCalendarOpen(true);
      return;
    }
    setPreset(p);
    setDateRange(presetRange(p));
  };

  const handleCalendarSelect = (range: { from?: Date; to?: Date } | undefined) => {
    if (range?.from) {
      setDateRange({ from: range.from, to: range.to || range.from });
      setPreset("custom");
      if (range.to) setCalendarOpen(false);
    }
  };

  const presets: DatePreset[] = ["month", "today", "yesterday", "7d", "30d", "90d"];

  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "manager";
  const targetCA = myStats?.target?.monthly;
  const currentCA = myStats?.sales?.ca || 0;
  const caEvolution = myStats?.sales?.ca_evolution_pct || 0;
  const viewAsUser = viewAs !== "me" && viewAs !== "all" ? allUsers.find((u) => u.id === viewAs) : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            {isAdmin && viewAs === "all"
              ? "Pilotage commercial"
              : viewAsUser
                ? `Dashboard de ${viewAsUser.name}`
                : "Mon tableau de bord"}
          </h2>
          <p className="text-muted-foreground text-xs sm:text-sm">
            {viewAsUser ? viewAsUser.name : currentUser?.name} · {preset !== "custom"
              ? presetLabel(preset)
              : formatDateRange(dateRange.from, dateRange.to)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && allUsers.length > 0 && (
            <Select value={viewAs} onValueChange={setViewAs}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="me">Mes stats</SelectItem>
                <SelectItem value="all">Vue globale</SelectItem>
                {allUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Date filters */}
      <div className="flex flex-wrap items-center gap-1.5">
        {presets.map((p) => (
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
              {preset === "custom" ? formatDateRange(dateRange.from, dateRange.to) : "Période"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={{ from: dateRange.from, to: dateRange.to }}
              onSelect={handleCalendarSelect}
              numberOfMonths={2}
              disabled={{ after: new Date() }}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Admin global view */}
      {isAdmin && viewAs === "all" ? (
        <AdminPilotingView
          data={salesDashboard}
          loading={loading}
          topClients={topClients}
          topProducts={topProducts}
        />
      ) : (
      <>
      {/* 1. STATS : Business */}
      {myStats && (() => {
        const wt = myStats.weekly_trends || [];
        const sparkCA = wt.map((w) => w.ca);
        const sparkOrders = wt.map((w) => w.orders);
        const sparkBasket = wt.map((w) => w.avg_basket);
        const sparkWeight = wt.map((w) => w.weight_kg);

        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <CardContent className="pt-5 pb-4">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Chiffre d&apos;affaires</p>
                <div className="flex items-end justify-between mt-1">
                  <div>
                    <p className="text-2xl font-extrabold">{loading ? "…" : formatCurrency(currentCA)}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      {caEvolution !== 0 && (
                        <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${caEvolution > 0 ? "text-kiku bg-kiku/15" : "text-ume bg-ume/15"}`}>
                          {caEvolution > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {caEvolution > 0 ? "+" : ""}{caEvolution}%
                        </span>
                      )}
                    </div>
                  </div>
                  <SparkLine
                    data={sparkCA}
                    color={THEME_COLORS.sora}
                    height={44}
                    width={110}
                    tooltipFormatter={(v) => formatCurrency(v)}
                  />
                </div>
                {targetCA && targetCA > 0 && (
                  <div className="mt-3">
                    <ProgressGauge value={currentCA} max={targetCA} label={`Obj. ${formatCurrency(targetCA)}`} />
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <CardContent className="pt-5 pb-4">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Commandes</p>
                <div className="flex items-end justify-between mt-1">
                  <div>
                    <p className="text-2xl font-extrabold">{loading ? "…" : myStats.sales.orders}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">{myStats.sales.clients} clients actifs</p>
                  </div>
                  <SparkLine data={sparkOrders} color={THEME_COLORS.sora} height={44} width={110} />
                </div>
              </CardContent>
            </Card>
            <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <CardContent className="pt-5 pb-4">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Panier moyen</p>
                <div className="flex items-end justify-between mt-1">
                  <div>
                    <p className="text-2xl font-extrabold">{loading ? "…" : formatCurrency(myStats.sales.avg_basket)}</p>
                    {margins && margins.total_weight_kg > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-1">CA/kg : {formatCurrency(margins.total_ca / margins.total_weight_kg)}</p>
                    )}
                  </div>
                  <SparkLine
                    data={sparkBasket}
                    color={THEME_COLORS.kiku}
                    height={44}
                    width={110}
                    tooltipFormatter={(v) => formatCurrency(v)}
                  />
                </div>
              </CardContent>
            </Card>
            <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <CardContent className="pt-5 pb-4">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Volume vendu</p>
                <div className="flex items-end justify-between mt-1">
                  <div>
                    <p className="text-2xl font-extrabold">
                      {loading ? "…" : margins && margins.total_weight_kg > 0
                        ? `${margins.total_weight_kg.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} kg`
                        : "—"}
                    </p>
                    {margins && margins.total_weight_kg > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-1">{(margins.total_weight_kg / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} tonnes</p>
                    )}
                  </div>
                  <SparkLine
                    data={sparkWeight}
                    color={THEME_COLORS.kiku}
                    height={44}
                    width={110}
                    tooltipFormatter={(v) => `${v.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} kg`}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* 1b. STATS : Marges */}
      {margins && margins.total_ca > 0 && (() => {
        const netPositive = margins.total_margin_net >= 0;
        const deductions = margins.total_margin_gross - margins.total_margin_net;
        const wt = myStats?.weekly_trends || [];
        const sparkMarginGross = wt.map((w) => w.margin_gross);
        const sparkMarginPct = wt.map((w) => w.ca > 0 ? Math.round((w.margin_gross / w.ca) * 1000) / 10 : 0);

        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <CardContent className="pt-5 pb-4">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Marge brute</p>
                <div className="flex items-end justify-between mt-1">
                  <div>
                    <p className="text-2xl font-extrabold">{loading ? "…" : formatCurrency(margins.total_margin_gross)}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] font-semibold text-sora bg-sora/10 px-1.5 py-0.5 rounded-full">{margins.margin_gross_pct.toFixed(1)}%</span>
                      {margins.total_weight_kg > 0 && <span className="text-[11px] text-muted-foreground">{formatCurrency(margins.total_margin_gross / margins.total_weight_kg)}/kg</span>}
                    </div>
                  </div>
                  <SparkLine
                    data={sparkMarginGross}
                    color={THEME_COLORS.sora}
                    height={44}
                    width={110}
                    tooltipFormatter={(v) => formatCurrency(v)}
                  />
                </div>
              </CardContent>
            </Card>
            <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <CardContent className="pt-5 pb-4">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Marge nette</p>
                <div className="flex items-end justify-between mt-1">
                  <div>
                    <p className={`text-2xl font-extrabold ${netPositive ? "" : "text-ume"}`}>{loading ? "…" : formatCurrency(margins.total_margin_net)}</p>
                    <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full mt-1 inline-block ${netPositive ? "text-sora bg-sora/10" : "text-ume bg-ume/10"}`}>{margins.margin_net_pct.toFixed(1)}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <CardContent className="pt-5 pb-4">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Déductions</p>
                <p className="text-2xl font-extrabold mt-1 text-ume">{loading ? "…" : formatCurrency(deductions)}</p>
                <p className="text-[11px] text-muted-foreground mt-2">Logistique · Structure · RFA</p>
              </CardContent>
            </Card>
            <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <CardContent className="pt-5 pb-4">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Taux marge brute</p>
                <div className="flex items-end justify-between mt-1">
                  <div>
                    <p className={`text-2xl font-extrabold ${netPositive ? "" : "text-ume"}`}>{margins.margin_gross_pct.toFixed(1)} <span className="text-base font-bold text-muted-foreground">%</span></p>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-2 w-20">
                      <div className={`h-full rounded-full transition-all ${netPositive ? "bg-sora" : "bg-ume"}`} style={{ width: `${Math.min(Math.abs(margins.margin_gross_pct), 100)}%` }} />
                    </div>
                  </div>
                  <SparkLine
                    data={sparkMarginPct}
                    color={netPositive ? THEME_COLORS.sora : THEME_COLORS.ume}
                    height={44}
                    width={110}
                    tooltipFormatter={(v) => `${v.toFixed(1)}%`}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* 1b-bis. Factures & Avoirs */}
      {myStats && (myStats.sales.invoices_count > 0 || myStats.sales.credit_notes_count > 0) && (
        <>
          <div className="flex items-center gap-2 mt-2 mb-1">
            <Receipt className="w-4 h-4 text-sora" />
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Facturation</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <CardContent className="pt-5 pb-4">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Factures</p>
                <div className="mt-1">
                  <p className="text-2xl font-extrabold">{loading ? "…" : myStats.sales.invoices_count}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">documents émis</p>
                </div>
              </CardContent>
            </Card>
            <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <CardContent className="pt-5 pb-4">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">CA Facturé</p>
                <div className="mt-1">
                  <p className="text-2xl font-extrabold">{loading ? "…" : formatCurrency(myStats.sales.invoices_ca)}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {myStats.sales.invoices_count > 0 ? `Moy. ${formatCurrency(myStats.sales.invoices_ca / myStats.sales.invoices_count)}` : "—"}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <CardContent className="pt-5 pb-4">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Avoirs</p>
                <div className="mt-1">
                  <p className={`text-2xl font-extrabold ${myStats.sales.credit_notes_count > 0 ? "text-ume" : ""}`}>
                    {loading ? "…" : myStats.sales.credit_notes_count}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">documents émis</p>
                </div>
              </CardContent>
            </Card>
            <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <CardContent className="pt-5 pb-4">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">CA Avoirs</p>
                <div className="mt-1">
                  <p className={`text-2xl font-extrabold ${myStats.sales.credit_notes_ca < 0 ? "text-ume" : ""}`}>
                    {loading ? "…" : formatCurrency(myStats.sales.credit_notes_ca)}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {myStats.sales.credit_notes_count > 0 ? `Moy. ${formatCurrency(myStats.sales.credit_notes_ca / myStats.sales.credit_notes_count)}` : "—"}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* 1c. PIPELINE : Commandes en cours (BC + BL) */}
      {pipeline && pipeline.orders_count > 0 && (
        <>
          <div className="flex items-center gap-2 mt-2 mb-1">
            <Package className="w-4 h-4 text-kiku" />
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Pipeline en cours</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md border-kiku/20">
              <CardContent className="pt-5 pb-4">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">CA en commande</p>
                <div className="flex items-end justify-between mt-1">
                  <div>
                    <p className="text-2xl font-extrabold">{loading ? "…" : formatCurrency(pipeline.orders_ca)}</p>
                    <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full text-kiku bg-kiku/15 mt-1">
                      <Package className="w-3 h-3" />
                      {pipeline.orders_count} doc.
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md border-kiku/20">
              <CardContent className="pt-5 pb-4">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Clients actifs</p>
                <div className="mt-1">
                  <p className="text-2xl font-extrabold">{loading ? "…" : pipeline.orders_clients}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">avec commandes en cours</p>
                </div>
              </CardContent>
            </Card>
            <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md border-kiku/20">
              <CardContent className="pt-5 pb-4">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Dernière commande</p>
                <div className="mt-1">
                  <p className="text-2xl font-extrabold">
                    {pipeline.last_order_date
                      ? new Date(pipeline.last_order_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })
                      : "—"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {pipeline.last_order_date
                      ? new Date(pipeline.last_order_date).toLocaleDateString("fr-FR", { year: "numeric" })
                      : ""}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md border-kiku/20">
              <CardContent className="pt-5 pb-4">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Panier moyen</p>
                <div className="mt-1">
                  <p className="text-2xl font-extrabold">
                    {loading ? "…" : pipeline.orders_count > 0 ? formatCurrency(pipeline.orders_ca / pipeline.orders_count) : "—"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">par commande</p>
                </div>
              </CardContent>
            </Card>
          </div>
          {pipeline.recent_orders.length > 0 && (
            <Card className="transition-all duration-200 hover:shadow-md border-kiku/20">
              <CardContent className="p-0">
                <div className="divide-y">
                  {pipeline.recent_orders.slice(0, 5).map((o, i) => (
                    <div
                      key={o.piece_id}
                      className="stagger-row flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40 transition-colors"
                      style={{ animationDelay: `${i * 80}ms` }}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${o.doc_type === "BC" ? "bg-kiku/10" : "bg-sora/10"}`}>
                        {o.doc_type === "BC" ? (
                          <FileText className="w-4 h-4 text-kiku" />
                        ) : (
                          <Truck className="w-4 h-4 text-sora" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        {o.client_id ? (
                          <Link href={`/clients/${o.client_id}`} className="text-sm font-medium truncate block hover:underline hover:text-primary transition-colors">
                            {o.client_name}
                          </Link>
                        ) : (
                          <p className="text-sm font-medium truncate">{o.client_name}</p>
                        )}
                        <p className="text-[11px] text-muted-foreground">
                          <Badge variant="outline" className={`text-[10px] mr-1.5 h-4 px-1 py-0 ${o.doc_type === "BC" ? "text-kiku border-kiku/30" : "text-sora border-sora/30"}`}>{o.doc_type}</Badge>
                          {o.piece_id} · {new Date(o.date).toLocaleDateString("fr-FR")} · {o.nb_lines} ligne{o.nb_lines > 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold">{formatCurrency(o.total_ht)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* 1d. STATS : Téléphonie */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        <Card>
          <CardContent className="pt-5 pb-4 text-center">
            <p className="text-2xl font-extrabold">{myStats?.calls?.total ?? stats?.total_calls ?? 0}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Total appels</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 text-center">
            <p className="text-2xl font-extrabold text-sora">{stats?.total_answered ?? 0}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Décrochés</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 text-center">
            <p className="text-2xl font-extrabold text-ume">{stats?.total_missed ?? 0}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Manqués</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 text-center">
            <p className="text-2xl font-extrabold text-kiku">{stats?.total_no_answer ?? 0}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Sans réponse</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 text-center">
            <p className="text-2xl font-extrabold">{formatDurationHM(stats?.total_duration_seconds ?? 0)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Durée totale</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 text-center">
            <p className="text-2xl font-extrabold text-sora">{stats?.qualified_calls ?? 0}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Qualifiés</p>
          </CardContent>
        </Card>
      </div>
      {myStats && (
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground -mt-2">
          <span>Taux décroché : <span className="font-semibold text-foreground">{myStats.calls.answer_rate}%</span></span>
          <span>Durée moy. : <span className="font-semibold text-foreground">{formatDurationHM(myStats.calls.avg_duration)}</span></span>
          <span>Score IA : <span className="font-semibold text-foreground">{myStats.ai_score != null ? `${myStats.ai_score}/10` : "—"}</span></span>
        </div>
      )}

      {/* 2. RAPPELS | ALERTES (côte à côte) */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">
              <CalendarClock className="w-4 h-4 inline mr-2" />
              Rappels à venir
              {(reminders.length + playlistReminders.length) > 0 && (
                <Badge variant="secondary" className="ml-2 text-xs">{reminders.length + playlistReminders.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {reminders.length === 0 && playlistReminders.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">Aucun rappel</p>
            ) : (() => {
              const REMINDERS_LIMIT = 10;
              const totalReminders = playlistReminders.length + reminders.length;
              const visiblePlaylist = remindersExpanded ? playlistReminders : playlistReminders.slice(0, REMINDERS_LIMIT);
              const remainingSlots = Math.max(0, REMINDERS_LIMIT - playlistReminders.length);
              const visibleReminders = remindersExpanded ? reminders : reminders.slice(0, remainingSlots);
              const hiddenCount = totalReminders - visiblePlaylist.length - visibleReminders.length;
              return (
              <div className="space-y-1.5">
                {visiblePlaylist.map((r) => (
                  <div key={r.id} className="flex items-start justify-between py-2 px-3 rounded-lg hover:bg-accent transition-colors group gap-3">
                    <div className="flex-1 min-w-0 pt-0.5">
                      <Link href={`/clients/${r.client_id}`} className="text-sm font-medium hover:underline">{r.client_name}</Link>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {r.reason_detail || "Rappel"}
                        {r.reminder_time && <span> · <Clock className="w-3 h-3 inline" /> {r.reminder_time}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant={new Date(r.generated_date) <= new Date() ? "destructive" : "outline"} className="text-xs whitespace-nowrap">
                        {new Date(r.generated_date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                      </Badge>
                      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => {
                        setEditingReminder(r);
                        setEditReminderDate(r.generated_date);
                        setEditReminderTime(r.reminder_time || "");
                        setEditReminderNote(r.reason_detail || "");
                      }}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-600" onClick={async () => {
                        try {
                          await api.deleteReminder(r.id);
                          setPlaylistReminders(prev => prev.filter(x => x.id !== r.id));
                          toast.success("Rappel supprimé");
                        } catch { toast.error("Erreur"); }
                      }}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
                {visibleReminders.map((r) => (
                  <div key={r.call_id} className="flex items-start justify-between py-2 px-3 rounded-lg hover:bg-accent transition-colors gap-3">
                    <div className="flex-1 min-w-0 pt-0.5">
                      {r.client_id ? (
                        <Link href={`/clients/${r.client_id}`} className="text-sm font-medium hover:underline">{r.client_name || "Client"}</Link>
                      ) : (
                        <p className="text-sm font-medium">{r.contact_number || "Inconnu"}</p>
                      )}
                      <p className="text-xs text-muted-foreground line-clamp-2">{r.next_step || r.outcome || "Rappel"} · {new Date(r.next_step_date).toLocaleDateString("fr-FR")}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {r.contact_e164 && <ClickToCall phoneNumber={r.contact_e164} />}
                      <Badge variant={new Date(r.next_step_date) <= new Date() ? "destructive" : "outline"} className="text-xs whitespace-nowrap">
                        {new Date(r.next_step_date) <= new Date() ? "Aujourd'hui" : new Date(r.next_step_date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                      </Badge>
                    </div>
                  </div>
                ))}
                {totalReminders > REMINDERS_LIMIT && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs text-muted-foreground hover:text-foreground mt-1"
                    onClick={() => setRemindersExpanded(!remindersExpanded)}
                  >
                    {remindersExpanded ? (
                      <>Réduire <ChevronUp className="w-3 h-3 ml-1" /></>
                    ) : (
                      <>Voir les {hiddenCount} autres rappels <ChevronDown className="w-3 h-3 ml-1" /></>
                    )}
                  </Button>
                )}
              </div>
              );
            })()}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              <AlertTriangle className="w-4 h-4 inline mr-2" />
              Alertes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href="/calls" className="flex items-center justify-between py-3 px-4 rounded-lg bg-accent/50 hover:bg-accent transition-colors">
              <div>
                <p className="text-sm font-medium">Appels non qualifiés</p>
                <p className="text-xs text-muted-foreground">À qualifier pour gagner des XP</p>
              </div>
              <Badge variant="destructive">{unqualCount}</Badge>
            </Link>
            <Link href="/clients?filter=dormant" className="flex items-center justify-between py-3 px-4 rounded-lg bg-accent/50 hover:bg-accent transition-colors">
              <div>
                <p className="text-sm font-medium">Clients dormants</p>
                <p className="text-xs text-muted-foreground">Sans commande depuis 6+ mois</p>
              </div>
              <Badge variant="secondary">{dormantCount}</Badge>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* 3. PLAYLIST DU JOUR */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">
            <ListMusic className="w-4 h-4 inline mr-2" />
            To do du jour
          </CardTitle>
          <Link href="/playlist">
            <Button variant="ghost" size="sm" className="h-7 text-xs">
              Tout voir <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {playlist.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Aucune entrée</p>
          ) : (
            <div className="space-y-2">
              {playlist.map((item) => (
                <div key={item.playlist_id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-accent transition-colors">
                  <Link href={`/clients/${item.id}`} className="flex-1 min-w-0">
                    <p className="text-sm font-medium hover:underline">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.reason}</p>
                  </Link>
                  <div className="flex items-center gap-2">
                    {item.phone_e164 && item.status === "pending" && <ClickToCall phoneNumber={item.phone_e164} />}
                    <Badge variant={item.status === "done" ? "default" : item.status === "skipped" ? "secondary" : "outline"} className="text-xs">
                      {item.status === "pending" ? "À faire" : item.status === "done" ? "Fait" : item.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. OBJECTIFS | CHALLENGES (côte à côte) */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Objectifs */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="w-4 h-4" />
              Objectifs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {objProgress.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">Aucun objectif configuré</p>
            ) : (
              <div className="space-y-3">
                {objProgress.map((obj) => {
                  const pct = obj.progress_pct;
                  const barColor = pct >= 100 ? "bg-green-500" : pct >= 80 ? "bg-sora" : pct >= 50 ? "bg-kiku" : "bg-ume";
                  const unit = ["ca","margin_gross","margin_net","avg_basket","avg_ca_per_order"].includes(obj.metric) ? "€"
                    : obj.metric === "quantity_kg" ? "kg" : "";
                  const periodInfo = obj.period_type === "custom"
                    ? new Date(obj.period_start).toLocaleDateString("fr-FR", { month: "short", year: "numeric" })
                    : null;
                  return (
                    <div key={obj.id} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span className="text-sm font-medium truncate">{obj.metric_label}</span>
                          {periodInfo && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">{periodInfo}</Badge>
                          )}
                        </div>
                        <Badge variant={pct >= 100 ? "default" : "outline"} className={`text-[10px] shrink-0 ${pct >= 100 ? "bg-green-600" : ""}`}>{pct.toFixed(0)}%</Badge>
                      </div>
                      {obj.filter_tags && obj.filter_tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {obj.filter_tags.map((tag) => (
                            <span key={tag} className="text-[9px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{tag}</span>
                          ))}
                        </div>
                      )}
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>{obj.current_value.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} {unit}</span>
                        <span>/ {obj.target_value.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} {unit}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Challenges */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="w-4 h-4 text-kiku" />
              Challenges en cours
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeChallenges.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">Aucun challenge actif</p>
            ) : (
              <div className="space-y-3">
                {activeChallenges.map((ch) => {
                  const ranks = challengeRankings[ch.id] || [];
                  const daysLeft = Math.max(0, Math.ceil((new Date(ch.end_date).getTime() - Date.now()) / 86400000));
                  const myRank = ranks.find((r) => r.user_id === currentUser?.id);
                  const leader = ranks[0];

                  return (
                    <div key={ch.id} className="rounded-lg border overflow-hidden">
                      {/* En-tête challenge */}
                      <div className="bg-gradient-to-r from-kiku/10 via-sora/5 to-transparent p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Flame className="w-4 h-4 text-kiku shrink-0" />
                            <span className="text-sm font-bold truncate">{ch.name}</span>
                          </div>
                          <Badge variant="secondary" className="text-[10px] shrink-0 tabular-nums">{daysLeft}j</Badge>
                        </div>
                        {ch.reward && (
                          <div className="flex items-center gap-1.5 mt-1.5 ml-6">
                            <Gift className="w-3 h-3 text-ume" />
                            <span className="text-xs font-semibold text-ume">{ch.reward}</span>
                          </div>
                        )}
                        {ch.article_name && (
                          <p className="text-[11px] text-muted-foreground mt-1 ml-6">Produit : {ch.article_name}</p>
                        )}
                      </div>
                      {/* Podium compact */}
                      <div className="px-3 py-2">
                        {!(ch.id in challengeRankings) ? (
                          <p className="text-xs text-muted-foreground py-1">Chargement…</p>
                        ) : ranks.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-1">Pas encore de données</p>
                        ) : (
                          <div className="space-y-0.5">
                            {ranks.slice(0, 3).map((r) => {
                              const isMe = r.user_id === currentUser?.id;
                              const medals = ["🥇", "🥈", "🥉"];
                              return (
                                <div key={r.user_id} className={`flex items-center gap-2 py-1 px-1.5 rounded text-sm ${isMe ? "bg-kiku/8 font-semibold" : ""}`}>
                                  <span className="w-5 text-center text-xs">{medals[r.rank - 1]}</span>
                                  <span className="flex-1 truncate">{r.user_name}</span>
                                  <span className="font-mono text-xs tabular-nums">{r.current_value.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}</span>
                                  {r.progress_pct != null && (
                                    <span className={`text-[10px] font-mono w-9 text-right ${r.progress_pct >= 100 ? "text-green-600 font-bold" : "text-muted-foreground"}`}>{r.progress_pct.toFixed(0)}%</span>
                                  )}
                                </div>
                              );
                            })}
                            {myRank && myRank.rank > 3 && (
                              <div className="flex items-center gap-2 py-1 px-1.5 rounded bg-kiku/8 font-semibold text-sm border-t border-dashed mt-1 pt-1.5">
                                <span className="w-5 text-center text-[10px] font-bold text-muted-foreground">#{myRank.rank}</span>
                                <span className="flex-1 truncate">{myRank.user_name}</span>
                                <span className="font-mono text-xs tabular-nums">{myRank.current_value.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}</span>
                                {myRank.progress_pct != null && (
                                  <span className="text-[10px] font-mono w-9 text-right text-muted-foreground">{myRank.progress_pct.toFixed(0)}%</span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 5. TOP CLIENTS | TOP PRODUITS (côte à côte) */}
      <div className="grid lg:grid-cols-2 gap-4" key={`tops-${toISO(dateRange.from)}-${toISO(dateRange.to)}-${viewAs}`}>
        <TopListCard
          title="Top clients"
          icon={<Users className="w-4 h-4 text-sora" />}
          items={topClients}
          renderItem={(c, i) => (
            <Link
              key={c.client_id}
              href={`/clients/${c.client_id}`}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40 transition-colors"
            >
              <span className="w-5 text-center text-xs font-bold text-muted-foreground">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{c.client_name}</p>
                <p className="text-[11px] text-muted-foreground">{c.nb_orders} cmd · {c.nb_products} réf.</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold">{formatCurrency(c.total_ca)}</p>
                <p className="text-[11px] text-muted-foreground">Marge {formatCurrency(c.total_margin)}</p>
              </div>
            </Link>
          )}
        />

        <TopListCard
          title="Top produits"
          icon={<ShoppingCart className="w-4 h-4 text-sora" />}
          items={topProducts}
          renderItem={(p, i) => (
            <div
              key={p.article_ref}
              className="flex items-center gap-3 px-4 py-2.5"
            >
              <span className="w-5 text-center text-xs font-bold text-muted-foreground">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{p.designation || p.article_ref}</p>
                <p className="text-[11px] text-muted-foreground font-mono">{p.article_ref}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold">{formatCurrency(p.total_ca)}</p>
                <p className="text-[11px] text-muted-foreground">{p.total_qty.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} u. · {p.nb_clients} clients</p>
              </div>
            </div>
          )}
        />
      </div>

      {/* 6. GRAPHIQUE CA */}
      {myStats && myStats.monthly_ca.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Évolution CA mensuel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DashboardCAChart data={myStats.monthly_ca} targetCA={targetCA || undefined} />
          </CardContent>
        </Card>
      )}
      </>
      )}

      {/* Edit reminder dialog */}
      <Dialog open={!!editingReminder} onOpenChange={(open) => { if (!open) setEditingReminder(null); }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">Modifier le rappel</DialogTitle>
          </DialogHeader>
          {editingReminder && (
            <div className="space-y-3">
              <p className="text-sm font-medium">{editingReminder.client_name}</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Date</label>
                  <Input type="date" value={editReminderDate} onChange={(e) => setEditReminderDate(e.target.value)} min={new Date().toISOString().split("T")[0]} className="h-8 text-xs" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Heure</label>
                  <Input type="time" value={editReminderTime} onChange={(e) => setEditReminderTime(e.target.value)} className="h-8 text-xs" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Note</label>
                <Input value={editReminderNote} onChange={(e) => setEditReminderNote(e.target.value)} placeholder="Motif..." className="h-8 text-xs" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditingReminder(null)}>Annuler</Button>
                <Button size="sm" className="flex-1" disabled={savingReminder} onClick={async () => {
                  setSavingReminder(true);
                  try {
                    await api.updateReminder(editingReminder.id, {
                      target_date: editReminderDate,
                      target_time: editReminderTime || "",
                      reason_detail: editReminderNote,
                    });
                    setPlaylistReminders(prev => prev.map(r => r.id === editingReminder.id ? { ...r, generated_date: editReminderDate, reminder_time: editReminderTime || undefined, reason_detail: editReminderNote } : r));
                    toast.success("Rappel modifié");
                    setEditingReminder(null);
                  } catch { toast.error("Erreur"); }
                  setSavingReminder(false);
                }}>Enregistrer</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


function formatMonthShort(m: string): string {
  const months = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
  const [y, mo] = m.split("-");
  return `${months[parseInt(mo) - 1]} ${y.slice(2)}`;
}

function DashboardCAChart({
  data,
  targetCA,
}: {
  data: { month: string; ca: number; orders: number }[];
  targetCA?: number;
}) {
  const chartData = data.map((m) => ({
    month: formatMonthShort(m.month),
    ca: Math.round(m.ca * 100) / 100,
    orders: m.orders,
  }));

  const showBrush = chartData.length > 12;
  const startIndex = showBrush ? Math.max(chartData.length - 12, 0) : 0;

  return (
    <div className="w-full">
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 8, right: 8, left: -5, bottom: 0 }}
          >
            <defs>
              <linearGradient id="dashCaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8397A7" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#8397A7" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#E5E2DC"
              opacity={0.6}
              vertical={false}
            />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: "#9E9E9E" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#9E9E9E" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) =>
                v >= 1000 ? `${Math.round(v / 1000)}k€` : `${v}€`
              }
            />
            <RechartsTooltip
              contentStyle={{
                backgroundColor: "#FFFFFF",
                border: "1px solid #E5E2DC",
                borderRadius: "10px",
                fontSize: "13px",
                boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
              }}
              labelStyle={{ color: "#373C38", fontWeight: 600, marginBottom: 4 }}
              formatter={(value, name) => {
                if (name === "ca") return [formatCurrency(value as number), "CA HT"];
                return [value as number, "Commandes"];
              }}
            />
            {targetCA && targetCA > 0 && (
              <ReferenceLine
                y={targetCA}
                stroke="#DED28F"
                strokeWidth={2}
                strokeDasharray="6 4"
                label={{
                  value: `Objectif : ${formatCurrency(targetCA)}`,
                  position: "right",
                  fill: "#9E7A7A",
                  fontSize: 11,
                }}
              />
            )}
            <Area
              type="monotone"
              dataKey="ca"
              stroke="#8397A7"
              strokeWidth={2.5}
              fill="url(#dashCaGradient)"
              dot={false}
              activeDot={{
                r: 5,
                fill: "#8397A7",
                stroke: "#FFFFFF",
                strokeWidth: 2,
              }}
            />
            {showBrush && (
              <Brush
                dataKey="month"
                height={24}
                stroke="#E5E2DC"
                fill="#F9F8F5"
                travellerWidth={8}
                startIndex={startIndex}
                endIndex={chartData.length - 1}
                tickFormatter={() => ""}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}


const TOP_LIST_PAGE_SIZE = 5;

function TopListCard<T>({ title, icon, items, renderItem }: {
  title: string;
  icon: React.ReactNode;
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, TOP_LIST_PAGE_SIZE);
  const hasMore = items.length > TOP_LIST_PAGE_SIZE;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          {icon}
          {title}
          {items.length > 0 && (
            <span className="text-[10px] font-normal text-muted-foreground ml-auto">{items.length} résultats</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">Aucune donnée</p>
        ) : (
          <>
            <div className={expanded ? "max-h-[480px] overflow-y-auto scrollbar-thin" : ""}>
              <div className="divide-y">
                {visible.map((item, i) => renderItem(item, i))}
              </div>
            </div>
            {hasMore && (
              <div className="border-t px-4 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-7 text-xs text-muted-foreground hover:text-foreground"
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
                      Voir les {items.length} ({items.length - TOP_LIST_PAGE_SIZE} de plus)
                    </>
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}


type SortKey = "name" | "invoiced_ca" | "pipeline_ca" | "margin_rate" | "invoiced_orders" | "calls_total" | "answer_rate" | "total_talk_time" | "ai_overall" | "playlist_rate";

function AdminPilotingView({
  data,
  loading,
  topClients,
  topProducts,
}: {
  data: SalesDashboardResponse | null;
  loading: boolean;
  topClients: MyTopClient[];
  topProducts: MyTopProduct[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("invoiced_ca");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const sortedReps = useMemo(() => {
    if (!data) return [];
    const reps = [...data.reps];
    reps.sort((a, b) => {
      let va: number | string, vb: number | string;
      switch (sortKey) {
        case "name": va = a.name.toLowerCase(); vb = b.name.toLowerCase(); break;
        case "invoiced_ca": va = a.invoiced_ca; vb = b.invoiced_ca; break;
        case "pipeline_ca": va = a.pipeline_ca; vb = b.pipeline_ca; break;
        case "margin_rate": va = a.margin_rate; vb = b.margin_rate; break;
        case "invoiced_orders": va = a.invoiced_orders; vb = b.invoiced_orders; break;
        case "calls_total": va = a.calls_total; vb = b.calls_total; break;
        case "answer_rate": va = a.answer_rate; vb = b.answer_rate; break;
        case "total_talk_time": va = a.total_talk_time; vb = b.total_talk_time; break;
        case "ai_overall": va = a.ai_scores.overall; vb = b.ai_scores.overall; break;
        case "playlist_rate": va = a.playlist_rate; vb = b.playlist_rate; break;
        default: va = 0; vb = 0;
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return reps;
  }, [data, sortKey, sortDir]);

  const SortHeader = ({ label, k, className }: { label: string; k: SortKey; className?: string }) => (
    <th
      className={`px-3 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none transition-colors ${className || ""}`}
      onClick={() => handleSort(k)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === k ? (
          sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </span>
    </th>
  );

  const team = data?.team;
  const marginPct = team && team.total_invoiced_ca > 0 ? (team.total_invoiced_margin / team.total_invoiced_ca * 100) : 0;

  const rowBg = (rep: SalesRepStats) => {
    if (rep.target_progress != null && rep.target_progress >= 100) return "bg-green-50/60 dark:bg-green-950/20";
    if (rep.calls_total === 0 && rep.invoiced_ca === 0 && rep.pipeline_ca === 0) return "bg-red-50/40 dark:bg-red-950/15";
    return "";
  };

  const rateColor = (v: number, good: number, mid: number) =>
    v >= good ? "text-green-600 dark:text-green-400" : v >= mid ? "text-amber-600 dark:text-amber-400" : "text-red-500";

  if (loading && !data) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i}><CardContent className="p-6"><div className="h-16 bg-muted animate-pulse rounded" /></CardContent></Card>
        ))}
      </div>
    );
  }

  if (!data || !team) return null;

  return (
    <div className="space-y-5">
      {/* Section A: Team KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <CardContent className="pt-5 pb-4">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">CA Facturé</p>
            <p className="text-2xl font-extrabold mt-1">{formatCurrency(team.total_invoiced_ca)}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[11px] font-semibold text-sora bg-sora/10 px-1.5 py-0.5 rounded-full">
                Marge {marginPct.toFixed(1)}%
              </span>
              <span className="text-[11px] text-muted-foreground">{formatCurrency(team.total_invoiced_margin)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md border-kiku/20">
          <CardContent className="pt-5 pb-4">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Pipeline en cours</p>
            <p className="text-2xl font-extrabold mt-1">{formatCurrency(team.total_pipeline_ca)}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <Badge variant="outline" className="text-[10px] text-kiku border-kiku/30 h-5">
                <Package className="w-3 h-3 mr-1" />
                {team.total_pipeline_orders} BC/BL
              </Badge>
              <span className="text-[11px] text-muted-foreground">{team.total_invoiced_orders} factures</span>
            </div>
          </CardContent>
        </Card>

        <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <CardContent className="pt-5 pb-4">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Appels</p>
            <p className="text-2xl font-extrabold mt-1">{team.calls_answered} <span className="text-base font-bold text-muted-foreground">/ {team.calls_total}</span></p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${team.answer_rate >= 80 ? "text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30" : team.answer_rate >= 60 ? "text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30" : "text-red-500 bg-red-100 dark:text-red-400 dark:bg-red-900/30"}`}>
                {team.answer_rate}% décroché
              </span>
              <span className="text-[11px] text-muted-foreground">{formatDurationHM(team.total_talk_time)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <CardContent className="pt-5 pb-4">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Qualité</p>
            <p className="text-2xl font-extrabold mt-1">{team.avg_ai_score > 0 ? `${team.avg_ai_score}/10` : "—"}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[11px] text-muted-foreground">Qualif. {team.qualification_rate}%</span>
              <span className="text-[11px] text-muted-foreground">To do {team.playlist_rate}%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section B: Per-rep table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" />
            Performance par commercial
            <Badge variant="secondary" className="text-[10px] ml-1">{data.reps.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <SortHeader label="Commercial" k="name" className="text-left sticky left-0 bg-muted/30" />
                  <SortHeader label="CA Facturé" k="invoiced_ca" className="text-right" />
                  <SortHeader label="Pipeline" k="pipeline_ca" className="text-right" />
                  <SortHeader label="Marge" k="margin_rate" className="text-right" />
                  <SortHeader label="Factures" k="invoiced_orders" className="text-right" />
                  <SortHeader label="Appels" k="calls_total" className="text-right" />
                  <SortHeader label="Décroché" k="answer_rate" className="text-right" />
                  <SortHeader label="Temps tél." k="total_talk_time" className="text-right" />
                  <SortHeader label="Score IA" k="ai_overall" className="text-right" />
                  <SortHeader label="To do" k="playlist_rate" className="text-right" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {sortedReps.map((rep) => {
                  const targetPct = rep.target_progress ?? 0;
                  return (
                    <tr
                      key={rep.user_id}
                      className={`hover:bg-accent/40 transition-colors ${rowBg(rep)}`}
                    >
                      {/* Name */}
                      <td className="px-3 py-2.5 font-medium whitespace-nowrap sticky left-0 bg-background">
                        <div>
                          <span className="text-sm">{rep.name}</span>
                          {rep.portfolio.total > 0 && (
                            <p className="text-[10px] text-muted-foreground">
                              {rep.portfolio.active} actifs · {rep.portfolio.dormant} dormants
                            </p>
                          )}
                        </div>
                      </td>

                      {/* CA Facturé + target progress */}
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <p className="text-sm font-bold tabular-nums">{formatCurrency(rep.invoiced_ca)}</p>
                        {rep.target_ca != null && rep.target_ca > 0 && (
                          <div className="flex items-center gap-1.5 justify-end mt-0.5">
                            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${targetPct >= 100 ? "bg-green-500" : targetPct >= 70 ? "bg-sora" : targetPct >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                                style={{ width: `${Math.min(targetPct, 100)}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-muted-foreground tabular-nums">{targetPct.toFixed(0)}%</span>
                          </div>
                        )}
                      </td>

                      {/* Pipeline */}
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {rep.pipeline_ca > 0 ? (
                          <>
                            <p className="text-sm tabular-nums">{formatCurrency(rep.pipeline_ca)}</p>
                            <Badge variant="outline" className="text-[9px] h-4 px-1 text-kiku border-kiku/30 mt-0.5">
                              {rep.pipeline_orders} doc
                            </Badge>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Marge */}
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <span className={`text-sm font-semibold tabular-nums ${rateColor(rep.margin_rate, 25, 15)}`}>
                          {rep.invoiced_ca > 0 ? `${rep.margin_rate.toFixed(1)}%` : "—"}
                        </span>
                        {rep.invoiced_margin > 0 && (
                          <p className="text-[10px] text-muted-foreground tabular-nums">{formatCurrency(rep.invoiced_margin)}</p>
                        )}
                      </td>

                      {/* Factures */}
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {rep.invoiced_orders || "—"}
                      </td>

                      {/* Appels */}
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <p className="text-sm tabular-nums">{rep.calls_total}</p>
                        <p className="text-[10px] text-muted-foreground">
                          <span title="Sortants">{rep.calls_outbound}↑</span>
                          {" "}
                          <span title="Entrants">{rep.calls_inbound}↓</span>
                        </p>
                      </td>

                      {/* Taux décroché */}
                      <td className="px-3 py-2.5 text-right">
                        <span className={`text-sm font-semibold tabular-nums ${rateColor(rep.answer_rate, 80, 60)}`}>
                          {rep.calls_total > 0 ? `${rep.answer_rate}%` : "—"}
                        </span>
                      </td>

                      {/* Temps tel */}
                      <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums text-sm">
                        {rep.total_talk_time > 0 ? formatDurationHM(rep.total_talk_time) : "—"}
                      </td>

                      {/* Score IA */}
                      <td className="px-3 py-2.5 text-right">
                        {rep.ai_scores.overall > 0 ? (
                          <span className={`text-sm font-semibold tabular-nums ${rateColor(rep.ai_scores.overall, 7, 5)}`}>
                            {rep.ai_scores.overall}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* To do */}
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {rep.playlist_total > 0 ? (
                          <>
                            <span className={`text-sm font-semibold tabular-nums ${rateColor(rep.playlist_rate, 80, 50)}`}>
                              {rep.playlist_rate.toFixed(0)}%
                            </span>
                            <p className="text-[10px] text-muted-foreground tabular-nums">{rep.playlist_completed}/{rep.playlist_total}</p>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Totals footer */}
              <tfoot>
                <tr className="border-t-2 bg-muted/40 font-semibold">
                  <td className="px-3 py-2.5 text-sm sticky left-0 bg-muted/40">Total équipe</td>
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums">{formatCurrency(team.total_invoiced_ca)}</td>
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums">{formatCurrency(team.total_pipeline_ca)}</td>
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums">{marginPct.toFixed(1)}%</td>
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums">{team.total_invoiced_orders}</td>
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums">{team.calls_total}</td>
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums">{team.answer_rate}%</td>
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums">{formatDurationHM(team.total_talk_time)}</td>
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums">{team.avg_ai_score > 0 ? team.avg_ai_score : "—"}</td>
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums">{team.playlist_rate}%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Section C: Top clients / Top products */}
      <div className="grid lg:grid-cols-2 gap-4">
        <TopListCard
          title="Top clients"
          icon={<Users className="w-4 h-4 text-sora" />}
          items={topClients}
          renderItem={(c, i) => (
            <Link
              key={c.client_id}
              href={`/clients/${c.client_id}`}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40 transition-colors"
            >
              <span className="w-5 text-center text-xs font-bold text-muted-foreground">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{c.client_name}</p>
                <p className="text-[11px] text-muted-foreground">{c.nb_orders} cmd · {c.nb_products} réf.</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold">{formatCurrency(c.total_ca)}</p>
                <p className="text-[11px] text-muted-foreground">Marge {formatCurrency(c.total_margin)}</p>
              </div>
            </Link>
          )}
        />

        <TopListCard
          title="Top produits"
          icon={<ShoppingCart className="w-4 h-4 text-sora" />}
          items={topProducts}
          renderItem={(p, i) => (
            <div
              key={p.article_ref}
              className="flex items-center gap-3 px-4 py-2.5"
            >
              <span className="w-5 text-center text-xs font-bold text-muted-foreground">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{p.designation || p.article_ref}</p>
                <p className="text-[11px] text-muted-foreground font-mono">{p.article_ref}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold">{formatCurrency(p.total_ca)}</p>
                <p className="text-[11px] text-muted-foreground">{p.total_qty.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} u. · {p.nb_clients} clients</p>
              </div>
            </div>
          )}
        />
      </div>

    </div>
  );
}
