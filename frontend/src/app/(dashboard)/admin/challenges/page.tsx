"use client";

import { useEffect, useState, useRef } from "react";
import { api, ChallengeEntry, ChallengeRankingEntry, ProductListItem } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Trophy,
  Plus,
  Pencil,
  Trash2,
  Medal,
  BarChart3,
  Calendar,
  Target,
  Loader2,
  Search,
  Package,
  X,
} from "lucide-react";
import { toast } from "sonner";

const METRIC_LABELS: Record<string, string> = {
  quantity_kg: "Quantité (kg)",
  quantity_units: "Quantité (unités)",
  ca: "Chiffre d'affaires (€)",
  margin_gross: "Marge brute (€)",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "Brouillon", color: "bg-muted text-muted-foreground" },
  active: { label: "En cours", color: "bg-green-100 text-green-700 border-green-300" },
  completed: { label: "Terminé", color: "bg-blue-100 text-blue-700 border-blue-300" },
};

export default function AdminChallengesPage() {
  const [challenges, setChallenges] = useState<ChallengeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    article_ref: "",
    article_name: "",
    metric: "quantity_kg",
    target_value: "",
    reward: "",
    start_date: new Date().toISOString().slice(0, 10),
    end_date: "",
    status: "draft",
  });

  const [rankingChallengeId, setRankingChallengeId] = useState<string | null>(null);
  const [rankings, setRankings] = useState<ChallengeRankingEntry[]>([]);
  const [loadingRanking, setLoadingRanking] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<ProductListItem[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [showProductResults, setShowProductResults] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (productSearch.trim().length < 2) {
      setProductResults([]);
      setShowProductResults(false);
      return;
    }
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearchingProducts(true);
      api.getProducts({ search: productSearch.trim(), limit: "10" })
        .then((res) => {
          setProductResults(res.products);
          setShowProductResults(true);
        })
        .catch(() => {})
        .finally(() => setSearchingProducts(false));
    }, 300);
    return () => clearTimeout(searchTimer.current);
  }, [productSearch]);

  const selectProduct = (p: ProductListItem) => {
    setForm({ ...form, article_ref: p.article_ref, article_name: p.designation || p.article_ref });
    setProductSearch("");
    setShowProductResults(false);
  };

  const clearProduct = () => {
    setForm({ ...form, article_ref: "", article_name: "" });
  };

  const fetchChallenges = () => {
    setLoading(true);
    api.getChallenges()
      .then(setChallenges)
      .catch(() => toast.error("Erreur de chargement"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchChallenges();
  }, []);

  const openNew = () => {
    setEditingId(null);
    setForm({
      name: "",
      description: "",
      article_ref: "",
      article_name: "",
      metric: "quantity_kg",
      target_value: "",
      reward: "",
      start_date: new Date().toISOString().slice(0, 10),
      end_date: "",
      status: "draft",
    });
    setDialogOpen(true);
  };

  const openEdit = (ch: ChallengeEntry) => {
    setEditingId(ch.id);
    setForm({
      name: ch.name,
      description: ch.description || "",
      article_ref: ch.article_ref || "",
      article_name: ch.article_name || "",
      metric: ch.metric,
      target_value: ch.target_value?.toString() || "",
      reward: ch.reward || "",
      start_date: ch.start_date,
      end_date: ch.end_date,
      status: ch.status,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.end_date) {
      toast.error("Nom et date de fin requis");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await api.updateChallenge(editingId, {
          name: form.name,
          description: form.description || undefined,
          target_value: form.target_value ? parseFloat(form.target_value) : undefined,
          reward: form.reward || undefined,
          status: form.status,
          end_date: form.end_date,
        });
        toast.success("Challenge mis à jour");
      } else {
        await api.createChallenge({
          name: form.name,
          description: form.description || undefined,
          article_ref: form.article_ref || undefined,
          article_name: form.article_name || undefined,
          metric: form.metric,
          target_value: form.target_value ? parseFloat(form.target_value) : undefined,
          reward: form.reward || undefined,
          start_date: form.start_date,
          end_date: form.end_date,
          status: form.status,
        });
        toast.success("Challenge créé");
      }
      setDialogOpen(false);
      fetchChallenges();
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce challenge ?")) return;
    try {
      await api.deleteChallenge(id);
      toast.success("Challenge supprimé");
      fetchChallenges();
    } catch {
      toast.error("Erreur");
    }
  };

  const openRanking = (id: string) => {
    setRankingChallengeId(id);
    setLoadingRanking(true);
    setRankings([]);
    api.getChallengeRanking(id)
      .then(setRankings)
      .catch(() => toast.error("Erreur calcul classement"))
      .finally(() => setLoadingRanking(false));
  };

  const rankingChallenge = challenges.find((c) => c.id === rankingChallengeId);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Trophy className="w-6 h-6" />
            Challenges commerciaux
          </h2>
          <p className="text-muted-foreground text-sm">
            Créez des compétitions entre commerciaux sur des produits ou objectifs spécifiques
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="w-4 h-4 mr-2" />
          Nouveau challenge
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Chargement…</div>
      ) : challenges.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Aucun challenge créé. Lancez votre première compétition !
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {challenges.map((ch) => {
            const st = STATUS_LABELS[ch.status] || STATUS_LABELS.draft;
            const isActive = ch.status === "active";
            const daysLeft = Math.max(0, Math.ceil((new Date(ch.end_date).getTime() - Date.now()) / 86400000));
            return (
              <Card key={ch.id} className={`transition-shadow ${isActive ? "shadow-md border-green-200" : ""}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">{ch.name}</CardTitle>
                      {ch.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{ch.description}</p>
                      )}
                    </div>
                    <Badge variant="outline" className={`shrink-0 ml-2 text-[10px] ${st.color}`}>
                      {st.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <BarChart3 className="w-3 h-3" />
                      {METRIC_LABELS[ch.metric] || ch.metric}
                    </span>
                    {ch.article_name && (
                      <span className="flex items-center gap-1">
                        <Target className="w-3 h-3" />
                        {ch.article_name}
                      </span>
                    )}
                    {ch.target_value && (
                      <span className="font-medium text-foreground">
                        Objectif : {ch.target_value.toLocaleString("fr-FR")}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    <span>{ch.start_date} → {ch.end_date}</span>
                    {isActive && (
                      <Badge variant="secondary" className="text-[10px] ml-auto">
                        {daysLeft}j restants
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 pt-1">
                    <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => openRanking(ch.id)}>
                      <Medal className="w-3.5 h-3.5 mr-1" />
                      Classement
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(ch)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => handleDelete(ch.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Modifier le challenge" : "Nouveau challenge"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nom du challenge *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Challenge Entrecôte Argentine" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optionnel" />
            </div>
            <div className="space-y-2">
              <Label>Récompense</Label>
              <Input value={form.reward} onChange={(e) => setForm({ ...form, reward: e.target.value })} placeholder="Ex: iPhone 16, Bon d'achat 200€, Week-end spa…" />
            </div>
            <div className="space-y-2">
              <Label>Produit (optionnel — filtre le challenge sur un article)</Label>
              {form.article_ref ? (
                <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/30">
                  <Package className="w-4 h-4 text-sora shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{form.article_name || form.article_ref}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{form.article_ref}</p>
                  </div>
                  {!editingId && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={clearProduct}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              ) : (
                <div className="relative">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Rechercher un produit par nom ou référence…"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      onFocus={() => productResults.length > 0 && setShowProductResults(true)}
                      onBlur={() => setTimeout(() => setShowProductResults(false), 200)}
                      className="pl-8 h-9"
                      disabled={!!editingId}
                    />
                    {searchingProducts && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                  </div>
                  {showProductResults && productResults.length > 0 && (
                    <div className="absolute z-50 top-full mt-1 left-0 right-0 border rounded-md bg-popover shadow-lg max-h-60 overflow-y-auto">
                      {productResults.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-accent/50 border-b last:border-b-0 flex items-center gap-2"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectProduct(p)}
                        >
                          <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">{p.designation || p.article_ref}</p>
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                              <span className="font-mono">{p.article_ref}</span>
                              {p.family && <span>· {p.family}</span>}
                              {p.weight && <span>· {p.weight} kg</span>}
                            </div>
                          </div>
                          {p.sale_price != null && (
                            <span className="text-xs font-mono text-muted-foreground shrink-0">{p.sale_price.toFixed(2)} €</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Métrique</Label>
                <Select value={form.metric} onValueChange={(v) => setForm({ ...form, metric: v })} disabled={!!editingId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(METRIC_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Objectif (optionnel)</Label>
                <Input type="number" value={form.target_value} onChange={(e) => setForm({ ...form, target_value: e.target.value })} placeholder="Ex: 500" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Date début</Label>
                <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} disabled={!!editingId} />
              </div>
              <div className="space-y-2">
                <Label>Date fin *</Label>
                <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Statut</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Brouillon</SelectItem>
                  <SelectItem value="active">En cours</SelectItem>
                  <SelectItem value="completed">Terminé</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? "Enregistrement…" : editingId ? "Mettre à jour" : "Créer le challenge"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ranking Dialog */}
      <Dialog open={!!rankingChallengeId} onOpenChange={() => setRankingChallengeId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Medal className="w-5 h-5 text-amber-500" />
              Classement — {rankingChallenge?.name}
            </DialogTitle>
          </DialogHeader>
          {loadingRanking ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Calcul en cours…
            </div>
          ) : rankings.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">Aucune donnée de vente pour ce challenge</p>
          ) : (
            <div className="space-y-2">
              {rankings.map((r) => {
                const medal = r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : `#${r.rank}`;
                const pct = r.progress_pct ?? 0;
                return (
                  <div key={r.user_id} className="flex items-center gap-3 p-3 rounded-lg border bg-background">
                    <span className="text-lg w-8 text-center shrink-0">{medal}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{r.user_name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-kiku to-sora rounded-full transition-all"
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono text-muted-foreground shrink-0">
                          {r.current_value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}
                        </span>
                      </div>
                    </div>
                    {pct > 0 && (
                      <Badge variant={pct >= 100 ? "default" : "outline"} className="text-[10px] shrink-0">
                        {pct.toFixed(0)}%
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
