"use client";

import { useEffect, useState } from "react";
import { api, MarginRule } from "@/lib/api";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calculator, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const CALC_LABELS: Record<string, string> = {
  per_kg: "€ / kg",
  percent_ca: "% du CA",
};

export default function AdminMarginsPage() {
  const [rules, setRules] = useState<MarginRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    calc_type: "per_kg",
    value: "",
    applies_to: "all",
    effective_from: new Date().toISOString().slice(0, 10),
    effective_to: "",
  });
  const [saving, setSaving] = useState(false);

  const fetchRules = () => {
    setLoading(true);
    api.getMarginRules(!showAll)
      .then(setRules)
      .catch(() => toast.error("Erreur de chargement"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRules();
  }, [showAll]);

  const openNew = () => {
    setEditingId(null);
    setForm({
      name: "",
      description: "",
      calc_type: "per_kg",
      value: "",
      applies_to: "all",
      effective_from: new Date().toISOString().slice(0, 10),
      effective_to: "",
    });
    setDialogOpen(true);
  };

  const openEdit = (r: MarginRule) => {
    setEditingId(r.id);
    setForm({
      name: r.name,
      description: r.description || "",
      calc_type: r.calc_type,
      value: String(r.value),
      applies_to: r.applies_to,
      effective_from: r.effective_from,
      effective_to: r.effective_to || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.value) {
      toast.error("Nom et valeur requis");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await api.updateMarginRule(editingId, {
          name: form.name,
          description: form.description || undefined,
          value: parseFloat(form.value),
          applies_to: form.applies_to,
          effective_to: form.effective_to || undefined,
        });
        toast.success("Règle mise à jour");
      } else {
        await api.createMarginRule({
          name: form.name,
          description: form.description || undefined,
          calc_type: form.calc_type,
          value: parseFloat(form.value),
          applies_to: form.applies_to,
          effective_from: form.effective_from,
          effective_to: form.effective_to || undefined,
        });
        toast.success("Règle créée");
      }
      setDialogOpen(false);
      fetchRules();
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Désactiver cette règle ?")) return;
    try {
      await api.deleteMarginRule(id);
      toast.success("Règle désactivée");
      fetchRules();
    } catch {
      toast.error("Erreur");
    }
  };

  const formatScope = (s: string) => {
    if (s === "all") return "Tous les clients";
    return s
      .split(",")
      .map((g) => g.replace("group:", "").trim())
      .map((g) => g.charAt(0).toUpperCase() + g.slice(1))
      .join(", ");
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Calculator className="w-6 h-6" />
            Règles de marge
          </h2>
          <p className="text-muted-foreground text-sm">
            Configurez les forfaits et déductions appliqués au calcul de la marge nette
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Actives seulement" : "Voir tout l'historique"}
          </Button>
          <Button onClick={openNew}>
            <Plus className="w-4 h-4 mr-2" />
            Nouvelle règle
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Formule marge nette = Marge brute − Σ déductions
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Chargement…</div>
          ) : rules.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Aucune règle configurée</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Valeur</TableHead>
                  <TableHead>S'applique à</TableHead>
                  <TableHead>Depuis</TableHead>
                  <TableHead>Jusqu'à</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((r) => {
                  const expired = r.effective_to && new Date(r.effective_to) < new Date();
                  return (
                    <TableRow key={r.id} className={expired ? "opacity-50" : ""}>
                      <TableCell>
                        <div>
                          <span className="font-medium text-sm">{r.name}</span>
                          {r.description && (
                            <span className="block text-[11px] text-muted-foreground">{r.description}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">
                          {CALC_LABELS[r.calc_type] || r.calc_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {r.calc_type === "per_kg"
                          ? `${r.value.toFixed(2)} €/kg`
                          : `${r.value.toFixed(2)} %`}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{formatScope(r.applies_to)}</span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.effective_from}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.effective_to || "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          {!expired && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(r.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Modifier la règle" : "Nouvelle règle de marge"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nom *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Forfait logistique" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optionnel" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type de calcul</Label>
                <Select value={form.calc_type} onValueChange={(v) => setForm({ ...form, calc_type: v })} disabled={!!editingId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="per_kg">€ par kg</SelectItem>
                    <SelectItem value="percent_ca">% du CA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Valeur *</Label>
                <div className="flex items-center gap-1">
                  <Input type="number" step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
                  <span className="text-xs text-muted-foreground shrink-0">
                    {form.calc_type === "per_kg" ? "€/kg" : "%"}
                  </span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>S'applique à</Label>
              <Input value={form.applies_to} onChange={(e) => setForm({ ...form, applies_to: e.target.value })} placeholder="all ou group:metro,group:csf" />
              <p className="text-[11px] text-muted-foreground">
                "all" = tous les clients. Sinon : group:metro, group:csf, group:promocash (séparés par des virgules)
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Date début</Label>
                <Input type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} disabled={!!editingId} />
              </div>
              <div className="space-y-2">
                <Label>Date fin (optionnel)</Label>
                <Input type="date" value={form.effective_to} onChange={(e) => setForm({ ...form, effective_to: e.target.value })} />
              </div>
            </div>
            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? "Enregistrement…" : editingId ? "Mettre à jour" : "Créer la règle"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
