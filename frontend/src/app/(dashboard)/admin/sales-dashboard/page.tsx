"use client";

import { useEffect, useState, useCallback } from "react";
import {
  api,
  SalesDashboardResponse,
  SalesRepStats,
  RepCallEntry,
} from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  BarChart3,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  TrendingUp,
  Target,
  CheckCircle2,
  Clock,
  Users,
  ChevronDown,
  ChevronUp,
  Play,
  Headphones,
  Star,
  ShieldCheck,
  MessageSquare,
  Loader2,
  ArrowUpDown,
  CalendarIcon,
  ListChecks,
} from "lucide-react";
import { toast } from "sonner";
import type { DateRange } from "react-day-picker";
import { fr } from "react-day-picker/locale";

type Period = "today" | "week" | "month" | "quarter" | "custom";
type SortKey =
  | "name"
  | "calls_total"
  | "calls_outbound"
  | "answer_rate"
  | "total_ca"
  | "total_orders"
  | "ai_overall"
  | "qualification_rate"
  | "target_progress"
  | "playlist_rate";

const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Aujourd'hui" },
  { key: "week", label: "Semaine" },
  { key: "month", label: "Mois" },
  { key: "quarter", label: "Trimestre" },
];

function fmtDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function performanceGrade(rep: SalesRepStats): {
  label: string;
  color: string;
  bg: string;
} {
  let score = 0;
  if (rep.calls_outbound >= 15) score += 2;
  else if (rep.calls_outbound >= 8) score += 1;
  if (rep.answer_rate >= 60) score += 1;
  if (rep.qualification_rate >= 50) score += 2;
  else if (rep.qualification_rate >= 30) score += 1;
  if (rep.playlist_rate >= 80) score += 2;
  else if (rep.playlist_rate >= 50) score += 1;
  if (rep.target_progress != null && rep.target_progress >= 80) score += 2;
  else if (rep.target_progress != null && rep.target_progress >= 50) score += 1;

  if (score >= 7)
    return { label: "A", color: "text-green-700", bg: "bg-green-100" };
  if (score >= 5)
    return { label: "B", color: "text-sora", bg: "bg-sora/10" };
  if (score >= 3)
    return { label: "C", color: "text-kiku", bg: "bg-kiku/10" };
  return { label: "D", color: "text-ume", bg: "bg-ume/10" };
}

function fmtDuration(seconds: number): string {
  if (!seconds) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h${m.toString().padStart(2, "0")}`;
  return `${m}m`;
}

function fmtCA(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toFixed(0);
}

function ScoreBar({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground w-16 truncate">
            {label}
          </span>
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${color}`}
              style={{ width: `${Math.min(value, 100)}%` }}
            />
          </div>
          <span className="text-[10px] font-mono w-7 text-right">
            {value > 0 ? value : "—"}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="left" className="text-xs">
        {label}: {value}/100
      </TooltipContent>
    </Tooltip>
  );
}

