"use client";

import { useEffect, useState } from "react";
import { api, PlaylistItem, PlaylistInsight, EnrichSuggestion, UpdateClientPayload } from "@/lib/api";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ListMusic,
  CheckCircle2,
  SkipForward,
  Undo2,
  Sparkles,
  Loader2,
  Package,
  MapPin,
  ShoppingCart,
  Calendar,
  ArrowRight,
  Eye,
  X,
  ExternalLink,
  TrendingDown,
  TrendingUp,
  DollarSign,
  ShoppingBag,
  User,
  Building2,
  Phone,
  Search,
  Zap,
  Check,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { ClickToCall } from "@/components/click-to-call";
import { StatusBadge } from "@/components/status-badge";

function reasonLabel(reason: string) {
  const map: Record<string, string> = {
    churn_risk: "Risque churn",
    callback: "Rappel",
    upsell: "Upsell",
    new_prospect: "Prospect",
    dormant: "Dormant",
    relationship: "Relation",
  };
  return map[reason] || reason;
}

function reasonBadgeClass(reason: string) {
  const map: Record<string, string> = {
    churn_risk: "bg-red-50 text-red-600 border-red-200",
    callback: "bg-sora/10 text-sora border-sora/20",
    upsell: "bg-green-50 text-green-600 border-green-200",
    new_prospect: "bg-amber-50 text-amber-600 border-amber-200",
    dormant: "bg-ume/10 text-ume border-ume/20",
    relationship: "bg-gray-50 text-sensai border-gray-200",
  };
  return map[reason] || "bg-gray-50 text-gray-600";
}

function reasonIcon(reason: string) {
  const map: Record<string, string> = {
    churn_risk: "🔴",
    callback: "📞",
    upsell: "📈",
    new_prospect: "🆕",
    dormant: "💤",
    relationship: "🤝",
  };
  return map[reason] || "📋";
}


