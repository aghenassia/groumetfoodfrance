"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  api,
  Call,
  Client,
  QualifyRequest,
  AiAnalysis,
  ClientDetail,
  Contact as ContactType,
  ContactCallEntry,
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
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  PhoneOff,
  Clock,
  MessageSquare,
  CheckCircle2,
  Headphones,
  Bot,
  Star,
  TrendingUp,
  User,
  MapPin,
  Mail,
  Building2,
  ChevronRight,
  X,
  Search,
  DollarSign,
  Calendar,
  ShoppingCart,
  AlertTriangle,
  Target,
  ExternalLink,
  Plus,
  LinkIcon,
  Briefcase,
  ArrowRight,
  Play,
  Voicemail,
  Pencil,
  Check,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { ClickToCall } from "@/components/click-to-call";

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDurationLong(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}min ${s > 0 ? s + "s" : ""}`.trim();
}

function formatDate(d: string) {
  return new Date(d).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateShort(d: string) {
  return new Date(d).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(d: string) {
  return new Date(d).toLocaleString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateOnly(d: string) {
  const now = new Date();
  const date = new Date(d);
  const diff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Hier";
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function isOutbound(call: { direction: string }) {
  return call.direction === "out" || call.direction === "outbound" || call.direction === "OUT";
}

function formatCurrency(v: number | null | undefined): string {
  if (v == null || v === 0) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v);
}

function daysAgo(d: string | null | undefined): string {
  if (!d) return "";
  const diff = Math.floor(
    (Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diff === 0) return "aujourd'hui";
  if (diff === 1) return "hier";
  if (diff < 30) return `il y a ${diff}j`;
  if (diff < 365) return `il y a ${Math.floor(diff / 30)} mois`;
  return `il y a ${Math.floor(diff / 365)} an(s)`;
}

function scoreColor(score: number | undefined | null) {
  if (score == null) return "text-muted-foreground";
  if (score >= 7) return "text-green-600 dark:text-green-400";
  if (score >= 5) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function scoreBg(score: number | undefined | null) {
  if (score == null) return "bg-muted";
  if (score >= 7) return "bg-green-50 border-green-500/20 dark:bg-green-950/30 dark:border-green-500/20";
  if (score >= 5) return "bg-amber-50 border-amber-500/20 dark:bg-amber-950/30 dark:border-amber-500/20";
  return "bg-red-50 border-red-500/20 dark:bg-red-950/30 dark:border-red-500/20";
}

function moodEmoji(mood: string | undefined) {
  if (mood === "positive") return "😊";
  if (mood === "negative") return "😞";
  return "😐";
}

function moodLabel(mood: string | undefined) {
  if (mood === "positive") return "Positif";
  if (mood === "negative") return "Négatif";
  return "Neutre";
}

function outcomeColor(outcome: string | undefined) {
  if (!outcome) return "";
  if (outcome === "Commande") return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-green-300/50";
  if (outcome === "Devis envoyé") return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-300/50";
  if (outcome === "Rappel prévu" || outcome === "Intéressé") return "bg-sora/10 text-sora border-sora/20";
  if (outcome === "Pas intéressé") return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-300/30";
  if (outcome === "Injoignable" || outcome === "Mauvais numéro") return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300/50";
  return "";
}

const isPhoneNumber = (s: string) => /^[\d\s+\-().]{6,}$/.test(s.trim());

const MOODS = [
  { value: "positive", label: "Positif", color: "bg-green-500" },
  { value: "neutral", label: "Neutre", color: "bg-gray-500" },
  { value: "negative", label: "Négatif", color: "bg-red-500" },
];

const OUTCOMES = [
  "Intéressé",
  "Rappel prévu",
  "Devis envoyé",
  "Commande",
  "Pas intéressé",
  "Injoignable",
  "Mauvais numéro",
];

export default function CallsPage() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [animKey, setAnimKey] = useState(0);
  const [tab, setTab] = useState<"all" | "unqualified">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const selectedCallRef = useRef<Call | null>(null);

  const [qualifyCall, setQualifyCall] = useState<Call | null>(null);
  const [qualForm, setQualForm] = useState<Partial<QualifyRequest>>({});
  const [submitting, setSubmitting] = useState(false);

  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [panelMode, setPanelMode] = useState<"detail" | "company">("detail");
  const [selectedClient, setSelectedClient] = useState<ClientDetail | null>(null);
  const [loadingClient, setLoadingClient] = useState(false);

  const [clientResults, setClientResults] = useState<Client[]>([]);
  const [contactResults, setContactResults] = useState<ContactType[]>([]);
  const [searchingClients, setSearchingClients] = useState(false);
  const [showClientResults, setShowClientResults] = useState(false);

  const [enrichForm, setEnrichForm] = useState<{ first_name: string; last_name: string; role: string } | null>(null);
  const [savingEnrich, setSavingEnrich] = useState(false);

  const [assignDialog, setAssignDialog] = useState<{ contactId: string; contactName: string } | null>(null);
  const [assignSearch, setAssignSearch] = useState("");
  const [assignResults, setAssignResults] = useState<Client[]>([]);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [searchingAssign, setSearchingAssign] = useState(false);
  const [assigningContact, setAssigningContact] = useState(false);

  const fetchCalls = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (searchQuery.trim()) params.search = searchQuery.trim();
    const promise = tab === "unqualified" ? api.getUnqualifiedCalls() : api.getCalls(params);
    promise.then((freshCalls) => {
      setCalls(freshCalls);
      setAnimKey((k) => k + 1);
      const current = selectedCallRef.current;
      if (current) {
        const updated = freshCalls.find((c: Call) => c.id === current.id);
        if (updated) setSelectedCall(updated);
      }
    }).catch(() => toast.error("Erreur de chargement")).finally(() => setLoading(false));
  }, [tab, searchQuery]);

  useEffect(() => { fetchCalls(); }, [tab]);

  const prevSearchRef = useRef(searchQuery);
  useEffect(() => {
    const timer = setTimeout(() => {
      const changed = prevSearchRef.current !== searchQuery;
      prevSearchRef.current = searchQuery;
      if (tab === "all" && changed) fetchCalls();
      if (searchQuery.trim().length >= 2) {
        setSearchingClients(true);
        Promise.all([
          api.getClients({ search: searchQuery.trim(), limit: "8" }),
          api.getContacts({ search: searchQuery.trim(), limit: "8" }),
        ]).then(([clientRes, contactRes]) => {
          setClientResults(clientRes.clients);
          setContactResults(contactRes.contacts);
          setShowClientResults(true);
        }).catch(() => {}).finally(() => setSearchingClients(false));
      } else {
        setClientResults([]);
        setContactResults([]);
        setShowClientResults(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const contactName = (call: Call) => {
    if (call.contact_name && !isPhoneNumber(call.contact_name)) return call.contact_name;
    return null;
  };

  const companyName = (call: Call) => {
    const n = call.company_name || call.client_name;
    return n && !isPhoneNumber(n) ? n : null;
  };

  const displayName = (call: Call) => {
    return contactName(call) || companyName(call) || call.contact_number || "Inconnu";
  };

  const isOrphanCall = (call: Call) => !contactName(call) && !companyName(call);

  const isVoicemail = (call: Call) => call.ai_analysis?.is_voicemail === true;

  const directionIcon = (call: Call) => {
    if (isVoicemail(call)) return <Voicemail className="w-3.5 h-3.5 text-amber-500" />;
    if (!call.is_answered && !isOutbound(call)) return <PhoneMissed className="w-3.5 h-3.5 text-red-500" />;
    if (!call.is_answered && isOutbound(call)) return <PhoneOff className="w-3.5 h-3.5 text-amber-500" />;
    if (isOutbound(call)) return <PhoneOutgoing className="w-3.5 h-3.5 text-sora" />;
    return <PhoneIncoming className="w-3.5 h-3.5 text-green-600" />;
  };

  const callStatusLabel = (call: Call) => {
    if (!call.is_answered) return isOutbound(call) ? "Sans réponse" : "Manqué";
    if (isVoicemail(call)) return "Répondeur";
    return formatDuration(call.incall_duration);
  };

  useEffect(() => { selectedCallRef.current = selectedCall; }, [selectedCall]);

  const selectCall = (call: Call) => {
    setSelectedCall(call);
    setPanelMode("detail");
    setAnalysis(null);
    setEnrichForm(null);
    if (call.ai_analysis?.summary) {
      api.getCallAnalysis(call.id).then(setAnalysis).catch(() => {});
    }
    if (call.client_id || call.company_id) {
      const cid = call.company_id || call.client_id;
      if (cid && (!selectedClient || selectedClient.id !== cid)) {
        setLoadingClient(true);
        api.getClient(cid).then(setSelectedClient).catch(() => {}).finally(() => setLoadingClient(false));
      }
    } else {
      setSelectedClient(null);
    }
  };

  const openCompanyPanel = (clientId: string) => {
    setPanelMode("company");
    setLoadingClient(true);
    api.getClient(clientId).then(setSelectedClient).catch(() => toast.error("Erreur")).finally(() => setLoadingClient(false));
  };

  const openQualify = (call: Call) => {
    setQualifyCall(call);
    setQualForm({
      mood: call.qualification?.mood || undefined,
      outcome: call.qualification?.outcome || undefined,
      notes: call.qualification?.notes || "",
      next_step: call.qualification?.next_step || "",
    });
  };

  const handleQualify = async () => {
    if (!qualifyCall) return;
    setSubmitting(true);
    try {
      await api.qualifyCall({ call_id: qualifyCall.id, ...qualForm });
      toast.success("Appel qualifié (+10 XP)");
      setQualifyCall(null);
      fetchCalls();
    } catch { toast.error("Erreur de qualification"); } finally { setSubmitting(false); }
  };

  const handleTranscribe = async () => {
    if (!selectedCall) return;
    setTranscribing(true);
    try {
      const res = await api.transcribeCall(selectedCall.id);
      setAnalysis(res);
      toast.success("Analyse terminée");
      fetchCalls();
    } catch { toast.error("Erreur de transcription"); } finally { setTranscribing(false); }
  };

  const openAssignDialog = (contactId: string, contactName: string) => {
    setAssignDialog({ contactId, contactName });
    setAssignSearch("");
    setAssignResults([]);
    setNewCompanyName("");
  };

  useEffect(() => {
    if (!assignDialog) return;
    if (assignSearch.trim().length < 2) { setAssignResults([]); return; }
    const timer = setTimeout(() => {
      setSearchingAssign(true);
      api.getClients({ search: assignSearch.trim(), limit: "8" })
        .then((res) => setAssignResults(res.clients)).catch(() => {}).finally(() => setSearchingAssign(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [assignSearch, assignDialog]);

  const handleAssignContact = async (companyId: string) => {
    if (!assignDialog) return;
    setAssigningContact(true);
    try {
      if (assignDialog.contactId === "__new_from_call__" && selectedCall) {
        const contact = await api.createContact({
          name: selectedCall.contact_number || "Nouveau contact",
          phone: selectedCall.contact_number || undefined,
          company_id: companyId,
          is_primary: false,
        });
        toast.success(`Contact créé et rattaché — pensez à compléter la fiche !`);
      } else {
        await api.assignContact(assignDialog.contactId, companyId);
        toast.success("Contact assigné");
      }
      setAssignDialog(null);
      fetchCalls();
    } catch { toast.error("Erreur d'assignation"); } finally { setAssigningContact(false); }
  };

  const handleCreateAndAssign = async () => {
    if (!assignDialog) return;
    const companyNameToUse = newCompanyName.trim() || assignDialog.contactName;
    if (!companyNameToUse || companyNameToUse.length < 2) {
      toast.error("Saisissez un nom pour l'entreprise");
      return;
    }
    setAssigningContact(true);
    try {
      const hasExistingContact = assignDialog.contactId !== "__new_from_call__";
      const created = await api.createProspect({
        name: companyNameToUse,
        phone: hasExistingContact ? undefined : selectedCall?.contact_number || undefined,
      });
      if (!hasExistingContact && selectedCall) {
        await api.createContact({
          name: selectedCall.contact_number || "Nouveau contact",
          phone: selectedCall.contact_number || undefined,
          company_id: created.id,
          is_primary: true,
        });
      } else {
        await api.assignContact(assignDialog.contactId, created.id);
      }
      toast.success("Entreprise créée et contact assigné");
      setAssignDialog(null);
      window.open(`/clients/${created.id}`, "_blank");
      fetchCalls();
    } catch { toast.error("Erreur de création"); } finally { setAssigningContact(false); }
  };

  const handleCreateFromOrphan = async (call: Call) => {
    setAssigningContact(true);
    try {
      const company = await api.createProspect({ name: call.contact_number || "Nouveau prospect" });
      await api.createContact({
        name: call.contact_number || "Nouveau contact",
        phone: call.contact_number || undefined,
        company_id: company.id,
        is_primary: true,
      });
      toast.success("Fiche créée ! Enrichissez le nom et les infos du contact.");
      window.open(`/clients/${company.id}`, "_blank");
      fetchCalls();
    } catch { toast.error("Erreur de création"); } finally { setAssigningContact(false); }
  };

  const handleEnrichContact = async () => {
    if (!enrichForm || !selectedCall) return;
    const first = enrichForm.first_name.trim();
    const last = enrichForm.last_name.trim();
    if (!first && !last) { toast.error("Saisissez au moins le prénom ou le nom"); return; }
    const fullName = [first, last].filter(Boolean).join(" ");
    setSavingEnrich(true);
    try {
      if (selectedCall.contact_id) {
        await api.updateContact(selectedCall.contact_id, {
          name: fullName,
          first_name: first || undefined,
          last_name: last || undefined,
          role: enrichForm.role || undefined,
        });
      } else {
        await api.createContact({
          name: fullName,
          first_name: first || undefined,
          last_name: last || undefined,
          role: enrichForm.role || undefined,
          phone: selectedCall.contact_number || undefined,
          company_id: selectedCall.company_id || selectedCall.client_id || undefined,
          is_primary: true,
        });
      }
      toast.success("Contact enrichi !");
      setEnrichForm(null);
      fetchCalls();
    } catch { toast.error("Erreur de sauvegarde"); } finally { setSavingEnrich(false); }
  };

  const panelOpen = selectedCall || (panelMode === "company" && selectedClient);

  return (
    <div className="relative">
      {/* ——— LEFT: Call list ——— */}
      <div className={`space-y-4 ${panelOpen ? "lg:pr-[440px]" : ""}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <Phone className="w-5 h-5" />
              Historique appels
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {calls.length} appel{calls.length > 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher un contact, entreprise, numéro..."
              className="pl-9 h-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => { if (clientResults.length > 0 || contactResults.length > 0) setShowClientResults(true); }}
              onBlur={() => { setTimeout(() => setShowClientResults(false), 200); }}
            />
            {showClientResults && (clientResults.length > 0 || contactResults.length > 0) && (
              <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-background border rounded-lg shadow-lg max-h-[360px] overflow-y-auto">
                {contactResults.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 border-b bg-muted/30">
                      <p className="text-[11px] font-medium text-muted-foreground">
                        <User className="w-3 h-3 inline mr-1" />Contacts ({contactResults.length})
                      </p>
                    </div>
                    {contactResults.map((ct) => (
                      <div key={ct.id} className="flex items-center gap-2 px-3 py-2 hover:bg-accent/50 cursor-pointer border-b last:border-b-0"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setShowClientResults(false);
                          if (ct.company_id) {
                            openCompanyPanel(ct.company_id);
                          }
                          setSearchQuery(ct.phone || ct.name || "");
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{ct.first_name || ct.last_name ? [ct.first_name, ct.last_name].filter(Boolean).join(" ") : ct.name}</p>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            {ct.company_name && <span className="flex items-center gap-0.5"><Building2 className="w-2.5 h-2.5" />{ct.company_name}</span>}
                            {ct.phone && <span className="font-mono">{ct.phone}</span>}
                          </div>
                        </div>
                        {ct.phone_e164 && <ClickToCall phoneNumber={ct.phone_e164} />}
                        {ct.company_id && (
                          <Link href={`/clients/${ct.company_id}`} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-6 w-6"><ChevronRight className="w-3 h-3" /></Button>
                          </Link>
                        )}
                      </div>
                    ))}
                  </>
                )}
                {clientResults.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 border-b bg-muted/30">
                      <p className="text-[11px] font-medium text-muted-foreground">
                        <Building2 className="w-3 h-3 inline mr-1" />Entreprises ({clientResults.length})
                      </p>
                    </div>
                    {clientResults.map((c) => (
                      <div key={c.id} className="flex items-center gap-2 px-3 py-2 hover:bg-accent/50 cursor-pointer border-b last:border-b-0"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { openCompanyPanel(c.id); setShowClientResults(false); }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{c.name}</p>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            {c.city && <span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{c.city}</span>}
                            <span className="font-mono">{c.sage_id}</span>
                          </div>
                        </div>
                        {c.phone_e164 && <ClickToCall phoneNumber={c.phone_e164} />}
                        <Link href={`/clients/${c.id}`}><Button variant="ghost" size="icon" className="h-6 w-6"><ChevronRight className="w-3 h-3" /></Button></Link>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-1">
            <Button variant={tab === "all" ? "default" : "outline"} size="sm" className="h-9" onClick={() => setTab("all")}>Tous</Button>
            <Button variant={tab === "unqualified" ? "default" : "outline"} size="sm" className="h-9" onClick={() => setTab("unqualified")}>Non qualifiés</Button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Chargement...</div>
        ) : calls.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm border rounded-lg">
            {tab === "unqualified" ? "Tous les appels sont qualifiés !" : "Aucun appel"}
          </div>
        ) : (
          <div className="border rounded-lg divide-y bg-card overflow-hidden" key={animKey}>
            {calls.map((call, _i) => {
              const isSelected = selectedCall?.id === call.id;
              const cn = contactName(call);
              const cpn = companyName(call);
              const hasOutcome = !!call.qualification?.outcome;
              const hasAi = !!call.ai_analysis;

              return (
                <div
                  key={call.id}
                  className={`stagger-row flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                    isSelected ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-accent/30 border-l-2 border-l-transparent"
                  }`}
                  style={{ animationDelay: `${_i * 30}ms` }}
                  onClick={() => selectCall(call)}
                >
                  {/* Direction + status indicator */}
                  <div className="shrink-0 flex flex-col items-center gap-0.5">
                    {directionIcon(call)}
                    {isVoicemail(call) ? (
                      <span className="text-sm text-amber-500 font-medium">Rép.</span>
                    ) : call.is_answered ? (
                      <span className="text-sm text-muted-foreground font-mono">{formatDuration(call.incall_duration)}</span>
                    ) : (
                      <span className="text-sm text-red-500 font-medium">
                        {isOutbound(call) ? "N/R" : "Manq."}
                      </span>
                    )}
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold truncate">{displayName(call)}</span>
                      {cn && cpn && (
                        <button
                          onClick={(e) => { e.stopPropagation(); const cid = call.company_id || call.client_id; if (cid) openCompanyPanel(cid); }}
                          className="text-sm text-muted-foreground hover:text-foreground hover:underline truncate max-w-[180px] flex items-center gap-1 shrink-0"
                        >
                          <Building2 className="w-3.5 h-3.5 shrink-0" />
                          {cpn}
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {hasOutcome && (
                        <span className={`inline-flex items-center text-sm px-2 py-0.5 rounded-full border font-medium ${outcomeColor(call.qualification?.outcome)}`}>
                          {call.qualification?.outcome}
                        </span>
                      )}
                      {hasAi && call.ai_analysis?.overall_score != null && (
                        <span className={`inline-flex items-center gap-0.5 text-sm font-semibold ${scoreColor(call.ai_analysis.overall_score)}`}>
                          <Star className="w-3.5 h-3.5" />{call.ai_analysis.overall_score}/10
                        </span>
                      )}
                      {call.qualification?.mood && (
                        <span className="text-sm text-muted-foreground">{moodEmoji(call.qualification.mood)}</span>
                      )}
                      {hasAi && call.ai_analysis?.summary && (
                        <span className="text-sm text-muted-foreground truncate max-w-[220px] hidden sm:inline">
                          {call.ai_analysis.summary.slice(0, 70)}{call.ai_analysis.summary.length > 70 ? "…" : ""}
                        </span>
                      )}
                      {!hasOutcome && !hasAi && call.is_answered && !call.qualification && (
                        <span className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <MessageSquare className="w-3.5 h-3.5" />À qualifier
                        </span>
                      )}
                      {!call.company_id && !call.client_id && call.contact_id && (
                        <span className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />Orphelin
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: date + meta */}
                  <div className="shrink-0 text-right flex flex-col items-end gap-0.5">
                    <span className="text-sm text-muted-foreground">{formatDateOnly(call.start_time)}</span>
                    <span className="text-sm text-muted-foreground">{formatTime(call.start_time)}</span>
                    {call.user_name && <span className="text-sm text-muted-foreground truncate max-w-[100px]">{call.user_name}</span>}
                  </div>

                  <ChevronRight className={`w-4 h-4 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground/40"}`} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ——— RIGHT: Detail panel (sticky) ——— */}
      {panelOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => { setSelectedCall(null); setPanelMode("detail"); }} />
          <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] lg:w-[420px] bg-background border-l shadow-xl lg:shadow-none overflow-y-auto lg:z-30">
            {/* Panel header */}
            <div className="sticky top-0 z-10 bg-background border-b px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                {panelMode === "detail" && selectedCall ? (
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {directionIcon(selectedCall)}
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold truncate">{displayName(selectedCall)}</h3>
                      <p className="text-[11px] text-muted-foreground">{formatDate(selectedCall.start_time)}</p>
                    </div>
                    {selectedCall.contact_e164 && (
                      <ClickToCall
                        phoneNumber={selectedCall.contact_e164}
                        variant="cta"
                        size="sm"
                        contactName={contactName(selectedCall) || undefined}
                        label="Rappeler"
                      />
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 className="w-4 h-4 shrink-0" />
                    <h3 className="text-sm font-bold truncate">{selectedClient?.name || "Chargement..."}</h3>
                  </div>
                )}
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => { setSelectedCall(null); setPanelMode("detail"); setSelectedClient(null); }}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* ——— CALL DETAIL MODE ——— */}
              {panelMode === "detail" && selectedCall && (
                <>
                  {/* Call summary card */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center p-2 rounded-lg bg-accent">
                      <p className="text-xs text-muted-foreground">Durée</p>
                      <p className="text-sm font-bold mt-0.5">
                        {selectedCall.is_answered ? formatDurationLong(selectedCall.incall_duration) : "—"}
                      </p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-accent">
                      <p className="text-xs text-muted-foreground">Direction</p>
                      <p className="text-sm font-bold mt-0.5">{isOutbound(selectedCall) ? "Sortant" : "Entrant"}</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-accent">
                      <p className="text-xs text-muted-foreground">Statut</p>
                      <p className={`text-sm font-bold mt-0.5 ${
                        isVoicemail(selectedCall) ? "text-amber-500" :
                        selectedCall.is_answered ? "text-green-600 dark:text-green-400" : "text-red-500"
                      }`}>
                        {isVoicemail(selectedCall) ? "Répondeur" : selectedCall.is_answered ? "Décroché" : isOutbound(selectedCall) ? "N/R" : "Manqué"}
                      </p>
                    </div>
                  </div>

                  {/* Contact info — only show if we have real contact data */}
                  {contactName(selectedCall) && (
                    <Card>
                      <CardContent className="py-3 space-y-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <User className="w-4 h-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{contactName(selectedCall)}</p>
                            {selectedCall.contact_role && <p className="text-[11px] text-muted-foreground">{selectedCall.contact_role}</p>}
                          </div>
                        </div>
                        {selectedCall.contact_number && (
                          <p className="text-xs text-muted-foreground font-mono ml-6">{selectedCall.contact_number}</p>
                        )}
                        {selectedCall.contact_email && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground ml-6">
                            <Mail className="w-3 h-3" />{selectedCall.contact_email}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Company link — only show if company has a real name */}
                  {companyName(selectedCall) && (selectedCall.company_id || selectedCall.client_id) && (
                    <Link href={`/clients/${selectedCall.company_id || selectedCall.client_id}`} className="block">
                      <div className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors group">
                        <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{companyName(selectedCall)}</p>
                          {selectedCall.client_city && (
                            <p className="text-[11px] text-muted-foreground flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{selectedCall.client_city}</p>
                          )}
                        </div>
                        {selectedCall.client_ca_total != null && selectedCall.client_ca_total > 0 && (
                          <span className="text-xs font-semibold text-muted-foreground">{formatCurrency(selectedCall.client_ca_total)}</span>
                        )}
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary shrink-0" />
                      </div>
                    </Link>
                  )}

                  {/* Contact with no company (has contact_id but no real company name) */}
                  {contactName(selectedCall) && !companyName(selectedCall) && selectedCall.contact_id && (
                    <div className="p-3 rounded-lg border border-dashed border-sora/40 bg-sora/5">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-4 h-4 text-sora" />
                        <span className="text-xs font-medium">Contact non rattaché à une entreprise</span>
                      </div>
                      <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={() => openAssignDialog(selectedCall.contact_id!, contactName(selectedCall) || displayName(selectedCall))}>
                        <LinkIcon className="w-3 h-3 mr-1" />Assigner à une entreprise
                      </Button>
                    </div>
                  )}

                  {/* Orphan — no real contact name AND no real company name */}
                  {isOrphanCall(selectedCall) && (
                    <div className="rounded-lg border-2 border-dashed border-sora/40 bg-gradient-to-b from-sora/5 to-sora/10 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-sora/15 flex items-center justify-center shrink-0">
                          <AlertTriangle className="w-4 h-4 text-sora" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">Numéro non identifié</p>
                          <p className="text-[11px] text-muted-foreground">
                            {selectedCall.contact_number || "Numéro inconnu"}
                          </p>
                        </div>
                      </div>

                      {enrichForm ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-[10px] text-muted-foreground">Prénom</Label>
                              <Input className="h-7 text-xs" value={enrichForm.first_name} onChange={(e) => setEnrichForm({...enrichForm, first_name: e.target.value})} placeholder="Prénom" autoFocus />
                            </div>
                            <div>
                              <Label className="text-[10px] text-muted-foreground">Nom</Label>
                              <Input className="h-7 text-xs" value={enrichForm.last_name} onChange={(e) => setEnrichForm({...enrichForm, last_name: e.target.value})} placeholder="Nom" />
                            </div>
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Fonction</Label>
                            <Input className="h-7 text-xs" value={enrichForm.role} onChange={(e) => setEnrichForm({...enrichForm, role: e.target.value})} placeholder="Ex: Directeur, Chef cuisine..." />
                          </div>
                          <div className="flex gap-2">
                            <Button variant="ghost" size="sm" className="h-7 text-xs flex-1" onClick={() => setEnrichForm(null)}>
                              Annuler
                            </Button>
                            <Button variant="default" size="sm" className="h-7 text-xs flex-1" onClick={handleEnrichContact} disabled={savingEnrich || (!enrichForm.first_name.trim() && !enrichForm.last_name.trim())}>
                              {savingEnrich ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}
                              Enregistrer
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-xs text-muted-foreground">
                            Qui avez-vous eu au bout du fil ?
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full h-8 text-xs"
                            onClick={() => setEnrichForm({ first_name: '', last_name: '', role: '' })}
                          >
                            <Pencil className="w-3 h-3 mr-1.5" />
                            Identifier ce contact
                          </Button>
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-[11px]"
                              onClick={() => {
                                const cId = selectedCall.contact_id || "__new_from_call__";
                                openAssignDialog(cId, selectedCall.contact_number || "Inconnu");
                              }}
                            >
                              <LinkIcon className="w-3 h-3 mr-1" />
                              Rattacher
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-[11px]"
                              onClick={() => {
                                const cid = selectedCall.company_id || selectedCall.client_id;
                                if (cid) {
                                  window.open(`/clients/${cid}`, "_blank");
                                } else {
                                  handleCreateFromOrphan(selectedCall);
                                }
                              }}
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              {selectedCall.client_id ? "Voir la fiche" : "Nouvelle fiche"}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Qualification — CTA proéminent si non qualifié */}
                  {selectedCall.is_answered && !selectedCall.qualification ? (
                    <div
                      className="rounded-lg border-2 border-amber-400/60 bg-gradient-to-r from-amber-50 to-amber-100/60 p-4 cursor-pointer hover:shadow-md transition-all"
                      onClick={() => openQualify(selectedCall)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-amber-400/20 flex items-center justify-center shrink-0">
                          <MessageSquare className="w-5 h-5 text-amber-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-amber-800">À qualifier</p>
                          <p className="text-xs text-amber-700/70 mt-0.5">Qualifiez cet appel pour suivre vos performances</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-amber-500 shrink-0" />
                      </div>
                    </div>
                  ) : (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center justify-between">
                          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" />Qualification</span>
                          {selectedCall.is_answered && selectedCall.qualification && (
                            <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => openQualify(selectedCall)}>
                              Modifier
                            </Button>
                          )}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        {selectedCall.qualification ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              {selectedCall.qualification.outcome && (
                                <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border font-medium ${outcomeColor(selectedCall.qualification.outcome)}`}>
                                  {selectedCall.qualification.outcome}
                                </span>
                              )}
                              {selectedCall.qualification.mood && (
                                <span className="text-xs">{moodEmoji(selectedCall.qualification.mood)} {moodLabel(selectedCall.qualification.mood)}</span>
                              )}
                            </div>
                            {selectedCall.qualification.notes && (
                              <p className="text-xs text-muted-foreground bg-accent rounded-lg p-2">{selectedCall.qualification.notes}</p>
                            )}
                            {selectedCall.qualification.next_step && (
                              <div className="flex items-center gap-1.5 text-xs">
                                <ArrowRight className="w-3 h-3 text-sora" />
                                <span>{selectedCall.qualification.next_step}</span>
                              </div>
                            )}
                            {selectedCall.qualification.next_step_date && (
                              <div className="flex items-center gap-1.5 text-xs text-sora">
                                <Calendar className="w-3 h-3" />
                                Rappel le {new Date(selectedCall.qualification.next_step_date).toLocaleDateString("fr-FR")}
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Appel non décroché — pas de qualification requise.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Audio + AI Analysis */}
                  {selectedCall.record_url && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-1.5">
                          <Headphones className="w-3.5 h-3.5" />Enregistrement
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0 space-y-3">
                        <audio controls className="w-full h-8" src={selectedCall.record_url}>Audio non supporté.</audio>

                        {!analysis && (
                          <Button variant="outline" size="sm" className="w-full h-8 text-xs" onClick={handleTranscribe} disabled={transcribing}>
                            {transcribing ? <><Bot className="w-3 h-3 mr-1.5 animate-spin" />Analyse en cours...</>
                              : <><Bot className="w-3 h-3 mr-1.5" />Analyser avec l&apos;IA</>}
                          </Button>
                        )}

                        {analysis && (
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                              {analysis.overall_score != null && (
                                <div className={`p-2 rounded-lg border text-center ${scoreBg(analysis.overall_score)}`}>
                                  <p className={`text-lg font-bold ${scoreColor(analysis.overall_score)}`}>{analysis.overall_score}/10</p>
                                  <p className="text-[10px] text-muted-foreground">Score IA</p>
                                </div>
                              )}
                              {analysis.client_sentiment && (
                                <div className="p-2 rounded-lg border bg-accent text-center">
                                  <p className="text-lg">{moodEmoji(analysis.client_sentiment)}</p>
                                  <p className="text-[10px] text-muted-foreground">{moodLabel(analysis.client_sentiment)}</p>
                                </div>
                              )}
                            </div>
                            {analysis.summary && (
                              <div>
                                <p className="text-[11px] font-medium text-muted-foreground mb-1">Résumé</p>
                                <p className="text-xs bg-accent rounded-lg p-2.5 leading-relaxed">{analysis.summary}</p>
                              </div>
                            )}
                            {analysis.sales_feedback && (
                              <div>
                                <p className="text-[11px] font-medium text-muted-foreground mb-1">Coaching</p>
                                <p className="text-xs bg-primary/5 border border-primary/10 rounded-lg p-2.5 leading-relaxed whitespace-pre-wrap">{analysis.sales_feedback}</p>
                              </div>
                            )}
                            {analysis.detected_opportunities && (
                              <div>
                                <p className="text-[11px] font-medium text-muted-foreground mb-1">Opportunités</p>
                                <p className="text-xs bg-green-50 dark:bg-green-950/30 border border-green-200/30 rounded-lg p-2.5 leading-relaxed">{analysis.detected_opportunities}</p>
                              </div>
                            )}
                            {analysis.next_actions && (
                              <div>
                                <p className="text-[11px] font-medium text-muted-foreground mb-1">Actions recommandées</p>
                                <p className="text-xs bg-sora/5 border border-sora/10 rounded-lg p-2.5 leading-relaxed">{analysis.next_actions}</p>
                              </div>
                            )}
                            {analysis.key_topics && analysis.key_topics.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {analysis.key_topics.map((t, i) => (
                                  <Badge key={i} variant="outline" className="text-[10px] px-1.5">{t}</Badge>
                                ))}
                              </div>
                            )}

                            <details className="group">
                              <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">Scores détaillés & transcription</summary>
                              <div className="mt-2 space-y-2">
                                <div className="grid grid-cols-3 gap-1.5">
                                  {[
                                    { label: "Politesse", value: analysis.politeness_score },
                                    { label: "Objections", value: analysis.objection_handling },
                                    { label: "Closing", value: analysis.closing_attempt },
                                    { label: "Produits", value: analysis.product_knowledge },
                                    { label: "Écoute", value: analysis.listening_quality },
                                    { label: "Global", value: analysis.overall_score },
                                  ].map((item) => (
                                    <div key={item.label} className={`p-1.5 rounded border text-center ${scoreBg(item.value)}`}>
                                      <p className={`text-sm font-bold ${scoreColor(item.value)}`}>{item.value ?? "—"}</p>
                                      <p className="text-[9px] text-muted-foreground">{item.label}</p>
                                    </div>
                                  ))}
                                </div>
                                {analysis.admin_feedback && (
                                  <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200/30 text-xs whitespace-pre-wrap">
                                    <p className="text-[10px] font-medium text-muted-foreground mb-1">Feedback manager</p>
                                    {analysis.admin_feedback}
                                  </div>
                                )}
                                {analysis.transcript && (
                                  <div className="p-2 rounded-lg bg-accent text-xs whitespace-pre-wrap max-h-40 overflow-y-auto">
                                    {analysis.transcript}
                                  </div>
                                )}
                              </div>
                            </details>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Quick company KPIs */}
                  {selectedClient && selectedClient.sales_summary && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-1.5">
                          <TrendingUp className="w-3.5 h-3.5" />Entreprise
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="text-center p-2 rounded-lg bg-accent">
                            <p className="text-sm font-bold">{formatCurrency(selectedClient.sales_summary.total_ht)}</p>
                            <p className="text-[10px] text-muted-foreground">CA total</p>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-accent">
                            <p className="text-sm font-bold">{selectedClient.sales_summary.total_orders}</p>
                            <p className="text-[10px] text-muted-foreground">Commandes</p>
                          </div>
                        </div>
                        {selectedClient.sales_summary.last_order_date && (
                          <p className="text-[11px] text-muted-foreground text-center mt-1.5">
                            Dernière cde : {daysAgo(selectedClient.sales_summary.last_order_date)}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </>
              )}

              {/* ——— COMPANY MODE ——— */}
              {panelMode === "company" && selectedClient && (
                <>
                  <Card>
                    <CardContent className="py-3 space-y-2">
                      {selectedClient.contacts && selectedClient.contacts.length > 0 ? (
                        <div className="space-y-1.5">
                          {selectedClient.contacts.map((ct) => (
                            <div key={ct.id} className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-accent/50">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <User className="w-3 h-3 text-muted-foreground shrink-0" />
                                  <span className="text-sm font-medium truncate">{ct.name}</span>
                                  {ct.is_primary && <Badge variant="outline" className="text-[9px] px-1 py-0 border-green-300 text-green-700 shrink-0">principal</Badge>}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground ml-[18px]">
                                  {ct.phone && <span>{ct.phone}</span>}
                                  {ct.email && <span className="truncate">{ct.email}</span>}
                                </div>
                              </div>
                              {ct.phone_e164 && <ClickToCall phoneNumber={ct.phone_e164} />}
                            </div>
                          ))}
                        </div>
                      ) : selectedClient.phone ? (
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="w-3.5 h-3.5 text-muted-foreground" />{selectedClient.phone}
                          {selectedClient.phone_e164 && <ClickToCall phoneNumber={selectedClient.phone_e164} />}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                  <Link href={`/clients/${selectedClient.id}`}>
                    <Button variant="outline" size="sm" className="w-full h-8 text-xs">
                      <ExternalLink className="w-3 h-3 mr-1.5" />Voir la fiche 360°
                    </Button>
                  </Link>
                  {selectedClient.sales_summary && (
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" />Chiffres clés</CardTitle></CardHeader>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="text-center p-2 rounded-lg bg-accent">
                            <p className="text-sm font-bold">{formatCurrency(selectedClient.sales_summary.total_ht)}</p>
                            <p className="text-[10px] text-muted-foreground">CA total</p>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-accent">
                            <p className="text-sm font-bold">{selectedClient.sales_summary.total_orders}</p>
                            <p className="text-[10px] text-muted-foreground">Commandes</p>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-accent">
                            <p className="text-sm font-bold">{formatCurrency(selectedClient.sales_summary.avg_basket)}</p>
                            <p className="text-[10px] text-muted-foreground">Panier moyen</p>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-accent">
                            <p className="text-sm font-bold">{selectedClient.sales_summary.distinct_products}</p>
                            <p className="text-[10px] text-muted-foreground">Produits</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  {selectedClient.score && (
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Target className="w-3.5 h-3.5" />Scores</CardTitle></CardHeader>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-3 gap-2">
                          <div className="text-center p-2 rounded-lg bg-accent">
                            <p className={`text-sm font-bold ${selectedClient.score.churn_risk_score >= 7 ? "text-red-600" : selectedClient.score.churn_risk_score >= 4 ? "text-amber-600" : "text-green-600"}`}>
                              {selectedClient.score.churn_risk_score}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Churn</p>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-accent">
                            <p className="text-sm font-bold text-sora">{selectedClient.score.upsell_score}</p>
                            <p className="text-[10px] text-muted-foreground">Upsell</p>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-accent">
                            <p className="text-sm font-bold">{selectedClient.score.global_priority_score}</p>
                            <p className="text-[10px] text-muted-foreground">Priorité</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  {selectedClient.top_products.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><ShoppingCart className="w-3.5 h-3.5" />Top produits</CardTitle></CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-1">
                          {selectedClient.top_products.slice(0, 5).map((p, i) => (
                            <div key={i} className="flex items-center justify-between text-xs py-0.5">
                              <span className="truncate max-w-[220px]">{p.designation || p.article_ref || "—"}</span>
                              <span className="font-medium shrink-0 ml-2">{formatCurrency(p.total_ht)}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}

              {loadingClient && !selectedClient && (
                <div className="text-center py-8 text-muted-foreground text-sm">Chargement...</div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ——— Qualify dialog (only this stays as a popup) ——— */}
      <Dialog open={!!qualifyCall} onOpenChange={() => setQualifyCall(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Qualifier l&apos;appel</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Ressenti</Label>
              <div className="flex gap-2">
                {MOODS.map((m) => (
                  <Button key={m.value} variant={qualForm.mood === m.value ? "default" : "outline"} size="sm"
                    onClick={() => setQualForm((p) => ({ ...p, mood: m.value }))}>
                    <div className={`w-2 h-2 rounded-full ${m.color} mr-1`} />{m.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Résultat</Label>
              <div className="flex flex-wrap gap-2">
                {OUTCOMES.map((o) => (
                  <Button key={o} variant={qualForm.outcome === o ? "default" : "outline"} size="sm"
                    onClick={() => setQualForm((p) => ({ ...p, outcome: o }))}>{o}</Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Prochaine étape</Label>
              <Input value={qualForm.next_step || ""} onChange={(e) => setQualForm((p) => ({ ...p, next_step: e.target.value }))}
                placeholder="Ex: Rappeler lundi, Envoyer devis..." />
            </div>
            <div className="space-y-2">
              <Label>Date de rappel</Label>
              <Input type="date" value={qualForm.next_step_date || ""}
                onChange={(e) => setQualForm((p) => ({ ...p, next_step_date: e.target.value || undefined }))}
                min={new Date().toISOString().split("T")[0]} />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <textarea
                className="w-full rounded-md bg-background border border-input px-3 py-2 text-sm min-h-[80px] focus:outline-none focus:ring-1 focus:ring-ring"
                value={qualForm.notes || ""} onChange={(e) => setQualForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Notes sur l'appel..." />
            </div>
            <Button className="w-full" onClick={handleQualify} disabled={submitting}>
              {submitting ? "Enregistrement..." : "Valider la qualification"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ——— Assign contact dialog ——— */}
      <Dialog open={!!assignDialog} onOpenChange={() => setAssignDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LinkIcon className="w-5 h-5" />Assigner {assignDialog?.contactName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Rechercher une entreprise..." className="pl-9" value={assignSearch}
                onChange={(e) => setAssignSearch(e.target.value)} autoFocus />
            </div>
            {searchingAssign && <p className="text-xs text-muted-foreground text-center">Recherche...</p>}
            {assignResults.length > 0 && (
              <div className="space-y-1 max-h-[240px] overflow-y-auto">
                {assignResults.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent/50 cursor-pointer border"
                    onClick={() => handleAssignContact(c.id)}>
                    <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        {c.city && <span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{c.city}</span>}
                        <span className="font-mono">{c.sage_id}</span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                ))}
              </div>
            )}
            {assignSearch.trim().length >= 2 && !searchingAssign && assignResults.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">Aucune entreprise trouvée</p>
            )}
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs text-muted-foreground">Ou créer une nouvelle fiche entreprise :</p>
              <Input
                placeholder="Nom de l'entreprise"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
              />
              <Button variant="default" className="w-full" onClick={handleCreateAndAssign} disabled={assigningContact || newCompanyName.trim().length < 2}>
                <Plus className="w-4 h-4 mr-2" />{assigningContact ? "Création..." : "Créer et ouvrir la fiche"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
