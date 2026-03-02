"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  BookOpen,
  ArrowRight,
  Activity,
  TrendingUp,
  Target,
  Clock,
  BarChart3,
  Sparkles,
  UserPlus,
  UserCircle,
  GitMerge,
  ScrollText,
  Phone,
  Search,
  Globe,
  Flame,
  FileText,
  Truck,
  Receipt,
  Package,
  ShoppingCart,
} from "lucide-react";

const STATUSES = [
  {
    key: "prospect",
    label: "Prospect",
    badgeClass: "bg-kiku/10 text-sensai border-kiku/30",
    description:
      "Contact avec zéro commande en base et aucune interaction téléphonique significative. Règle fondamentale : un contact ayant au moins une commande dans Sage n'est JAMAIS un prospect.",
    entry: "Import Sage ou création manuelle, aucune commande en base",
    exit: "Appel décroché > 30s → Lead qualifié, ou commande détectée dans Sage → Client actif (transition automatique)",
    auto: true,
  },
  {
    key: "lead",
    label: "Lead qualifié",
    badgeClass: "bg-sora/10 text-sora border-sora/30",
    description:
      "Un appel décroché de plus de 30 secondes a été enregistré sur ce contact, MAIS aucune commande n'existe en base. Dès qu'une commande apparaît, le lead devient automatiquement Client actif.",
    entry: "Appel is_answered=true avec incall_duration > 30s ET zéro commande en base",
    exit: "Première commande détectée dans Sage → Client actif",
    auto: true,
  },
  {
    key: "client",
    label: "Client actif",
    badgeClass: "bg-sensai/5 text-sensai border-sensai/20",
    description:
      "Au moins une commande enregistrée et dernière commande < 180 jours. La transition depuis Prospect ou Lead est automatique dès qu'une commande est détectée (pas besoin d'appel préalable). Le scoring et la sync Sage auto-corrigent les statuts incohérents.",
    entry: "Commande détectée dans Sage (auto-transition depuis Prospect, Lead ou Dormant)",
    exit: "churn_risk_score ≥ 60 → À risque, ou dernière commande ≥ 180j → Dormant",
    auto: true,
  },
  {
    key: "at_risk",
    label: "À risque",
    badgeClass: "bg-ume/10 text-ume border-ume/30",
    description:
      "Le client a des commandes en base mais commande significativement moins que d'habitude. Son score de churn a dépassé le seuil de 60/100 (churn ≥ 60%).",
    entry: "churn_risk_score ≥ 60 (scoring RFM quotidien), commandes existantes en base",
    exit: "Dernière commande ≥ 180j → Dormant, ou churn redescend < 60 → Client actif",
    auto: true,
  },
  {
    key: "dormant",
    label: "Dormant",
    badgeClass: "bg-ume/20 text-sensai border-ume/30",
    description:
      "Commandes en base mais dernière commande ≥ 180 jours. Un cooldown de 14 jours s'active après chaque appel pour éviter la saturation.",
    entry: "days_since_last_order ≥ 180, commandes existantes en base",
    exit: "Nouvelle commande → Client actif, ou qualification « pas intéressé » → Perdu",
    auto: true,
  },
  {
    key: "dead",
    label: "Perdu",
    badgeClass: "bg-muted text-muted-foreground border-border",
    description:
      "Contact définitivement perdu. Exclu de toutes les playlists. C'est la seule transition manuelle du système.",
    entry:
      "Qualification manuelle avec outcome = « pas intéressé » + confirmation",
    exit: "Aucune — statut terminal",
    auto: false,
  },
];

const CHURN_COMPONENTS = [
  {
    name: "Recency",
    range: "0 – 40",
    description:
      "Temps absolu depuis la dernière activité commerciale. Calculée sur TOUS les types de documents (BC, BL, Factures, Avoirs) pour refléter l'activité réelle — un client avec un bon de commande récent n'est pas inactif.",
    detail: [
      { seuil: "≤ 30 jours", pts: 0 },
      { seuil: "31 – 60 jours", pts: 10 },
      { seuil: "61 – 90 jours", pts: 20 },
      { seuil: "91 – 180 jours", pts: 30 },
      { seuil: "180+ jours", pts: 40 },
    ],
    footnote:
      "La recency prend en compte les BC et BL (pas uniquement les factures) pour détecter l'activité avant facturation.",
  },
  {
    name: "Déviation de fréquence",
    range: "0 – 35",
    description:
      "Retard par rapport au rythme habituel du client (ratio = jours depuis dernière commande / fréquence moyenne). Nécessite ≥ 3 commandes historiques. Basée sur les factures uniquement (types 6, 7).",
    detail: [
      { seuil: "≤ 1.2×", pts: 0 },
      { seuil: "1.2 – 1.8×", pts: 10 },
      { seuil: "1.8 – 2.5×", pts: 20 },
      { seuil: "2.5 – 4×", pts: 30 },
      { seuil: "> 4×", pts: 35 },
    ],
    footnote:
      "Clients avec ≤ 2 commandes et 180+ jours d'inactivité reçoivent +20 pts (one-shot perdu).",
  },
  {
    name: "Tendance d'activité",
    range: "0 – 25",
    description:
      "Déclin du volume de commandes et/ou du CA par rapport à l'historique. Nécessite ≥ 3 commandes historiques. Basée sur les factures uniquement (types 6, 7).",
    detail: [
      { seuil: "0 commande sur 12 mois", pts: 20 },
      { seuil: "Nb cmd 12m < 50% du rythme attendu", pts: 15 },
      { seuil: "Nb cmd 12m < 70% du rythme attendu", pts: 8 },
      { seuil: "CA 12m < 30% du CA annuel moyen", pts: 5 },
    ],
  },
];

