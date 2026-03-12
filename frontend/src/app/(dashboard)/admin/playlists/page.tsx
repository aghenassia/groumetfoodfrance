"use client";

import { useEffect, useState, useCallback } from "react";
import {
  api,
  PlaylistConfigItem,
  PlaylistConfigPayload,
  PlaylistOverviewUser,
  PlaylistOverviewEntry,
  FilterOption,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ListMusic,
  Settings2,
  Play,
  Trash2,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Users,
  Percent,
  Hash,
  Briefcase,
  Eye,
  Plus,
  X,
  Search,
  Target,
  CheckCircle2,
  Clock,
  SkipForward,
  Phone,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

const REASON_LABELS: Record<string, { label: string; color: string }> = {
  callback: { label: "Rappels", color: "bg-sora/10 text-sora" },
  manual: { label: "Manuel", color: "bg-indigo-50 text-indigo-600" },
  dormant: { label: "Dormants", color: "bg-ume/10 text-ume" },
  churn_risk: { label: "Risque churn", color: "bg-red-50 text-red-600" },
  upsell: { label: "Upsell", color: "bg-green-50 text-green-600" },
  new_prospect: { label: "Prospects", color: "bg-amber-50 text-amber-600" },
  intel_target: { label: "Opé éclair", color: "bg-purple-50 text-purple-600" },
  relationship: { label: "Suivi", color: "bg-slate-50 text-slate-600" },
};

const STATUS_ICONS: Record<string, { icon: typeof CheckCircle2; color: string }> = {
  done: { icon: CheckCircle2, color: "text-green-500" },
  called: { icon: Phone, color: "text-green-500" },
  pending: { icon: Clock, color: "text-amber-500" },
  skipped: { icon: SkipForward, color: "text-slate-400" },
};

const DEFAULT_CONFIG: PlaylistConfigPayload = {
  is_active: true,
  total_size: 15,
  pct_callback: 10,
  pct_dormant: 35,
  pct_churn_risk: 25,
  pct_upsell: 25,
  pct_prospect: 15,
  dormant_min_days: 90,
  churn_min_score: 40,
  upsell_min_score: 30,
  client_scope: "own",
  sage_rep_filter: null,
  filter_mode: "disabled",
  filter_competitor_ids: [],
  filter_supplier_ids: [],
  filter_product_refs: [],
  filter_product_families: [],
};

const SCOPE_LABELS: Record<string, string> = {
  own: "Ses entreprises uniquement",
  own_and_unassigned: "Ses entreprises + non assignées",
  sage_rep: "Entreprises d'un rep Sage",
  unassigned: "Entreprises sans commercial",
  all: "Toutes (assignées + rep Sage)",
};

export default function AdminPlaylistsPage() {
  const [configs, setConfigs] = useState<PlaylistConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState<PlaylistConfigItem | null>(null);
  const [form, setForm] = useState<PlaylistConfigPayload>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [sageReps, setSageReps] = useState<string[]>([]);

  // Overview state
  const [overview, setOverview] = useState<PlaylistOverviewUser[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());

  // Add client dialog
  const [addClientForUser, setAddClientForUser] = useState<{ userId: string; userName: string } | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [clientResults, setClientResults] = useState<{ id: string; name: string; sage_id: string; city: string }[]>([]);
  const [searchingClients, setSearchingClients] = useState(false);

  // Filter options
  const [competitors, setCompetitors] = useState<FilterOption[]>([]);
  const [suppliers, setSuppliers] = useState<FilterOption[]>([]);
  const [productFamilies, setProductFamilies] = useState<FilterOption[]>([]);

  const fetchConfigs = useCallback(() => {
    setLoading(true);
    api
      .getPlaylistConfigs()
      .then(setConfigs)
      .catch(() => toast.error("Erreur chargement configs"))
      .finally(() => setLoading(false));
  }, []);

  const fetchOverview = useCallback(() => {
    setOverviewLoading(true);
    api
      .getPlaylistOverview()
      .then(setOverview)
      .catch(() => toast.error("Erreur chargement overview"))
      .finally(() => setOverviewLoading(false));
  }, []);

  useEffect(() => {
    fetchConfigs();
    fetchOverview();
    api.getSageReps().then(setSageReps).catch(() => {});
    api.getFilterCompetitors().then(setCompetitors).catch(() => {});
    api.getFilterSuppliers().then(setSuppliers).catch(() => {});
    api.getFilterProductFamilies().then(setProductFamilies).catch(() => {});
  }, [fetchConfigs, fetchOverview]);

  const openEdit = (item: PlaylistConfigItem) => {
    setEditUser(item);
    setForm({
      ...DEFAULT_CONFIG,
      ...item.config,
      filter_competitor_ids: item.config.filter_competitor_ids || [],
      filter_supplier_ids: item.config.filter_supplier_ids || [],
      filter_product_refs: item.config.filter_product_refs || [],
      filter_product_families: item.config.filter_product_families || [],
      filter_mode: item.config.filter_mode || "disabled",
    });
  };

  // pct_callback is informational only — not part of the editable %, sum of the 4 editable categories
  const editablePct = form.pct_dormant + form.pct_churn_risk + form.pct_upsell + form.pct_prospect;
  const totalPctForSave = form.pct_callback + editablePct;

  const handleSave = async () => {
    if (totalPctForSave !== 100) {
      toast.error(`Les pourcentages doivent totaliser 100% (actuellement ${totalPctForSave}%)`);
      return;
    }
    setSaving(true);
    try {
      await api.upsertPlaylistConfig(editUser!.user_id, form);
      toast.success(`Config sauvegardée pour ${editUser!.user_name}`);
      setEditUser(null);
      fetchConfigs();
    } catch {
      toast.error("Erreur de sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async (userId?: string) => {
    setGenerating(userId || "all");
    try {
      const result = await api.generatePlaylists(userId);
      const entries = (result as Record<string, unknown>).total_entries || (result as Record<string, unknown>).entries || 0;
      toast.success(`To Do générée : ${entries} entrées`);
      fetchConfigs();
      fetchOverview();
    } catch {
      toast.error("Erreur de génération");
    } finally {
      setGenerating(null);
    }
  };

  const handleClear = async (userId?: string) => {
    try {
      await api.clearPlaylistsToday(userId);
      toast.success("To Do du jour supprimées (rappels préservés)");
      fetchConfigs();
      fetchOverview();
    } catch {
      toast.error("Erreur de suppression");
    }
  };

  const handleDeleteEntries = async (entryIds: string[]) => {
    try {
      await api.deletePlaylistEntries(entryIds);
      toast.success(`${entryIds.length} entrée(s) supprimée(s)`);
      setSelectedEntries(new Set());
      fetchOverview();
      fetchConfigs();
    } catch {
      toast.error("Erreur de suppression");
    }
  };

  const handleSearchClients = async (search: string) => {
    setClientSearch(search);
    if (search.length < 2) { setClientResults([]); return; }
    setSearchingClients(true);
    try {
      const res = await api.searchClients(search);
      setClientResults(
        (res as { id: string; name: string; sage_id: string; city: string }[]).slice(0, 15)
      );
    } catch {
      setClientResults([]);
    } finally {
      setSearchingClients(false);
    }
  };

  const handleAddClient = async (clientId: string) => {
    if (!addClientForUser) return;
    try {
      const res = await api.adminAddPlaylistEntry(addClientForUser.userId, clientId);
      toast.success(`${res.client_name} ajouté à la To Do de ${addClientForUser.userName}`);
      fetchOverview();
      fetchConfigs();
    } catch (e) {
      toast.error((e as Error).message || "Erreur");
    }
  };

  const toggleEntrySelection = (id: string) => {
    setSelectedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pctSlots = (total: number, pct: number) => Math.round(total * pct / 100);

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <ListMusic className="w-5 h-5 sm:w-6 sm:h-6" />
              Gestion des To Do
            </h2>
            <p className="text-sm text-muted-foreground">
              Configurez, générez et supervisez les To Do de chaque commercial
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handleClear()} className="text-red-600">
            <Trash2 className="w-4 h-4 mr-1.5" />
            Vider tout
          </Button>
          <Button size="sm" onClick={() => handleGenerate()} disabled={generating === "all"}>
            <Play className="w-4 h-4 mr-1.5" />
            {generating === "all" ? "Génération..." : "Générer toutes"}
          </Button>
        </div>
      </div>

      {/* ── OVERVIEW: per-user progress ────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Eye className="w-4 h-4" />
            Avancement des To Do du jour
          </CardTitle>
        </CardHeader>
        <CardContent>
          {overviewLoading ? (
            <div className="text-center py-4 text-muted-foreground text-sm">Chargement...</div>
          ) : overview.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground text-sm">Aucune To Do générée aujourd&apos;hui</div>
          ) : (
            <div className="space-y-2">
              {overview.map((u) => {
                const isExpanded = expandedUser === u.user_id;
                return (
                  <div key={u.user_id} className="border rounded-lg">
                    {/* Summary row */}
                    <button
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left"
                      onClick={() => setExpandedUser(isExpanded ? null : u.user_id)}
                    >
                      <span className="font-medium text-sm flex-1">{u.user_name}</span>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-green-600 font-medium">{u.done} faits</span>
                        <span className="text-amber-600">{u.pending} en attente</span>
                        {u.skipped > 0 && <span className="text-slate-400">{u.skipped} skip</span>}
                        {u.reminders > 0 && <span className="text-sora">{u.reminders} rappels</span>}
                        <span className="font-bold">{u.completion_rate}%</span>
                      </div>
                      {/* Progress bar */}
                      <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full transition-all"
                          style={{ width: `${u.completion_rate}%` }}
                        />
                      </div>
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    {/* Expanded: entries table */}
                    {isExpanded && (
                      <div className="border-t px-4 py-3 space-y-2">
                        <div className="flex items-center gap-2 mb-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setAddClientForUser({ userId: u.user_id, userName: u.user_name });
                              setClientSearch("");
                              setClientResults([]);
                            }}
                          >
                            <Plus className="w-3.5 h-3.5 mr-1" />
                            Ajouter un client
                          </Button>
                          {selectedEntries.size > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600"
                              onClick={() => handleDeleteEntries(Array.from(selectedEntries))}
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-1" />
                              Supprimer ({selectedEntries.size})
                            </Button>
                          )}
                          <div className="ml-auto text-xs text-muted-foreground">
                            {u.total} entrées · dernière activité : {u.last_activity ? new Date(u.last_activity).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—"}
                          </div>
                        </div>

                        {u.entries.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-3">Aucune entrée</p>
                        ) : (
                          <div className="space-y-1">
                            {u.entries.map((entry) => {
                              const statusInfo = STATUS_ICONS[entry.status] || STATUS_ICONS.pending;
                              const StatusIcon = statusInfo.icon;
                              const reasonInfo = REASON_LABELS[entry.reason] || { label: entry.reason, color: "bg-slate-50 text-slate-600" };
                              return (
                                <div
                                  key={entry.id}
                                  className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm hover:bg-muted/50 ${
                                    selectedEntries.has(entry.id) ? "bg-red-50" : ""
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedEntries.has(entry.id)}
                                    onChange={() => toggleEntrySelection(entry.id)}
                                    className="rounded"
                                  />
                                  <StatusIcon className={`w-3.5 h-3.5 ${statusInfo.color} shrink-0`} />
                                  <span className="font-medium truncate max-w-[180px]">
                                    {entry.client_name || "—"}
                                  </span>
                                  {entry.city && (
                                    <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                                      {entry.city}
                                    </span>
                                  )}
                                  <Badge variant="outline" className={`${reasonInfo.color} border-transparent text-[10px] ml-auto shrink-0`}>
                                    {reasonInfo.label}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                    {entry.reason_detail}
                                  </span>
                                  {entry.called_at && (
                                    <span className="text-[10px] text-muted-foreground shrink-0">
                                      {new Date(entry.called_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-red-400 hover:text-red-600 shrink-0"
                                    onClick={() => handleDeleteEntries([entry.id])}
                                  >
                                    <X className="w-3 h-3" />
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── CONFIG: User cards ────────────────── */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Chargement...</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {configs.map((item) => {
            const cfg = item.config;
            return (
              <Card key={item.user_id} className={!cfg.is_active ? "opacity-50" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      {item.user_name}
                    </CardTitle>
                    <div className="flex items-center gap-1.5">
                      {item.today_playlist > 0 ? (
                        <Badge variant="outline" className="text-xs">
                          {item.today_done}/{item.today_playlist} fait
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Pas de To Do</Badge>
                      )}
                      <Badge variant={cfg.is_active ? "default" : "secondary"} className="text-xs">
                        {cfg.is_active ? "Actif" : "Inactif"}
                      </Badge>
                      {cfg.filter_mode !== "disabled" && (
                        <Badge variant="outline" className="text-xs bg-purple-50 text-purple-600 border-transparent">
                          <Target className="w-3 h-3 mr-1" />
                          Opé
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex rounded-full overflow-hidden h-3">
                    <div className="bg-sora transition-all" style={{ width: `${cfg.pct_callback}%` }} title={`Rappels ${cfg.pct_callback}%`} />
                    <div className="bg-ume transition-all" style={{ width: `${cfg.pct_dormant}%` }} title={`Dormants ${cfg.pct_dormant}%`} />
                    <div className="bg-red-400 transition-all" style={{ width: `${cfg.pct_churn_risk}%` }} title={`Churn ${cfg.pct_churn_risk}%`} />
                    <div className="bg-green-400 transition-all" style={{ width: `${cfg.pct_upsell}%` }} title={`Upsell ${cfg.pct_upsell}%`} />
                    <div className="bg-amber-400 transition-all" style={{ width: `${cfg.pct_prospect}%` }} title={`Prospects ${cfg.pct_prospect}%`} />
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs">
                    {[
                      { key: "callback", pct: cfg.pct_callback },
                      { key: "dormant", pct: cfg.pct_dormant },
                      { key: "churn_risk", pct: cfg.pct_churn_risk },
                      { key: "upsell", pct: cfg.pct_upsell },
                      { key: "prospect", pct: cfg.pct_prospect },
                    ].map(({ key, pct }) => {
                      const info = REASON_LABELS[key === "prospect" ? "new_prospect" : key] || REASON_LABELS[key] || { label: key, color: "" };
                      return (
                        <Badge key={key} variant="outline" className={`${info.color} border-transparent`}>
                          {info.label} {pct}% ({pctSlots(cfg.total_size, pct)})
                        </Badge>
                      );
                    })}
                  </div>

                  <div className="text-xs text-muted-foreground">
                    {cfg.total_size} clients/jour · Dormant {">"}{cfg.dormant_min_days}j · Churn {">"}{cfg.churn_min_score}% · Upsell {">"}{cfg.upsell_min_score}%
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Briefcase className="w-3 h-3" />
                    Périmètre : {SCOPE_LABELS[cfg.client_scope] || cfg.client_scope}
                    {cfg.client_scope === "sage_rep" && cfg.sage_rep_filter && (
                      <span className="font-mono text-foreground"> ({cfg.sage_rep_filter})</span>
                    )}
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(item)}>
                      <Settings2 className="w-3.5 h-3.5 mr-1.5" />
                      Configurer
                    </Button>
                    <Button size="sm" className="flex-1" onClick={() => handleGenerate(item.user_id)} disabled={generating === item.user_id}>
                      <Play className="w-3.5 h-3.5 mr-1.5" />
                      {generating === item.user_id ? "..." : "Générer"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Edit config dialog ────────────────── */}
      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5" />
              To Do — {editUser?.user_name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* Active + Total */}
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm font-medium">Actif</span>
              </label>
              <div className="flex items-center gap-2 ml-auto">
                <Label className="text-sm text-muted-foreground">
                  <Hash className="w-3.5 h-3.5 inline mr-1" />
                  Taille
                </Label>
                <Input
                  type="number"
                  value={form.total_size}
                  onChange={(e) => setForm({ ...form, total_size: parseInt(e.target.value) || 15 })}
                  className="w-20 h-9"
                  min={5}
                  max={50}
                />
              </div>
            </div>

            {/* Répartition % */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold flex items-center gap-1.5">
                  <Percent className="w-4 h-4" />
                  Répartition
                </h4>
                <span className={`text-sm font-bold ${totalPctForSave === 100 ? "text-green-600" : "text-red-600"}`}>
                  {totalPctForSave}%
                </span>
              </div>

              <div className="flex rounded-full overflow-hidden h-4 shadow-inner bg-muted">
                <div className="bg-sora transition-all" style={{ width: `${form.pct_callback}%` }} />
                <div className="bg-ume transition-all" style={{ width: `${form.pct_dormant}%` }} />
                <div className="bg-red-400 transition-all" style={{ width: `${form.pct_churn_risk}%` }} />
                <div className="bg-green-400 transition-all" style={{ width: `${form.pct_upsell}%` }} />
                <div className="bg-amber-400 transition-all" style={{ width: `${form.pct_prospect}%` }} />
              </div>

              {/* Rappels — read-only */}
              <div className="flex items-center gap-3 opacity-60">
                <div className="w-3 h-3 rounded-full bg-sora shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Rappels planifiés</span>
                    <span className="text-xs text-muted-foreground">(hors budget)</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Ajoutés automatiquement, non comptabilisés dans la taille</p>
                </div>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={form.pct_callback}
                    className="w-16 h-8 text-center"
                    disabled
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>

              {/* Editable categories */}
              {[
                { key: "pct_dormant", label: "Clients dormants", color: "bg-ume", desc: "Sans commande depuis longtemps" },
                { key: "pct_churn_risk", label: "Risque churn", color: "bg-red-400", desc: "Score de churn élevé" },
                { key: "pct_upsell", label: "Upsell", color: "bg-green-400", desc: "Potentiel de vente additionnelle" },
                { key: "pct_prospect", label: "Prospects", color: "bg-amber-400", desc: "Nouveaux clients / cibles intel" },
              ].map(({ key, label, color, desc }) => {
                const val = form[key as keyof PlaylistConfigPayload] as number;
                const slots = pctSlots(form.total_size, val);
                return (
                  <div key={key} className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${color} shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{label}</span>
                        <span className="text-xs text-muted-foreground">{slots} clients</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        value={val}
                        onChange={(e) => setForm({ ...form, [key]: parseInt(e.target.value) || 0 })}
                        className="w-16 h-8 text-center"
                        min={0}
                        max={100}
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Seuils */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Seuils</h4>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Dormant (jours)</Label>
                  <Input
                    type="number"
                    value={form.dormant_min_days}
                    onChange={(e) => setForm({ ...form, dormant_min_days: parseInt(e.target.value) || 90 })}
                    className="h-9 mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Churn min %</Label>
                  <Input
                    type="number"
                    value={form.churn_min_score}
                    onChange={(e) => setForm({ ...form, churn_min_score: parseInt(e.target.value) || 40 })}
                    className="h-9 mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Upsell min %</Label>
                  <Input
                    type="number"
                    value={form.upsell_min_score}
                    onChange={(e) => setForm({ ...form, upsell_min_score: parseInt(e.target.value) || 30 })}
                    className="h-9 mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Périmètre entreprises */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <Briefcase className="w-4 h-4" />
                Périmètre des entreprises
              </Label>
              <Select
                value={form.client_scope}
                onValueChange={(v) => setForm({ ...form, client_scope: v })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="own">Ses entreprises uniquement (assignées CRM)</SelectItem>
                  <SelectItem value="own_and_unassigned">Ses entreprises + entreprises non assignées</SelectItem>
                  <SelectItem value="sage_rep">Entreprises d&apos;un rep Sage spécifique</SelectItem>
                  <SelectItem value="unassigned">Entreprises sans commercial uniquement</SelectItem>
                  <SelectItem value="all">Toutes (assignées CRM + rep Sage)</SelectItem>
                </SelectContent>
              </Select>
              {form.client_scope === "sage_rep" && (
                <div>
                  <Label className="text-xs text-muted-foreground">Rep Sage</Label>
                  <Select
                    value={form.sage_rep_filter || ""}
                    onValueChange={(v) => setForm({ ...form, sage_rep_filter: v || null })}
                  >
                    <SelectTrigger className="h-9 mt-1">
                      <SelectValue placeholder="Sélectionner un rep Sage…" />
                    </SelectTrigger>
                    <SelectContent>
                      {sageReps.map((rep) => (
                        <SelectItem key={rep} value={rep}>{rep}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* ── Filtres Opé Éclair ────────────────── */}
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <Target className="w-4 h-4 text-purple-500" />
                  Opération éclair
                </Label>
              </div>
              <Select
                value={form.filter_mode}
                onValueChange={(v) => setForm({ ...form, filter_mode: v })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="disabled">Désactivé</SelectItem>
                  <SelectItem value="replace_prospects">Remplacer les prospects par cibles intel</SelectItem>
                  <SelectItem value="dedicated_pool">100% cibles intel (opé éclair totale)</SelectItem>
                </SelectContent>
              </Select>

              {form.filter_mode !== "disabled" && (
                <div className="space-y-3 pl-2 border-l-2 border-purple-200">
                  {/* Concurrents */}
                  {competitors.length > 0 && (
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Concurrents ciblés</Label>
                      <div className="flex flex-wrap gap-1 mb-1">
                        {form.filter_competitor_ids.map((id) => {
                          const c = competitors.find((x) => x.id === id);
                          return (
                            <Badge key={id} variant="outline" className="text-xs bg-purple-50">
                              {c?.name || id}
                              <button
                                className="ml-1"
                                onClick={() => setForm({ ...form, filter_competitor_ids: form.filter_competitor_ids.filter((x) => x !== id) })}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </Badge>
                          );
                        })}
                      </div>
                      <Select
                        value=""
                        onValueChange={(v) => {
                          if (v && !form.filter_competitor_ids.includes(v))
                            setForm({ ...form, filter_competitor_ids: [...form.filter_competitor_ids, v] });
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Ajouter un concurrent…" />
                        </SelectTrigger>
                        <SelectContent>
                          {competitors
                            .filter((c) => !form.filter_competitor_ids.includes(c.id!))
                            .map((c) => (
                              <SelectItem key={c.id} value={c.id!}>{c.name}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Fournisseurs */}
                  {suppliers.length > 0 && (
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Fournisseurs ciblés</Label>
                      <div className="flex flex-wrap gap-1 mb-1">
                        {form.filter_supplier_ids.map((id) => {
                          const s = suppliers.find((x) => x.id === id);
                          return (
                            <Badge key={id} variant="outline" className="text-xs bg-purple-50">
                              {s?.name || id}
                              <button
                                className="ml-1"
                                onClick={() => setForm({ ...form, filter_supplier_ids: form.filter_supplier_ids.filter((x) => x !== id) })}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </Badge>
                          );
                        })}
                      </div>
                      <Select
                        value=""
                        onValueChange={(v) => {
                          if (v && !form.filter_supplier_ids.includes(v))
                            setForm({ ...form, filter_supplier_ids: [...form.filter_supplier_ids, v] });
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Ajouter un fournisseur…" />
                        </SelectTrigger>
                        <SelectContent>
                          {suppliers
                            .filter((s) => !form.filter_supplier_ids.includes(s.id!))
                            .map((s) => (
                              <SelectItem key={s.id} value={s.id!}>{s.name}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Familles produit */}
                  {productFamilies.length > 0 && (
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Familles de produits</Label>
                      <div className="flex flex-wrap gap-1 mb-1">
                        {form.filter_product_families.map((f) => (
                          <Badge key={f} variant="outline" className="text-xs bg-purple-50" title={f}>
                            {productFamilies.find((pf) => pf.value === f)?.label || f}
                            <button
                              className="ml-1"
                              onClick={() => setForm({ ...form, filter_product_families: form.filter_product_families.filter((x) => x !== f) })}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                      <Select
                        value=""
                        onValueChange={(v) => {
                          if (v && !form.filter_product_families.includes(v))
                            setForm({ ...form, filter_product_families: [...form.filter_product_families, v] });
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Ajouter une famille…" />
                        </SelectTrigger>
                        <SelectContent>
                          {productFamilies
                            .filter((f) => !form.filter_product_families.includes(f.value!))
                            .map((f) => (
                              <SelectItem key={f.value} value={f.value!}>{f.label}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    <strong>Remplacer prospects :</strong> les slots Prospects sont remplis par les cibles intel au lieu du random habituel.{" "}
                    <strong>100% cibles intel :</strong> toute la To Do est alimentée par les filtres (opé éclair totale).
                    Les filtres sont cumulatifs : un client doit matcher au moins un filtre.
                  </p>
                </div>
              )}
            </div>

            <Button onClick={handleSave} disabled={saving || totalPctForSave !== 100} className="w-full">
              {saving ? "Enregistrement..." : "Sauvegarder la configuration"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Add client dialog ────────────────── */}
      <Dialog open={!!addClientForUser} onOpenChange={() => setAddClientForUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Ajouter un client — {addClientForUser?.userName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Rechercher par nom, ville, sage_id…"
                value={clientSearch}
                onChange={(e) => handleSearchClients(e.target.value)}
                className="pl-9"
              />
            </div>
            {searchingClients && <p className="text-xs text-muted-foreground text-center">Recherche...</p>}
            <div className="max-h-60 overflow-y-auto space-y-1">
              {clientResults.map((c) => (
                <button
                  key={c.id}
                  className="w-full text-left px-3 py-2 rounded hover:bg-muted/50 flex items-center justify-between text-sm"
                  onClick={() => {
                    handleAddClient(c.id);
                    setAddClientForUser(null);
                  }}
                >
                  <div>
                    <span className="font-medium">{c.name}</span>
                    {c.city && <span className="text-muted-foreground ml-2">{c.city}</span>}
                  </div>
                  {c.sage_id && <span className="text-xs text-muted-foreground font-mono">{c.sage_id}</span>}
                </button>
              ))}
              {clientSearch.length >= 2 && !searchingClients && clientResults.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">Aucun résultat</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
