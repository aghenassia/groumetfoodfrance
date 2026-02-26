"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, AdminDashboard, SyncLog } from "@/lib/api";
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
  Shield,
  RefreshCw,
  BarChart3,
  ListMusic,
  Users,
  Phone,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Database,
  Wifi,
  Clock,
  ServerCrash,
} from "lucide-react";
import { toast } from "sonner";

export default function AdminPage() {
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sageSyncing, setSageSyncing] = useState(false);
  const [sageTesting, setSageTesting] = useState(false);
  const [sageStatus, setSageStatus] = useState<{
    status: string;
    clients?: number;
    sales_lines?: number;
    error?: string;
  } | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);

  const fetchDashboard = () => {
    api
      .getAdminDashboard()
      .then(setDashboard)
      .catch(() => toast.error("Erreur de chargement"))
      .finally(() => setLoading(false));
  };

  const fetchLogs = () => {
    api.getSyncLogs().then(setSyncLogs).catch(() => {});
  };

  useEffect(() => {
    fetchDashboard();
    fetchLogs();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await api.syncRingover();
      toast.success(`${res.synced} appels synchronisés`);
      fetchDashboard();
      fetchLogs();
    } catch {
      toast.error("Erreur de synchronisation");
    } finally {
      setSyncing(false);
    }
  };

  const handleScoring = async () => {
    setScoring(true);
    try {
      const res = await api.runScoring();
      toast.success(`${res.clients_scored} clients scorés`);
    } catch {
      toast.error("Erreur de scoring");
    } finally {
      setScoring(false);
    }
  };

  const handlePlaylists = async () => {
    setGenerating(true);
    try {
      const res = await api.generatePlaylists();
      const entries = (res as Record<string, unknown>).total_entries || 0;
      toast.success(`${entries} entrées générées`);
    } catch {
      toast.error("Erreur de génération");
    } finally {
      setGenerating(false);
    }
  };

  const handleTestSage = async () => {
    setSageTesting(true);
    try {
      const res = await api.testSageConnection();
      setSageStatus(res);
      if (res.status === "connected") {
        toast.success(
          `Sage connecté : ${res.clients} clients, ${res.sales_lines} ventes`
        );
      } else {
        toast.error(`Sage erreur : ${res.error}`);
      }
    } catch {
      toast.error("Impossible de joindre Sage");
    } finally {
      setSageTesting(false);
    }
  };

  const handleSageFullSync = async () => {
    setSageSyncing(true);
    try {
      const res = await api.syncSageFull();
      toast.success(
        `Sage sync : ${res.clients.synced} clients, ${res.sales.synced} ventes`
      );
      fetchDashboard();
      fetchLogs();
    } catch {
      toast.error("Erreur sync Sage");
    } finally {
      setSageSyncing(false);
    }
  };

  const handleSageDeltaSync = async () => {
    setSageSyncing(true);
    try {
      const clients = await api.syncSageClients("delta");
      const sales = await api.syncSageSales("delta");
      toast.success(
        `Delta sync : ${clients.synced} clients, ${sales.synced} ventes modifiés`
      );
      fetchDashboard();
      fetchLogs();
    } catch {
      toast.error("Erreur delta sync Sage");
    } finally {
      setSageSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Chargement...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Shield className="w-6 h-6" />
          Administration
        </h2>
        <p className="text-muted-foreground">Tour de contrôle</p>
      </div>

      {/* Stats */}
      {dashboard && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">Clients</p>
                <Users className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold">{dashboard.total_clients}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">
                  Appels aujourd&apos;hui
                </p>
                <Phone className="w-4 h-4 text-sora" />
              </div>
              <p className="text-2xl font-bold">{dashboard.today.calls}</p>
              <p className="text-xs text-muted-foreground">
                {dashboard.today.answered} décrochés
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">Qualifiés auj.</p>
                <CheckCircle2 className="w-4 h-4 text-green-600" />
              </div>
              <p className="text-2xl font-bold">{dashboard.today.qualified}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">Risque churn</p>
                <AlertTriangle className="w-4 h-4 text-red-600" />
              </div>
              <p className="text-2xl font-bold">
                {dashboard.churn_risk_clients}
              </p>
              <p className="text-xs text-muted-foreground">clients à risque</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Separator />

      {/* Sage ODBC Section */}
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Database className="w-5 h-5 text-orange-600" />
          Sage 100 — Connexion ODBC
        </h3>
        <div className="grid sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-5 space-y-3">
              <div className="flex items-center gap-2">
                <Wifi className="w-4 h-4 text-sora" />
                <p className="text-sm font-medium">Test connexion</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Vérifier l&apos;accès au serveur Sage via Tailscale
              </p>
              {sageStatus && (
                <div className="text-xs space-y-1">
                  <Badge
                    variant={
                      sageStatus.status === "connected"
                        ? "default"
                        : "destructive"
                    }
                  >
                    {sageStatus.status === "connected"
                      ? "Connecté"
                      : "Erreur"}
                  </Badge>
                  {sageStatus.clients && (
                    <p className="text-muted-foreground">
                      {sageStatus.clients} clients · {sageStatus.sales_lines}{" "}
                      ventes
                    </p>
                  )}
                </div>
              )}
              <Button
                className="w-full"
                variant="outline"
                onClick={handleTestSage}
                disabled={sageTesting}
              >
                {sageTesting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Wifi className="w-4 h-4 mr-2" />
                )}
                Tester
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 space-y-3">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-orange-600" />
                <p className="text-sm font-medium">Full Sync</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Synchronisation complète : tous les clients + ventes
              </p>
              <Button
                className="w-full"
                variant="outline"
                onClick={handleSageFullSync}
                disabled={sageSyncing}
              >
                {sageSyncing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Database className="w-4 h-4 mr-2" />
                )}
                Full Sync
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-green-600" />
                <p className="text-sm font-medium">Delta Sync</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Uniquement les modifications depuis la dernière sync
              </p>
              <Button
                className="w-full"
                variant="outline"
                onClick={handleSageDeltaSync}
                disabled={sageSyncing}
              >
                {sageSyncing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Clock className="w-4 h-4 mr-2" />
                )}
                Delta Sync
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Separator />

      {/* Ringover + Scoring */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Actions</h3>
        <div className="grid sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-5 space-y-3">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-sora" />
                <p className="text-sm font-medium">Sync Ringover</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Récupérer les derniers appels + auto-transcription IA
              </p>
              <Button
                className="w-full"
                variant="outline"
                onClick={handleSync}
                disabled={syncing}
              >
                {syncing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Synchroniser
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 space-y-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-green-600" />
                <p className="text-sm font-medium">Scoring RFM</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Recalculer les scores churn, upsell et priorité
              </p>
              <Button
                className="w-full"
                variant="outline"
                onClick={handleScoring}
                disabled={scoring}
              >
                {scoring ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <BarChart3 className="w-4 h-4 mr-2" />
                )}
                Lancer le scoring
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 space-y-3">
              <div className="flex items-center gap-2">
                <ListMusic className="w-4 h-4 text-amber-600" />
                <p className="text-sm font-medium">Playlists</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Générer les playlists d&apos;appels du jour
              </p>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  variant="outline"
                  onClick={handlePlaylists}
                  disabled={generating}
                >
                  {generating ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <ListMusic className="w-4 h-4 mr-2" />
                  )}
                  Générer
                </Button>
                <Link href="/admin/playlists">
                  <Button variant="outline" className="w-full">
                    Configurer
                  </Button>
                </Link>
                <Link href="/admin/assignments">
                  <Button variant="outline" className="w-full">
                    Assigner
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Separator />

      {/* Sync Logs */}
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Historique des synchronisations
        </h3>
        {syncLogs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune sync enregistrée</p>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                    Source
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                    Type
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                    Statut
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">
                    Trouvés
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">
                    Traités
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">
                    Erreurs
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {syncLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-accent/50">
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-xs">
                        {log.source}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-xs">{log.sync_type}</td>
                    <td className="px-3 py-2">
                      <Badge
                        variant={
                          log.status === "completed"
                            ? "default"
                            : log.status === "error"
                              ? "destructive"
                              : "secondary"
                        }
                        className="text-xs"
                      >
                        {log.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      {log.records_found}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      {log.records_created}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      {log.records_errors > 0 ? (
                        <span className="text-red-600">{log.records_errors}</span>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(log.started_at).toLocaleString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