const SAGE_DOC_TYPES = [
  {
    code: "1",
    label: "BC — Bon de Commande",
    icon: ShoppingCart,
    color: "text-sora",
    usage: "Pipeline. Inclus dans la recency du churn. Exclu des métriques financières (CA, marge).",
  },
  {
    code: "3",
    label: "BL — Bon de Livraison",
    icon: Truck,
    color: "text-kiku",
    usage: "Pipeline. Inclus dans la recency du churn. Exclu des métriques financières (CA, marge).",
  },
  {
    code: "6",
    label: "FA — Facture",
    icon: Receipt,
    color: "text-sensai",
    usage: "Source principale des métriques financières (CA, marge, panier moyen, order_count). Inclus dans la recency.",
  },
  {
    code: "7",
    label: "AV — Avoir (facture crédit)",
    icon: FileText,
    color: "text-ume",
    usage: "Comptabilisé comme les factures (montants négatifs). Inclus dans la recency et les métriques financières.",
  },
];

const SERVICE_ARTICLE_REFS = [
  { ref: "TRANSPORT", description: "Participation frais de transport" },
  { ref: "ARTDIVERS / ARTDIVERS5 / ARTDIVERS20", description: "Articles divers (TVA 5,5% / 20%)" },
  { ref: "ZACOMPTE", description: "Acompte" },
  { ref: "ZAVOIR", description: "Avoir sur facture" },
  { ref: "ZESCOMPTE", description: "Escompte" },
  { ref: "ZPORTSOUMIS / ZPORTNONSOUMIS", description: "Port soumis / non soumis à TVA" },
  { ref: "ZREMISE", description: "Remise commerciale" },
];

const SCORES = [
  {
    name: "Churn Risk Score",
    range: "0 – 100",
    icon: Activity,
    color: "text-ume",
    description:
      "Risque de perte du client. Somme de 3 composantes : Recency (0-40), Déviation de fréquence (0-35), Tendance (0-25). Un bonus de +5 s'applique si le panier moyen dépasse 2× la médiane.",
    thresholds: [
      { label: "0 – 20", meaning: "En forme" },
      { label: "21 – 40", meaning: "Retard modéré" },
      { label: "41 – 59", meaning: "Attention requise" },
      { label: "≥ 60", meaning: "Transition → À risque" },
      { label: "≥ 80", meaning: "Probablement perdu" },
    ],
  },
  {
    name: "Upsell Score",
    range: "0 – 100",
    icon: TrendingUp,
    color: "text-sora",
    description:
      "Potentiel de vente additionnelle. Formule : min(100, nb_commandes_12m × 5 + panier_moyen / 50). Vaut 0 si aucune commande sur 12 mois.",
    thresholds: [
      { label: "0", meaning: "Pas de commande récente" },
      { label: "1 – 30", meaning: "Potentiel faible" },
      { label: "31 – 60", meaning: "Potentiel modéré" },
      { label: "> 60", meaning: "Fort potentiel upsell" },
    ],
  },
  {
    name: "Global Priority Score",
    range: "0 – 100",
    icon: Target,
    color: "text-kiku",
    description:
      "Score composite qui détermine l'ordre d'appel dans la playlist. Formule : churn × 0.5 + upsell × 0.3 + min(100, CA_12m / 100) × 0.2",
    thresholds: [
      { label: "Poids churn", meaning: "50% — rétention prioritaire" },
      {
        label: "Poids upsell",
        meaning: "30% — croissance du panier",
      },
      {
        label: "Poids CA",
        meaning: "20% — valeur absolue du client",
      },
    ],
  },
];

