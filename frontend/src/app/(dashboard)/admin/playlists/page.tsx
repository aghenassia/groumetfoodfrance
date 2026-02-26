"use client";

import { useEffect, useState } from "react";
import {
  api,
  PlaylistConfigItem,
  PlaylistConfigPayload,
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
  Users,
  Percent,
  Hash,
  Briefcase,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

const REASON_LABELS: Record<string, { label: string; color: string }> = {
  callback: { label: "Rappels", color: "bg-sora/10 text-sora" },
  dormant: { label: "Dormants", color: "bg-ume/10 text-ume" },
  churn_risk: { label: "Risque churn", color: "bg-red-50 text-red-600" },
  upsell: { label: "Upsell", color: "bg-green-50 text-green-600" },
  prospect: { label: "Prospects", color: "bg-amber-50 text-amber-600" },
};

const DEFAULT_CONFIG: PlaylistConfigPayload = {
  is_active: true,
  total_size: 15,
  pct_callback: 10,
  pct_dormant: 30,
  pct_churn_risk: 25,
  pct_upsell: 20,
  pct_prospect: 15,
  dormant_min_days: 90,
  churn_min_score: 40,
  upsell_min_score: 30,
  client_scope: "own",
  sage_rep_filter: null,
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

  const fetchConfigs = () => {
    setLoading(true);
    api
      .getPlaylistConfigs()
      .then(setConfigs)
      .catch(() => toast.error("Erreur chargement configs"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchConfigs();
    api.getSageReps().then(setSageReps).catch(() => {});
  }, []);

  const openEdit = (item: PlaylistConfigItem) => {
    setEditUser(item);
    setForm({ ...item.config });
  };

  const totalPct = form.pct_callback + form.pct_dormant + form.pct_churn_risk + form.pct_upsell + form.pct_prospect;

  const handleSave = async () => {
    if (totalPct !== 100) {
      toast.error(`Les pourcentages doivent totaliser 100% (actuellement ${totalPct}%)`);
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
      toast.success(`Playlist générée : ${entries} entrées`);
      fetchConfigs();
    } catch {
      toast.error("Erreur de génération");
    } finally {
      setGenerating(null);
    }
  };

  const handleClear = async (userId?: string) => {
    try {
      await api.clearPlaylistsToday(userId);
      toast.success("Playlists du jour supprimées");
      fetchConfigs();
    } catch {
      toast.error("Erreur de suppression");
    }
  };

  const pctSlots = (total: number, pct: number) => Math.round(total * pct / 100);

  return (
    <div className="space-y-6 max-w-5xl">
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
              Gestion des playlists
            </h2>
            <p className="text-sm text-muted-foreground">
              Configurez la répartition de la playlist pour chaque commercial
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleClear()}
            className="text-red-600"
          >
            <Trash2 className="w-4 h-4 mr-1.5" />
            Vider tout
          </Button>
          <Button
            size="sm"
            onClick={() => handleGenerate()}
            disabled={generating === "all"}
          >
            <Play className="w-4 h-4 mr-1.5" />
            {generating === "all" ? "Génération..." : "Générer toutes"}
          </Button>
        </div>
      </div>

      {/* User cards */}
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
                        <Badge variant="secondary" className="text-xs">
                          Pas de playlist
                        </Badge>
                      )}
                      <Badge
                        variant={cfg.is_active ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {cfg.is_active ? "Actif" : "Inactif"}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Répartition visuelle */}
                  <div className="flex rounded-full overflow-hidden h-3">
                    <div
                      className="bg-sora transition-all"
                      style={{ width: `${cfg.pct_callback}%` }}
                      title={`Rappels ${cfg.pct_callback}%`}
                    />
                    <div
                      className="bg-ume transition-all"
                      style={{ width: `${cfg.pct_dormant}%` }}
                      title={`Dormants ${cfg.pct_dormant}%`}
                    />
                    <div
                      className="bg-red-400 transition-all"
                      style={{ width: `${cfg.pct_churn_risk}%` }}
                      title={`Churn ${cfg.pct_churn_risk}%`}
                    />
                    <div
                      className="bg-green-400 transition-all"
                      style={{ width: `${cfg.pct_upsell}%` }}
                      title={`Upsell ${cfg.pct_upsell}%`}
                    />
                    <div
                      className="bg-amber-400 transition-all"
                      style={{ width: `${cfg.pct_prospect}%` }}
                      title={`Prospects ${cfg.pct_prospect}%`}
                    />
                  </div>

                  {/* Légende */}
                  <div className="flex flex-wrap gap-2 text-xs">
                    {Object.entries(REASON_LABELS).map(([key, { label, color }]) => {
                      const pctKey = `pct_${key}` as keyof PlaylistConfigPayload;
                      const pct = cfg[pctKey] as number;
                      const count = pctSlots(cfg.total_size, pct);
                      return (
                        <Badge key={key} variant="outline" className={`${color} border-transparent`}>
                          {label} {pct}% ({count})
                        </Badge>
                      );
                    })}
                  </div>

                  <div className="text-xs text-muted-foreground">
                    {cfg.total_size} clients/jour · Dormant {">"}
                    {cfg.dormant_min_days}j · Churn {">"}{cfg.churn_min_score}% · Upsell {">"}{cfg.upsell_min_score}%
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Briefcase className="w-3 h-3" />
                    Périmètre : {SCOPE_LABELS[cfg.client_scope] || cfg.client_scope}
                    {cfg.client_scope === "sage_rep" && cfg.sage_rep_filter && (
                      <span className="font-mono text-foreground"> ({cfg.sage_rep_filter})</span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => openEdit(item)}
                    >
                      <Settings2 className="w-3.5 h-3.5 mr-1.5" />
                      Configurer
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => handleGenerate(item.user_id)}
                      disabled={generating === item.user_id}
                    >
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

      {/* Edit dialog */}
      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5" />
              Playlist — {editUser?.user_name}
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
                <span className={`text-sm font-bold ${totalPct === 100 ? "text-green-600" : "text-red-600"}`}>
                  {totalPct}%
                </span>
              </div>

              {/* Barre preview */}
              <div className="flex rounded-full overflow-hidden h-4 shadow-inner bg-muted">
                <div className="bg-sora transition-all" style={{ width: `${form.pct_callback}%` }} />
                <div className="bg-ume transition-all" style={{ width: `${form.pct_dormant}%` }} />
                <div className="bg-red-400 transition-all" style={{ width: `${form.pct_churn_risk}%` }} />
                <div className="bg-green-400 transition-all" style={{ width: `${form.pct_upsell}%` }} />
                <div className="bg-amber-400 transition-all" style={{ width: `${form.pct_prospect}%` }} />
              </div>

              {[
                { key: "pct_callback", label: "Rappels planifiés", color: "bg-sora", desc: "Clients avec rappel prévu aujourd'hui" },
                { key: "pct_dormant", label: "Clients dormants", color: "bg-ume", desc: "Sans commande depuis longtemps" },
                { key: "pct_churn_risk", label: "Risque churn", color: "bg-red-400", desc: "Score de churn élevé" },
                { key: "pct_upsell", label: "Upsell", color: "bg-green-400", desc: "Potentiel de vente additionnelle" },
                { key: "pct_prospect", label: "Prospects", color: "bg-amber-400", desc: "Nouveaux clients à démarcher" },
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
                        onChange={(e) =>
                          setForm({ ...form, [key]: parseInt(e.target.value) || 0 })
                        }
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
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                <strong>Ses entreprises :</strong> uniquement les clients assignés au commercial dans le CRM.{" "}
                <strong>+ non assignées :</strong> ajoute les entreprises sans commercial attitré.{" "}
                <strong>Rep Sage :</strong> les clients du rep Sage sélectionné.{" "}
                <strong>Sans commercial :</strong> uniquement les entreprises sans assignation.{" "}
                <strong>Toutes :</strong> combine assignées CRM + rep Sage (le plus large).
              </p>
            </div>

            <Button onClick={handleSave} disabled={saving || totalPct !== 100} className="w-full">
              {saving ? "Enregistrement..." : "Sauvegarder la configuration"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
