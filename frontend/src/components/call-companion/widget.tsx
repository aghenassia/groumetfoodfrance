"use client";

import { useState } from "react";
import { useCallCompanion } from "./context";
import { api } from "@/lib/api";
import { SupplierPicker } from "@/components/intel/supplier-picker";
import { CompetitorPicker } from "@/components/intel/competitor-picker";
import { ProductInterestPicker } from "@/components/intel/product-interest-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  X,
  Minus,
  Maximize2,
  Phone,
  Smile,
  Meh,
  Frown,
  Send,
  Loader2,
  CalendarDays,
  MessageSquare,
  ChevronRight,
} from "lucide-react";

const OUTCOMES = [
  { key: "interested", label: "Intéressé", color: "bg-green-50 text-green-700 border-green-200" },
  { key: "callback", label: "Rappel prévu", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { key: "quote_sent", label: "Devis envoyé", color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { key: "order", label: "Commande", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { key: "not_interested", label: "Pas intéressé", color: "bg-red-50 text-red-700 border-red-200" },
  { key: "nrp", label: "NRP", color: "bg-gray-50 text-gray-700 border-gray-200" },
  { key: "wrong_number", label: "Mauvais n°", color: "bg-gray-50 text-gray-700 border-gray-200" },
];

const MOODS = [
  { key: "positive", label: "Positif", icon: Smile, color: "text-green-600 bg-green-50 border-green-200" },
  { key: "neutral", label: "Neutre", icon: Meh, color: "text-amber-600 bg-amber-50 border-amber-200" },
  { key: "negative", label: "Négatif", icon: Frown, color: "text-red-600 bg-red-50 border-red-200" },
];

export function CallCompanionWidget() {
  const {
    isOpen,
    isMinimized,
    sessionId,
    clientId,
    clientName,
    phoneNumber,
    intel,
    minimizeCompanion,
    expandCompanion,
    closeCompanion,
    refreshIntel,
  } = useCallCompanion();

  const [mood, setMood] = useState<string>("");
  const [outcome, setOutcome] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [nextStepDate, setNextStepDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  if (isMinimized) {
    return (
      <button
        onClick={expandCompanion}
        className="fixed bottom-4 right-4 z-[60] flex items-center gap-2 px-4 py-2.5 rounded-full bg-sensai text-white shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95 animate-in slide-in-from-bottom-4"
      >
        <span className="relative flex items-center justify-center w-5 h-5">
          <span className="absolute inset-[-2px] rounded-full bg-white/20 animate-[ping_2s_ease-in-out_infinite]" />
          <Phone className="w-4 h-4 relative z-10" />
        </span>
        <span className="text-sm font-medium truncate max-w-[200px]">{clientName || "Appel en cours"}</span>
        <Maximize2 className="w-3.5 h-3.5 opacity-70" />
      </button>
    );
  }

  const handleSubmit = async () => {
    if (!sessionId || !clientId) return;
    setSubmitting(true);
    try {
      await api.updateCallSession(sessionId, {
        mood: mood || undefined,
        outcome: outcome || undefined,
        notes: notes || undefined,
        next_step: nextStep || undefined,
        next_step_date: nextStepDate || undefined,
      });
      toast.success("Appel qualifié et intel sauvegardée");
      setMood("");
      setOutcome("");
      setNotes("");
      setNextStep("");
      setNextStepDate("");
      closeCompanion();
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setMood("");
    setOutcome("");
    setNotes("");
    setNextStep("");
    setNextStepDate("");
    closeCompanion();
  };

  return (
    <>
      {/* Mobile: full screen overlay */}
      <div className="lg:hidden fixed inset-0 z-[60] bg-background flex flex-col animate-in slide-in-from-bottom-4 duration-200">
        <div className="flex items-center justify-between p-3 border-b bg-card">
          <div className="flex items-center gap-2 min-w-0">
            <Phone className="w-4 h-4 text-green-600 shrink-0" />
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate">{clientName}</h3>
              {phoneNumber && <p className="text-xs text-muted-foreground">{phoneNumber}</p>}
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <CompanionForm
            clientId={clientId}
            intel={intel}
            mood={mood}
            setMood={setMood}
            outcome={outcome}
            setOutcome={setOutcome}
            notes={notes}
            setNotes={setNotes}
            nextStep={nextStep}
            setNextStep={setNextStep}
            nextStepDate={nextStepDate}
            setNextStepDate={setNextStepDate}
            onRefreshIntel={refreshIntel}
          />
        </div>
        <div className="p-3 border-t bg-card">
          <Button className="w-full gap-2" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Valider et fermer
          </Button>
        </div>
      </div>

      {/* Desktop: floating panel */}
      <div className="hidden lg:flex fixed bottom-4 right-4 z-[60] w-[400px] max-h-[calc(100vh-6rem)] flex-col bg-card border rounded-xl shadow-2xl animate-in slide-in-from-bottom-4 slide-in-from-right-4 duration-300">
        <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30 rounded-t-xl">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center justify-center w-7 h-7 rounded-full bg-green-100">
              <Phone className="w-3.5 h-3.5 text-green-600" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate">{clientName}</h3>
              {phoneNumber && <p className="text-[11px] text-muted-foreground">{phoneNumber}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={minimizeCompanion} title="Minimiser">
              <Minus className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleClose} title="Fermer">
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-0">
          <CompanionForm
            clientId={clientId}
            intel={intel}
            mood={mood}
            setMood={setMood}
            outcome={outcome}
            setOutcome={setOutcome}
            notes={notes}
            setNotes={setNotes}
            nextStep={nextStep}
            setNextStep={setNextStep}
            nextStepDate={nextStepDate}
            setNextStepDate={setNextStepDate}
            onRefreshIntel={refreshIntel}
          />
        </div>
        <div className="px-4 py-2.5 border-t">
          <Button className="w-full gap-2 h-9" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Valider et fermer
          </Button>
        </div>
      </div>
    </>
  );
}


function CompanionForm({
  clientId,
  intel,
  mood, setMood,
  outcome, setOutcome,
  notes, setNotes,
  nextStep, setNextStep,
  nextStepDate, setNextStepDate,
  onRefreshIntel,
}: {
  clientId: string | null;
  intel: any;
  mood: string; setMood: (v: string) => void;
  outcome: string; setOutcome: (v: string) => void;
  notes: string; setNotes: (v: string) => void;
  nextStep: string; setNextStep: (v: string) => void;
  nextStepDate: string; setNextStepDate: (v: string) => void;
  onRefreshIntel: () => Promise<void>;
}) {
  if (!clientId) return null;

  return (
    <div className="space-y-4">
      {/* 1. Mood */}
      <section>
        <SectionTitle number={1} title="Ressenti de l'appel" />
        <div className="flex gap-2 mt-2">
          {MOODS.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.key}
                onClick={() => setMood(mood === m.key ? "" : m.key)}
                className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border-2 transition-all text-xs font-medium ${
                  mood === m.key
                    ? `${m.color} border-current scale-105 shadow-sm`
                    : "border-transparent bg-muted/30 hover:bg-muted/50 text-muted-foreground"
                }`}
              >
                <Icon className="w-5 h-5" />
                {m.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. Outcome */}
      <section>
        <SectionTitle number={2} title="Résultat de l'appel" />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {OUTCOMES.map((o) => (
            <button
              key={o.key}
              onClick={() => setOutcome(outcome === o.key ? "" : o.key)}
              className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-all ${
                outcome === o.key
                  ? `${o.color} border-current scale-105 shadow-sm`
                  : "border-border bg-background hover:bg-muted/50 text-muted-foreground"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </section>

      {/* 3. Suppliers */}
      <section>
        <SectionTitle number={3} title="Avec qui travaillez-vous ?" subtitle="Fournisseurs actuels du client" />
        <div className="mt-2">
          <SupplierPicker
            clientId={clientId}
            suppliers={intel?.suppliers || []}
            onUpdate={onRefreshIntel}
            compact
          />
        </div>
      </section>

      {/* 4. Competitors */}
      <section>
        <SectionTitle number={4} title="Qui propose les mêmes produits ?" subtitle="Concurrents identifiés" />
        <div className="mt-2">
          <CompetitorPicker
            clientId={clientId}
            competitors={intel?.competitors || []}
            onUpdate={onRefreshIntel}
            compact
          />
        </div>
      </section>

      {/* 5. Product Interests */}
      <section>
        <SectionTitle number={5} title="Quels produits commandez-vous ?" subtitle="Produits habituels / d'intérêt" />
        <div className="mt-2">
          <ProductInterestPicker
            clientId={clientId}
            interests={intel?.product_interests || []}
            onUpdate={onRefreshIntel}
            compact
          />
        </div>
      </section>

      {/* 6. Notes + Next step */}
      <section>
        <SectionTitle number={6} title="Notes & prochaine action" />
        <div className="mt-2 space-y-2">
          <Textarea
            placeholder="Notes sur l'échange..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="text-xs min-h-[60px] resize-none"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Prochaine étape</label>
              <Input
                placeholder="Ex: Rappeler, Envoyer devis..."
                value={nextStep}
                onChange={(e) => setNextStep(e.target.value)}
                className="h-7 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Date de rappel</label>
              <Input
                type="date"
                value={nextStepDate}
                onChange={(e) => setNextStepDate(e.target.value)}
                className="h-7 text-xs"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}


function SectionTitle({ number, title, subtitle }: { number: number; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold shrink-0 mt-0.5">
        {number}
      </span>
      <div>
        <p className="text-xs font-medium">{title}</p>
        {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}