function MoodDots({
  moods,
}: {
  moods: { hot: number; neutral: number; cold: number };
}) {
  const total = moods.hot + moods.neutral + moods.cold;
  if (total === 0)
    return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {moods.hot > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-red-500 font-medium">{moods.hot}</span>
          </TooltipTrigger>
          <TooltipContent>Hot: {moods.hot}</TooltipContent>
        </Tooltip>
      )}
      {moods.neutral > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-muted-foreground">{moods.neutral}</span>
          </TooltipTrigger>
          <TooltipContent>Neutre: {moods.neutral}</TooltipContent>
        </Tooltip>
      )}
      {moods.cold > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-sora font-medium">{moods.cold}</span>
          </TooltipTrigger>
          <TooltipContent>Cold: {moods.cold}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

export default function SalesDashboardPage() {
  const [data, setData] = useState<SalesDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("month");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [expandedRep, setExpandedRep] = useState<string | null>(null);
  const [repCalls, setRepCalls] = useState<RepCallEntry[]>([]);
  const [callsLoading, setCallsLoading] = useState(false);
  const [selectedCall, setSelectedCall] = useState<RepCallEntry | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("total_ca");
  const [sortAsc, setSortAsc] = useState(false);

  const fetchData = useCallback(
    (p: Period, start?: string, end?: string) => {
      setLoading(true);
      api
        .getSalesDashboard(p, start, end)
        .then(setData)
        .catch(() => toast.error("Erreur de chargement"))
        .finally(() => setLoading(false));
    },
    []
  );

  useEffect(() => {
    if (period === "custom" && dateRange?.from && dateRange?.to) {
      fetchData("custom", fmtDate(dateRange.from), fmtDate(dateRange.to));
    } else if (period !== "custom") {
      fetchData(period);
    }
  }, [period, dateRange, fetchData]);

  const handlePeriod = (p: Period) => {
    setPeriod(p);
    if (p !== "custom") setDateRange(undefined);
  };

  const handleDateSelect = (range: DateRange | undefined) => {
    setDateRange(range);
    if (range?.from && range?.to) {
      setPeriod("custom");
      setCalendarOpen(false);
    }
  };

  const toggleExpand = async (rep: SalesRepStats) => {
    if (expandedRep === rep.user_id) {
      setExpandedRep(null);
      return;
    }
    setExpandedRep(rep.user_id);
    setCallsLoading(true);
    try {
      const start = data?.period.start;
      const end = data?.period.end;
      const calls = await api.getRepCalls(rep.user_id, start, end);
      setRepCalls(calls);
    } catch {
      toast.error("Erreur chargement appels");
    } finally {
      setCallsLoading(false);
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const sortedReps = data
    ? [...data.reps].sort((a, b) => {
        let va: number, vb: number;
        switch (sortKey) {
          case "name":
            return sortAsc
              ? a.name.localeCompare(b.name)
              : b.name.localeCompare(a.name);
          case "calls_total":
            va = a.calls_total;
            vb = b.calls_total;
            break;
          case "calls_outbound":
            va = a.calls_outbound;
            vb = b.calls_outbound;
            break;
          case "answer_rate":
            va = a.answer_rate;
            vb = b.answer_rate;
            break;
          case "total_ca":
            va = a.total_ca;
            vb = b.total_ca;
            break;
          case "total_orders":
            va = a.total_orders;
            vb = b.total_orders;
            break;
          case "ai_overall":
            va = a.ai_scores.overall;
            vb = b.ai_scores.overall;
            break;
          case "qualification_rate":
            va = a.qualification_rate;
            vb = b.qualification_rate;
            break;
          case "target_progress":
            va = a.target_progress ?? 0;
            vb = b.target_progress ?? 0;
            break;
          case "playlist_rate":
            va = a.playlist_rate;
            vb = b.playlist_rate;
            break;
          default:
            va = 0;
            vb = 0;
        }
        return sortAsc ? va - vb : vb - va;
      })
    : [];

  if (loading && !data) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Chargement...
      </div>
    );
  }

  if (!data) return null;

  const t = data.team;

  const SortHeader = ({
    k,
    label,
    className = "",
  }: {
    k: SortKey;
    label: string;
    className?: string;
  }) => (
    <th
      className={`px-2 py-2 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none ${className}`}
      onClick={() => handleSort(k)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {sortKey === k ? (
          sortAsc ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </span>
    </th>
  );

  return (
    <div className="space-y-6">
      {/* Header + Period selector + Date range picker */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6" />
            Pilotage Commercial
          </h2>
          <p className="text-muted-foreground text-sm">
            {new Date(data.period.start).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
            {" — "}
            {new Date(data.period.end).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
          </p>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1 h-6">
              <span className="underline underline-offset-2">Comment lire cette page ?</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 text-xs space-y-2" side="bottom" align="start">
            <p className="font-semibold text-sm text-foreground">Guide rapide</p>
            <p className="text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Filtres de période :</strong> choisissez
              Aujourd&apos;hui pour le bilan du jour, Semaine/Mois/Trimestre pour un recap,
              ou le calendrier pour une plage libre.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Cards du haut :</strong> vision
              d&apos;ensemble de l&apos;équipe — appels sortants/entrants, taux de décroché,
              CA, marge, complétion playlist, score IA moyen.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Note A/B/C/D :</strong> note composite
              de chaque commercial basée sur le volume d&apos;appels sortants, le taux de
              décroché, la qualification, la playlist et l&apos;atteinte d&apos;objectif.
              Permet d&apos;identifier en un coup d&apos;oeil qui performe et qui est en retard.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Colonnes triables :</strong> cliquez
              sur n&apos;importe quel en-tête pour trier (ascendant/descendant).
              Utile pour trouver le meilleur CA, le plus faible taux de qualification, etc.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Drill-down :</strong> cliquez sur
              une ligne pour voir le détail — scores IA sur 6 axes, portefeuille
              client, résultats de qualification, et la liste complète des appels.
              Cliquez sur un appel pour écouter l&apos;enregistrement et lire l&apos;analyse IA.
            </p>
          </PopoverContent>
        </Popover>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 bg-muted rounded-lg p-0.5">
            {PERIODS.map((p) => (
              <Button
                key={p.key}
                variant={period === p.key ? "default" : "ghost"}
                size="sm"
                className="text-xs h-7 px-3"
                onClick={() => handlePeriod(p.key)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant={period === "custom" ? "default" : "outline"}
                size="sm"
                className="text-xs h-7 px-3 gap-1.5"
              >
                <CalendarIcon className="w-3.5 h-3.5" />
                {period === "custom" && dateRange?.from && dateRange?.to
                  ? `${dateRange.from.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} - ${dateRange.to.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}`
                  : "Période"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={handleDateSelect}
                numberOfMonths={2}
                locale={fr}
                disabled={{ after: new Date() }}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Team summary cards - 2 rows */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Sortants
              </p>
              <PhoneOutgoing className="w-3.5 h-3.5 text-sora" />
            </div>
            <p className="text-xl font-bold">{t.calls_outbound}</p>
            <p className="text-[10px] text-muted-foreground">
              {t.calls_outbound_answered} décrochés
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Entrants
              </p>
              <PhoneIncoming className="w-3.5 h-3.5 text-green-600" />
            </div>
            <p className="text-xl font-bold">{t.calls_inbound}</p>
            <p className="text-[10px] text-muted-foreground">
              {t.calls_inbound_answered} décrochés
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Décroché
              </p>
              <Phone className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <p className="text-xl font-bold">{t.answer_rate}%</p>
            <p className="text-[10px] text-muted-foreground">
              {t.calls_answered}/{t.calls_total} appels
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Qualifiés
              </p>
              <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
            </div>
            <p className="text-xl font-bold">{t.calls_qualified}</p>
            <p className="text-[10px] text-muted-foreground">
              {t.qualification_rate}% de taux
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                CA
              </p>
              <TrendingUp className="w-3.5 h-3.5 text-sora" />
            </div>
            <p className="text-xl font-bold">{fmtCA(t.total_ca)}</p>
            <p className="text-[10px] text-muted-foreground">
              {t.total_orders} commandes
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Marge
              </p>
              <Target className="w-3.5 h-3.5 text-kiku" />
            </div>
            <p className="text-xl font-bold">{fmtCA(t.total_margin)}</p>
            <p className="text-[10px] text-muted-foreground">
              {t.total_ca > 0
                ? `${((t.total_margin / t.total_ca) * 100).toFixed(1)}%`
                : "—"}{" "}
              de taux
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Playlist
              </p>
              <ListChecks className="w-3.5 h-3.5 text-kiku" />
            </div>
            <p className="text-xl font-bold">
              {t.playlist_rate > 0 ? `${t.playlist_rate}%` : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {t.playlist_completed}/{t.playlist_total} traitées
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Score IA
              </p>
              <Star className="w-3.5 h-3.5 text-kiku" />
            </div>
            <p className="text-xl font-bold">
              {t.avg_ai_score > 0 ? t.avg_ai_score : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {t.calls_answered > 0
                ? `${fmtDuration(Math.round(t.total_talk_time / t.calls_answered))} moy/appel`
                : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Rep comparison table */}
      <div>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Users className="w-5 h-5" />
          Détail par commercial
        </h3>

        <div className="rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="w-8" />
                  <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-center w-8">
                    Note
                  </th>
                  <SortHeader k="name" label="Commercial" className="text-left" />
                  <SortHeader k="calls_outbound" label="Out" className="text-right" />
                  <SortHeader k="calls_total" label="In" className="text-right" />
                  <SortHeader k="answer_rate" label="Décr.%" className="text-right" />
                  <SortHeader k="total_ca" label="CA" className="text-right" />
                  <SortHeader k="total_orders" label="Cmd" className="text-right" />
                  <SortHeader k="target_progress" label="Obj." className="text-right" />
                  <SortHeader k="ai_overall" label="IA" className="text-right" />
                  <SortHeader k="qualification_rate" label="Qual.%" className="text-right" />
                  <SortHeader k="playlist_rate" label="Playlist" className="text-right" />
                  <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-center">
                    Humeurs
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sortedReps.map((rep) => (
                  <RepRow
                    key={rep.user_id}
                    rep={rep}
                    isExpanded={expandedRep === rep.user_id}
                    onToggle={() => toggleExpand(rep)}
                    calls={
                      expandedRep === rep.user_id ? repCalls : []
                    }
                    callsLoading={
                      expandedRep === rep.user_id && callsLoading
                    }
                    onSelectCall={setSelectedCall}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Call detail sheet */}
      <Sheet
        open={!!selectedCall}
        onOpenChange={() => setSelectedCall(null)}
      >
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Détail de l&apos;appel</SheetTitle>
          </SheetHeader>
          {selectedCall && <CallDetail call={selectedCall} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function RepRow({
  rep,
  isExpanded,
  onToggle,
  calls,
  callsLoading,
  onSelectCall,
}: {
  rep: SalesRepStats;
  isExpanded: boolean;
  onToggle: () => void;
  calls: RepCallEntry[];
  callsLoading: boolean;
  onSelectCall: (c: RepCallEntry) => void;
}) {
  const grade = performanceGrade(rep);

  return (
    <>
      <tr
        className="hover:bg-accent/50 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="px-2 py-2 text-center">
          {isExpanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </td>
        <td className="px-2 py-2 text-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${grade.bg} ${grade.color}`}
              >
                {grade.label}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Performance composite : appels sortants, taux décroché,
              qualification, playlist, objectif
            </TooltipContent>
          </Tooltip>
        </td>
        <td className="px-2 py-2 font-medium">{rep.name}</td>
        <td className="px-2 py-2 text-right tabular-nums">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="font-medium">{rep.calls_outbound}</span>
            </TooltipTrigger>
            <TooltipContent>
              {rep.calls_outbound_answered} décrochés sur {rep.calls_outbound} sortants
            </TooltipContent>
          </Tooltip>
        </td>
        <td className="px-2 py-2 text-right tabular-nums">
          <Tooltip>
            <TooltipTrigger asChild>
              <span>{rep.calls_inbound}</span>
            </TooltipTrigger>
            <TooltipContent>
              {rep.calls_inbound_answered} décrochés sur {rep.calls_inbound} entrants
            </TooltipContent>
          </Tooltip>
        </td>
        <td className="px-2 py-2 text-right tabular-nums">
          <span
            className={
              rep.answer_rate >= 70
                ? "text-green-600"
                : rep.answer_rate >= 50
                  ? "text-kiku"
                  : "text-ume"
            }
          >
            {rep.answer_rate}%
          </span>
        </td>
        <td className="px-2 py-2 text-right tabular-nums font-medium">
          {fmtCA(rep.total_ca)}
        </td>
        <td className="px-2 py-2 text-right tabular-nums">
          {rep.total_orders}
        </td>
        <td className="px-2 py-2 text-right tabular-nums">
          {rep.target_progress != null ? (
            <span
              className={
                rep.target_progress >= 100
                  ? "text-green-600 font-medium"
                  : rep.target_progress >= 70
                    ? "text-kiku"
                    : "text-ume"
              }
            >
              {rep.target_progress}%
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-2 py-2 text-right tabular-nums">
          {rep.ai_scores.overall > 0 ? (
            <span
              className={
                rep.ai_scores.overall >= 70
                  ? "text-green-600"
                  : rep.ai_scores.overall >= 50
                    ? "text-kiku"
                    : "text-ume"
              }
            >
              {rep.ai_scores.overall}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-2 py-2 text-right tabular-nums">
          {rep.qualification_rate}%
        </td>
        <td className="px-2 py-2 text-right tabular-nums">
          {rep.playlist_total > 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={
                    rep.playlist_rate >= 80
                      ? "text-green-600 font-medium"
                      : rep.playlist_rate >= 50
                        ? "text-kiku"
                        : "text-ume"
                  }
                >
                  {rep.playlist_completed}/{rep.playlist_total}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {rep.playlist_rate}% de la playlist traitée
              </TooltipContent>
            </Tooltip>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-2 py-2 text-center">
          <MoodDots moods={rep.moods} />
        </td>
      </tr>

      {/* Expanded detail */}
      {isExpanded && (
        <tr>
          <td colSpan={13} className="p-0">
            <div className="bg-accent/30 p-4 space-y-4 border-t">
              {/* Scores IA + Portfolio + Outcomes */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* AI Scores */}
                <Card>
                  <CardHeader className="pb-1 pt-3 px-3">
                    <CardTitle className="text-xs flex items-center gap-1.5">
                      <Star className="w-3.5 h-3.5 text-kiku" />
                      Scores IA
                      {rep.analyzed_calls > 0 && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] ml-auto"
                        >
                          {rep.analyzed_calls} analysés
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3 space-y-1">
                    <ScoreBar
                      value={rep.ai_scores.overall}
                      label="Global"
                      color="bg-kiku"
                    />
                    <ScoreBar
                      value={rep.ai_scores.politeness}
                      label="Politesse"
                      color="bg-sora"
                    />
                    <ScoreBar
                      value={rep.ai_scores.objection}
                      label="Objections"
                      color="bg-ume"
                    />
                    <ScoreBar
                      value={rep.ai_scores.closing}
                      label="Closing"
                      color="bg-green-500"
                    />
                    <ScoreBar
                      value={rep.ai_scores.product}
                      label="Produit"
                      color="bg-violet-500"
                    />
                    <ScoreBar
                      value={rep.ai_scores.listening}
                      label="Écoute"
                      color="bg-cyan-500"
                    />
                  </CardContent>
                </Card>

                {/* Portfolio */}
                <Card>
                  <CardHeader className="pb-1 pt-3 px-3">
                    <CardTitle className="text-xs flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-sora" />
                      Portefeuille
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total</span>
                        <span className="font-medium">
                          {rep.portfolio.total}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Actifs</span>
                        <span className="text-green-600 font-medium">
                          {rep.portfolio.active}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">À risque</span>
                        <span className="text-ume font-medium">
                          {rep.portfolio.at_risk}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Dormants</span>
                        <span className="font-medium">
                          {rep.portfolio.dormant}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Prospects/Leads
                        </span>
                        <span className="text-sora font-medium">
                          {rep.portfolio.prospects}
                        </span>
                      </div>
                      <Separator className="my-1" />
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Marge totale
                        </span>
                        <span className="font-medium">
                          {fmtCA(rep.total_margin)}{" "}
                          <span className="text-muted-foreground">
                            ({rep.margin_rate}%)
                          </span>
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Temps comm.
                        </span>
                        <span className="font-medium">
                          {fmtDuration(rep.total_talk_time)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Dur. moy/appel
                        </span>
                        <span className="font-medium">
                          {fmtDuration(rep.avg_call_duration)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Outcomes */}
                <Card>
                  <CardHeader className="pb-1 pt-3 px-3">
                    <CardTitle className="text-xs flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-ume" />
                      Résultats qualifications
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    <div className="space-y-1.5 text-xs">
                      {Object.entries(rep.outcomes).map(([key, val]) =>
                        val > 0 ? (
                          <div key={key} className="flex justify-between">
                            <span className="text-muted-foreground capitalize">
                              {key.replace("_", " ")}
                            </span>
                            <span className="font-medium">{val}</span>
                          </div>
                        ) : null
                      )}
                      {Object.values(rep.outcomes).every((v) => v === 0) && (
                        <p className="text-muted-foreground">
                          Aucune qualification
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Calls list */}
              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  <Headphones className="w-4 h-4" />
                  Derniers appels
                </h4>
                {callsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                ) : calls.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">
                    Aucun appel sur cette période
                  </p>
                ) : (
                  <div className="rounded border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">
                            Date
                          </th>
                          <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">
                            Contact
                          </th>
                          <th className="text-center px-2 py-1.5 font-medium text-muted-foreground">
                            Dir.
                          </th>
                          <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">
                            Durée
                          </th>
                          <th className="text-center px-2 py-1.5 font-medium text-muted-foreground">
                            Mood
                          </th>
                          <th className="text-center px-2 py-1.5 font-medium text-muted-foreground">
                            Résultat
                          </th>
                          <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">
                            Score IA
                          </th>
                          <th className="w-8" />
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {calls.slice(0, 50).map((call) => (
                          <tr
                            key={call.id}
                            className="hover:bg-accent/50 cursor-pointer"
                            onClick={() => onSelectCall(call)}
                          >
                            <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">
                              {new Date(call.start_time).toLocaleString(
                                "fr-FR",
                                {
                                  day: "2-digit",
                                  month: "2-digit",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }
                              )}
                            </td>
                            <td className="px-2 py-1.5 font-medium truncate max-w-[160px]">
                              {call.contact_name || call.contact_number || "—"}
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              {call.direction === "outbound" ? (
                                <PhoneOutgoing className="w-3 h-3 inline text-sora" />
                              ) : (
                                <PhoneIncoming className="w-3 h-3 inline text-green-600" />
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {call.is_answered
                                ? fmtDuration(call.incall_duration || 0)
                                : "—"}
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              {call.qualification ? (
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] px-1 py-0 ${
                                    call.qualification.mood === "hot"
                                      ? "text-red-500 border-red-200"
                                      : call.qualification.mood === "cold"
                                        ? "text-sora border-sora/30"
                                        : "text-muted-foreground"
                                  }`}
                                >
                                  {call.qualification.mood || "—"}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              {call.qualification?.outcome ? (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] px-1 py-0"
                                >
                                  {call.qualification.outcome}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {call.ai_scores ? (
                                <span
                                  className={
                                    call.ai_scores.overall >= 70
                                      ? "text-green-600 font-medium"
                                      : call.ai_scores.overall >= 50
                                        ? "text-kiku"
                                        : "text-ume"
                                  }
                                >
                                  {call.ai_scores.overall}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5">
                              {call.record_url && (
                                <Play className="w-3 h-3 text-muted-foreground" />
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function CallDetail({ call }: { call: RepCallEntry }) {
  const ai = call.ai_scores;
  const qual = call.qualification;

  return (
    <div className="space-y-5 mt-4">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          {call.direction === "outbound" ? (
            <PhoneOutgoing className="w-4 h-4 text-sora" />
          ) : (
            <PhoneIncoming className="w-4 h-4 text-green-600" />
          )}
          <span className="font-medium">
            {call.contact_name || call.contact_number || "Inconnu"}
          </span>
          {call.is_answered ? (
            <Badge variant="outline" className="text-[10px] text-green-600 border-green-200">
              Décroché
            </Badge>
          ) : call.direction === "outbound" || call.direction === "out" || call.direction === "OUT" ? (
            <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-300/30">
              Sans réponse
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] text-ume border-ume/30">
              Manqué
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {new Date(call.start_time).toLocaleString("fr-FR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
          })}
          {call.incall_duration
            ? ` — ${fmtDuration(call.incall_duration)}`
            : ""}
        </p>
      </div>

      {call.record_url && (
        <div>
          <audio controls className="w-full h-8" src={call.record_url}>
            <track kind="captions" />
          </audio>
        </div>
      )}

      <Separator />

      {/* Qualification */}
      {qual && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Qualification</h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">Humeur</span>
              <p className="font-medium capitalize">{qual.mood || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Résultat</span>
              <p className="font-medium capitalize">
                {qual.outcome?.replace("_", " ") || "—"}
              </p>
            </div>
          </div>
          {qual.notes && (
            <div className="text-xs">
              <span className="text-muted-foreground">Notes</span>
              <p className="mt-0.5 p-2 bg-muted/50 rounded text-foreground">
                {qual.notes}
              </p>
            </div>
          )}
          {qual.next_step && (
            <div className="text-xs">
              <span className="text-muted-foreground">Prochaine étape</span>
              <p className="font-medium">
                {qual.next_step}
                {qual.next_step_date && (
                  <span className="text-muted-foreground ml-1">
                    (
                    {new Date(qual.next_step_date).toLocaleDateString("fr-FR")}
                    )
                  </span>
                )}
              </p>
            </div>
          )}
          {qual.tags && qual.tags.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {qual.tags.map((t) => (
                <Badge key={t} variant="secondary" className="text-[10px]">
                  {t}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {!qual && (
        <p className="text-xs text-muted-foreground italic">
          Appel non qualifié
        </p>
      )}

      <Separator />

      {/* AI Analysis */}
      {ai ? (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-1.5">
            <Star className="w-4 h-4 text-kiku" />
            Analyse IA
            <Badge variant="outline" className="text-[10px] ml-auto font-mono">
              {ai.overall}/100
            </Badge>
          </h4>

          <div className="space-y-1.5">
            <ScoreBar
              value={ai.politeness}
              label="Politesse"
              color="bg-sora"
            />
            <ScoreBar
              value={ai.objection}
              label="Objections"
              color="bg-ume"
            />
            <ScoreBar
              value={ai.closing}
              label="Closing"
              color="bg-green-500"
            />
            <ScoreBar
              value={ai.product}
              label="Produit"
              color="bg-violet-500"
            />
            <ScoreBar
              value={ai.listening}
              label="Écoute"
              color="bg-cyan-500"
            />
          </div>

          {ai.summary && (
            <div className="text-xs">
              <span className="text-muted-foreground font-medium">Résumé</span>
              <p className="mt-1 p-2 bg-muted/50 rounded leading-relaxed">
                {ai.summary}
              </p>
            </div>
          )}

          {ai.feedback && (
            <div className="text-xs">
              <span className="text-muted-foreground font-medium">
                Feedback commercial
              </span>
              <p className="mt-1 p-2 bg-sora/5 border border-sora/20 rounded leading-relaxed">
                {ai.feedback}
              </p>
            </div>
          )}

          {ai.sentiment && (
            <div className="text-xs flex items-center gap-2">
              <span className="text-muted-foreground">Sentiment client :</span>
              <Badge variant="outline" className="text-[10px] capitalize">
                {ai.sentiment}
              </Badge>
            </div>
          )}

          {ai.opportunities && (
            <div className="text-xs">
              <span className="text-muted-foreground font-medium">
                Opportunités détectées
              </span>
              <p className="mt-1 p-2 bg-kiku/5 border border-kiku/20 rounded leading-relaxed">
                {ai.opportunities}
              </p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          Pas d&apos;analyse IA disponible
        </p>
      )}
    </div>
  );
}