export default function PlaylistPage() {
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [insight, setInsight] = useState<PlaylistInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [enrichSuggestions, setEnrichSuggestions] = useState<EnrichSuggestion | null>(null);
  const [enrichTargetId, setEnrichTargetId] = useState<string | null>(null);
  const [enrichSelectedFields, setEnrichSelectedFields] = useState<Record<string, boolean>>({});
  const [enrichSaving, setEnrichSaving] = useState(false);

  const selectedItem = items.find((i) => i.playlist_id === selectedId) || null;

  useEffect(() => {
    api
      .getPlaylist()
      .then(setItems)
      .catch(() => toast.error("Impossible de charger la playlist"))
      .finally(() => setLoading(false));
  }, []);

  const handleStatus = async (id: string, status: string) => {
    try {
      await api.updatePlaylistStatus(id, status);
      setItems((prev) =>
        prev.map((i) => (i.playlist_id === id ? { ...i, status } : i))
      );
      const msg: Record<string, string> = {
        done: "Marqué comme fait",
        skipped: "Passé",
        pending: "Remis en attente",
      };
      toast.success(msg[status] || status);
    } catch {
      toast.error("Erreur de mise à jour");
    }
  };

  const openInsight = async (item: PlaylistItem) => {
    setSelectedId(item.playlist_id);
    setInsight(null);
    setInsightLoading(true);
    try {
      const data = await api.getPlaylistInsight(item.playlist_id);
      setInsight(data);
    } catch {
      toast.error("Erreur chargement insight");
    } finally {
      setInsightLoading(false);
    }
  };

  const requestAi = async () => {
    if (!selectedId) return;
    setAiLoading(true);
    try {
      const data = await api.getPlaylistInsight(selectedId, true);
      setInsight(data);
    } catch {
      toast.error("Erreur IA");
    } finally {
      setAiLoading(false);
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

  const enrichClient = async (clientId: string) => {
    setEnrichLoading(true);
    try {
      const suggestions = await api.enrichClient(clientId);
      const hasData = ENRICH_FIELDS.some(([k]) => !!suggestions[k]);
      if (!hasData) {
        toast.info("Aucune nouvelle donnée trouvée — complétez la fiche manuellement");
        return;
      }
      const selected: Record<string, boolean> = {};
      for (const [key] of ENRICH_FIELDS) {
        if (suggestions[key]) selected[key] = true;
      }
      setEnrichSuggestions(suggestions);
      setEnrichTargetId(clientId);
      setEnrichSelectedFields(selected);
    } catch {
      toast.error("Erreur lors de l'enrichissement");
    } finally {
      setEnrichLoading(false);
    }
  };

  const applyEnrichFromPlaylist = async () => {
    if (!enrichSuggestions || !enrichTargetId) return;
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
    setEnrichSaving(true);
    try {
      await api.updateClient(enrichTargetId, payload);
      if (payload.phone) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === enrichTargetId ? { ...i, phone_e164: payload.phone ?? i.phone_e164 } : i
          )
        );
      }
      toast.success("Enrichissement appliqué");
      setEnrichSuggestions(null);
      setEnrichTargetId(null);
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setEnrichSaving(false);
    }
  };

  const closePanel = () => {
    setSelectedId(null);
    setInsight(null);
  };

  const doneCount = items.filter((i) => ["done", "called"].includes(i.status)).length;
  const skippedCount = items.filter((i) => i.status === "skipped").length;
  const pendingCount = items.filter((i) => i.status === "pending").length;
  const total = items.length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
            <ListMusic className="w-5 h-5 sm:w-6 sm:h-6" />
            Playlist du jour
          </h2>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            <span className="text-green-600 font-medium">{doneCount} fait{doneCount > 1 ? "s" : ""}</span>
            <span>·</span>
            <span>{skippedCount} passé{skippedCount > 1 ? "s" : ""}</span>
            <span>·</span>
            <span>{pendingCount} en attente</span>
          </div>
        </div>
        <div className="text-right text-sm font-semibold text-muted-foreground">
          {total} appels prévus
        </div>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="w-full bg-accent rounded-full h-2.5 overflow-hidden">
          <div className="h-full flex">
            <div
              className="bg-green-500 transition-all duration-500"
              style={{ width: `${(doneCount / total) * 100}%` }}
            />
            <div
              className="bg-gray-300 transition-all duration-500"
              style={{ width: `${(skippedCount / total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Layout: list + side panel */}
      <div className="flex gap-0">
        {/* List */}
        <div className={`flex-1 min-w-0 transition-all duration-300 ${selectedId ? "mr-0" : ""}`}>
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
              Chargement...
            </div>
          ) : items.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Aucune playlist pour aujourd&apos;hui. Lancez la génération depuis
                l&apos;admin.
              </CardContent>
            </Card>
          ) : (
            <div className="border rounded-lg divide-y bg-card">
              {items.map((item, idx) => {
                const isDone = item.status === "done" || item.status === "called";
                const isSkipped = item.status === "skipped";
                const isProcessed = isDone || isSkipped;
                const isSelected = item.playlist_id === selectedId;

                return (
                  <div
                    key={item.playlist_id}
                    className={`flex items-center gap-3 px-3 py-2.5 sm:px-4 sm:py-3 transition-colors cursor-pointer ${
                      isSelected ? "bg-sora/5 border-l-2 border-l-sora" : "hover:bg-accent/30"
                    } ${isProcessed ? "opacity-40" : ""}`}
                    onClick={() => openInsight(item)}
                  >
                    {/* Priority number */}
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      isDone ? "bg-green-100 text-green-600" : isSkipped ? "bg-gray-100 text-gray-400" : "bg-accent text-foreground"
                    }`}>
                      {isDone ? "✓" : idx + 1}
                    </div>

                    {/* Reason badge */}
                    <Badge variant="outline" className={`text-xs px-1.5 py-0 shrink-0 ${reasonBadgeClass(item.reason)}`}>
                      <span className="mr-0.5">{reasonIcon(item.reason)}</span>
                      <span className="hidden sm:inline">{reasonLabel(item.reason)}</span>
                    </Badge>

                    {/* Client status */}
                    <StatusBadge status={item.client_status} size="xs" />

                    {/* Contact + Company info */}
                    <div className="flex-1 min-w-0">
                      {item.primary_contact && !/^\+?\d[\d\s-]{6,}$/.test(item.primary_contact.name) ? (
                        <>
                          <div className="flex items-center gap-1.5">
                            <User className="w-3 h-3 text-muted-foreground shrink-0" />
                            <p className="text-sm font-medium truncate">
                              {item.primary_contact.name}
                            </p>
                            {item.primary_contact.role && (
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                · {item.primary_contact.role}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Building2 className="w-3 h-3 text-muted-foreground shrink-0" />
                            <p className="text-xs text-muted-foreground truncate">
                              {item.name}
                            </p>
                          </div>
                        </>
                      ) : (
                        <p className="text-sm font-medium truncate">
                          {item.contact_name && !/^\+?\d[\d\s-]{6,}$/.test(item.contact_name) ? item.contact_name : item.name}
                        </p>
                      )}
                      {item.reason_detail && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {item.reason_detail}
                        </p>
                      )}
                    </div>

                    {/* City */}
                    {item.city && (
                      <span className="text-xs text-muted-foreground hidden lg:block shrink-0">
                        {item.city}
                      </span>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {!isProcessed && (
                        <>
                          {item.phone_e164 && (
                            <ClickToCall
                              phoneNumber={item.phone_e164}
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                            />
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleStatus(item.playlist_id, "done")}
                            title="Marquer fait"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleStatus(item.playlist_id, "skipped")}
                            title="Passer"
                          >
                            <SkipForward className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                        </>
                      )}

                      {isProcessed && (
                        <div className="flex items-center gap-1">
                          <Badge
                            variant={isDone ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {isDone ? "Fait" : "Passé"}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleStatus(item.playlist_id, "pending")}
                            title="Remettre en attente"
                          >
                            <Undo2 className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Side panel (Sheet) */}
      <Sheet open={!!selectedId} onOpenChange={(open) => { if (!open) closePanel(); }}>
        <SheetContent side="right" className="w-full sm:w-[440px] sm:max-w-[440px] p-0 overflow-y-auto">
          <SheetHeader className="sr-only">
            <SheetTitle>Détail opportunité</SheetTitle>
          </SheetHeader>
          {insightLoading ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mb-3" />
              <p className="text-sm">Chargement...</p>
            </div>
          ) : insight && selectedItem ? (
            <div className="flex flex-col h-full">
              {/* Panel header */}
              <div className="sticky top-0 z-10 bg-card border-b px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className={`text-xs shrink-0 ${reasonBadgeClass(insight.reason)}`}>
                        {reasonIcon(insight.reason)} {reasonLabel(insight.reason)}
                      </Badge>
                    </div>
                    {selectedItem.primary_contact && !/^\+?\d[\d\s-]{6,}$/.test(selectedItem.primary_contact.name) && (
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <User className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium truncate">{selectedItem.primary_contact.name}</span>
                        {selectedItem.primary_contact.role && (
                          <span className="text-xs text-muted-foreground shrink-0">· {selectedItem.primary_contact.role}</span>
                        )}
                      </div>
                    )}
                    <h3 className="text-lg font-bold leading-tight truncate flex items-center gap-1.5">
                      <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                      {insight.client_name}
                    </h3>
                    {insight.client_city && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3.5 h-3.5" />
                        {insight.client_city}
                      </p>
                    )}
                  </div>
                </div>

                {/* Quick actions */}
                <div className="mt-3 space-y-2">
                  <div className="flex gap-2">
                    <Link href={`/clients/${selectedItem.id}`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full text-xs h-9">
                        <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                        Fiche client
                      </Button>
                    </Link>
                    {selectedItem.phone_e164 ? (
                      <ClickToCall
                        phoneNumber={selectedItem.phone_e164}
                        variant="cta"
                        contactName={selectedItem.primary_contact?.name || selectedItem.contact_name || undefined}
                        className="flex-1"
                      />
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs h-9 border-dashed"
                        onClick={() => enrichClient(selectedItem.id)}
                        disabled={enrichLoading}
                      >
                        {enrichLoading ? (
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <Search className="w-3.5 h-3.5 mr-1.5" />
                        )}
                        {enrichLoading ? "Recherche…" : "Trouver un n°"}
                      </Button>
                    )}
                  </div>
                  {selectedItem.phone_e164 && (() => {
                    const rawName = selectedItem.primary_contact?.name || selectedItem.contact_name;
                    const isPhone = !rawName || /^\+?\d[\d\s-]{6,}$/.test(rawName);
                    return (
                      <p className="text-xs text-muted-foreground text-center">
                        {!isPhone && <><span>{rawName}</span><span className="mx-1">·</span></>}
                        <span className="font-mono">{selectedItem.phone_e164}</span>
                      </p>
                    );
                  })()}
                  {!selectedItem.phone_e164 && (
                    <p className="text-xs text-muted-foreground text-center italic">
                      Pas de numéro — cliquez sur &quot;Trouver un n°&quot; pour lancer l&apos;enrichissement IA
                    </p>
                  )}
                </div>
              </div>

              {/* Panel body */}
              <div className="flex-1 px-5 py-4 space-y-5">
                {/* KPIs */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="bg-accent/40 rounded-lg p-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-sora/10 flex items-center justify-center shrink-0">
                      <DollarSign className="w-4 h-4 text-sora" />
                    </div>
                    <div>
                      <p className="text-base font-bold">{insight.ca_12m.toLocaleString("fr-FR")}€</p>
                      <p className="text-xs text-muted-foreground">CA 12 mois</p>
                    </div>
                  </div>
                  <div className="bg-accent/40 rounded-lg p-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center shrink-0">
                      <ShoppingBag className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-base font-bold">{insight.avg_basket.toLocaleString("fr-FR")}€</p>
                      <p className="text-xs text-muted-foreground">Panier moy.</p>
                    </div>
                  </div>
                  <div className={`rounded-lg p-3 flex items-center gap-3 ${insight.score_churn > 50 ? "bg-red-50" : "bg-accent/40"}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${insight.score_churn > 50 ? "bg-red-100" : "bg-accent"}`}>
                      <TrendingDown className={`w-4 h-4 ${insight.score_churn > 50 ? "text-red-600" : "text-muted-foreground"}`} />
                    </div>
                    <div>
                      <p className={`text-base font-bold ${insight.score_churn > 50 ? "text-red-600" : ""}`}>{insight.score_churn}%</p>
                      <p className="text-xs text-muted-foreground">Churn</p>
                    </div>
                  </div>
                  <div className={`rounded-lg p-3 flex items-center gap-3 ${insight.score_upsell > 40 ? "bg-green-50" : "bg-accent/40"}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${insight.score_upsell > 40 ? "bg-green-100" : "bg-accent"}`}>
                      <TrendingUp className={`w-4 h-4 ${insight.score_upsell > 40 ? "text-green-600" : "text-muted-foreground"}`} />
                    </div>
                    <div>
                      <p className={`text-base font-bold ${insight.score_upsell > 40 ? "text-green-600" : ""}`}>{insight.score_upsell}%</p>
                      <p className="text-xs text-muted-foreground">Upsell</p>
                    </div>
                  </div>
                </div>

                {/* Context info */}
                <div className="space-y-2">
                  {insight.days_since_last_order !== null && insight.days_since_last_order !== undefined && (
                    <div className="flex items-center gap-2.5 text-sm">
                      <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span>Dernière commande il y a <strong>{insight.days_since_last_order} jours</strong></span>
                    </div>
                  )}
                  {insight.reason_detail && (
                    <div className="flex items-center gap-2.5 text-sm">
                      <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span>{insight.reason_detail}</span>
                    </div>
                  )}
                  {insight.ca_total > 0 && (
                    <div className="flex items-center gap-2.5 text-sm">
                      <DollarSign className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span>CA total historique : <strong>{insight.ca_total.toLocaleString("fr-FR")}€</strong></span>
                    </div>
                  )}
                </div>

                {/* Upsell recommendations */}
                {insight.upsell_recommendations && insight.upsell_recommendations.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-2 text-sensai">
                      <Zap className="w-4 h-4" />
                      Opportunités upsell
                    </h4>
                    <div className="border border-sensai/20 bg-sensai/5 rounded-lg divide-y divide-sensai/10">
                      {insight.upsell_recommendations.map((r) => (
                        <Link
                          key={r.article_ref}
                          href={`/products?ref=${encodeURIComponent(r.article_ref)}`}
                          className="flex items-center gap-2.5 px-3 py-2 hover:bg-sensai/10 transition-colors group"
                        >
                          <div className="w-6 h-6 rounded-full bg-sensai/15 flex items-center justify-center shrink-0">
                            <Zap className="w-3 h-3 text-sensai" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate group-hover:underline">{r.designation}</p>
                            <p className="text-xs text-muted-foreground">
                              {r.similar_clients_count} client{r.similar_clients_count > 1 ? "s" : ""} similaire{r.similar_clients_count > 1 ? "s" : ""}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-medium">{r.avg_revenue.toLocaleString("fr-FR")}€</p>
                            <p className="text-[10px] text-muted-foreground">CA moy.</p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* Products */}
                {insight.top_products.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                      <ShoppingCart className="w-4 h-4" />
                      Produits commandés
                    </h4>
                    <div className="border rounded-lg divide-y">
                      {insight.top_products.map((p) => (
                        <Link
                          key={p.article_ref}
                          href={`/products?ref=${encodeURIComponent(p.article_ref)}`}
                          className="flex items-center gap-2.5 px-3 py-2 hover:bg-accent/30 transition-colors group"
                        >
                          <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate group-hover:underline">{p.designation}</p>
                            {p.last_order_date && (
                              <p className="text-xs text-muted-foreground">
                                Dernière cde : {new Date(p.last_order_date).toLocaleDateString("fr-FR")}
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-medium">{p.total_ht.toLocaleString("fr-FR")}€</p>
                            <p className="text-xs text-muted-foreground">{p.order_count}x</p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI suggestion */}
                {insight.ai_suggestion ? (
                  <div className="border border-sora/20 bg-sora/5 rounded-lg p-4">
                    <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-2.5 text-sora">
                      <Sparkles className="w-4 h-4" />
                      Recommandation IA
                    </h4>
                    <div className="text-sm whitespace-pre-line leading-relaxed">
                      {insight.ai_suggestion}
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={requestAi}
                    disabled={aiLoading}
                  >
                    {aiLoading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4 mr-2 text-sora" />
                    )}
                    {aiLoading ? "Analyse en cours..." : "Demander une recommandation IA"}
                  </Button>
                )}
              </div>

              {/* Panel footer - status actions */}
              {selectedItem.status === "pending" && (
                <div className="sticky bottom-0 bg-card border-t px-5 py-3 flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => handleStatus(selectedItem.playlist_id, "done")}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1.5" />
                    Fait
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleStatus(selectedItem.playlist_id, "skipped")}
                  >
                    <SkipForward className="w-4 h-4 mr-1.5" />
                    Passer
                  </Button>
                </div>
              )}
              {selectedItem.status !== "pending" && (
                <div className="sticky bottom-0 bg-card border-t px-5 py-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => handleStatus(selectedItem.playlist_id, "pending")}
                  >
                    <Undo2 className="w-4 h-4 mr-1.5" />
                    Remettre en attente
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Sélectionnez un client
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Enrich dialog */}
      <Dialog open={!!enrichSuggestions} onOpenChange={(open) => { if (!open) { setEnrichSuggestions(null); setEnrichTargetId(null); } }}>
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
              <p className="text-xs text-muted-foreground">Sélectionnez les champs à appliquer sur la fiche client.</p>
              <div className="space-y-1 text-sm">
                {ENRICH_FIELDS.map(([key, label]) => {
                  const val = enrichSuggestions[key];
                  if (!val) return null;
                  const isSelected = enrichSelectedFields[key] ?? false;
                  const currentItem = items.find((i) => i.id === enrichTargetId);
                  const existing = key === "phone"
                    ? currentItem?.phone_e164
                    : key === "name"
                      ? currentItem?.name
                      : key === "city"
                        ? currentItem?.city
                        : key === "email"
                          ? currentItem?.email
                          : undefined;
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
                          <p className="text-xs text-amber-600 truncate">Actuel : {existing}</p>
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
                  onClick={applyEnrichFromPlaylist}
                  disabled={enrichSaving || Object.values(enrichSelectedFields).filter(Boolean).length === 0}
                >
                  {enrichSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                  Appliquer ({Object.values(enrichSelectedFields).filter(Boolean).length})
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => { setEnrichSuggestions(null); setEnrichTargetId(null); }}>
                  Ignorer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
