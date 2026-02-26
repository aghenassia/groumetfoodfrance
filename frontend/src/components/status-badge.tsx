"use client";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const STATUS_CONFIG: Record<
  string,
  { label: string; class: string; explanation: string }
> = {
  prospect: {
    label: "Prospect",
    class: "bg-kiku/10 text-sensai border-kiku/30",
    explanation:
      "Aucune commande en base. Passe automatiquement en Client ou Dormant dès qu'une commande est détectée. Passe en Lead dès qu'un appel décroché > 30s est enregistré.",
  },
  lead: {
    label: "Lead qualifié",
    class: "bg-sora/10 text-sora border-sora/30",
    explanation:
      "Un appel décroché > 30s a été enregistré mais aucune commande en base. Passera automatiquement en Client dès la première commande détectée dans Sage.",
  },
  client: {
    label: "Client actif",
    class: "bg-sensai/5 text-sensai border-sensai/20",
    explanation:
      "Au moins une commande enregistrée. Peut passer en « À risque » si le score de churn dépasse 60% (scoring RFM quotidien).",
  },
  at_risk: {
    label: "À risque",
    class: "bg-ume/10 text-ume border-ume/30",
    explanation:
      "Score de churn ≥ 60% — le client commande moins fréquemment que d'habitude. Passe en Dormant après 180 jours sans commande.",
  },
  dormant: {
    label: "Dormant",
    class: "bg-ume/20 text-sensai border-ume/30",
    explanation:
      "Aucune commande depuis 180+ jours. Un cooldown de 14 jours s'active après chaque appel pour éviter la saturation. Redevient Client dès qu'une nouvelle commande est détectée.",
  },
  dead: {
    label: "Perdu",
    class: "bg-muted text-muted-foreground border-border",
    explanation:
      "Marqué manuellement comme perdu lors d'une qualification (« pas intéressé »). Exclu de toutes les playlists. Seule transition manuelle du système.",
  },
};

interface StatusBadgeProps {
  status: string | undefined;
  size?: "xs" | "sm";
}

export function StatusBadge({ status, size = "xs" }: StatusBadgeProps) {
  const s = status || "prospect";
  const cfg = STATUS_CONFIG[s] || STATUS_CONFIG.prospect;

  const sizeClass =
    size === "xs" ? "text-[10px] px-1 py-0" : "text-xs px-1.5 py-0.5";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={`${sizeClass} shrink-0 cursor-help ${cfg.class}`}
        >
          {cfg.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-[280px] text-xs leading-relaxed"
      >
        <p className="font-semibold mb-1 text-sensai">{cfg.label}</p>
        <p className="text-sensai/70">{cfg.explanation}</p>
      </TooltipContent>
    </Tooltip>
  );
}
