"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ClientDetail, PhoneNumber, OrderDetailResponse, UpsellResponse, EnrichSuggestion, ClientAuditLog, UpdateClientPayload, Contact as ContactType } from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  TrendingUp,
  AlertTriangle,
  ShoppingCart,
  BarChart3,
  Calendar,
  Plus,
  Trash2,
  PhoneOutgoing,
  PhoneIncoming,
  Package,
  Euro,
  Globe,
  MessageSquare,
  Bot,
  Flame,
  Snowflake,
  ChevronDown,
  ChevronUp,
  Play,
  Lightbulb,
  Tag,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  UserCircle,
  Pencil,
  Save,
  Sparkles,
  History,
  X,
  Check,
  Loader2,
  Link2,
  Users,
  FileText,
  Truck,
} from "lucide-react";
import { ClickToCall } from "@/components/click-to-call";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Brush,
} from "recharts";
import Link from "next/link";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatCurrencyPrecise(n: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n);
}

function formatDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR");
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMonth(m: string) {
  const [y, mo] = m.split("-");
  const months = [
    "Jan", "Fév", "Mar", "Avr", "Mai", "Jun",
    "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc",
  ];
  return `${months[parseInt(mo) - 1]} ${y.slice(2)}`;
}

function churnLabel(score: number) {
  if (score >= 80) return { label: "Critique", color: "text-red-600", bg: "bg-red-500" };
  if (score >= 50) return { label: "Élevé", color: "text-orange-600", bg: "bg-orange-500" };
  if (score >= 30) return { label: "Modéré", color: "text-amber-600", bg: "bg-amber-500" };
  return { label: "Faible", color: "text-green-600", bg: "bg-green-500" };
}