const PLAYLIST_VARS = [
  {
    variable: "total_size",
    defaut: "15",
    description: "Nombre total d'entrées dans la playlist quotidienne",
  },
  {
    variable: "pct_callback",
    defaut: "10%",
    description:
      "Rappels planifiés — clients ayant un next_step_date = aujourd'hui",
  },
  {
    variable: "pct_dormant",
    defaut: "30%",
    description:
      "Clients dormants (180+ jours sans commande, hors cooldown, hors dead)",
  },
  {
    variable: "pct_churn_risk",
    defaut: "25%",
    description:
      "Clients actifs avec un churn_risk_score ≥ seuil configuré (défaut : 40)",
  },
  {
    variable: "pct_upsell",
    defaut: "20%",
    description:
      "Clients actifs avec un upsell_score ≥ seuil configuré (défaut : 30)",
  },
  {
    variable: "pct_prospect",
    defaut: "15%",
    description:
      "Prospects et leads — les leads qualifiés sont priorisés sur les prospects",
  },
  {
    variable: "dormant_min_days",
    defaut: "90",
    description:
      "Nombre minimum de jours d'inactivité pour qu'un dormant soit inclus",
  },
  {
    variable: "churn_min_score",
    defaut: "40",
    description:
      "Score churn minimum pour qu'un client apparaisse dans la catégorie risque",
  },
  {
    variable: "upsell_min_score",
    defaut: "30",
    description:
      "Score upsell minimum pour qu'un client apparaisse dans la catégorie upsell",
  },
  {
    variable: "client_scope",
    defaut: "own",
    description:
      "Périmètre des entreprises : own (assignées au sales), own_and_unassigned (assignées + sans commercial), sage_rep (rep Sage spécifique), unassigned (sans commercial), all (assignées + rep Sage)",
  },
  {
    variable: "sage_rep_filter",
    defaut: "null",
    description:
      "Nom du rep Sage ciblé (utilisé uniquement quand client_scope = sage_rep). Sélectionné dans une liste des reps présents en base",
  },
];

const DEDUP_VARS = [
  {
    variable: "global_seen (batch)",
    description:
      "Set partagé entre tous les commerciaux lors de la génération en batch. Chaque client ajouté est marqué, empêchant son apparition dans les playlists suivantes",
  },
  {
    variable: "already_assigned (individuel)",
    description:
      "Lors de la génération individuelle, le système charge d'abord les client_id des playlists du jour des autres commerciaux et les exclut automatiquement",
  },
];

const COOLDOWN_VARS = [
  {
    variable: "contact_cooldown_until",
    description:
      "Date jusqu'à laquelle un dormant contacté est exclu de la playlist (14 jours après le dernier appel)",
  },
  {
    variable: "dormant_contact_count",
    description:
      "Nombre de tentatives de contact sur un dormant. À 5+ tentatives sur 6 mois → remonte pour décision managériale",
  },
  {
    variable: "dormant_first_contact_at",
    description:
      "Date de la première tentative de contact. Si > 6 mois et ≥ 5 appels sans résultat → revue manager",
  },
];

const OBJECTIVE_METRICS = [
  { key: "ca", label: "Chiffre d'affaires", unit: "€", description: "Total du CA HT réalisé sur la période" },
  { key: "margin_gross", label: "Marge brute", unit: "€", description: "Prix de vente HT - Prix de revient HT" },
  { key: "margin_net", label: "Marge nette", unit: "€", description: "Marge brute après déductions (logistique, structure, étiquetage, RFA)" },
  { key: "quantity_kg", label: "Quantité (kg)", unit: "kg", description: "Poids net total vendu (converti de grammes Sage en kg)" },
  { key: "quantity_units", label: "Quantité (unités)", unit: "unités", description: "Nombre total d'unités vendues" },
  { key: "avg_basket", label: "Panier moyen", unit: "€", description: "CA divisé par le nombre de commandes" },
  { key: "avg_ca_per_order", label: "CA moyen / commande", unit: "€", description: "Montant moyen par commande" },
  { key: "order_count", label: "Nombre de commandes", unit: "—", description: "Volume total de commandes distinctes" },
];

const MARGIN_RULES = [
  { name: "Forfait logistique", type: "par kg", value: "1,00 €/kg", applies: "Tous les clients", description: "Coûts d'expédition et de manutention" },
  { name: "Forfait structure", type: "par kg", value: "1,00 €/kg", applies: "Tous les clients", description: "Coûts fixes de structure répartis au kg" },
  { name: "Étiquetage", type: "par kg", value: "0,15 €/kg", applies: "Metro (margin_group)", description: "Opération d'étiquetage spécifique Metro" },
  { name: "RFA", type: "% CA", value: "2%", applies: "CSF + Promocash", description: "Remise/Rabais/Ristourne sur le CA" },
];

const CHALLENGE_METRICS = [
  { key: "quantity_kg", label: "kg vendus", description: "Poids net vendu du produit (converti de grammes en kg)" },
  { key: "quantity_units", label: "Unités vendues", description: "Nombre d'unités vendues du produit" },
  { key: "ca", label: "CA réalisé", description: "Chiffre d'affaires HT généré sur le produit" },
  { key: "margin_gross", label: "Marge brute", description: "Marge brute réalisée sur le produit" },
];

