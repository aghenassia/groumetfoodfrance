"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Clock,
  LogIn,
  CalendarDays,
  Users as UsersIcon,
  Download,
  Loader2,
  ShieldOff,
} from "lucide-react";
import { api, UsageAnalyticsResponse, UsageAnalyticsUser } from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { toast } from "sonner";

type Period = "7d" | "30d" | "90d" | "all";

const PERIOD_LABEL: Record<Period, string> = {
  "7d": "7 derniers jours",
  "30d": "30 derniers jours",
  "90d": "90 derniers jours",
  "all": "Depuis toujours",
};

function formatMinutes(total: number): string {
  if (!total) return "0 min";
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m.toString().padStart(2, "0")}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelative(iso: string | null): string {
  if (!iso) return "Jamais";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "À l'instant";
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Il y a ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `Il y a ${diffD}j`;
  return formatDate(iso);
}

export default function UsageAnalyticsPage() {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<UsageAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getUsageAnalytics(period)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setForbidden(false);
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = String(e?.message || "");
        if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
          setForbidden(true);
        } else {
          toast.error("Erreur de chargement");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  const stats = useMemo(() => {
    if (!data) return null;
    const users = data.users;
    const totalUsers = users.length;
    const activeUsers = users.filter((u) => u.total_logins > 0).length;
    const totalLogins = users.reduce((s, u) => s + u.total_logins, 0);
    const totalMinutes = users.reduce((s, u) => s + u.total_minutes, 0);
    return { totalUsers, activeUsers, totalLogins, totalMinutes };
  }, [data]);

  const handleExportCsv = () => {
    if (!data) return;
    const rows = [
      [
        "Nom",
        "Email",
        "Rôle",
        "Connexions",
        "Sessions",
        "Jours actifs",
        "Temps total (min)",
        "Première connexion",
        "Dernière connexion",
        "Dernière activité",
      ],
      ...data.users.map((u) => [
        u.name,
        u.email,
        u.role,
        u.total_logins,
        u.total_sessions,
        u.days_active,
        u.total_minutes,
        u.first_login_at ?? "",
        u.last_login_at ?? "",
        u.last_active_at ?? "",
      ]),
    ];
    const csv = rows
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `usage-analytics-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (forbidden) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center space-y-4">
        <ShieldOff className="w-12 h-12 mx-auto text-muted-foreground" />
        <h1 className="text-xl font-semibold">Page introuvable</h1>
        <p className="text-sm text-muted-foreground">
          Cette page n'existe pas ou vous n'y avez pas accès.
        </p>
        <Button variant="outline" onClick={() => router.push("/")}>
          Retour au dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="w-6 h-6" />
            Usage du CRM
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Statistiques d'utilisation par utilisateur — connexions, temps passé, jours actifs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
                <SelectItem key={p} value={p}>
                  {PERIOD_LABEL[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={!data}>
            <Download className="w-4 h-4 mr-1.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Cartes synthèse */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <UsersIcon className="w-3.5 h-3.5" />
              Utilisateurs actifs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats ? `${stats.activeUsers} / ${stats.totalUsers}` : "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              avec ≥ 1 connexion sur la période
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <LogIn className="w-3.5 h-3.5" />
              Connexions totales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalLogins ?? "—"}</div>
            <p className="text-xs text-muted-foreground mt-1">sur {PERIOD_LABEL[period].toLowerCase()}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Temps total cumulé
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats ? formatMinutes(stats.totalMinutes) : "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">tous utilisateurs confondus</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" />
              Moyenne par user actif
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats && stats.activeUsers > 0
                ? formatMinutes(Math.round(stats.totalMinutes / stats.activeUsers))
                : "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">de temps actif sur la période</p>
          </CardContent>
        </Card>
      </div>

      {/* Tableau détaillé */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Détail par utilisateur</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Chargement...
            </div>
          ) : !data || data.users.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Aucune donnée disponible.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Utilisateur</TableHead>
                    <TableHead>Rôle</TableHead>
                    <TableHead className="text-right">Connexions</TableHead>
                    <TableHead className="text-right">Sessions</TableHead>
                    <TableHead className="text-right">Jours actifs</TableHead>
                    <TableHead className="text-right">Temps total</TableHead>
                    <TableHead>Dernière connexion</TableHead>
                    <TableHead>Dernière activité</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.users.map((u) => (
                    <UserRow key={u.user_id} u={u} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        Les données d'activité sont enregistrées via heartbeat toutes les 60 secondes
        lorsque l'onglet du CRM est ouvert et actif. Données mises à jour en temps réel.
      </p>
    </div>
  );
}

function UserRow({ u }: { u: UsageAnalyticsUser }) {
  const isInactive = u.total_logins === 0;
  return (
    <TableRow className={isInactive ? "opacity-60" : ""}>
      <TableCell>
        <div className="font-medium flex items-center gap-2">
          {u.name}
          {u.is_shadow && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              shadow
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">{u.email}</div>
      </TableCell>
      <TableCell>
        <Badge variant={u.role === "admin" ? "default" : "secondary"} className="text-xs">
          {u.role}
        </Badge>
      </TableCell>
      <TableCell className="text-right font-mono">{u.total_logins}</TableCell>
      <TableCell className="text-right font-mono">{u.total_sessions}</TableCell>
      <TableCell className="text-right font-mono">{u.days_active}</TableCell>
      <TableCell className="text-right font-mono font-semibold">
        {formatMinutes(u.total_minutes)}
      </TableCell>
      <TableCell className="text-xs">{formatDate(u.last_login_at)}</TableCell>
      <TableCell className="text-xs">{formatRelative(u.last_active_at)}</TableCell>
    </TableRow>
  );
}
