"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { api, CallStats, PlaylistItem, Reminder, MyStats, User, ObjectiveProgress, ChallengeEntry, ChallengeRankingEntry, MyMargins, MyTopProduct, MyTopClient } from "@/lib/api";
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
} from "lucide-react";
import Link from "next/link";
import { ClickToCall } from "@/components/click-to-call";
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

type DatePreset = "today" | "yesterday" | "7d" | "30d" | "90d" | "custom";

function toISO(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function presetLabel(p: DatePreset): string {
  switch (p) {
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
      return { from: addDays(today, -6), to: today };
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
  const [objProgress, setObjProgress] = useState<ObjectiveProgress[]>([]);
  const [activeChallenges, setActiveChallenges] = useState<ChallengeEntry[]>([]);
  const [challengeRankings, setChallengeRankings] = useState<Record<string, ChallengeRankingEntry[]>>({});
  const [margins, setMargins] = useState<MyMargins | null>(null);
  const [topProducts, setTopProducts] = useState<MyTopProduct[]>([]);
  const [topClients, setTopClients] = useState<MyTopClient[]>([]);

  const [preset, setPreset] = useState<DatePreset>("30d");
  const [dateRange, setDateRange] = useState(presetRange("30d"));
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

    const callParams = { ...params };
    const statsParams = { ...params };
    const marginParams = { ...params };
    if (viewAs === "me") {
      callParams.mine = "true";
    } else if (viewAs === "all") {
      marginParams.user_id = "all";
    } else {
      callParams.user_id = viewAs;
      statsParams.user_id = viewAs;
      marginParams.user_id = viewAs;
    }

    const rankParams: Record<string, string> = { ...params, limit: "5" };
    if (viewAs !== "me" && viewAs !== "all") {
      rankParams.user_id = viewAs;
    } else if (viewAs === "all") {
      rankParams.user_id = "all";
    }

    Promise.all([
      api.getCallStats(callParams),
      api.getMyStats(statsParams),
      api.getMyMargins(marginParams),
      api.getMyTopProducts(rankParams),
      api.getMyTopClients(rankParams),
    ])
      .then(([callStats, myStatsData, marginsData, prods, clients]) => {
        setStats(callStats);
        setMyStats(myStatsData);
        setMargins(marginsData);
        setTopProducts(prods);
        setTopClients(clients);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    const objUserId = viewAs !== "me" && viewAs !== "all" ? viewAs : currentUser?.id;
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

  const presets: DatePreset[] = ["today", "yesterday", "7d", "30d", "90d"];

  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "manager";
  const targetCA = myStats?.target?.monthly;
  const currentCA = myStats?.sales?.ca || 0;
  const caEvolution = myStats?.sales?.ca_evolution_pct || 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            {isAdmin && viewAs === "all" ? "Dashboard global" : "Mon tableau de bord"}
          </h2>
          <p className="text-muted-foreground text-xs sm:text-sm">
            {currentUser?.name} · {preset !== "custom"
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

      {/* 1. STATS : Business */}
      {myStats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-5 pb-4">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Chiffre d'affaires</p>
              <p className="text-2xl font-extrabold mt-1">{loading ? "…" : formatCurrency(currentCA)}</p>
              <div className="flex items-center gap-1.5 mt-2">
                {caEvolution !== 0 && (
                  <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${caEvolution > 0 ? "text-kiku bg-kiku/15" : "text-ume bg-ume/15"}`}>
                    {caEvolution > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {caEvolution > 0 ? "+" : ""}{caEvolution}%
                  </span>
                )}
              </div>
              {targetCA && targetCA > 0 && (
                <div className="mt-3">
                  <ProgressGauge value={currentCA} max={targetCA} label={`Obj. ${formatCurrency(targetCA)}`} />
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Commandes</p>
              <p className="text-2xl font-extrabold mt-1">{loading ? "…" : myStats.sales.orders}</p>
              <p className="text-[11px] text-muted-foreground mt-2">{myStats.sales.clients} clients actifs</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Panier moyen</p>
              <p className="text-2xl font-extrabold mt-1">{loading ? "…" : formatCurrency(myStats.sales.avg_basket)}</p>
              {margins && margins.total_weight_kg > 0 && (
                <p className="text-[11px] text-muted-foreground mt-2">CA/kg : {formatCurrency(margins.total_ca / margins.total_weight_kg)}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Volume vendu</p>
              <p className="text-2xl font-extrabold mt-1">
                {loading ? "…" : margins && margins.total_weight_kg > 0
                  ? `${margins.total_weight_kg.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} kg`
                  : "—"}
              </p>
              {margins && margins.total_weight_kg > 0 && (
                <p className="text-[11px] text-muted-foreground mt-2">{(margins.total_weight_kg / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} tonnes</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* 1b. STATS : Marges */}
      {margins && margins.total_ca > 0 && (() => {
        const netPositive = margins.total_margin_net >= 0;
        const deductions = margins.total_margin_gross - margins.total_margin_net;
        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-5 pb-4">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Marge brute</p>
                <p className="text-2xl font-extrabold mt-1">{loading ? "…" : formatCurrency(margins.total_margin_gross)}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[11px] font-semibold text-sora bg-sora/10 px-1.5 py-0.5 rounded-full">{margins.margin_gross_pct.toFixed(1)}%</span>
                  {margins.total_weight_kg > 0 && <span className="text-[11px] text-muted-foreground">{formatCurrency(margins.total_margin_gross / margins.total_weight_kg)}/kg</span>}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Marge nette</p>
                <p className={`text-2xl font-extrabold mt-1 ${netPositive ? "" : "text-ume"}`}>{loading ? "…" : formatCurrency(margins.total_margin_net)}</p>
                <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${netPositive ? "text-sora bg-sora/10" : "text-ume bg-ume/10"}`}>{margins.margin_net_pct.toFixed(1)}%</span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Déductions</p>
                <p className="text-2xl font-extrabold mt-1 text-ume">{loading ? "…" : formatCurrency(deductions)}</p>
                <p className="text-[11px] text-muted-foreground mt-2">Logistique · Structure · RFA</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Taux marge nette</p>
                <p className={`text-2xl font-extrabold mt-1 ${netPositive ? "" : "text-ume"}`}>{margins.margin_net_pct.toFixed(1)} <span className="text-base font-bold text-muted-foreground">%</span></p>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-3">
                  <div className={`h-full rounded-full transition-all ${netPositive ? "bg-sora" : "bg-ume"}`} style={{ width: `${Math.min(Math.abs(margins.margin_net_pct), 100)}%` }} />
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* 1c. STATS : Téléphonie */}
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
            </CardTitle>
          </CardHeader>
          <CardContent>
            {reminders.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">Aucun rappel</p>
            ) : (
              <div className="space-y-1.5">
                {reminders.map((r) => (
                  <div key={r.call_id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-accent transition-colors">
                    <div className="flex-1 min-w-0">
                      {r.client_id ? (
                        <Link href={`/clients/${r.client_id}`} className="text-sm font-medium hover:underline">{r.client_name || "Client"}</Link>
                      ) : (
                        <p className="text-sm font-medium">{r.contact_number || "Inconnu"}</p>
                      )}
                      <p className="text-xs text-muted-foreground">{r.next_step || r.outcome || "Rappel"} · {new Date(r.next_step_date).toLocaleDateString("fr-FR")}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {r.contact_e164 && <ClickToCall phoneNumber={r.contact_e164} />}
                      <Badge variant={new Date(r.next_step_date) <= new Date() ? "destructive" : "outline"} className="text-xs">
                        {new Date(r.next_step_date) <= new Date() ? "Aujourd'hui" : new Date(r.next_step_date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
            Playlist du jour
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
                  const barColor = pct >= 80 ? "bg-sora" : pct >= 50 ? "bg-kiku" : "bg-ume";
                  const unit = ["ca","margin_gross","margin_net","avg_basket","avg_ca_per_order"].includes(obj.metric) ? "€" : "";
                  return (
                    <div key={obj.id} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{obj.metric_label}</span>
                        <Badge variant={pct >= 100 ? "default" : "outline"} className="text-[10px]">{pct.toFixed(0)}%</Badge>
                      </div>
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
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-sora" />
              Top clients
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {topClients.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">Aucune donnée</p>
            ) : (
              <div className="divide-y">
                {topClients.map((c, i) => (
                  <Link key={c.client_id} href={`/clients/${c.client_id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40 transition-colors">
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
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-sora" />
              Top produits
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {topProducts.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">Aucune donnée</p>
            ) : (
              <div className="divide-y">
                {topProducts.map((p, i) => (
                  <div key={p.article_ref} className="flex items-center gap-3 px-4 py-2.5">
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
                ))}
              </div>
            )}
          </CardContent>
        </Card>
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