export default function GlossairePage() {
  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BookOpen className="w-6 h-6" />
          Glossaire
        </h2>
        <p className="text-muted-foreground">
          Définition de chaque variable clé du système
        </p>
      </div>

      {/* --- CONTACTS (ENTREPRISE/CONTACT) --- */}
      <section>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <UserCircle className="w-5 h-5 text-sora" />
          Contacts (architecture Entreprise / Contact)
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Le CRM distingue les entreprises (clients) et les contacts (personnes physiques).
          Chaque entreprise peut avoir plusieurs contacts.
        </p>

        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <UserCircle className="w-4 h-4 text-sora" />
                Contact
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Personne physique rattachée à une entreprise. Un contact possède un nom,
                des coordonnées (téléphone, email) et est lié à une et une seule entreprise.
              </p>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-sensai" />
                Contact principal
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Le contact par défaut de l&apos;entreprise. Créé automatiquement lors de l&apos;import
                Sage ou lors de la synchronisation des appels Ringover (numéro inconnu).
                Chaque entreprise a au moins un contact principal.
              </p>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <GitMerge className="w-4 h-4 text-ume" />
                Déplacement de contact
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Transférer un contact et son historique d&apos;appels vers une autre entreprise.
                Utile lorsqu&apos;un collaborateur change d&apos;entreprise ou pour corriger une
                mauvaise assignation initiale. Les appels restent liés au contact.
              </p>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ArrowRight className="w-4 h-4 text-kiku" />
                Assignation
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Rattacher un contact orphelin (sans entreprise) à une entreprise existante.
                Cas typique : un contact créé automatiquement depuis un appel Ringover
                avant que l&apos;entreprise ne soit identifiée.
              </p>
            </CardHeader>
          </Card>
        </div>
      </section>

      <Separator />

      {/* --- STATUTS --- */}
      <section>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-sora" />
          Statuts des leads / clients
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Chaque contact possède un statut unique qui évolue automatiquement
          selon l&apos;historique de commandes et les interactions téléphoniques.
          Règle fondamentale : <strong>un contact ayant au moins une commande dans Sage
          n&apos;est jamais un prospect</strong>. Le scoring et la sync Sage
          auto-corrigent les statuts incohérents. Le seul statut
          attribué manuellement est <strong>Perdu</strong>.
        </p>

        <div className="space-y-3">
          {STATUSES.map((s, i) => (
            <Card key={s.key}>
              <CardContent className="pt-5">
                <div className="flex items-start gap-3">
                  <div className="flex items-center gap-2 min-w-[140px]">
                    <span className="text-sm font-mono text-muted-foreground w-5">
                      {i + 1}.
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-xs px-1.5 py-0.5 ${s.badgeClass}`}
                    >
                      {s.label}
                    </Badge>
                  </div>
                  <div className="flex-1 space-y-2">
                    <p className="text-sm">{s.description}</p>
                    <div className="grid sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div className="flex items-start gap-1.5">
                        <ArrowRight className="w-3 h-3 mt-0.5 text-sora shrink-0" />
                        <span>
                          <strong className="text-foreground">Entrée :</strong>{" "}
                          {s.entry}
                        </span>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <ArrowRight className="w-3 h-3 mt-0.5 text-ume shrink-0" />
                        <span>
                          <strong className="text-foreground">Sortie :</strong>{" "}
                          {s.exit}
                        </span>
                      </div>
                    </div>
                    {!s.auto && (
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-muted/50"
                      >
                        Transition manuelle uniquement
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-4 p-4 rounded-lg border bg-muted/30">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Flux simplifié :</strong>{" "}
            Prospect → Lead qualifié → Client actif → À risque → Dormant. La
            transition Prospect/Lead → Client est <strong>automatique</strong> dès
            qu&apos;une commande existe dans Sage (pas besoin d&apos;appel préalable).
            Les retours sont possibles : un Dormant qui recommande redevient Client,
            un client À risque dont le churn redescend redevient Client actif.
            Le scoring et la sync Sage auto-corrigent les incohérences (ex : un prospect avec des commandes est requalifié).
          </p>
        </div>
      </section>

      <Separator />

      {/* --- CHURN DÉTAIL --- */}
      <section>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-ume" />
          Churn Risk Score — Détail du calcul
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Le score est la <strong>somme de 3 composantes indépendantes</strong>,
          plafonnée à 100. Un bonus de +5 s&apos;applique pour les clients à
          haute valeur (panier &gt; 2× la médiane).
        </p>

        <div className="space-y-4">
          {CHURN_COMPONENTS.map((comp) => (
            <Card key={comp.name}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  {comp.name}
                  <Badge variant="secondary" className="text-xs font-mono">
                    {comp.range} pts
                  </Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {comp.description}
                </p>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="rounded border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">
                          Seuil
                        </th>
                        <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">
                          Points
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {comp.detail.map((d) => (
                        <tr key={d.seuil}>
                          <td className="px-3 py-1.5">{d.seuil}</td>
                          <td className="px-3 py-1.5 text-right font-mono font-medium">
                            +{d.pts}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {comp.footnote && (
                  <p className="text-[11px] text-muted-foreground mt-2 italic">
                    {comp.footnote}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Separator />

      {/* --- SOURCES DE DONNÉES SAGE --- */}
      <section>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-sora" />
          Sources de données Sage (DO_Type)
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Le CRM synchronise <strong>4 types de documents</strong> depuis Sage 100.
          Chaque type a un rôle précis dans les calculs. La distinction est essentielle
          pour éviter le double-comptage (un BC sera facturé plus tard).
        </p>

        <div className="space-y-3">
          {SAGE_DOC_TYPES.map((dt) => (
            <Card key={dt.code}>
              <CardContent className="pt-5">
                <div className="flex items-start gap-3">
                  <div className="flex items-center gap-2 min-w-[60px]">
                    <dt.icon className={`w-4 h-4 ${dt.color}`} />
                    <Badge variant="secondary" className="text-xs font-mono">
                      {dt.code}
                    </Badge>
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium">{dt.label}</p>
                    <p className="text-xs text-muted-foreground">{dt.usage}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-4 p-4 rounded-lg border bg-muted/30 space-y-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Règle de calcul :</strong>{" "}
            La <strong>recency</strong> du score de churn utilise tous les types (BC, BL, FA, AV)
            pour refléter l&apos;activité réelle du client. Les <strong>métriques financières</strong>{" "}
            (CA, marge, panier moyen, order_count) sont calculées uniquement sur les
            factures (6) et avoirs (7) pour éviter le double-comptage.
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Pipeline :</strong>{" "}
            Les BC et BL forment le &quot;pipeline en cours&quot; visible sur le dashboard
            et les fiches clients — ce sont les commandes pas encore facturées.
          </p>
        </div>
      </section>

      <Separator />

      {/* --- ARTICLES DE SERVICE --- */}
      <section>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Package className="w-5 h-5 text-ume" />
          Articles de service (is_service)
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Certaines références Sage ne sont pas de vrais produits mais des lignes
          de service (transport, remises, acomptes). Elles sont flaggées{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-foreground">is_service = true</code>{" "}
          et <strong>exclues automatiquement</strong> des listings produits,
          suggestions upsell, co-achats et top produits.
          Leur valeur financière reste comptabilisée dans le CA global.
        </p>

        <Card>
          <CardContent className="pt-5">
            <div className="rounded border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">
                      Référence(s)
                    </th>
                    <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {SERVICE_ARTICLE_REFS.map((s) => (
                    <tr key={s.ref}>
                      <td className="px-3 py-1.5 font-mono text-sora whitespace-nowrap">
                        {s.ref}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {s.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="mt-4 p-4 rounded-lg border bg-muted/30">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Détection automatique :</strong>{" "}
            lors de la synchronisation Sage, les articles dont la référence correspond
            à la liste ci-dessus sont automatiquement marqués{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-foreground">is_service = true</code>.
            Ce flag est persisté en base et utilisé par tous les endpoints produits.
          </p>
        </div>
      </section>

      <Separator />

      {/* --- SCORES --- */}
      <section>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-kiku" />
          Scores calculés
        </h3>

        <div className="space-y-4">
          {SCORES.map((score) => (
            <Card key={score.name}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <score.icon className={`w-4 h-4 ${score.color}`} />
                  {score.name}
                  <Badge variant="secondary" className="text-xs font-mono ml-auto">
                    {score.range}
                  </Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {score.description}
                </p>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="rounded border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">
                          Valeur
                        </th>
                        <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">
                          Signification
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {score.thresholds.map((t) => (
                        <tr key={t.label}>
                          <td className="px-3 py-1.5 font-mono">{t.label}</td>
                          <td className="px-3 py-1.5">{t.meaning}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Separator />

      {/* --- PLAYLIST CONFIG --- */}
      <section>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Target className="w-5 h-5 text-sora" />
          Variables de playlist
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Chaque commercial possède une <strong>PlaylistConfig</strong>{" "}
          configurable par l&apos;admin. La somme des pourcentages doit
          toujours faire 100%.
        </p>

        <Card>
          <CardContent className="pt-5">
            <div className="rounded border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                      Variable
                    </th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground">
                      Défaut
                    </th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {PLAYLIST_VARS.map((v) => (
                    <tr key={v.variable}>
                      <td className="px-3 py-2 font-mono text-sora">
                        {v.variable}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {v.defaut}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {v.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      <Separator />

      {/* --- DEDUPLICATION --- */}
      <section>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Target className="w-5 h-5 text-kiku" />
          Anti-doublons entre playlists
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Un client ne peut jamais apparaître dans les playlists de deux
          commerciaux différents le même jour, que les playlists soient
          générées en batch ou individuellement.
        </p>

        <Card>
          <CardContent className="pt-5">
            <div className="rounded border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                      Mécanisme
                    </th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {DEDUP_VARS.map((v) => (
                    <tr key={v.variable}>
                      <td className="px-3 py-2 font-mono text-sora whitespace-nowrap">
                        {v.variable}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {v.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      <Separator />

      {/* --- COOLDOWN DORMANTS --- */}
      <section>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-ume" />
          Cooldown & suivi dormants
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Quand un commercial appelle un dormant, un système de cooldown évite
          la saturation. Si le client ne recommande pas après plusieurs
          tentatives, il remonte pour décision managériale (Dead ou pas).
        </p>

        <Card>
          <CardContent className="pt-5">
            <div className="rounded border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                      Champ
                    </th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                      Rôle
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {COOLDOWN_VARS.map((v) => (
                    <tr key={v.variable}>
                      <td className="px-3 py-2 font-mono text-sora whitespace-nowrap">
                        {v.variable}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {v.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="mt-4 p-4 rounded-lg border bg-muted/30 space-y-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Seuils de remontée manager :</strong>{" "}
            un dormant est flaggé pour décision si{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-foreground">
              dormant_contact_count ≥ 5
            </code>{" "}
            ET{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-foreground">
              dormant_first_contact_at
            </code>{" "}
            remonte à plus de 6 mois.
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Réactivation :</strong> si une
            nouvelle commande est détectée (sync Sage), le client repasse
            automatiquement en <em>Client actif</em>, les compteurs de contact
            sont remis à zéro et le cooldown est annulé.
          </p>
        </div>
      </section>

      <Separator />

      {/* --- ENRICHISSEMENT IA & GESTION DES FICHES --- */}
      <section>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-kiku" />
          Enrichissement IA &amp; Gestion des fiches
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Mécanismes de création automatique de fiches, enrichissement par IA,
          fusion de doublons et traçabilité des modifications.
        </p>

        <div className="space-y-4">
          {/* Auto-création de fiche */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-sora" />
                Auto-création de fiche
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Lorsqu&apos;un numéro inconnu appelle ou est appelé via Ringover,
                une fiche client par défaut est automatiquement créée.
              </p>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="rounded border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">
                        Champ
                      </th>
                      <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">
                        Valeur par défaut
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <tr>
                      <td className="px-3 py-1.5 font-mono text-sora">name</td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        Le numéro de téléphone (ex : +33612345678)
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 font-mono text-sora">phone_e164</td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        Numéro normalisé au format E.164
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 font-mono text-sora">PhoneIndex</td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        Entrée créée pour indexation et recherche rapide
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 font-mono text-sora">status</td>
                      <td className="px-3 py-1.5">
                        <Badge variant="outline" className="text-[10px] bg-kiku/10 text-sensai border-kiku/30">
                          prospect
                        </Badge>
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 font-mono text-sora">audit_log</td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        <code className="bg-muted px-1 py-0.5 rounded text-foreground">
                          action=&quot;created&quot;
                        </code>{" "}
                        — <code className="bg-muted px-1 py-0.5 rounded text-foreground">
                          details=&quot;Création auto depuis appel Ringover&quot;
                        </code>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Enrichissement IA */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-kiku" />
                Enrichissement IA
                <Badge variant="secondary" className="text-xs font-mono ml-auto">
                  Pipeline 4 phases
                </Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Pipeline d&apos;enrichissement automatique combinant recherche web,
                Google Places et extraction par GPT-4o-mini.
              </p>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div className="space-y-2">
                <div className="flex items-start gap-2 p-2 rounded border bg-muted/20">
                  <Badge variant="outline" className="text-[10px] font-mono shrink-0 mt-0.5">
                    Phase 1
                  </Badge>
                  <div className="text-xs">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Search className="w-3 h-3 text-sora" />
                      <strong className="text-foreground">Recherche par SIRET</strong>
                      <span className="text-muted-foreground">(si disponible)</span>
                    </div>
                    <p className="text-muted-foreground">
                      Recherche via OpenAI web search sur{" "}
                      <code className="bg-muted px-1 py-0.5 rounded text-foreground">pappers.fr</code>,{" "}
                      <code className="bg-muted px-1 py-0.5 rounded text-foreground">société.com</code>,{" "}
                      <code className="bg-muted px-1 py-0.5 rounded text-foreground">infogreffe.fr</code>
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2 p-2 rounded border bg-muted/20">
                  <Badge variant="outline" className="text-[10px] font-mono shrink-0 mt-0.5">
                    Phase 2
                  </Badge>
                  <div className="text-xs">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Phone className="w-3 h-3 text-sora" />
                      <strong className="text-foreground">Recherche par téléphone</strong>
                    </div>
                    <p className="text-muted-foreground">
                      Google Places API —{" "}
                      <code className="bg-muted px-1 py-0.5 rounded text-foreground">findplacefromtext</code>{" "}
                      avec{" "}
                      <code className="bg-muted px-1 py-0.5 rounded text-foreground">inputtype=phonenumber</code>{" "}
                      + récupération des détails du lieu
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2 p-2 rounded border bg-muted/20">
                  <Badge variant="outline" className="text-[10px] font-mono shrink-0 mt-0.5">
                    Phase 3
                  </Badge>
                  <div className="text-xs">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Globe className="w-3 h-3 text-sora" />
                      <strong className="text-foreground">Recherche par nom</strong>
                      <span className="text-muted-foreground">(si pas de téléphone)</span>
                    </div>
                    <p className="text-muted-foreground">
                      Google Places API —{" "}
                      <code className="bg-muted px-1 py-0.5 rounded text-foreground">textquery</code>{" "}
                      + détails pour recherche inversée de téléphone
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2 p-2 rounded border bg-muted/20">
                  <Badge variant="outline" className="text-[10px] font-mono shrink-0 mt-0.5">
                    Phase 4
                  </Badge>
                  <div className="text-xs">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Search className="w-3 h-3 text-sora" />
                      <strong className="text-foreground">Infos légales par nom</strong>
                      <span className="text-muted-foreground">(si pas de SIRET)</span>
                    </div>
                    <p className="text-muted-foreground">
                      OpenAI web search pour trouver SIRET, code NAF, email
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-lg border bg-muted/30">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">Extraction :</strong> les
                  résultats combinés sont analysés par{" "}
                  <code className="bg-muted px-1 py-0.5 rounded text-foreground">GPT-4o-mini</code>{" "}
                  et structurés en JSON normalisé.
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                  <strong className="text-foreground">Configuration :</strong>{" "}
                  <code className="bg-muted px-1 py-0.5 rounded text-foreground">GOOGLE_PLACES_API_KEY</code>{" "}
                  dans le fichier{" "}
                  <code className="bg-muted px-1 py-0.5 rounded text-foreground">.env</code>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Rattachement / Fusion de fiches */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <GitMerge className="w-4 h-4 text-ume" />
                Rattachement / Fusion de fiches
                <Badge variant="secondary" className="text-xs font-mono ml-auto">
                  POST /api/clients/&#123;source_id&#125;/merge-into/&#123;target_id&#125;
                </Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Permet de fusionner deux fiches client lorsqu&apos;un doublon est
                identifié (ex : collaborateur appelant depuis un numéro personnel).
              </p>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="rounded border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">
                        Étape
                      </th>
                      <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <tr>
                      <td className="px-3 py-1.5">
                        <Badge variant="outline" className="text-[10px] font-mono">1</Badge>
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        Transfert des entrées{" "}
                        <code className="bg-muted px-1 py-0.5 rounded text-foreground">PhoneIndex</code>{" "}
                        vers la fiche cible (dédoublonnage automatique)
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5">
                        <Badge variant="outline" className="text-[10px] font-mono">2</Badge>
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        Transfert de tous les enregistrements{" "}
                        <code className="bg-muted px-1 py-0.5 rounded text-foreground">Call</code>{" "}
                        vers la fiche cible
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5">
                        <Badge variant="outline" className="text-[10px] font-mono">3</Badge>
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        Création d&apos;un log d&apos;audit sur la cible avec{" "}
                        <code className="bg-muted px-1 py-0.5 rounded text-foreground">action=&quot;merged&quot;</code>
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5">
                        <Badge variant="outline" className="text-[10px] font-mono">4</Badge>
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        Suppression des logs d&apos;audit source et de la fiche source
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="mt-3 p-3 rounded-lg border bg-muted/30">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">Cas d&apos;usage :</strong> un
                  collaborateur appelle depuis son numéro personnel, créant une
                  fiche séparée. La fusion permet de rattacher l&apos;historique
                  d&apos;appels à la fiche principale du client.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Audit trail */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ScrollText className="w-4 h-4 text-sora" />
                Audit trail
                <Badge variant="secondary" className="text-xs font-mono ml-auto">
                  ClientAuditLog
                </Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Modèle de traçabilité enregistrant toutes les modifications
                apportées aux fiches clients.
              </p>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div className="rounded border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">
                        Champ
                      </th>
                      <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">
                        Description
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <tr>
                      <td className="px-3 py-1.5 font-mono text-sora">id</td>
                      <td className="px-3 py-1.5 text-muted-foreground">Identifiant unique</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 font-mono text-sora">client_id</td>
                      <td className="px-3 py-1.5 text-muted-foreground">Référence vers la fiche client</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 font-mono text-sora">user_id</td>
                      <td className="px-3 py-1.5 text-muted-foreground">Utilisateur ayant effectué la modification</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 font-mono text-sora">user_name</td>
                      <td className="px-3 py-1.5 text-muted-foreground">Nom affiché de l&apos;utilisateur</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 font-mono text-sora">action</td>
                      <td className="px-3 py-1.5 text-muted-foreground">Type d&apos;action effectuée</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 font-mono text-sora">field_name</td>
                      <td className="px-3 py-1.5 text-muted-foreground">Nom du champ modifié (si applicable)</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 font-mono text-sora">old_value</td>
                      <td className="px-3 py-1.5 text-muted-foreground">Ancienne valeur avant modification</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 font-mono text-sora">new_value</td>
                      <td className="px-3 py-1.5 text-muted-foreground">Nouvelle valeur après modification</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 font-mono text-sora">details</td>
                      <td className="px-3 py-1.5 text-muted-foreground">Informations complémentaires libres</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 font-mono text-sora">created_at</td>
                      <td className="px-3 py-1.5 text-muted-foreground">Horodatage de l&apos;entrée</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div>
                <p className="text-xs font-medium text-foreground mb-2">Actions possibles :</p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="text-[10px] bg-sensai/5 text-sensai border-sensai/20">
                    created
                  </Badge>
                  <Badge variant="outline" className="text-[10px] bg-sora/10 text-sora border-sora/30">
                    updated
                  </Badge>
                  <Badge variant="outline" className="text-[10px] bg-ume/10 text-ume border-ume/30">
                    merged
                  </Badge>
                  <Badge variant="outline" className="text-[10px] bg-kiku/10 text-sensai border-kiku/30">
                    phone_added
                  </Badge>
                  <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground border-border">
                    phone_removed
                  </Badge>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-foreground mb-2">Index de base de données :</p>
                <div className="flex flex-wrap gap-1.5">
                  <code className="text-[10px] bg-muted px-2 py-1 rounded font-mono text-foreground">
                    idx_audit_client
                  </code>
                  <code className="text-[10px] bg-muted px-2 py-1 rounded font-mono text-foreground">
                    idx_audit_created
                  </code>
                </div>
              </div>

              <div className="p-3 rounded-lg border bg-muted/30">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">Endpoint :</strong>{" "}
                  <code className="bg-muted px-1 py-0.5 rounded text-foreground">
                    GET /api/clients/&#123;id&#125;/audit
                  </code>{" "}
                  — retourne l&apos;historique complet des modifications pour une
                  fiche client donnée, trié par date décroissante.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <Separator />

      {/* --- OBJECTIFS MULTI-KPI --- */}
      <section>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Target className="w-5 h-5 text-sora" />
          Objectifs multi-KPI
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Chaque commercial peut avoir plusieurs objectifs sur différents KPIs,
          avec une période (mensuel, trimestriel, annuel) et une cible chiffrée.
          La progression est calculée en temps réel à partir des données Sage.
        </p>

        <Card>
          <CardContent className="pt-5">
            <div className="rounded border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Clé</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">KPI</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground">Unité</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {OBJECTIVE_METRICS.map((m) => (
                    <tr key={m.key}>
                      <td className="px-3 py-2 font-mono text-sora">{m.key}</td>
                      <td className="px-3 py-2 font-medium">{m.label}</td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant="outline" className="text-[10px] font-mono">{m.unit}</Badge>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{m.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      <Separator />

      {/* --- MARGE NETTE --- */}
      <section>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-kiku" />
          Calcul de la marge nette — Règles de déduction
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          La marge nette est calculée en déduisant des forfaits et pourcentages
          de la marge brute. Le poids <code className="bg-muted px-1 py-0.5 rounded text-foreground">net_weight</code> de
          Sage est en <strong>grammes</strong> et converti en kg dans les calculs.
          Les règles sont configurables dans <strong>Admin → Règles de marge</strong>.
        </p>

        <Card>
          <CardContent className="pt-5">
            <div className="rounded border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Règle</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground">Type</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground">Valeur</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Appliqué à</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {MARGIN_RULES.map((r) => (
                    <tr key={r.name}>
                      <td className="px-3 py-2 font-medium">{r.name}</td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant="outline" className="text-[10px]">{r.type}</Badge>
                      </td>
                      <td className="px-3 py-2 text-center font-mono">{r.value}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.applies}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="mt-4 p-4 rounded-lg border bg-muted/30">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Formule :</strong>{" "}
            Marge nette = Prix de vente HT − Prix de revient HT − Forfait logistique (1€/kg)
            − Forfait structure (1€/kg) − Étiquetage (0,15€/kg si Metro) − RFA (2% CA si CSF/Promocash).
            Les règles supportent des <strong>dates d&apos;effet</strong> (effective_from / effective_to)
            pour garder un historique des barèmes.
          </p>
        </div>
      </section>

      <Separator />

      {/* --- CHALLENGES --- */}
      <section>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Flame className="w-5 h-5 text-ume" />
          Challenges commerciaux
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Concours ponctuels pour motiver les commerciaux sur un produit ou un KPI.
          Un challenge définit un produit cible (optionnel), une métrique, un objectif,
          une <strong>récompense</strong> et une période. Le classement est calculé en temps réel.
        </p>

        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-medium text-foreground mb-2">Métriques disponibles pour les challenges :</p>
            <div className="rounded border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Clé</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Label</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {CHALLENGE_METRICS.map((m) => (
                    <tr key={m.key}>
                      <td className="px-3 py-2 font-mono text-sora">{m.key}</td>
                      <td className="px-3 py-2 font-medium">{m.label}</td>
                      <td className="px-3 py-2 text-muted-foreground">{m.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 space-y-2 text-xs text-muted-foreground">
              <p><strong className="text-foreground">Statuts :</strong> brouillon → actif → terminé. Seuls les challenges actifs sont visibles par les commerciaux.</p>
              <p><strong className="text-foreground">Récompense :</strong> texte libre (ex: &quot;iPhone 16&quot;, &quot;Bon 200€&quot;) affiché sur le dashboard et le classement.</p>
              <p><strong className="text-foreground">Classement :</strong> calculé en temps réel à partir des lignes de vente Sage, filtré par article_ref (si défini) et par période.</p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