function phoneLabel(label: string | undefined | null) {
  const map: Record<string, string> = {
    main: "Principal",
    principal: "Principal",
    fax: "Fax",
    autre: "Autre",
    mobile: "Mobile",
    fixe: "Fixe",
  };
  return map[label || ""] || label || "Autre";
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddPhone, setShowAddPhone] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newPhoneLabel, setNewPhoneLabel] = useState("mobile");
  const [addingPhone, setAddingPhone] = useState(false);
  const [activeTab, setActiveTab] = useState<"sales" | "orders" | "calls" | "feedback" | "upsell" | "audit">("sales");
  const [expandedCall, setExpandedCall] = useState<string | null>(null);
  const [orderDetail, setOrderDetail] = useState<OrderDetailResponse | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [upsell, setUpsell] = useState<UpsellResponse | null>(null);
  const [loadingUpsell, setLoadingUpsell] = useState(false);

  const [salesSort, setSalesSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });
  const [salesSearch, setSalesSearch] = useState("");

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<UpdateClientPayload>({});
  const [saving, setSaving] = useState(false);

  const [enriching, setEnriching] = useState(false);
  const [enrichSuggestions, setEnrichSuggestions] = useState<EnrichSuggestion | null>(null);
  const [showEnrichDialog, setShowEnrichDialog] = useState(false);

  const [auditLogs, setAuditLogs] = useState<ClientAuditLog[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  const [mergeResults, setMergeResults] = useState<Array<{ id: string; name: string; phone_e164?: string; city?: string }>>([]);
  const [merging, setMerging] = useState(false);
  const [searchingMerge, setSearchingMerge] = useState(false);

  const [showContactDialog, setShowContactDialog] = useState(false);
  const [editingContact, setEditingContact] = useState<ContactType | null>(null);
  const [contactForm, setContactForm] = useState<{name: string; first_name: string; last_name: string; role: string; phone: string; emails: string[]; is_primary: boolean}>({name: '', first_name: '', last_name: '', role: '', phone: '', emails: [''], is_primary: false});
  const [savingContact, setSavingContact] = useState(false);
  const [showMoveContactDialog, setShowMoveContactDialog] = useState(false);
  const [movingContactId, setMovingContactId] = useState<string | null>(null);
  const [moveCompanySearch, setMoveCompanySearch] = useState('');
  const [moveCompanyResults, setMoveCompanyResults] = useState<Array<{id: string; name: string; city?: string}>>([]);
  const [movingContact, setMovingContact] = useState(false);

  const [deleteContactTarget, setDeleteContactTarget] = useState<{id: string; name: string} | null>(null);
  const [enrichSelectedFields, setEnrichSelectedFields] = useState<Record<string, boolean>>({});
  const [showDeleteClient, setShowDeleteClient] = useState(false);
  const [deletingClient, setDeletingClient] = useState(false);

  const fetchClient = () => {
    api
      .getClient(id)
      .then(setClient)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchClient();
  }, [id]);

  useEffect(() => {
    const onFocus = () => fetchClient();
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchClient();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    const interval = setInterval(fetchClient, 60_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
    };
  }, [id]);

  const handleAddPhone = async () => {
    if (!newPhone.trim()) return;
    setAddingPhone(true);
    try {
      await api.addPhoneNumber(id, newPhone, newPhoneLabel);
      toast.success("Numéro ajouté");
      setShowAddPhone(false);
      setNewPhone("");
      fetchClient();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setAddingPhone(false);
    }
  };

  const openOrder = (pieceId: string) => {
    setLoadingOrder(true);
    api
      .getOrderDetail(pieceId)
      .then(setOrderDetail)
      .catch(() => toast.error("Erreur chargement commande"))
      .finally(() => setLoadingOrder(false));
  };

  const fetchUpsell = () => {
    if (upsell) return;
    setLoadingUpsell(true);
    api
      .getProductUpsell(id)
      .then(setUpsell)
      .catch(() => {})
      .finally(() => setLoadingUpsell(false));
  };

  const handleRemovePhone = async (phoneId: string) => {
    try {
      await api.removePhoneNumber(id, phoneId);
      toast.success("Numéro supprimé");
      fetchClient();
    } catch {
      toast.error("Erreur de suppression");
    }
  };

  const startEditing = () => {
    if (!client) return;
    setEditForm({
      name: client.name,
      contact_name: client.contact_name || "",
      phone: client.phone || "",
      email: client.email || "",
      address: client.address || "",
      postal_code: client.postal_code || "",
      city: client.city || "",
      country: client.country || "",
      website: client.website || "",
      siret: client.siret || "",
      vat_number: client.vat_number || "",
      naf_code: client.naf_code || "",
      tariff_category: client.tariff_category || "",
    });
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateClient(id, editForm);
      toast.success("Fiche mise à jour");
      setEditing(false);
      fetchClient();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erreur de sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClient = async () => {
    setDeletingClient(true);
    try {
      await api.deleteClient(id);
      toast.success("Entreprise supprimée");
      router.push("/clients");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erreur de suppression");
    } finally {
      setDeletingClient(false);
    }
  };

  const ENRICH_FIELDS: [keyof EnrichSuggestion, string][] = [
    ["name", "Nom"],
    ["contact_name", "Contact"],
    ["phone", "Téléphone"],
    ["email", "Email"],
    ["address", "Adresse"],
    ["postal_code", "Code postal"],
    ["city", "Ville"],
    ["website", "Site web"],
    ["siret", "SIRET"],
    ["naf_code", "Code NAF"],
  ];

  const handleEnrich = async () => {
    setEnriching(true);
    try {
      const suggestions = await api.enrichClient(id);
      setEnrichSuggestions(suggestions);
      const selected: Record<string, boolean> = {};
      for (const [key] of ENRICH_FIELDS) {
        const val = suggestions[key];
        if (val) selected[key] = true;
      }
      setEnrichSelectedFields(selected);
      setShowEnrichDialog(true);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erreur d'enrichissement IA");
    } finally {
      setEnriching(false);
    }
  };

  const getExistingValue = (key: string): string | undefined => {
    if (!client) return undefined;
    if (key === "phone") return client.phone_e164 || undefined;
    return (client as unknown as Record<string, string | undefined>)[key] || undefined;
  };

  const applyEnrichment = async () => {
    if (!enrichSuggestions || !client) return;
    const payload: UpdateClientPayload = {};
    for (const [key] of ENRICH_FIELDS) {
      if (!enrichSelectedFields[key]) continue;
      const val = enrichSuggestions[key];
      if (!val) continue;
      if (key === "phone") {
        payload.phone = val;
      } else {
        (payload as Record<string, string>)[key] = val;
      }
    }
    if (Object.keys(payload).length === 0) {
      toast.info("Aucun champ sélectionné");
      return;
    }
    setSaving(true);
    try {
      await api.updateClient(id, payload);
      toast.success("Enrichissement appliqué");
      setShowEnrichDialog(false);
      setEnrichSuggestions(null);
      fetchClient();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  const fetchAudit = () => {
    setLoadingAudit(true);
    api
      .getClientAudit(id)
      .then(setAuditLogs)
      .catch(() => {})
      .finally(() => setLoadingAudit(false));
  };

  const searchMergeTargets = async (q: string) => {
    setMergeSearch(q);
    if (q.length < 2) { setMergeResults([]); return; }
    setSearchingMerge(true);
    try {
      const res = await api.getClients({ search: q, limit: "10" });
      setMergeResults(
        res.clients
          .filter((c) => c.id !== id)
          .map((c) => ({ id: c.id, name: c.name, phone_e164: c.phone_e164, city: c.city })),
      );
    } catch {
      setMergeResults([]);
    } finally {
      setSearchingMerge(false);
    }
  };

  const handleMerge = async (targetId: string, targetName: string) => {
    if (!confirm(`Rattacher cette fiche à "${targetName}" ?\n\nLes numéros et appels seront transférés et cette fiche sera supprimée.`)) return;
    setMerging(true);
    try {
      const res = await api.mergeClient(id, targetId);
      toast.success(`Fusion réussie : ${res.phones_transferred} numéro(s) et ${res.calls_transferred} appel(s) transférés`);
      router.push(`/clients/${targetId}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erreur de fusion");
    } finally {
      setMerging(false);
    }
  };

  const openNewContact = () => {
    setEditingContact(null);
    setContactForm({ name: '', first_name: '', last_name: '', role: '', phone: '', emails: [''], is_primary: false });
    setShowContactDialog(true);
  };

  const openEditContact = (contact: ContactType) => {
    setEditingContact(contact);
    const emails = contact.email ? contact.email.split(',').map(e => e.trim()).filter(Boolean) : [''];
    setContactForm({
      name: contact.name || '',
      first_name: contact.first_name || '',
      last_name: contact.last_name || '',
      role: contact.role || '',
      phone: contact.phone || '',
      emails: emails.length > 0 ? emails : [''],
      is_primary: contact.is_primary,
    });
    setShowContactDialog(true);
  };

  const buildContactName = (first: string, last: string) => {
    const parts = [first, last].filter(p => p.trim());
    return parts.join(' ') || '';
  };

  const handleSaveContact = async () => {
    const first = contactForm.first_name.trim();
    const last = contactForm.last_name.trim();
    if (!first && !last) {
      toast.error('Saisissez au moins le prénom ou le nom');
      return;
    }
    const fullName = buildContactName(first, last);
    const email = contactForm.emails.map(e => e.trim()).filter(Boolean).join(', ') || undefined;
    setSavingContact(true);
    try {
      const payload = {
        name: fullName,
        first_name: first || undefined,
        last_name: last || undefined,
        role: contactForm.role || undefined,
        phone: contactForm.phone || undefined,
        email,
        is_primary: contactForm.is_primary,
      };
      if (editingContact) {
        await api.updateContact(editingContact.id, payload);
        toast.success('Contact mis à jour');
      } else {
        await api.createContact({ ...payload, company_id: id });
        toast.success('Contact créé');
      }
      setShowContactDialog(false);
      fetchClient();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSavingContact(false);
    }
  };

  const handleDeleteContact = (contactId: string, contactName: string) => {
    setDeleteContactTarget({ id: contactId, name: contactName });
  };

  const confirmDeleteContact = async () => {
    if (!deleteContactTarget) return;
    try {
      await api.deleteContact(deleteContactTarget.id);
      toast.success("Contact supprimé");
      setDeleteContactTarget(null);
      fetchClient();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  const openMoveContact = (contactId: string) => {
    setMovingContactId(contactId);
    setMoveCompanySearch('');
    setMoveCompanyResults([]);
    setShowMoveContactDialog(true);
  };

  const searchMoveTargets = async (q: string) => {
    setMoveCompanySearch(q);
    if (q.length < 2) { setMoveCompanyResults([]); return; }
    try {
      const res = await api.getClients({ search: q, limit: '10' });
      setMoveCompanyResults(
        res.clients.filter((c) => c.id !== id).map((c) => ({ id: c.id, name: c.name, city: c.city }))
      );
    } catch {
      setMoveCompanyResults([]);
    }
  };

  const handleMoveContact = async (targetId: string, targetName: string) => {
    if (!movingContactId) return;
    if (!confirm(`Déplacer ce contact vers "${targetName}" ?\nSes appels et numéros seront aussi transférés.`)) return;
    setMovingContact(true);
    try {
      const res = await api.moveContact(movingContactId, targetId);
      toast.success(`Contact déplacé : ${res.calls_moved} appel(s) transféré(s)`);
      setShowMoveContactDialog(false);
      fetchClient();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setMovingContact(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Chargement...
      </div>
    );
  }
  if (!client) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Client introuvable
      </div>
    );
  }

  const score = client.score;
  const churn = score ? churnLabel(score.churn_risk_score) : null;
  const summary = client.sales_summary;
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start sm:items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" className="shrink-0 mt-1 sm:mt-0" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          {editing ? (
            <Input
              value={editForm.name || ""}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              className="text-xl sm:text-2xl font-bold tracking-tight h-auto py-0.5 border-primary/30"
              autoFocus
            />
          ) : (
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight truncate">{client.name}</h2>
          )}
          <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
            <span className="font-mono text-xs">{client.sage_id}</span>
            {(client.assigned_user_name || client.sales_rep) && (
              <>
                <span>·</span>
                <Badge
                  variant="outline"
                  className={`text-xs gap-1 font-normal ${client.assigned_user_name ? "" : "border-amber-300 text-amber-700 bg-amber-50"}`}
                >
                  <UserCircle className="w-3 h-3" />
                  {client.assigned_user_name || client.sales_rep}
                </Badge>
                {!client.assigned_user_name && client.sales_rep && (
                  <span className="text-[10px] text-muted-foreground/60">(Sage)</span>
                )}
              </>
            )}
            {!client.assigned_user_name && !client.sales_rep && (
              <>
                <span>·</span>
                <Badge variant="outline" className="text-xs gap-1 font-normal border-amber-300 text-amber-700 bg-amber-50">
                  <UserCircle className="w-3 h-3" />
                  Non attribué
                </Badge>
              </>
            )}
            {client.tariff_category && (
              <>
                <span>·</span>
                <Badge variant="outline" className="text-xs">
                  {client.tariff_category}
                </Badge>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={client.status} size="sm" />
          {!editing && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={startEditing}>
              <Pencil className="w-3.5 h-3.5" />
              Modifier
            </Button>
          )}
          {editing && (
            <>
              <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setShowDeleteClient(true)}>
                <Trash2 className="w-3.5 h-3.5 mr-1" />Supprimer
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
                <X className="w-3.5 h-3.5 mr-1" />Annuler
              </Button>
              <Button variant="default" size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Enregistrer
              </Button>
            </>
          )}
          {client.phone_e164 && (
            <ClickToCall
              phoneNumber={client.phone_e164}
              variant="cta"
              label="Appeler"
              contactName={client.name}
            />
          )}
        </div>
      </div>

      {/* Edit form */}
      {editing && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-1.5">
              <Pencil className="w-4 h-4" />
              Modifier les informations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Nom de l&apos;entreprise</Label>
                <Input
                  value={editForm.name || ""}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="Nom de l'entreprise"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Contact principal</Label>
                <Input
                  value={editForm.contact_name || ""}
                  onChange={(e) => setEditForm({ ...editForm, contact_name: e.target.value })}
                  placeholder="Nom du contact"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Téléphone</Label>
                <Input
                  value={editForm.phone || ""}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  placeholder="Téléphone"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input
                  type="email"
                  value={editForm.email || ""}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  placeholder="email@entreprise.fr"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Adresse</Label>
                <Input
                  value={editForm.address || ""}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  placeholder="Adresse"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Code postal</Label>
                <Input
                  value={editForm.postal_code || ""}
                  onChange={(e) => setEditForm({ ...editForm, postal_code: e.target.value })}
                  placeholder="75001"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Ville</Label>
                <Input
                  value={editForm.city || ""}
                  onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                  placeholder="Paris"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Pays</Label>
                <Input
                  value={editForm.country || ""}
                  onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}
                  placeholder="France"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Site web</Label>
                <Input
                  value={editForm.website || ""}
                  onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">SIRET</Label>
                <Input
                  value={editForm.siret || ""}
                  onChange={(e) => setEditForm({ ...editForm, siret: e.target.value })}
                  placeholder="123 456 789 00012"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">TVA intracom</Label>
                <Input
                  value={editForm.vat_number || ""}
                  onChange={(e) => setEditForm({ ...editForm, vat_number: e.target.value })}
                  placeholder="FR12345678901"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Catégorie tarifaire</Label>
                <Input
                  value={editForm.tariff_category || ""}
                  onChange={(e) => setEditForm({ ...editForm, tariff_category: e.target.value })}
                  placeholder="Catégorie"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sales Summary Cards */}
      {summary && summary.total_orders > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between mb-1">
                <Euro className="w-4 h-4 text-green-600" />
              </div>
              <p className="text-xl font-bold">{formatCurrency(summary.total_ht)}</p>
              <p className="text-xs text-muted-foreground">CA total</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between mb-1">
                <ShoppingCart className="w-4 h-4 text-sora" />
              </div>
              <p className="text-xl font-bold">{summary.total_orders}</p>
              <p className="text-xs text-muted-foreground">
                commandes · panier moy {formatCurrency(summary.avg_basket)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between mb-1">
                <Package className="w-4 h-4 text-sora" />
              </div>
              <p className="text-xl font-bold">{summary.distinct_products}</p>
              <p className="text-xs text-muted-foreground">produits distincts</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between mb-1">
                <TrendingUp className="w-4 h-4 text-amber-600" />
              </div>
              <p className="text-xl font-bold">{summary.avg_margin_percent}%</p>
              <p className="text-xs text-muted-foreground">
                marge moy · {formatCurrency(summary.total_margin)} total
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between mb-1">
                <Calendar className="w-4 h-4 text-cyan-700" />
              </div>
              <p className="text-xl font-bold">
                {score?.days_since_last_order != null
                  ? `${score.days_since_last_order}j`
                  : formatDate(summary.last_order_date)}
              </p>
              <p className="text-xs text-muted-foreground">
                depuis dernière cde
                {summary.first_order_date && (
                  <> · client depuis {formatDate(summary.first_order_date)}</>
                )}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Score + Monthly Chart */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Churn + Scores */}
        {score && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-1.5">
                <AlertTriangle className={`w-4 h-4 ${churn?.color}`} />
                Scoring
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>Risque churn</span>
                  <span className={`font-bold ${churn?.color}`}>
                    {score.churn_risk_score}% — {churn?.label}
                  </span>
                </div>
                <Progress value={score.churn_risk_score} className="h-2" />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>Upsell potentiel</span>
                  <span className="font-bold text-green-600">{score.upsell_score}%</span>
                </div>
                <Progress value={score.upsell_score} className="h-2" />
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">CA 12 mois</span>
                  <p className="font-medium">{formatCurrency(score.total_revenue_12m)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Cdes 12 mois</span>
                  <p className="font-medium">{score.order_count_12m}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Fréquence moy.</span>
                  <p className="font-medium">
                    {score.avg_frequency_days
                      ? `${Math.round(score.avg_frequency_days)}j`
                      : "—"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Priorité</span>
                  <p className="font-medium">{score.global_priority_score}/100</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Monthly CA Chart */}
        {client.monthly_sales.length > 0 && (
          <Card className={score ? "lg:col-span-2" : "lg:col-span-3"}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4" />
                Évolution CA mensuel
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MonthlyCAChart data={client.monthly_sales} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Qualification feedback summary */}
      {(client.last_qualification_mood || (client.qualification_hot_count || 0) > 0 || (client.qualification_cold_count || 0) > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4" />
              Feedback commercial
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-orange-500" />
                  <span className="text-sm font-bold">{client.qualification_hot_count || 0}</span>
                  <span className="text-xs text-muted-foreground">chaud</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Snowflake className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-bold">{client.qualification_cold_count || 0}</span>
                  <span className="text-xs text-muted-foreground">froid</span>
                </div>
              </div>
              {client.last_qualification_mood && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Dernier mood : </span>
                  <Badge variant="outline" className={`text-xs ${
                    client.last_qualification_mood === "hot" ? "border-orange-300 text-orange-700 bg-orange-50" :
                    client.last_qualification_mood === "cold" ? "border-blue-300 text-blue-700 bg-blue-50" :
                    "border-gray-300"
                  }`}>
                    {client.last_qualification_mood === "hot" ? "Chaud" :
                     client.last_qualification_mood === "cold" ? "Froid" : "Neutre"}
                  </Badge>
                </div>
              )}
              {client.last_qualification_outcome && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Dernier outcome : </span>
                  <Badge variant="outline" className="text-xs">
                    {client.last_qualification_outcome === "callback" ? "Rappel" :
                     client.last_qualification_outcome === "sale" ? "Vente" :
                     client.last_qualification_outcome === "interested" ? "Intéressé" :
                     client.last_qualification_outcome === "not_interested" ? "Pas intéressé" :
                     client.last_qualification_outcome === "no_answer" ? "Pas de réponse" :
                     client.last_qualification_outcome}
                  </Badge>
                </div>
              )}
              {client.last_qualification_at && (
                <span className="text-xs text-muted-foreground">
                  le {formatDateTime(client.last_qualification_at)}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mobile-only contact cards */}
      <div className="lg:hidden grid sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-1.5">
              <Phone className="w-4 h-4" />
              Téléphones
            </CardTitle>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowAddPhone(true)}>
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {client.phone_numbers.length === 0 && !client.phone && (
              <p className="text-xs text-muted-foreground">Aucun numéro</p>
            )}
            {client.phone_numbers.map((pn) => (
              <div key={pn.id} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-accent group">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{pn.raw_phone || pn.phone_e164}</p>
                  <p className="text-xs text-muted-foreground">{phoneLabel(pn.label)}</p>
                </div>
                <ClickToCall phoneNumber={pn.phone_e164} />
              </div>
            ))}
            {client.phone_numbers.length === 0 && client.phone && (
              <div className="flex items-center gap-2 py-1 px-2">
                <div className="flex-1"><p className="text-sm font-medium">{client.phone}</p></div>
                {client.phone_e164 && <ClickToCall phoneNumber={client.phone_e164} />}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              Contacts ({client.contacts?.length || 0})
            </CardTitle>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={openNewContact}>
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {(!client.contacts || client.contacts.length === 0) ? (
              <p className="text-xs text-muted-foreground">Aucun contact</p>
            ) : (
              client.contacts.map((ct) => (
                <div key={ct.id} className="flex items-center gap-3 py-2 px-2 rounded hover:bg-accent group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{ct.name}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                      {ct.phone && <span className="flex items-center gap-1 whitespace-nowrap"><Phone className="w-3 h-3 shrink-0" />{ct.phone}</span>}
                    </div>
                  </div>
                  {ct.phone_e164 && <ClickToCall phoneNumber={ct.phone_e164} />}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main content + sidebar layout */}
      <div className="grid lg:grid-cols-[1fr_340px] gap-4 items-start">
      <div className="space-y-6 min-w-0">

      {/* Top Products */}
      {client.top_products.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-1.5">
              <Package className="w-4 h-4 text-sora" />
              Top produits commandés
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {client.top_products.slice(0, 10).map((p, i) => {
                const maxHt = Math.max(
                  ...client.top_products.map((x) => x.total_ht),
                  1
                );
                const pct = (p.total_ht / maxHt) * 100;
                return (
                  <Link
                    key={i}
                    href={`/products?ref=${encodeURIComponent(p.article_ref || "")}`}
                    className="p-2.5 rounded-lg border hover:bg-accent/50 hover:border-sora/30 transition-colors group block min-w-0 overflow-hidden"
                  >
                    <p className="text-xs font-medium truncate group-hover:text-sora transition-colors" title={p.designation || ""}>
                      {p.designation || p.article_ref || "—"}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-sm font-bold">
                        {formatCurrency(p.total_ht)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        x{p.order_count}
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1 mt-1.5">
                      <div
                        className="bg-sora h-1 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {p.article_ref && (
                      <p className="text-xs text-muted-foreground font-mono mt-1">
                        {p.article_ref}
                      </p>
                    )}
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs: Sales / Calls */}
      <div>
        <div className="flex gap-1 mb-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
          <Button
            variant={activeTab === "sales" ? "default" : "outline"}
            size="sm"
            className="shrink-0 text-xs sm:text-sm"
            onClick={() => setActiveTab("sales")}
          >
            <ShoppingCart className="w-3.5 h-3.5 mr-1 sm:mr-1.5" />
            <span className="hidden sm:inline">Historique </span>ventes ({client.recent_sales.length})
          </Button>
          {client.recent_orders && client.recent_orders.length > 0 && (
            <Button
              variant={activeTab === "orders" ? "default" : "outline"}
              size="sm"
              className="shrink-0 text-xs sm:text-sm"
              onClick={() => setActiveTab("orders")}
            >
              <Package className="w-3.5 h-3.5 mr-1 sm:mr-1.5" />
              <span className="hidden sm:inline">Commandes </span>en cours ({client.recent_orders.length})
              {client.pipeline && (
                <Badge variant="secondary" className="ml-1.5 text-[10px]">{formatCurrency(client.pipeline.orders_ca)}</Badge>
              )}
            </Button>
          )}
          <Button
            variant={activeTab === "calls" ? "default" : "outline"}
            size="sm"
            className="shrink-0 text-xs sm:text-sm"
            onClick={() => setActiveTab("calls")}
          >
            <Phone className="w-3.5 h-3.5 mr-1 sm:mr-1.5" />
            <span className="hidden sm:inline">Historique </span>appels ({client.recent_calls.length})
          </Button>
          <Button
            variant={activeTab === "feedback" ? "default" : "outline"}
            size="sm"
            className="shrink-0 text-xs sm:text-sm"
            onClick={() => setActiveTab("feedback")}
          >
            <MessageSquare className="w-3.5 h-3.5 mr-1 sm:mr-1.5" />
            Retours ({client.recent_calls.filter(c => c.qualification).length})
          </Button>
          <Button
            variant={activeTab === "upsell" ? "default" : "outline"}
            size="sm"
            className="shrink-0 text-xs sm:text-sm"
            onClick={() => {
              setActiveTab("upsell");
              fetchUpsell();
            }}
          >
            <TrendingUp className="w-3.5 h-3.5 mr-1 sm:mr-1.5" />
            Upsell
          </Button>
          <Button
            variant={activeTab === "audit" ? "default" : "outline"}
            size="sm"
            className="shrink-0 text-xs sm:text-sm"
            onClick={() => {
              setActiveTab("audit");
              fetchAudit();
            }}
          >
            <History className="w-3.5 h-3.5 mr-1 sm:mr-1.5" />
            <span className="hidden sm:inline">Historique </span>modifs
          </Button>
        </div>

        {activeTab === "sales" && (
          <Card>
            <CardContent className="p-0">
              {client.recent_sales.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Aucune vente enregistrée
                </p>
              ) : (
                <>
                  <div className="px-3 pt-3 pb-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Filtrer par article, pièce, commercial..."
                        className="pl-8 h-8 text-xs"
                        value={salesSearch}
                        onChange={(e) => setSalesSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    {(() => {
                      const toggleSalesSort = (key: string) => {
                        setSalesSort((prev) =>
                          prev.key === key
                            ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
                            : { key, dir: key === "date" ? "desc" : "asc" }
                        );
                      };

                      const SalesSortIcon = ({ col }: { col: string }) => {
                        if (salesSort.key !== col)
                          return <ArrowUpDown className="w-3 h-3 ml-0.5 opacity-30" />;
                        return salesSort.dir === "asc"
                          ? <ArrowUp className="w-3 h-3 ml-0.5 text-primary" />
                          : <ArrowDown className="w-3 h-3 ml-0.5 text-primary" />;
                      };

                      const needle = salesSearch.toLowerCase();
                      const filtered = client.recent_sales.filter((s) => {
                        if (!needle) return true;
                        return (
                          (s.designation || "").toLowerCase().includes(needle) ||
                          (s.article_ref || "").toLowerCase().includes(needle) ||
                          (s.sage_piece_id || "").toLowerCase().includes(needle) ||
                          (s.sales_rep || "").toLowerCase().includes(needle)
                        );
                      });

                      const sorted = [...filtered].sort((a, b) => {
                        const dir = salesSort.dir === "asc" ? 1 : -1;
                        switch (salesSort.key) {
                          case "date":
                            return dir * (new Date(a.date).getTime() - new Date(b.date).getTime());
                          case "piece":
                            return dir * (a.sage_piece_id || "").localeCompare(b.sage_piece_id || "");
                          case "article":
                            return dir * (a.designation || a.article_ref || "").localeCompare(b.designation || b.article_ref || "");
                          case "qty":
                            return dir * ((a.quantity ?? 0) - (b.quantity ?? 0));
                          case "unit_price":
                            return dir * ((a.unit_price ?? 0) - (b.unit_price ?? 0));
                          case "amount":
                            return dir * (a.amount_ht - b.amount_ht);
                          case "margin":
                            return dir * ((a.margin_percent ?? 0) - (b.margin_percent ?? 0));
                          default:
                            return 0;
                        }
                      });

                      const cols: { key: string; label: string; align: string }[] = [
                        { key: "date", label: "Date", align: "text-left" },
                        { key: "piece", label: "Pièce", align: "text-left" },
                        { key: "article", label: "Article", align: "text-left" },
                        { key: "qty", label: "Qté", align: "text-right" },
                        { key: "unit_price", label: "PU HT", align: "text-right" },
                        { key: "amount", label: "Montant HT", align: "text-right" },
                        { key: "margin", label: "Marge", align: "text-right" },
                      ];

                      return (
                        <table className="w-full min-w-[640px] text-sm">
                          <thead className="bg-muted/50">
                            <tr>
                              {cols.map((col) => (
                                <th
                                  key={col.key}
                                  className={`${col.align} px-3 py-2 text-xs text-muted-foreground font-medium cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap`}
                                  onClick={() => toggleSalesSort(col.key)}
                                >
                                  <span className={`inline-flex items-center ${col.align === "text-right" ? "justify-end" : ""}`}>
                                    {col.label}
                                    <SalesSortIcon col={col.key} />
                                  </span>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {sorted.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="px-3 py-6 text-center text-xs text-muted-foreground">
                                  Aucun résultat pour &quot;{salesSearch}&quot;
                                </td>
                              </tr>
                            ) : (
                              sorted.map((sale, i) => (
                                <tr key={i} className="hover:bg-accent/50">
                                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                                    {formatDate(sale.date)}
                                  </td>
                                  <td className="px-3 py-2 text-xs font-mono">
                                    <button
                                      onClick={() => openOrder(sale.sage_piece_id)}
                                      className="text-primary hover:underline"
                                    >
                                      {sale.sage_piece_id}
                                    </button>
                                  </td>
                                  <td className="px-3 py-2 text-xs max-w-[250px] truncate">
                                    {sale.designation || sale.article_ref || "—"}
                                  </td>
                                  <td className="px-3 py-2 text-xs text-right tabular-nums">
                                    {sale.quantity != null ? sale.quantity : "—"}
                                  </td>
                                  <td className="px-3 py-2 text-xs text-right tabular-nums">
                                    {sale.unit_price != null
                                      ? formatCurrencyPrecise(sale.unit_price)
                                      : "—"}
                                  </td>
                                  <td className="px-3 py-2 text-xs text-right font-medium tabular-nums">
                                    {formatCurrencyPrecise(sale.amount_ht)}
                                  </td>
                                  <td className="px-3 py-2 text-xs text-right">
                                    {sale.margin_percent != null ? (
                                      <span
                                        className={
                                          sale.margin_percent >= 30
                                            ? "text-green-600"
                                            : sale.margin_percent >= 15
                                              ? "text-amber-600"
                                              : "text-red-600"
                                        }
                                      >
                                        {sale.margin_percent.toFixed(1)}%
                                      </span>
                                    ) : (
                                      "—"
                                    )}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                          {sorted.length > 0 && (
                            <tfoot className="bg-muted/30 border-t">
                              <tr>
                                <td colSpan={3} className="px-3 py-2 text-xs font-medium">
                                  {sorted.length} ligne{sorted.length > 1 ? "s" : ""}
                                  {salesSearch && ` (filtré)`}
                                </td>
                                <td className="px-3 py-2 text-xs text-right font-medium tabular-nums">
                                  {sorted.reduce((s, r) => s + (r.quantity ?? 0), 0)}
                                </td>
                                <td className="px-3 py-2 text-xs text-right" />
                                <td className="px-3 py-2 text-xs text-right font-bold tabular-nums">
                                  {formatCurrencyPrecise(sorted.reduce((s, r) => s + r.amount_ht, 0))}
                                </td>
                                <td className="px-3 py-2 text-xs text-right font-medium">
                                  {(() => {
                                    const withMargin = sorted.filter((s) => s.margin_percent != null);
                                    if (withMargin.length === 0) return "—";
                                    const avg = withMargin.reduce((s, r) => s + (r.margin_percent ?? 0), 0) / withMargin.length;
                                    return (
                                      <span className={avg >= 30 ? "text-green-600" : avg >= 15 ? "text-amber-600" : "text-red-600"}>
                                        ø {avg.toFixed(1)}%
                                      </span>
                                    );
                                  })()}
                                </td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      );
                    })()}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "orders" && client.recent_orders && (
          <Card className="border-dashed border-kiku/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="w-4 h-4 text-kiku" />
                Commandes en cours (BC / BL)
                {client.pipeline && (
                  <span className="text-muted-foreground text-xs font-normal ml-auto">
                    Total : {formatCurrency(client.pipeline.orders_ca)}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {client.recent_orders.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Aucune commande en cours
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-kiku/5">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs text-muted-foreground font-medium">Type</th>
                        <th className="text-left px-3 py-2 text-xs text-muted-foreground font-medium">Date</th>
                        <th className="text-left px-3 py-2 text-xs text-muted-foreground font-medium">Pièce</th>
                        <th className="text-left px-3 py-2 text-xs text-muted-foreground font-medium">Article</th>
                        <th className="text-right px-3 py-2 text-xs text-muted-foreground font-medium">Qté</th>
                        <th className="text-right px-3 py-2 text-xs text-muted-foreground font-medium">Montant HT</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {client.recent_orders.map((o, i) => (
                        <tr key={i} className="hover:bg-accent/50">
                          <td className="px-3 py-2 text-xs">
                            {o.sage_doc_type === 1 ? (
                              <span className="inline-flex items-center gap-1 text-kiku font-medium">
                                <FileText className="w-3.5 h-3.5" /> BC
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-sora font-medium">
                                <Truck className="w-3.5 h-3.5" /> BL
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs whitespace-nowrap">{formatDate(o.date)}</td>
                          <td className="px-3 py-2 text-xs font-mono">{o.sage_piece_id}</td>
                          <td className="px-3 py-2 text-xs max-w-[250px] truncate">{o.designation || o.article_ref || "—"}</td>
                          <td className="px-3 py-2 text-xs text-right tabular-nums">{o.quantity != null ? o.quantity : "—"}</td>
                          <td className="px-3 py-2 text-xs text-right font-medium tabular-nums">{formatCurrencyPrecise(o.amount_ht)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-muted/30 border-t">
                      <tr>
                        <td colSpan={4} className="px-3 py-2 text-xs font-medium">
                          {client.recent_orders.length} ligne{client.recent_orders.length > 1 ? "s" : ""}
                        </td>
                        <td className="px-3 py-2 text-xs text-right font-medium tabular-nums">
                          {client.recent_orders.reduce((s, r) => s + (r.quantity ?? 0), 0)}
                        </td>
                        <td className="px-3 py-2 text-xs text-right font-bold tabular-nums">
                          {formatCurrencyPrecise(client.recent_orders.reduce((s, r) => s + r.amount_ht, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "calls" && (
          <Card>
            <CardContent className="p-0">
              {client.recent_calls.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Aucun appel enregistré
                </p>
              ) : (
                <div className="space-y-0 divide-y">
                  {client.recent_calls.map((call) => {
                    const isOut = call.direction === "out" || call.direction === "outbound";
                    const q = call.qualification;
                    const ai = call.ai_analysis;
                    const isExpanded = expandedCall === call.id;
                    const hasDetails = !!(q || ai);

                    return (
                      <div key={call.id}>
                        <div
                          className={`flex items-center gap-3 py-2.5 px-4 hover:bg-accent/50 ${hasDetails ? "cursor-pointer" : ""}`}
                          onClick={() => hasDetails && setExpandedCall(isExpanded ? null : call.id)}
                        >
                          {isOut ? (
                            <PhoneOutgoing className="w-4 h-4 text-sora shrink-0" />
                          ) : (
                            <PhoneIncoming className="w-4 h-4 text-green-600 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm">
                                {isOut ? "Sortant" : "Entrant"}
                                {call.user_name && (
                                  <span className="text-muted-foreground"> · {call.user_name}</span>
                                )}
                              </p>
                              {q?.mood && (
                                <Badge variant="outline" className={`text-[10px] px-1 py-0 ${
                                  q.mood === "hot" ? "border-orange-300 text-orange-700 bg-orange-50" :
                                  q.mood === "cold" ? "border-blue-300 text-blue-700 bg-blue-50" :
                                  "border-gray-200"
                                }`}>
                                  {q.mood === "hot" ? "Chaud" : q.mood === "cold" ? "Froid" : "Neutre"}
                                </Badge>
                              )}
                              {q?.outcome && (
                                <Badge variant="outline" className="text-[10px] px-1 py-0">
                                  {q.outcome === "callback" ? "Rappel" :
                                   q.outcome === "sale" ? "Vente" :
                                   q.outcome === "interested" ? "Intéressé" :
                                   q.outcome === "not_interested" ? "Pas intéressé" :
                                   q.outcome === "no_answer" ? "Pas de réponse" :
                                   q.outcome}
                                </Badge>
                              )}
                              {ai?.overall_score != null && (
                                <span className={`text-[10px] font-bold ${
                                  ai.overall_score >= 70 ? "text-green-600" :
                                  ai.overall_score >= 40 ? "text-amber-600" : "text-red-600"
                                }`}>
                                  IA {ai.overall_score}/100
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {formatDateTime(call.start_time)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {call.record_url && (
                              <Play className="w-3.5 h-3.5 text-muted-foreground" />
                            )}
                            <Badge
                              variant={call.is_answered ? "default" : (call.direction === "out" || call.direction === "outbound" || call.direction === "OUT") ? "secondary" : "destructive"}
                              className="text-xs"
                            >
                              {call.is_answered
                                ? `${Math.floor(call.incall_duration / 60)}:${(call.incall_duration % 60).toString().padStart(2, "0")}`
                                : (call.direction === "out" || call.direction === "outbound" || call.direction === "OUT")
                                  ? "Sans réponse"
                                  : "Manqué"}
                            </Badge>
                            {hasDetails && (
                              isExpanded
                                ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                        </div>

                        {isExpanded && hasDetails && (
                          <div className="px-4 pb-3 pt-0 bg-accent/30 border-t border-dashed space-y-3">
                            <div className="grid sm:grid-cols-2 gap-3 pt-3">
                              {q && (
                                <div className="space-y-2">
                                  <p className="text-xs font-semibold flex items-center gap-1.5">
                                    <MessageSquare className="w-3.5 h-3.5" />
                                    Qualification sales
                                  </p>
                                  {q.notes && (
                                    <p className="text-xs text-muted-foreground bg-white rounded p-2 border">
                                      {q.notes}
                                    </p>
                                  )}
                                  {q.tags && q.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {q.tags.map((tag, i) => (
                                        <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
                                          <Tag className="w-2.5 h-2.5" />
                                          {tag}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                  {q.next_step && (
                                    <div className="text-xs">
                                      <span className="text-muted-foreground">Prochaine étape : </span>
                                      <span className="font-medium">{q.next_step}</span>
                                      {q.next_step_date && (
                                        <span className="text-muted-foreground"> — {formatDate(q.next_step_date)}</span>
                                      )}
                                    </div>
                                  )}
                                  {q.qualified_at && (
                                    <p className="text-[10px] text-muted-foreground">
                                      Qualifié le {formatDateTime(q.qualified_at)}
                                    </p>
                                  )}
                                </div>
                              )}

                              {ai && (
                                <div className="space-y-2">
                                  <p className="text-xs font-semibold flex items-center gap-1.5">
                                    <Bot className="w-3.5 h-3.5" />
                                    Analyse IA
                                    {ai.overall_score != null && (
                                      <span className={`ml-1 font-bold ${
                                        ai.overall_score >= 70 ? "text-green-600" :
                                        ai.overall_score >= 40 ? "text-amber-600" : "text-red-600"
                                      }`}>
                                        {ai.overall_score}/100
                                      </span>
                                    )}
                                  </p>
                                  {ai.summary && (
                                    <p className="text-xs text-muted-foreground bg-white rounded p-2 border">
                                      {ai.summary}
                                    </p>
                                  )}
                                  {ai.client_sentiment && (
                                    <div className="text-xs">
                                      <span className="text-muted-foreground">Sentiment : </span>
                                      <Badge variant="outline" className={`text-[10px] px-1 py-0 ${
                                        ai.client_sentiment === "positive" ? "border-green-300 text-green-700 bg-green-50" :
                                        ai.client_sentiment === "negative" ? "border-red-300 text-red-700 bg-red-50" :
                                        "border-gray-200"
                                      }`}>
                                        {ai.client_sentiment === "positive" ? "Positif" :
                                         ai.client_sentiment === "negative" ? "Négatif" : "Neutre"}
                                      </Badge>
                                    </div>
                                  )}
                                  {ai.sales_feedback && (
                                    <div className="text-xs">
                                      <span className="text-muted-foreground">Feedback coaching : </span>
                                      <span>{ai.sales_feedback}</span>
                                    </div>
                                  )}
                                  {ai.detected_opportunities && (
                                    <div className="text-xs flex items-start gap-1">
                                      <Lightbulb className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
                                      <span>{ai.detected_opportunities}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {call.record_url && (
                              <div className="pt-1">
                                <audio controls className="w-full h-8" preload="none">
                                  <source src={call.record_url} />
                                </audio>
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
        )}
      </div>

      {/* Feedback / Retours commerciaux tab */}
      {activeTab === "feedback" && (
        <Card>
          <CardContent className="py-4">
            {(() => {
              const feedbacks = client.recent_calls
                .filter((c) => c.qualification)
                .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());

              if (feedbacks.length === 0) {
                return (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Aucun retour commercial enregistré
                  </p>
                );
              }

              return (
                <div className="relative pl-6 space-y-0">
                  <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
                  {feedbacks.map((call) => {
                    const q = call.qualification!;
                    const isOut = call.direction === "out" || call.direction === "outbound" || call.direction === "OUT";
                    const isAutoQualified = q.outcome === "Injoignable" && !call.is_answered && isOut;

                    return (
                      <div key={call.id} className="relative pb-5">
                        <div className={`absolute -left-6 top-1 w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center bg-white ${
                          isAutoQualified ? "border-amber-300" :
                          q.mood === "positive" || q.mood === "hot" ? "border-green-400" :
                          q.mood === "negative" || q.mood === "cold" ? "border-red-400" :
                          "border-gray-300"
                        }`}>
                          {isAutoQualified ? (
                            <Phone className="w-2.5 h-2.5 text-amber-500" />
                          ) : (
                            <MessageSquare className="w-2.5 h-2.5 text-muted-foreground" />
                          )}
                        </div>

                        <div className="bg-accent/40 rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-medium">
                                {formatDateTime(call.start_time)}
                              </span>
                              {call.user_name && (
                                <span className="text-xs text-muted-foreground">· {call.user_name}</span>
                              )}
                              {isAutoQualified && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-300 bg-amber-50">
                                  Auto
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              {q.mood && (
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                                  q.mood === "positive" || q.mood === "hot" ? "border-green-300 text-green-700 bg-green-50" :
                                  q.mood === "negative" || q.mood === "cold" ? "border-red-300 text-red-700 bg-red-50" :
                                  q.mood === "neutral" ? "border-gray-200 bg-gray-50" :
                                  "border-gray-200"
                                }`}>
                                  {q.mood === "positive" || q.mood === "hot" ? "Positif" :
                                   q.mood === "negative" || q.mood === "cold" ? "Négatif" : "Neutre"}
                                </Badge>
                              )}
                              {q.outcome && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  {q.outcome}
                                </Badge>
                              )}
                            </div>
                          </div>

                          {q.notes && (
                            <p className="text-sm bg-white rounded p-2.5 border text-foreground">
                              {q.notes}
                            </p>
                          )}

                          {q.next_step && (
                            <div className="flex items-center gap-1.5 text-xs">
                              <Calendar className="w-3 h-3 text-sora shrink-0" />
                              <span className="font-medium">{q.next_step}</span>
                              {q.next_step_date && (
                                <span className="text-muted-foreground">— {formatDate(q.next_step_date)}</span>
                              )}
                            </div>
                          )}

                          {q.tags && q.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {q.tags.map((tag, i) => (
                                <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}

                          {call.ai_analysis?.summary && (
                            <div className="text-xs text-muted-foreground bg-white/50 rounded p-2 border border-dashed">
                              <span className="font-medium text-foreground">IA : </span>
                              {call.ai_analysis.summary}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Upsell tab */}
      {activeTab === "upsell" && (
        <Card>
          <CardContent className="py-4">
            {loadingUpsell ? (
              <p className="text-center text-muted-foreground py-8">
                Calcul des suggestions...
              </p>
            ) : upsell?.message ? (
              <p className="text-center text-muted-foreground py-8">
                {upsell.message}
              </p>
            ) : upsell && upsell.suggestions.length > 0 ? (
              <div>
                <p className="text-xs text-muted-foreground mb-3">
                  Basé sur {upsell.similar_clients_count} clients similaires
                  (qui achètent les mêmes {upsell.client_products_count} produits)
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="px-3 py-2">Produit suggéré</th>
                        <th className="px-3 py-2 text-center">Affinité</th>
                        <th className="px-3 py-2 text-center">Acheteurs</th>
                        <th className="px-3 py-2 text-right">Prix moy.</th>
                        <th className="px-3 py-2 text-right">CA chez similaires</th>
                      </tr>
                    </thead>
                    <tbody>
                      {upsell.suggestions.map((s, i) => (
                        <tr key={i} className="border-b hover:bg-accent/50">
                          <td className="px-3 py-2">
                            <Link
                              href={`/products?ref=${encodeURIComponent(s.article_ref)}`}
                              className="hover:text-sora transition-colors"
                            >
                              <p className="text-sm truncate max-w-[250px]">
                                {s.designation || s.article_ref}
                              </p>
                              <p className="text-xs text-muted-foreground font-mono">
                                {s.article_ref}
                              </p>
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <Badge
                              variant={
                                s.affinity_pct >= 10
                                  ? "default"
                                  : "outline"
                              }
                              className="text-xs"
                            >
                              {s.affinity_pct}%
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-center text-sm">
                            {s.bought_by_similar}
                          </td>
                          <td className="px-3 py-2 text-right text-sm">
                            {s.avg_price
                              ? formatCurrencyPrecise(s.avg_price)
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-right text-sm font-medium">
                            {formatCurrency(s.total_ca)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                Aucune suggestion disponible
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Audit tab */}
      {activeTab === "audit" && (
        <Card>
          <CardContent className="py-4">
            {loadingAudit ? (
              <p className="text-center text-muted-foreground py-8">Chargement...</p>
            ) : auditLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Aucune modification enregistrée
              </p>
            ) : (
              <div className="relative pl-6 space-y-0">
                <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
                {auditLogs.map((log) => {
                  const actionConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
                    created: { label: "Création", color: "border-green-400 bg-green-50", icon: <Plus className="w-2.5 h-2.5 text-green-600" /> },
                    updated: { label: "Modification", color: "border-blue-400 bg-blue-50", icon: <Pencil className="w-2.5 h-2.5 text-blue-600" /> },
                    enriched_ai: { label: "Enrichissement IA", color: "border-purple-400 bg-purple-50", icon: <Sparkles className="w-2.5 h-2.5 text-purple-600" /> },
                    phone_added: { label: "Téléphone ajouté", color: "border-cyan-400 bg-cyan-50", icon: <Phone className="w-2.5 h-2.5 text-cyan-600" /> },
                    phone_removed: { label: "Téléphone supprimé", color: "border-red-400 bg-red-50", icon: <Trash2 className="w-2.5 h-2.5 text-red-600" /> },
                  };
                  const cfg = actionConfig[log.action] || { label: log.action, color: "border-gray-300", icon: <History className="w-2.5 h-2.5 text-muted-foreground" /> };
                  const isSystem = !log.user_id || log.user_name === "system";

                  return (
                    <div key={log.id} className="relative pb-5">
                      <div className={`absolute -left-6 top-1 w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center bg-white ${cfg.color.split(" ")[0]}`}>
                        {cfg.icon}
                      </div>
                      <div className={`rounded-lg p-3 space-y-1 ${isSystem ? "bg-muted/30 border border-dashed" : "bg-accent/40"}`}>
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium">
                              {new Date(log.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              · {isSystem ? "Système" : log.user_name}
                            </span>
                          </div>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${cfg.color}`}>
                            {cfg.label}
                          </Badge>
                        </div>
                        {log.field_name && (
                          <div className="text-xs">
                            <span className="text-muted-foreground font-medium">{log.field_name}</span>
                            {log.old_value && (
                              <span className="text-red-500 line-through ml-2">{log.old_value}</span>
                            )}
                            {log.new_value && (
                              <span className="text-green-600 font-medium ml-2">{log.new_value}</span>
                            )}
                          </div>
                        )}
                        {log.details && (
                          <p className="text-xs text-muted-foreground">{log.details}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      </div>{/* end main left column */}

      {/* Sidebar right — sticky */}
      <div className="hidden lg:block sticky top-0 space-y-4 max-h-[calc(100vh-3rem)] overflow-y-auto scrollbar-thin">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-1.5">
              <Phone className="w-4 h-4" />
              Téléphones
            </CardTitle>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowAddPhone(true)}>
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {client.phone_numbers.length === 0 && !client.phone && (
              <p className="text-xs text-muted-foreground">Aucun numéro</p>
            )}
            {client.phone_numbers.map((pn) => (
              <div key={pn.id} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-accent group">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{pn.raw_phone || pn.phone_e164}</p>
                  <p className="text-xs text-muted-foreground">{phoneLabel(pn.label)}</p>
                </div>
                <ClickToCall phoneNumber={pn.phone_e164} />
                {pn.source !== "sage" && (
                  <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => handleRemovePhone(pn.id)}>
                    <Trash2 className="w-3 h-3 text-red-600" />
                  </Button>
                )}
              </div>
            ))}
            {client.phone_numbers.length === 0 && client.phone && (
              <div className="flex items-center gap-2 py-1 px-2">
                <div className="flex-1">
                  <p className="text-sm font-medium">{client.phone}</p>
                </div>
                {client.phone_e164 && <ClickToCall phoneNumber={client.phone_e164} />}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              Contacts ({client.contacts?.length || 0})
            </CardTitle>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={openNewContact}>
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {(!client.contacts || client.contacts.length === 0) ? (
              <p className="text-xs text-muted-foreground">Aucun contact</p>
            ) : (
              client.contacts.map((ct) => (
                <div key={ct.id} className="flex items-center gap-3 py-2 px-2 rounded hover:bg-accent group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{ct.name}</p>
                      {ct.is_primary && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 border-green-300 text-green-700 bg-green-50 shrink-0">principal</Badge>
                      )}
                      {ct.role && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">{ct.role}</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                      {ct.phone && <span className="flex items-center gap-1 whitespace-nowrap"><Phone className="w-3 h-3 shrink-0" />{ct.phone}</span>}
                      {ct.email && <span className="flex items-center gap-1 truncate"><Mail className="w-3 h-3 shrink-0" /><span className="truncate">{ct.email}</span></span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {ct.phone_e164 && <ClickToCall phoneNumber={ct.phone_e164} />}
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditContact(ct)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openMoveContact(ct.id)}>
                      <ArrowUpDown className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDeleteContact(ct.id, ct.name)}>
                      <Trash2 className="w-3 h-3 text-red-600" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Infos légales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {client.siret && (
              <div>
                <span className="text-xs text-muted-foreground">SIRET</span>
                <p className="font-mono text-xs">{client.siret}</p>
              </div>
            )}
            {client.vat_number && (
              <div>
                <span className="text-xs text-muted-foreground">TVA intracom</span>
                <p className="font-mono text-xs">{client.vat_number}</p>
              </div>
            )}
            {client.naf_code && (
              <div>
                <span className="text-xs text-muted-foreground">Code NAF</span>
                <p className="font-mono text-xs">{client.naf_code}</p>
              </div>
            )}
            {client.website && (
              <div>
                <span className="text-xs text-muted-foreground">Site web</span>
                <a
                  href={client.website.startsWith("http") ? client.website : `https://${client.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-sora hover:underline truncate"
                >
                  <Globe className="w-3 h-3 shrink-0" />
                  {client.website.replace(/^https?:\/\//, "")}
                </a>
              </div>
            )}
            {client.sage_created_at && (
              <div>
                <span className="text-xs text-muted-foreground">Créé dans Sage</span>
                <p>{formatDate(client.sage_created_at)}</p>
              </div>
            )}
            {!client.siret && !client.vat_number && !client.naf_code && !client.website && (
              <p className="text-xs text-muted-foreground">Aucune info légale</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-dashed border-sora/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-sora" />
              Enrichissement IA
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              Recherche automatique des informations de l&apos;entreprise via IA et Google Places.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5 border-sora/30 hover:bg-sora/10"
              onClick={handleEnrich}
              disabled={enriching}
            >
              {enriching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-sora" />}
              {enriching ? "Recherche en cours..." : "Enrichir cette entreprise"}
            </Button>
          </CardContent>
        </Card>
      </div>{/* end sidebar */}
      </div>{/* end grid layout */}

      {/* Enrich AI dialog */}
      <Dialog open={showEnrichDialog} onOpenChange={setShowEnrichDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-600" />
              Suggestions d&apos;enrichissement IA
            </DialogTitle>
          </DialogHeader>
          {enrichSuggestions && (
            <div className="space-y-4">
              {enrichSuggestions.confidence && (
                <Badge variant="outline" className={`text-xs ${
                  enrichSuggestions.confidence === "high" ? "border-green-300 text-green-700 bg-green-50" :
                  enrichSuggestions.confidence === "medium" ? "border-amber-300 text-amber-700 bg-amber-50" :
                  "border-red-300 text-red-700 bg-red-50"
                }`}>
                  Confiance : {enrichSuggestions.confidence === "high" ? "Élevée" :
                    enrichSuggestions.confidence === "medium" ? "Moyenne" : "Faible"}
                </Badge>
              )}
              <p className="text-xs text-muted-foreground">Sélectionnez les champs à appliquer. Les champs décochés ne seront pas modifiés.</p>
              <div className="space-y-1 text-sm">
                {ENRICH_FIELDS.map(([key, label]) => {
                  const val = enrichSuggestions[key];
                  if (!val) return null;
                  const existing = getExistingValue(key);
                  const isSelected = enrichSelectedFields[key] ?? false;
                  return (
                    <button
                      type="button"
                      key={key}
                      className={`w-full flex items-center gap-3 py-2 px-3 rounded-lg border transition-colors text-left ${
                        isSelected
                          ? "border-sensai/40 bg-sensai/5"
                          : "border-transparent bg-accent/30 opacity-60"
                      }`}
                      onClick={() => setEnrichSelectedFields((p) => ({ ...p, [key]: !p[key] }))}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        isSelected ? "bg-sensai border-sensai text-white" : "border-muted-foreground/30"
                      }`}>
                        {isSelected && <Check className="w-3 h-3" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="text-sm font-medium truncate">{val}</p>
                        {existing && (
                          <p className="text-xs text-amber-600 truncate">
                            Actuel : {existing}
                          </p>
                        )}
                      </div>
                      {existing ? (
                        <Badge variant="outline" className="text-[10px] px-1.5 border-amber-300 text-amber-700 bg-amber-50 shrink-0">écrase</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] px-1.5 border-green-300 text-green-700 bg-green-50 shrink-0">nouveau</Badge>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  className="flex-1"
                  onClick={applyEnrichment}
                  disabled={saving || Object.values(enrichSelectedFields).filter(Boolean).length === 0}
                >
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                  Appliquer ({Object.values(enrichSelectedFields).filter(Boolean).length})
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setShowEnrichDialog(false)}>
                  Ignorer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete contact confirmation dialog */}
      <Dialog open={!!deleteContactTarget} onOpenChange={(open) => { if (!open) setDeleteContactTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              Supprimer le contact
            </DialogTitle>
          </DialogHeader>
          {deleteContactTarget && (
            <div className="space-y-4">
              <p className="text-sm">
                Voulez-vous supprimer <strong>{deleteContactTarget.name}</strong> ?
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                <p className="font-medium flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Historique des conversations
                </p>
                <p className="text-xs">
                  Les appels associés à ce contact seront conservés dans l&apos;historique mais ne seront plus liés à ce contact.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="destructive" className="flex-1" onClick={confirmDeleteContact}>
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  Supprimer
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setDeleteContactTarget(null)}>
                  Annuler
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete client confirmation dialog */}
      <Dialog open={showDeleteClient} onOpenChange={setShowDeleteClient}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              Supprimer l&apos;entreprise
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm">
              Voulez-vous supprimer <strong>{client.name}</strong> et toutes ses données ?
            </p>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 space-y-1.5">
              <p className="font-medium flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Action irréversible
              </p>
              <ul className="text-xs space-y-0.5 ml-5.5 list-disc">
                <li>Tous les contacts seront supprimés</li>
                <li>Les entrées playlist seront supprimées</li>
                <li>Les appels et ventes seront dissociés (conservés sans lien)</li>
              </ul>
            </div>
            <div className="flex gap-2">
              <Button variant="destructive" className="flex-1" onClick={handleDeleteClient} disabled={deletingClient}>
                {deletingClient ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1.5" />}
                Supprimer
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setShowDeleteClient(false)}>
                Annuler
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Merge dialog */}
      <Dialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5" />
              Rattacher à un client existant
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Les numéros de téléphone et l&apos;historique d&apos;appels seront transférés vers le client sélectionné. Cette fiche sera supprimée.
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un client..."
              value={mergeSearch}
              onChange={(e) => searchMergeTargets(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {searchingMerge && (
              <div className="text-center py-4 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                Recherche...
              </div>
            )}
            {!searchingMerge && mergeSearch.length >= 2 && mergeResults.length === 0 && (
              <p className="text-center py-4 text-muted-foreground text-sm">Aucun client trouvé</p>
            )}
            {mergeResults.map((target) => (
              <button
                key={target.id}
                className="w-full flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors text-left"
                onClick={() => handleMerge(target.id, target.name)}
                disabled={merging}
              >
                <div>
                  <p className="font-medium text-sm">{target.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[target.city, target.phone_e164].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                {merging ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Link2 className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Order detail dialog */}
      <Dialog open={!!orderDetail} onOpenChange={() => setOrderDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Commande {orderDetail?.sage_piece_id}
            </DialogTitle>
          </DialogHeader>
          {orderDetail && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>{formatDate(orderDetail.date)}</span>
                <span>·</span>
                <span className="font-medium text-foreground">
                  {formatCurrency(orderDetail.total_ht)}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="px-3 py-2">Produit</th>
                      <th className="px-3 py-2 text-right">Qté</th>
                      <th className="px-3 py-2 text-right">PU</th>
                      <th className="px-3 py-2 text-right">HT</th>
                      <th className="px-3 py-2 text-right">Marge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderDetail.lines.map((l, i) => (
                      <tr key={i} className="border-b hover:bg-accent/50">
                        <td className="px-3 py-2">
                          <Link
                            href={`/products?ref=${encodeURIComponent(l.article_ref || "")}`}
                            className="hover:text-sora transition-colors"
                          >
                            <p className="text-sm">
                              {l.designation || l.article_ref || "—"}
                            </p>
                            {l.article_ref && (
                              <p className="text-xs text-muted-foreground font-mono">
                                {l.article_ref}
                              </p>
                            )}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-right text-sm">
                          {l.quantity != null
                            ? new Intl.NumberFormat("fr-FR", {
                                maximumFractionDigits: 2,
                              }).format(l.quantity)
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-sm">
                          {l.unit_price != null
                            ? formatCurrencyPrecise(l.unit_price)
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-medium">
                          {formatCurrency(l.amount_ht)}
                        </td>
                        <td className="px-3 py-2 text-right text-sm">
                          {l.margin_percent != null ? (
                            <span
                              className={
                                l.margin_percent >= 20
                                  ? "text-green-600"
                                  : l.margin_percent >= 0
                                  ? "text-amber-600"
                                  : "text-red-600"
                              }
                            >
                              {l.margin_percent.toFixed(1)}%
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add phone dialog */}
      <Dialog open={showAddPhone} onOpenChange={setShowAddPhone}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ajouter un numéro</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Numéro de téléphone</Label>
              <Input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="06 12 34 56 78"
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <div className="flex gap-2">
                {["mobile", "fixe", "fax", "autre"].map((l) => (
                  <Button
                    key={l}
                    variant={newPhoneLabel === l ? "default" : "outline"}
                    size="sm"
                    onClick={() => setNewPhoneLabel(l)}
                  >
                    {l.charAt(0).toUpperCase() + l.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
            <Button
              className="w-full"
              onClick={handleAddPhone}
              disabled={addingPhone}
            >
              {addingPhone ? "Ajout..." : "Ajouter"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Contact create/edit dialog */}
      <Dialog open={showContactDialog} onOpenChange={setShowContactDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingContact ? 'Modifier le contact' : 'Nouveau contact'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Prénom *</Label>
                <Input className="h-8 text-sm" value={contactForm.first_name} onChange={(e) => setContactForm({...contactForm, first_name: e.target.value})} placeholder="Prénom" autoFocus />
              </div>
              <div>
                <Label className="text-xs">Nom *</Label>
                <Input className="h-8 text-sm" value={contactForm.last_name} onChange={(e) => setContactForm({...contactForm, last_name: e.target.value})} placeholder="Nom de famille" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Rôle / Fonction</Label>
              <Input className="h-8 text-sm" value={contactForm.role} onChange={(e) => setContactForm({...contactForm, role: e.target.value})} placeholder="Ex: Directeur, Acheteur..." />
            </div>
            <div>
              <Label className="text-xs">Téléphone {editingContact?.phone ? '(clé unique)' : ''}</Label>
              <Input
                className="h-8 text-sm"
                value={contactForm.phone}
                onChange={(e) => setContactForm({...contactForm, phone: e.target.value})}
                placeholder="+33 6 12 34 56 78"
                readOnly={!!editingContact?.phone}
                disabled={!!editingContact?.phone}
              />
            </div>
            <div>
              <Label className="text-xs flex items-center justify-between">
                <span>Emails</span>
                <button type="button" className="text-[10px] text-primary hover:underline" onClick={() => setContactForm({...contactForm, emails: [...contactForm.emails, '']})}>
                  + Ajouter un email
                </button>
              </Label>
              <div className="space-y-1.5">
                {contactForm.emails.map((email, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    <Input
                      className="h-8 text-sm flex-1"
                      type="email"
                      value={email}
                      onChange={(e) => {
                        const updated = [...contactForm.emails];
                        updated[idx] = e.target.value;
                        setContactForm({...contactForm, emails: updated});
                      }}
                      placeholder={idx === 0 ? "email@entreprise.fr" : "autre email..."}
                    />
                    {contactForm.emails.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => {
                        const updated = contactForm.emails.filter((_, i) => i !== idx);
                        setContactForm({...contactForm, emails: updated});
                      }}>
                        <X className="w-3 h-3 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <Button className="w-full" onClick={handleSaveContact} disabled={savingContact || (!contactForm.first_name.trim() && !contactForm.last_name.trim())}>
              {savingContact ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {editingContact ? 'Enregistrer' : 'Créer le contact'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Move contact dialog */}
      <Dialog open={showMoveContactDialog} onOpenChange={setShowMoveContactDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpDown className="w-5 h-5" />
              Déplacer le contact
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Le contact sera déplacé avec ses appels et numéros de téléphone vers l&apos;entreprise sélectionnée.
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher une entreprise..."
              value={moveCompanySearch}
              onChange={(e) => searchMoveTargets(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {moveCompanySearch.length >= 2 && moveCompanyResults.length === 0 && (
              <p className="text-center py-4 text-muted-foreground text-sm">Aucune entreprise trouvée</p>
            )}
            {moveCompanyResults.map((target) => (
              <button
                key={target.id}
                className="w-full flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors text-left"
                onClick={() => handleMoveContact(target.id, target.name)}
                disabled={movingContact}
              >
                <div>
                  <p className="font-medium text-sm">{target.name}</p>
                  {target.city && <p className="text-xs text-muted-foreground">{target.city}</p>}
                </div>
                {movingContact ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpDown className="w-4 h-4 text-muted-foreground" />}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function MonthlyCAChart({
  data,
}: {
  data: { month: string; total_ht: number; order_count: number }[];
}) {
  const chartData = data.map((m) => ({
    month: formatMonth(m.month),
    rawMonth: m.month,
    ca: Math.round(m.total_ht * 100) / 100,
    orders: m.order_count,
  }));

  const showBrush = chartData.length > 12;
  const startIndex = showBrush ? Math.max(chartData.length - 12, 0) : 0;

  return (
    <div className="w-full h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 8, right: 8, left: -5, bottom: 0 }}
        >
          <defs>
            <linearGradient id="caGradient" x1="0" y1="0" x2="0" y2="1">
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
              if (name === "ca")
                return [formatCurrencyPrecise(value as number), "CA HT"];
              return [value as number, "Commandes"];
            }}
          />
          <Area
            type="monotone"
            dataKey="ca"
            stroke="#8397A7"
            strokeWidth={2.5}
            fill="url(#caGradient)"
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
  );
}
