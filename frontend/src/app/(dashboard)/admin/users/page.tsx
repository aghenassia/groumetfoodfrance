"use client";

import { useEffect, useState } from "react";
import {
  api,
  UserDetail,
  CreateUserPayload,
  RingoverMember,
  SageCollaborateur,
  UserObjective,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Users,
  Plus,
  Edit,
  Phone,
  Building2,
  Target,
  Power,
  ChevronLeft,
  Shield,
  UserCog,
  Trash2,
} from "lucide-react";
import Link from "next/link";

function formatCurrency(v: number): string {
  if (!v) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v);
}

interface UserFormData {
  name: string;
  email: string;
  password: string;
  role: string;
  ringover_user_id: string;
  ringover_number: string;
  ringover_email: string;
  sage_collaborator_id: string;
  sage_rep_name: string;
  phone: string;
}

const emptyForm: UserFormData = {
  name: "",
  email: "",
  password: "",
  role: "sales",
  ringover_user_id: "",
  ringover_number: "",
  ringover_email: "",
  sage_collaborator_id: "",
  sage_rep_name: "",
  phone: "",
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<UserFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ringoverLines, setRingoverLines] = useState<RingoverMember[]>([]);
  const [sageCollabs, setSageCollabs] = useState<SageCollaborateur[]>([]);
  const [objectives, setObjectives] = useState<UserObjective[]>([]);
  const [metrics, setMetrics] = useState<{ key: string; label: string }[]>([]);
  const [objDialogOpen, setObjDialogOpen] = useState(false);
  const [objForm, setObjForm] = useState({ metric: "ca", period_type: "monthly", target_value: "" });
  const [objUserId, setObjUserId] = useState<string | null>(null);
  const [savingObj, setSavingObj] = useState(false);

  const fetchUsers = () => {
    setLoading(true);
    api
      .getUsers()
      .then(setUsers)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const loadExternalData = () => {
    api.getRingoverLines().then((data) => {
      if (Array.isArray(data)) setRingoverLines(data);
    }).catch(() => {});
    api.getSageCollaborateurs().then((data) => {
      if (Array.isArray(data)) setSageCollabs(data);
    }).catch(() => {});
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    loadExternalData();
    setDialogOpen(true);
  };

  const openEdit = (u: UserDetail) => {
    setEditingId(u.id);
    setForm({
      name: u.name,
      email: u.email,
      password: "",
      role: u.role,
      ringover_user_id: u.ringover_user_id || "",
      ringover_number: u.ringover_number || "",
      ringover_email: u.ringover_email || "",
      sage_collaborator_id: u.sage_collaborator_id?.toString() || "",
      sage_rep_name: u.sage_rep_name || "",
      phone: u.phone || "",
    });
    setError("");
    loadExternalData();
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      if (editingId) {
        const update: Record<string, unknown> = {};
        if (form.name) update.name = form.name;
        if (form.email) update.email = form.email;
        if (form.password) update.password = form.password;
        update.role = form.role;
        update.ringover_user_id = form.ringover_user_id || null;
        update.ringover_number = form.ringover_number || null;
        update.ringover_email = form.ringover_email || null;
        update.sage_collaborator_id = form.sage_collaborator_id
          ? parseInt(form.sage_collaborator_id)
          : null;
        update.sage_rep_name = form.sage_rep_name || null;
        update.phone = form.phone || null;
        await api.updateUser(editingId, update);
      } else {
        if (!form.name || !form.email || !form.password) {
          setError("Nom, email et mot de passe requis");
          setSaving(false);
          return;
        }
        const payload: CreateUserPayload = {
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          ringover_user_id: form.ringover_user_id || undefined,
          ringover_number: form.ringover_number || undefined,
          ringover_email: form.ringover_email || undefined,
          sage_collaborator_id: form.sage_collaborator_id
            ? parseInt(form.sage_collaborator_id)
            : undefined,
          sage_rep_name: form.sage_rep_name || undefined,
          phone: form.phone || undefined,
        };
        await api.createUser(payload);
      }
      setDialogOpen(false);
      fetchUsers();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (userId: string) => {
    try {
      await api.toggleUserActive(userId);
      fetchUsers();
    } catch {}
  };

  const handleRingoverSelect = (memberId: string) => {
    const member = ringoverLines.find((m) => m.user_id === memberId);
    if (member) {
      setForm((f) => ({
        ...f,
        ringover_user_id: member.user_id,
        ringover_email: member.email || f.ringover_email,
        ringover_number: member.numbers[0] || f.ringover_number,
      }));
    }
  };

  const handleSageSelect = (coNo: string) => {
    const collab = sageCollabs.find((c) => String(c.CO_No) === coNo);
    if (collab) {
      setForm((f) => ({
        ...f,
        sage_collaborator_id: String(collab.CO_No),
        sage_rep_name:
          `${collab.CO_Nom || ""} ${collab.CO_Prenom || ""}`.trim() ||
          f.sage_rep_name,
      }));
    }
  };

  const activeUsers = users.filter((u) => u.is_active);
  const inactiveUsers = users.filter((u) => !u.is_active);

  return (
    <div className="space-y-5 max-w-6xl">
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
              <UserCog className="w-5 h-5 sm:w-6 sm:h-6" />
              Gestion des utilisateurs
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {activeUsers.length} actif{activeUsers.length > 1 ? "s" : ""} ·{" "}
              {inactiveUsers.length} inactif{inactiveUsers.length > 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <Button onClick={openCreate} className="gap-1.5">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nouveau commercial</span>
          <span className="sm:hidden">Ajouter</span>
        </Button>
      </div>

      {/* Users table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Chargement...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>Utilisateur</TableHead>
                    <TableHead>Ligne Ringover</TableHead>
                    <TableHead className="hidden md:table-cell">
                      Commercial Sage
                    </TableHead>
                    <TableHead className="text-center hidden lg:table-cell">
                      Appels auj.
                    </TableHead>
                    <TableHead className="text-right hidden md:table-cell">
                      CA total
                    </TableHead>
                    <TableHead className="text-center hidden lg:table-cell">
                      Commandes
                    </TableHead>
                    <TableHead className="text-center">Statut</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow
                      key={u.id}
                      className={!u.is_active ? "opacity-50" : ""}
                    >
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{u.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {u.email}
                          </p>
                          <Badge
                            variant={u.role === "admin" ? "default" : "outline"}
                            className="text-xs h-4 mt-0.5"
                          >
                            {u.role === "admin" ? (
                              <Shield className="w-2.5 h-2.5 mr-0.5" />
                            ) : null}
                            {u.role}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        {u.ringover_number ? (
                          <div className="text-xs">
                            <Phone className="w-3 h-3 inline mr-1 text-green-600" />
                            {u.ringover_number}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Non assigné
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {u.sage_rep_name ? (
                          <div className="text-xs">
                            <Building2 className="w-3 h-3 inline mr-1 text-sora" />
                            {u.sage_rep_name}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Non lié
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center hidden lg:table-cell tabular-nums text-sm">
                        {u.calls_today || "—"}
                      </TableCell>
                      <TableCell className="text-right hidden md:table-cell tabular-nums text-sm font-medium">
                        {formatCurrency(u.total_ca)}
                      </TableCell>
                      <TableCell className="text-center hidden lg:table-cell tabular-nums text-sm">
                        {u.total_orders || "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={u.is_active ? "default" : "secondary"}
                          className={`text-xs ${
                            u.is_active
                              ? "bg-green-50 text-green-600 border-green-200"
                              : "bg-red-50 text-red-600"
                          }`}
                        >
                          {u.is_active ? "Actif" : "Inactif"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openEdit(u)}
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px] gap-1"
                            onClick={() => {
                              setObjUserId(u.id);
                              api.getObjectives(u.id).then(setObjectives).catch(() => {});
                              api.getObjectiveMetrics().then(setMetrics).catch(() => {});
                              setObjDialogOpen(true);
                            }}
                          >
                            <Target className="w-3 h-3" />
                            Objectifs
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => toggleActive(u.id)}
                          >
                            <Power
                              className={`w-3.5 h-3.5 ${
                                u.is_active ? "text-red-600" : "text-green-600"
                              }`}
                            />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {users.map((u) => (
          <Card
            key={`m-${u.id}`}
            className={!u.is_active ? "opacity-50" : ""}
          >
            <CardContent className="p-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-sm">{u.name}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    {u.ringover_number && (
                      <span>
                        <Phone className="w-3 h-3 inline mr-0.5 text-green-600" />
                        {u.ringover_number}
                      </span>
                    )}
                    {u.sage_rep_name && (
                      <span>
                        <Building2 className="w-3 h-3 inline mr-0.5 text-sora" />
                        {u.sage_rep_name}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-3 mt-1 text-xs">
                    <span>CA: {formatCurrency(u.total_ca)}</span>
                    <span>{u.total_orders} cmd</span>
                    <span>{u.calls_today} appels auj.</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => openEdit(u)}
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Modifier l'utilisateur" : "Nouveau commercial"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
                {error}
              </p>
            )}

            {/* Basic info */}
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Informations
              </h4>
              <Input
                placeholder="Nom complet"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <Input
                placeholder="Email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <Input
                placeholder={editingId ? "Nouveau mot de passe (laisser vide)" : "Mot de passe"}
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-12">Rôle :</span>
                <Select
                  value={form.role}
                  onValueChange={(v) => setForm({ ...form, role: v })}
                >
                  <SelectTrigger className="flex-1 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sales">Commercial</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Input
                placeholder="Téléphone perso"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>

            {/* Ringover */}
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Phone className="w-3 h-3" />
                Ligne Ringover
              </h4>
              {ringoverLines.length > 0 ? (
                <Select
                  value={form.ringover_user_id || "none"}
                  onValueChange={(v) => {
                    if (v === "none") {
                      setForm((f) => ({
                        ...f,
                        ringover_user_id: "",
                        ringover_number: "",
                        ringover_email: "",
                      }));
                    } else {
                      handleRingoverSelect(v);
                    }
                  }}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Sélectionner une ligne Ringover" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucune ligne</SelectItem>
                    {ringoverLines.map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.name} — {m.numbers[0] || m.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Lignes non disponibles (API Ringover)
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="N° Ringover"
                  value={form.ringover_number}
                  onChange={(e) =>
                    setForm({ ...form, ringover_number: e.target.value })
                  }
                  className="text-sm h-8"
                />
                <Input
                  placeholder="Email Ringover"
                  value={form.ringover_email}
                  onChange={(e) =>
                    setForm({ ...form, ringover_email: e.target.value })
                  }
                  className="text-sm h-8"
                />
              </div>
            </div>

            {/* Sage */}
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                Collaborateur Sage
              </h4>
              {sageCollabs.length > 0 ? (
                <Select
                  value={form.sage_collaborator_id || "none"}
                  onValueChange={(v) => {
                    if (v === "none") {
                      setForm((f) => ({
                        ...f,
                        sage_collaborator_id: "",
                        sage_rep_name: "",
                      }));
                    } else {
                      handleSageSelect(v);
                    }
                  }}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Sélectionner un collaborateur" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun</SelectItem>
                    {sageCollabs.map((c) => (
                      <SelectItem key={c.CO_No} value={String(c.CO_No)}>
                        {c.CO_Nom} {c.CO_Prenom} (#{c.CO_No})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Collaborateurs non disponibles (Sage ODBC)
                </p>
              )}
              <Input
                placeholder="Nom commercial Sage"
                value={form.sage_rep_name}
                onChange={(e) =>
                  setForm({ ...form, sage_rep_name: e.target.value })
                }
                className="text-sm h-8"
              />
            </div>


            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full"
            >
              {saving
                ? "Enregistrement..."
                : editingId
                ? "Enregistrer les modifications"
                : "Créer l'utilisateur"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Objectives multi-KPI Dialog */}
      <Dialog open={objDialogOpen} onOpenChange={setObjDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              Objectifs — {users.find((u) => u.id === objUserId)?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Définissez des objectifs sur n'importe quel KPI. Chaque objectif sera suivi automatiquement sur le dashboard du commercial.
            </p>

            {/* Objectifs existants */}
            {objectives.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Objectifs actifs ({objectives.length})</p>
                {objectives.map((obj) => {
                  const unit = ["ca","margin_gross","margin_net","avg_basket","avg_ca_per_order"].includes(obj.metric) ? " €" : obj.metric === "quantity_kg" ? " kg" : "";
                  const periodLabel = obj.period_type === "monthly" ? "/ mois" : obj.period_type === "quarterly" ? "/ trimestre" : "/ an";
                  return (
                    <div key={obj.id} className="flex items-center gap-3 p-3 border rounded-lg">
                      <Target className="w-4 h-4 text-sora shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{obj.metric_label || obj.metric}</p>
                        <p className="text-[11px] text-muted-foreground">{periodLabel}</p>
                      </div>
                      <span className="font-mono text-sm font-bold">
                        {obj.target_value.toLocaleString("fr-FR")}{unit}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-ume hover:text-red-600"
                        onClick={async () => {
                          await api.deleteObjective(obj.id);
                          setObjectives((prev) => prev.filter((o) => o.id !== obj.id));
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 border rounded-lg border-dashed">
                <Target className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">Aucun objectif configuré</p>
                <p className="text-xs text-muted-foreground mt-1">Ajoutez un objectif ci-dessous</p>
              </div>
            )}

            {/* Ajout */}
            <div className="border-t pt-4 space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Ajouter un objectif</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">KPI</label>
                  <Select value={objForm.metric} onValueChange={(v) => setObjForm({ ...objForm, metric: v })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {metrics.map((m) => (
                        <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Période</label>
                  <Select value={objForm.period_type} onValueChange={(v) => setObjForm({ ...objForm, period_type: v })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Mensuel</SelectItem>
                      <SelectItem value="quarterly">Trimestriel</SelectItem>
                      <SelectItem value="yearly">Annuel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">
                  Cible
                  {" "}
                  <span className="text-muted-foreground/60">
                    ({["ca","margin_gross","margin_net","avg_basket","avg_ca_per_order"].includes(objForm.metric) ? "en €" : objForm.metric === "quantity_kg" ? "en kg" : "en unités"})
                  </span>
                </label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder={["ca","margin_gross","margin_net"].includes(objForm.metric) ? "Ex: 50000" : objForm.metric === "quantity_kg" ? "Ex: 10000" : "Ex: 100"}
                    value={objForm.target_value}
                    onChange={(e) => setObjForm({ ...objForm, target_value: e.target.value })}
                    className="flex-1 h-9"
                  />
                  <Button
                    className="h-9 px-4"
                    disabled={savingObj || !objForm.target_value}
                    onClick={async () => {
                      if (!objUserId || !objForm.target_value) return;
                      setSavingObj(true);
                      try {
                        const created = await api.createObjective({
                          user_id: objUserId,
                          metric: objForm.metric,
                          period_type: objForm.period_type,
                          target_value: parseFloat(objForm.target_value),
                        });
                        setObjectives((prev) => [...prev, created]);
                        setObjForm({ ...objForm, target_value: "" });
                      } catch {
                        // silently handled
                      } finally {
                        setSavingObj(false);
                      }
                    }}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Ajouter
                  </Button>
                </div>
              </div>
            </div>

            {/* Aide */}
            <div className="text-[11px] text-muted-foreground bg-muted/40 rounded-lg p-3 space-y-1">
              <p className="font-medium">KPIs disponibles :</p>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                <li><span className="font-semibold">CA</span> — chiffre d'affaires HT</li>
                <li><span className="font-semibold">Marge brute</span> — prix vente - coût revient</li>
                <li><span className="font-semibold">Marge nette</span> — après déduction forfaits</li>
                <li><span className="font-semibold">Quantité (kg)</span> — poids net vendu</li>
                <li><span className="font-semibold">Quantité (unités)</span> — nb unités vendues</li>
                <li><span className="font-semibold">Panier moyen</span> — CA / nb commandes</li>
                <li><span className="font-semibold">CA moy / commande</span> — montant moyen</li>
                <li><span className="font-semibold">Nb commandes</span> — volume de commandes</li>
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
