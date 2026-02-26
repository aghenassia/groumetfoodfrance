"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  BookOpen,
  Search,
  LayoutDashboard,
  ListMusic,
  Phone,
  Users,
  BarChart3,
  Package,
  Trophy,
  Shield,
  Bot,
  RefreshCw,
  Target,
  TrendingUp,
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Flame,
  Snowflake,
  Zap,
  Clock,
  MessageSquare,
  Star,
  ShoppingCart,
  Activity,
  UserCog,
  Sparkles,
  Pencil,
  Link2,
  History,
  Gift,
  Calculator,
  Percent,
} from "lucide-react";

type ArticleId =
  | "home"
  | "dashboard"
  | "playlist"
  | "clients"
  | "contacts"
  | "client360"
  | "calls"
  | "qualify"
  | "ai-analysis"
  | "statuts"
  | "scoring"
  | "products"
  | "leaderboard"
  | "objectives"
  | "challenges"
  | "margins"
  | "admin-sync"
  | "admin-playlist"
  | "admin-assign"
  | "admin-dashboard"
  | "admin-glossaire"
  | "admin-margins"
  | "admin-challenges"
  | "enrichment";

interface ArticleMeta {
  id: ArticleId;
  title: string;
  icon: React.ElementType;
  category: "sales" | "admin" | "concept";
  summary: string;
  tags: string[];
}

const ARTICLES: ArticleMeta[] = [
  {
    id: "dashboard",
    title: "Tableau de bord",
    icon: LayoutDashboard,
    category: "sales",
    summary: "Vue d'ensemble de vos performances : CA, appels, objectifs, rappels et alertes.",
    tags: ["ca", "kpi", "objectif", "stats"],
  },
  {
    id: "playlist",
    title: "Playlist quotidienne",
    icon: ListMusic,
    category: "sales",
    summary: "Votre liste de clients à appeler chaque jour, générée automatiquement selon des critères intelligents.",
    tags: ["appels", "priorité", "prospect", "dormant", "callback"],
  },
  {
    id: "clients",
    title: "Liste des clients",
    icon: Users,
    category: "sales",
    summary: "Recherche, tri et filtrage de toute votre base client avec scores et indicateurs. Colonnes Statut et Churn séparées avec filtres indépendants.",
    tags: ["recherche", "filtre", "tri", "base", "statut", "churn"],
  },
  {
    id: "contacts",
    title: "Entreprises & Contacts",
    icon: Users,
    category: "sales",
    summary: "Chaque entreprise peut avoir plusieurs contacts. Création, édition, déplacement entre entreprises. Les appels sont liés à un contact et à une entreprise.",
    tags: ["contact", "entreprise", "déplacer", "assignation", "principal"],
  },
  {
    id: "client360",
    title: "Fiche client 360°",
    icon: Target,
    category: "sales",
    summary: "Tout savoir sur un client : coordonnées, CA, historique d'appels, retours commerciaux, qualifications, analyse IA, upsell, section Contacts.",
    tags: ["détail", "historique", "ca", "scoring", "téléphone", "retours", "contacts"],
  },
  {
    id: "calls",
    title: "Historique des appels",
    icon: Phone,
    category: "sales",
    summary: "Tous vos appels entrants et sortants avec recherche hybride (appels + base client), qualification et analyse IA. Distinction Sans réponse / Manqué.",
    tags: ["entrant", "sortant", "écoute", "enregistrement", "sans réponse", "manqué"],
  },
  {
    id: "enrichment",
    title: "Enrichissement & Gestion des fiches",
    icon: Sparkles,
    category: "sales",
    summary: "Création auto, enrichissement IA, édition, rattachement et audit trail des fiches clients.",
    tags: ["enrichissement", "ia", "édition", "rattachement", "audit", "fiche", "merge", "historique"],
  },
  {
    id: "qualify",
    title: "Qualifier un appel",
    icon: MessageSquare,
    category: "sales",
    summary: "Comment et pourquoi qualifier chaque appel : mood, outcome, tags, notes et prochaine étape.",
    tags: ["mood", "outcome", "tags", "notes", "xp"],
  },
  {
    id: "ai-analysis",
    title: "Analyse IA des appels",
    icon: Bot,
    category: "concept",
    summary: "L'IA analyse chaque appel : score qualité, coaching, sentiment client, opportunités détectées.",
    tags: ["ia", "score", "coaching", "sentiment", "transcription"],
  },
  {
    id: "statuts",
    title: "Statuts & lifecycle client",
    icon: Activity,
    category: "concept",
    summary: "Le parcours d'un client : Prospect → Lead → Client → À risque → Dormant → Perdu. Un client avec des commandes n'est jamais un prospect.",
    tags: ["prospect", "lead", "dormant", "dead", "lifecycle"],
  },
  {
    id: "scoring",
    title: "Scores : Churn, Upsell, Priorité",
    icon: AlertTriangle,
    category: "concept",
    summary: "Comment le système calcule le risque de perte, le potentiel d'upsell et la priorité globale.",
    tags: ["churn", "upsell", "rfm", "priorité", "risque"],
  },
  {
    id: "products",
    title: "Catalogue produits & stock",
    icon: Package,
    category: "sales",
    summary: "Consultation du catalogue, fiches produit, niveaux de stock par dépôt et suggestions similaires.",
    tags: ["produit", "stock", "famille", "prix", "marge"],
  },
  {
    id: "leaderboard",
    title: "Classement & XP",
    icon: Trophy,
    category: "sales",
    summary: "Classement des commerciaux basé sur l'activité, les scores IA et l'XP gagnée.",
    tags: ["classement", "xp", "gamification", "performance"],
  },
  {
    id: "objectives",
    title: "Objectifs multi-KPI",
    icon: Target,
    category: "sales",
    summary: "Suivi de vos objectifs personnalisés : CA, marge, quantités, panier moyen… avec progression temps réel.",
    tags: ["objectif", "kpi", "ca", "marge", "progression", "cible"],
  },
  {
    id: "challenges",
    title: "Challenges commerciaux",
    icon: Flame,
    category: "sales",
    summary: "Concours ponctuels sur un produit ou un KPI. Classement live, récompenses et podium.",
    tags: ["challenge", "concours", "récompense", "classement", "produit"],
  },
  {
    id: "margins",
    title: "Marges brute & nette",
    icon: Percent,
    category: "concept",
    summary: "Calcul de la marge nette après déductions (logistique, structure, étiquetage, RFA). Configurable par l'admin.",
    tags: ["marge", "brute", "nette", "déduction", "forfait", "logistique"],
  },
  {
    id: "admin-margins",
    title: "Règles de marge (Admin)",
    icon: Calculator,
    category: "admin",
    summary: "Configuration des règles de déduction pour le calcul de la marge nette : forfaits au kg, pourcentages, dates d'effet.",
    tags: ["marge", "règle", "forfait", "admin", "déduction", "configuration"],
  },
  {
    id: "admin-challenges",
    title: "Gestion Challenges (Admin)",
    icon: Gift,
    category: "admin",
    summary: "Créer et gérer des challenges : choix du produit, métrique, objectif, récompense, période et statut.",
    tags: ["challenge", "admin", "créer", "récompense", "produit"],
  },
  {
    id: "admin-sync",
    title: "Synchronisation des données",
    icon: RefreshCw,
    category: "admin",
    summary: "Comment les données Sage et Ringover sont synchronisées (full sync, delta sync).",
    tags: ["sage", "ringover", "odbc", "sync", "delta"],
  },
  {
    id: "admin-playlist",
    title: "Configuration Playlists (Admin)",
    icon: ListMusic,
    category: "admin",
    summary: "Régler la taille, la répartition et les seuils des playlists pour chaque commercial.",
    tags: ["config", "répartition", "seuils", "pourcentage"],
  },
  {
    id: "admin-assign",
    title: "Assignation clients (Admin)",
    icon: UserCog,
    category: "admin",
    summary: "Transférer des clients entre commerciaux et gérer les portefeuilles.",
    tags: ["assignation", "transfert", "portefeuille"],
  },
  {
    id: "admin-dashboard",
    title: "Pilotage Sales (Admin)",
    icon: BarChart3,
    category: "admin",
    summary: "Dashboard manager : KPIs équipe, comparaison commerciaux, drill-down appels, notes A/B/C/D.",
    tags: ["manager", "kpi", "comparaison", "grade", "performance"],
  },
  {
    id: "admin-glossaire",
    title: "Glossaire technique (Admin)",
    icon: BookOpen,
    category: "admin",
    summary: "Référence complète de toutes les variables, seuils et formules du système.",
    tags: ["glossaire", "variable", "formule", "seuil"],
  },
];

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  sales: { label: "Commercial", color: "bg-sora/10 text-sora border-sora/30" },
  admin: { label: "Admin", color: "bg-ume/10 text-ume border-ume/30" },
  concept: { label: "Concept", color: "bg-kiku/10 text-sensai border-kiku/30" },
};

export default function WikiPage() {
  const [currentArticle, setCurrentArticle] = useState<ArticleId>("home");
  const [search, setSearch] = useState("");

  const filteredArticles = search.trim()
    ? ARTICLES.filter(
        (a) =>
          a.title.toLowerCase().includes(search.toLowerCase()) ||
          a.summary.toLowerCase().includes(search.toLowerCase()) ||
          a.tags.some((t) => t.includes(search.toLowerCase()))
      )
    : ARTICLES;

  const handleClick = (e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest("[data-navigate]");
    if (target) {
      setCurrentArticle(target.getAttribute("data-navigate") as ArticleId);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const goTo = (id: ArticleId) => {
    setCurrentArticle(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const article = ARTICLES.find((a) => a.id === currentArticle);

  if (currentArticle !== "home" && article) {
    return (
      <div className="max-w-4xl mx-auto space-y-6" onClick={handleClick}>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => goTo("home")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <article.icon className="w-5 h-5 text-sora" />
              <h2 className="text-2xl font-bold tracking-tight">{article.title}</h2>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{article.summary}</p>
          </div>
          <Badge variant="outline" className={CATEGORY_LABELS[article.category].color}>
            {CATEGORY_LABELS[article.category].label}
          </Badge>
        </div>

        <Separator />

        <div className="prose-sm max-w-none">
          <ArticleContent id={currentArticle} goTo={goTo} />
        </div>

        <Separator />
        <RelatedArticles current={currentArticle} goTo={goTo} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BookOpen className="w-6 h-6" />
          Wiki — Centre d&apos;aide
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Tout ce qu&apos;il faut savoir pour maîtriser Sales Machine. Cliquez sur un article pour en savoir plus.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher un sujet (ex: churn, playlist, qualification...)"
          className="pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {(["sales", "concept", "admin"] as const).map((cat) => {
        const items = filteredArticles.filter((a) => a.category === cat);
        if (items.length === 0) return null;
        return (
          <div key={cat}>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <Badge variant="outline" className={`text-xs ${CATEGORY_LABELS[cat].color}`}>
                {CATEGORY_LABELS[cat].label}
              </Badge>
              <span>{cat === "sales" ? "Fonctionnalités commerciales" : cat === "admin" ? "Administration" : "Concepts & Calculs"}</span>
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map((a) => (
                <Card
                  key={a.id}
                  className="cursor-pointer hover:border-sora/40 hover:shadow-md transition-all group"
                  onClick={() => goTo(a.id)}
                >
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-accent group-hover:bg-sora/10 transition-colors">
                        <a.icon className="w-4 h-4 text-muted-foreground group-hover:text-sora transition-colors" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold group-hover:text-sora transition-colors">
                          {a.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {a.summary}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-sora/60 mt-0.5 shrink-0 transition-colors" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RelatedArticles({ current, goTo }: { current: ArticleId; goTo: (id: ArticleId) => void }) {
  const currentTags = ARTICLES.find((a) => a.id === current)?.tags || [];
  const related = ARTICLES.filter(
    (a) => a.id !== current && a.tags.some((t) => currentTags.includes(t))
  ).slice(0, 4);

  if (related.length === 0) return null;

  return (
    <div>
      <h3 className="text-sm font-semibold text-muted-foreground mb-3">Articles liés</h3>
      <div className="grid sm:grid-cols-2 gap-2">
        {related.map((a) => (
          <button
            key={a.id}
            onClick={() => goTo(a.id)}
            className="flex items-center gap-3 p-3 rounded-lg border hover:border-sora/40 hover:bg-accent/50 transition-all text-left"
          >
            <a.icon className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{a.title}</p>
              <p className="text-xs text-muted-foreground truncate">{a.summary}</p>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

function ArticleContent({ id, goTo }: { id: ArticleId; goTo: (id: ArticleId) => void }) {
  const L = ({ to, children }: { to: ArticleId; children: React.ReactNode }) => (
    <button onClick={() => goTo(to)} className="text-sora hover:underline underline-offset-2 font-medium">
      {children}
    </button>
  );

  switch (id) {
    case "dashboard":
      return (
        <div className="space-y-4">
          <Section title="À quoi sert le tableau de bord ?">
            <p>C&apos;est votre cockpit quotidien. En un coup d&apos;œil, vous voyez votre CA, vos marges, vos appels, vos objectifs, les challenges en cours et les actions urgentes.</p>
          </Section>

          <Section title="Bloc Business">
            <ul className="space-y-2 text-sm">
              <li className="flex gap-2"><ShoppingCart className="w-4 h-4 mt-0.5 text-sora shrink-0" /><span><strong>CA :</strong> chiffre d&apos;affaires HT sur la période sélectionnée.</span></li>
              <li className="flex gap-2"><Package className="w-4 h-4 mt-0.5 text-sora shrink-0" /><span><strong>Commandes :</strong> nombre total de commandes.</span></li>
              <li className="flex gap-2"><ShoppingCart className="w-4 h-4 mt-0.5 text-sora shrink-0" /><span><strong>Panier moyen :</strong> CA divisé par le nombre de commandes.</span></li>
              <li className="flex gap-2"><Package className="w-4 h-4 mt-0.5 text-sora shrink-0" /><span><strong>Volume vendu :</strong> poids net total en kg.</span></li>
            </ul>
          </Section>

          <Section title="Bloc Marges">
            <p>Affiche la <strong>marge brute</strong>, la <strong>marge nette</strong> (après déductions), le total des <strong>déductions</strong> et le <strong>taux de marge nette</strong>. Voir <L to="margins">Marges brute &amp; nette</L> pour le détail du calcul.</p>
          </Section>

          <Section title="Bloc Activité téléphonique">
            <p>6 indicateurs individuels : appels sortants, entrants, décrochés, manqués, durée moyenne et durée totale. Réactifs aux filtres de dates et au sélecteur utilisateur.</p>
          </Section>

          <Section title="Filtrer par période">
            <p>Utilisez les boutons <strong>Aujourd&apos;hui</strong>, <strong>Hier</strong>, <strong>7j</strong>, <strong>30j</strong>, <strong>90j</strong> ou le <strong>calendrier</strong> pour choisir une plage libre. Toutes les données se mettent à jour instantanément.</p>
            <p>Les managers et admins ont un sélecteur <strong>&quot;Voir en tant que&quot;</strong> qui filtre <strong>toutes</strong> les données du dashboard : stats, marges, appels, rappels, playlist, objectifs, top clients et produits.</p>
          </Section>

          <Section title="Rappels & Alertes">
            <p>Côte à côte sous les stats :</p>
            <ul className="text-sm space-y-1">
              <li>• <strong>Rappels</strong> : les 5 prochains clients à rappeler (issus de la <L to="qualify">qualification</L>).</li>
              <li>• <strong>Alertes</strong> : appels non qualifiés et clients dormants.</li>
            </ul>
          </Section>

          <Section title="Objectifs & Challenges">
            <p>Côte à côte : vos <L to="objectives">objectifs multi-KPI</L> avec jauges de progression, et les <L to="challenges">challenges en cours</L> avec le podium et votre position.</p>
          </Section>

          <Section title="Top Clients & Produits">
            <p>Classement des meilleurs clients et produits sur la période sélectionnée, avec CA et quantités.</p>
          </Section>

          <Section title="Graphique d'évolution CA">
            <p>Le graphique montre votre CA mois par mois avec une ligne pointillée pour l&apos;objectif. Survolez pour voir le détail.</p>
          </Section>
        </div>
      );

    case "playlist":
      return (
        <div className="space-y-4">
          <Section title="Qu'est-ce que la playlist ?">
            <p>Chaque matin, le système génère automatiquement une liste de clients à appeler, personnalisée pour vous. C&apos;est votre plan d&apos;action de la journée : au lieu de chercher qui appeler, la playlist vous propose les contacts les plus pertinents selon plusieurs critères.</p>
          </Section>

          <Section title="Les catégories de contacts">
            <ul className="space-y-2 text-sm">
              <li className="flex gap-2"><Clock className="w-4 h-4 mt-0.5 text-sora shrink-0" /><span><strong>Rappels planifiés (callback) :</strong> clients pour qui vous avez prévu un rappel aujourd&apos;hui lors d&apos;une précédente <L to="qualify">qualification</L>. Toujours en priorité.</span></li>
              <li className="flex gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 text-ume shrink-0" /><span><strong>Clients dormants :</strong> 180+ jours sans commande. Le système respecte un <strong>cooldown de 14 jours</strong> entre les tentatives pour ne pas saturer le client.</span></li>
              <li className="flex gap-2"><TrendingUp className="w-4 h-4 mt-0.5 text-red-500 shrink-0" /><span><strong>Risque churn :</strong> clients actifs dont le <L to="scoring">score de churn</L> est élevé — ils commandent moins que d&apos;habitude, il faut les relancer.</span></li>
              <li className="flex gap-2"><Zap className="w-4 h-4 mt-0.5 text-green-600 shrink-0" /><span><strong>Upsell :</strong> clients avec un potentiel de vente additionnelle élevé. En cliquant sur l&apos;insight, vous verrez <L to="ai-analysis">les recommandations IA</L> sur quoi pousser.</span></li>
              <li className="flex gap-2"><Star className="w-4 h-4 mt-0.5 text-amber-500 shrink-0" /><span><strong>Prospects & Leads :</strong> nouveaux contacts à démarcher. Les <L to="statuts">leads qualifiés</L> (appel décroché &gt; 30s) sont priorisés sur les simples prospects.</span></li>
            </ul>
          </Section>

          <Section title="Comment l'utiliser">
            <ol className="text-sm space-y-2 list-decimal list-inside">
              <li>Parcourez votre playlist de haut en bas — les contacts sont triés par priorité.</li>
              <li>Cliquez sur le bouton <strong>téléphone</strong> pour appeler directement via Ringover.</li>
              <li>Après l&apos;appel, marquez le contact comme <strong>OK</strong> (traité) ou <strong>Skip</strong> (reporté).</li>
              <li>Vous pouvez <strong>annuler</strong> un statut (bouton ↩️) si vous vous trompez.</li>
              <li>Cliquez sur le nom du client pour ouvrir sa <L to="client360">fiche 360°</L>.</li>
              <li>Cliquez sur l&apos;icône <strong>info</strong> pour ouvrir le volet <strong>Insight</strong> : CA historique, panier moyen, et recommandation IA.</li>
            </ol>
          </Section>

          <Section title="Insight & Recommandation IA">
            <p>Le volet Insight s&apos;ouvre à droite et vous montre :</p>
            <ul className="text-sm space-y-1">
              <li>• Le <strong>CA total historique</strong> et le <strong>CA des 12 derniers mois</strong> (calculé en temps réel).</li>
              <li>• Le <strong>panier moyen</strong> et les <strong>top produits</strong> du client.</li>
              <li>• Une <strong>recommandation IA</strong> contextuelle qui analyse le profil et vous dit quoi pousser.</li>
            </ul>
          </Section>

          <Section title="Périmètre des entreprises">
            <p>Votre admin configure quelles entreprises remontent dans votre playlist :</p>
            <ul className="text-sm space-y-1">
              <li>• <strong>Vos entreprises :</strong> uniquement celles qui vous sont assignées dans le CRM.</li>
              <li>• <strong>Vos entreprises + non assignées :</strong> vos clients + les entreprises sans commercial attitré.</li>
              <li>• <strong>Rep Sage :</strong> les clients d&apos;un représentant Sage spécifique.</li>
              <li>• <strong>Sans commercial :</strong> uniquement les entreprises orphelines (sans assignation).</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-1">Ce périmètre empêche qu&apos;un client d&apos;un autre commercial apparaisse dans votre playlist.</p>
          </Section>

          <Section title="Anti-doublons">
            <p>Un même client ne peut <strong>jamais</strong> apparaître dans deux playlists différentes le même jour :</p>
            <ul className="text-sm space-y-1">
              <li>• En <strong>mode batch</strong> (toute l&apos;équipe) : un set global de clients vus est partagé entre tous les commerciaux pendant la génération.</li>
              <li>• En <strong>mode individuel</strong> (un seul commercial) : le système charge d&apos;abord tous les clients déjà présents dans les playlists des autres commerciaux du jour, puis les exclut.</li>
            </ul>
          </Section>
        </div>
      );

    case "clients":
      return (
        <div className="space-y-4">
          <Section title="La liste clients">
            <p>Cette page affiche toute votre base client avec des indicateurs clés sur chaque ligne : CA total, CA 12 mois, dernière commande, nombre de commandes, scores de churn et d&apos;upsell.</p>
          </Section>

          <Section title="Recherche & Filtres">
            <p>La barre de recherche filtre par nom, code Sage, ville, contact, téléphone ou email. Vous pouvez aussi filtrer par :</p>
            <ul className="text-sm space-y-1">
              <li>• <strong>Commercial</strong> : voir uniquement les clients d&apos;un sales rep spécifique.</li>
              <li>• <strong>Statut</strong> : filtrer par statut du lifecycle (Prospect, Lead qualifié, Client actif, À risque, Dormant, Perdu). Filtre indépendant du churn.</li>
              <li>• <strong>Churn</strong> : filtrer par niveau de risque churn (filtre indépendant du statut). Les colonnes <strong>Statut</strong> et <strong>Churn</strong> sont désormais séparées avec des filtres distincts.</li>
              <li>• <strong>Avec/sans commandes</strong> : séparer les clients actifs des prospects purs (rappel : un contact avec commandes n&apos;est jamais un prospect).</li>
            </ul>
          </Section>

          <Section title="Colonnes Statut et Churn">
            <p>La liste affiche désormais deux colonnes distinctes :</p>
            <ul className="text-sm space-y-1">
              <li>• <strong>Statut</strong> : le <L to="statuts">statut lifecycle</L> du client (Prospect, Lead qualifié, Client actif, À risque, Dormant, Perdu).</li>
              <li>• <strong>Churn</strong> : le <L to="scoring">score de risque churn</L> avec jauge visuelle. Chaque colonne dispose de son propre filtre indépendant.</li>
            </ul>
          </Section>

          <Section title="Trier les colonnes">
            <p>Cliquez sur n&apos;importe quel en-tête de colonne pour trier : par nom, CA total, CA 12m, dernière commande, nombre de commandes, panier moyen, marge, statut, churn, upsell, priorité.</p>
          </Section>

          <Section title="Badges de statut">
            <p>Chaque client affiche un badge coloré indiquant son <L to="statuts">statut dans le lifecycle</L>. Survolez-le pour lire l&apos;explication du statut. Rappel : un client avec des commandes en base n&apos;est jamais un prospect — le système auto-corrige les incohérences.</p>
          </Section>

          <Section title="Accéder à un client">
            <p>Cliquez sur le nom d&apos;un client pour ouvrir sa <L to="client360">fiche 360°</L>.</p>
          </Section>
        </div>
      );

    case "client360":
      return (
        <div className="space-y-4">
          <Section title="Vue d'ensemble">
            <p>La fiche 360° regroupe <strong>toutes les informations</strong> sur un client en une seule page. C&apos;est votre référence avant et après chaque appel.</p>
          </Section>

          <Section title="En-tête">
            <p>Nom, code Sage, commercial assigné, catégorie tarifaire, <L to="statuts">badge de statut</L>, et bouton d&apos;appel direct.</p>
            <p>Trois actions supplémentaires sont disponibles dans l&apos;en-tête :</p>
            <ul className="text-sm space-y-1">
              <li>• <Pencil className="w-3 h-3 inline text-sora" /> <strong>Mode édition</strong> : transforme tous les champs en inputs éditables avec boutons Sauvegarder/Annuler. Voir <L to="enrichment">Gestion des fiches</L>.</li>
              <li>• <Sparkles className="w-3 h-3 inline text-amber-500" /> <strong>Enrichir IA</strong> : recherche automatique d&apos;informations via Google Places, recherche web et OpenAI. Voir <L to="enrichment">Enrichissement IA</L>.</li>
              <li>• <Link2 className="w-3 h-3 inline text-sora" /> <strong>Rattacher</strong> : fusionner cette fiche avec un client existant (transfert des numéros et de l&apos;historique). Voir <L to="enrichment">Rattachement</L>.</li>
            </ul>
          </Section>

          <Section title="Cartes de synthèse">
            <ul className="text-sm space-y-1">
              <li>• <strong>CA total</strong> historique depuis la première commande.</li>
              <li>• <strong>Commandes</strong> : nombre total et panier moyen.</li>
              <li>• <strong>Produits distincts</strong> commandés.</li>
              <li>• <strong>Marge moyenne</strong> en % et en valeur.</li>
              <li>• <strong>Dernière commande</strong> : nombre de jours depuis + date de première commande.</li>
            </ul>
          </Section>

          <Section title="Scoring">
            <p>Les jauges affichent le <L to="scoring">score de churn</L> (risque de perte) et le score d&apos;upsell (potentiel de vente additionnelle), ainsi que le CA 12 mois, les commandes 12 mois, la fréquence moyenne et la priorité globale.</p>
          </Section>

          <Section title="Feedback commercial">
            <p>Si des appels ont été <L to="qualify">qualifiés</L> pour ce client, un bloc résume :</p>
            <ul className="text-sm space-y-1">
              <li>• <Flame className="w-3 h-3 inline text-orange-500" /> Compteur <strong>chaud</strong> et <Snowflake className="w-3 h-3 inline text-blue-500" /> compteur <strong>froid</strong> : combien de fois le client a été jugé réceptif ou froid.</li>
              <li>• Le <strong>dernier mood</strong> et le <strong>dernier outcome</strong> avec la date.</li>
            </ul>
          </Section>

          <Section title="Onglets : Ventes / Appels / Retours / Upsell / Historique modifications">
            <p><strong>Historique ventes</strong> : tableau de toutes les commandes avec date, numéro de pièce, articles, quantités, prix, montant HT et marge. Cliquez sur un numéro de pièce pour voir le détail complet de la commande.</p>
            <p><strong>Historique appels</strong> : les 30 derniers appels avec direction, durée, mood, outcome, et score IA affichés directement sur la ligne. Cliquez pour déplier et voir :</p>
            <ul className="text-sm space-y-1">
              <li>• La <L to="qualify">qualification</L> du sales : notes, tags, prochaine étape.</li>
              <li>• L&apos;<L to="ai-analysis">analyse IA</L> : résumé, sentiment, coaching, opportunités.</li>
              <li>• Le <strong>lecteur audio</strong> si un enregistrement existe.</li>
            </ul>
            <p><strong>Retours commerciaux</strong> : timeline chronologique de tous les retours et qualifications du commercial sur ce client (moods, outcomes, notes, tags, prochaines étapes). Permet de visualiser l&apos;historique complet des échanges commerciaux en un seul endroit.</p>
            <p><strong>Suggestions upsell</strong> : produits que des clients similaires achètent mais pas celui-ci, avec un taux d&apos;affinité et le CA généré chez les similaires.</p>
            <p><History className="w-3 h-3 inline text-sora" /> <strong>Historique modifications</strong> : timeline de toutes les modifications apportées à la fiche (création, mises à jour, fusions, ajout/suppression de téléphones). Chaque entrée indique qui a fait la modification, quel champ, l&apos;ancienne et la nouvelle valeur. Voir <L to="enrichment">Audit trail</L>.</p>
          </Section>

          <Section title="Section Contacts">
            <p>Chaque entreprise peut avoir <strong>plusieurs contacts</strong> (personnes physiques rattachées). La fiche 360° affiche la liste des contacts de l&apos;entreprise avec possibilité de créer, éditer et déplacer des contacts. Le <strong>contact principal</strong> est créé automatiquement lors de l&apos;import Sage ou de la sync Ringover. Voir <L to="contacts">Entreprises & Contacts</L>.</p>
          </Section>

          <Section title="Infos légales">
            <p>Téléphones (multi-numéros avec ajout/suppression), email, adresse, site web, SIRET, TVA intracom, code NAF.</p>
          </Section>
        </div>
      );

    case "contacts":
      return (
        <div className="space-y-4">
          <Section title="Architecture Entreprise / Contact">
            <p>Le CRM distingue désormais les <strong>entreprises</strong> (clients) et les <strong>contacts</strong> (personnes physiques). Une entreprise peut avoir plusieurs contacts.</p>
          </Section>

          <Section title="Contacts">
            <p><strong>Chaque entreprise peut avoir plusieurs contacts</strong> (personnes). Un contact est une personne physique rattachée à une entreprise. Les coordonnées (téléphone, email) sont associées aux contacts.</p>
          </Section>

          <Section title="Contact principal">
            <p>Un <strong>contact principal</strong> est créé automatiquement lors de :</p>
            <ul className="text-sm space-y-1">
              <li>• L&apos;import des données depuis <strong>Sage</strong> : le contact principal de la fiche comptable est créé ou mis à jour.</li>
              <li>• La synchronisation des <strong>appels Ringover</strong> : lorsqu&apos;un numéro inconnu appelle ou est appelé, une entreprise et son contact principal sont créés automatiquement.</li>
            </ul>
          </Section>

          <Section title="Création, édition et déplacement">
            <p>Vous pouvez :</p>
            <ul className="text-sm space-y-1">
              <li>• <strong>Créer</strong> de nouveaux contacts pour une entreprise existante.</li>
              <li>• <strong>Éditer</strong> les informations des contacts (nom, téléphone, email, etc.).</li>
              <li>• <strong>Déplacer</strong> un contact vers une autre entreprise : le contact et son historique d&apos;appels sont transférés. Utile lorsqu&apos;un collaborateur change d&apos;entreprise ou pour corriger une mauvaise assignation.</li>
              <li>• <strong>Assigner</strong> un contact orphelin (sans entreprise) à une entreprise existante.</li>
            </ul>
          </Section>

          <Section title="Appels et liens">
            <p>Les appels sont liés à <strong>un contact ET à une entreprise</strong>. Ainsi, l&apos;historique d&apos;appels est toujours contextualisé : vous savez quelle personne a été contactée et pour quelle entreprise. Lors d&apos;un déplacement de contact, les appels associés sont transférés avec le contact.</p>
          </Section>

          <Section title="Où gérer les contacts ?">
            <p>Sur la <L to="client360">fiche client 360°</L>, une section dédiée affiche la liste des contacts de l&apos;entreprise avec les actions disponibles (créer, éditer, déplacer).</p>
          </Section>
        </div>
      );

    case "calls":
      return (
        <div className="space-y-4">
          <Section title="Vue d'ensemble">
            <p>Cette page liste tous vos appels (entrants et sortants) synchronisés depuis Ringover. La barre de recherche effectue une <strong>recherche hybride</strong> : elle interroge à la fois l&apos;historique d&apos;appels et la base client (nom, code Sage, numéro, contact).</p>
          </Section>

          <Section title="Onglets">
            <ul className="text-sm space-y-1">
              <li>• <strong>Tous les appels</strong> : historique complet.</li>
              <li>• <strong>Non qualifiés</strong> : appels décrochés qui n&apos;ont pas encore été <L to="qualify">qualifiés</L>. C&apos;est ici que vous devez agir en priorité pour compléter vos fiches.</li>
            </ul>
          </Section>

          <Section title="Classification des appels">
            <ul className="text-sm space-y-1">
              <li>• <strong>Appel sortant décroché</strong> : icône flèche sortante (bleu).</li>
              <li>• <strong>Appel entrant décroché</strong> : icône flèche entrante (vert).</li>
              <li>• <strong>Sans réponse (sortant)</strong> : appel sortant non décroché par le client. Auto-qualifié comme <strong>« Injoignable »</strong>. Ne pas confondre avec &quot;Manqué&quot;.</li>
              <li>• <strong>Manqué (entrant)</strong> : appel entrant auquel le commercial n&apos;a pas répondu. Réservé aux appels entrants uniquement.</li>
            </ul>
          </Section>

          <Section title="Informations sur chaque appel">
            <ul className="text-sm space-y-1">
              <li>• <strong>Direction</strong> : icône selon la classification ci-dessus.</li>
              <li>• <strong>Client</strong> : nom cliquable qui ouvre un panneau latéral avec les infos résumées.</li>
              <li>• <strong>Score IA</strong> : badge coloré (vert ≥ 7, ambre ≥ 5, rouge &lt; 5) si l&apos;appel a été analysé.</li>
              <li>• <strong>Sentiment</strong> : Positif / Neutre / Négatif détecté par l&apos;IA.</li>
              <li>• <strong>Qualification</strong> : badge du résultat (Rappel, Vente, Intéressé, Injoignable, etc.).</li>
            </ul>
          </Section>

          <Section title="Numéros inconnus & création automatique">
            <p>Lorsqu&apos;un appel est passé ou reçu depuis un numéro non répertorié dans la base, le système <strong>crée automatiquement une fiche client par défaut</strong> lors de la synchronisation des appels. Cela garantit qu&apos;aucun appel ne reste orphelin.</p>
            <p>Pour les numéros inconnus, un bouton <Badge variant="outline" className="text-xs">Créer fiche</Badge> apparaît directement dans la liste, permettant de créer manuellement une fiche si la création automatique n&apos;a pas encore eu lieu. Une fois la fiche créée, vous pouvez l&apos;<L to="enrichment">enrichir via l&apos;IA</L> ou la <L to="enrichment">rattacher à un client existant</L>.</p>
          </Section>

          <Section title="Actions disponibles">
            <ul className="text-sm space-y-1">
              <li>• <strong>Appeler</strong> : relancer le numéro via click-to-call Ringover.</li>
              <li>• <strong>Écouter</strong> : ouvrir l&apos;enregistrement avec l&apos;<L to="ai-analysis">analyse IA</L> complète.</li>
              <li>• <strong>Qualifier</strong> : ouvrir le formulaire de <L to="qualify">qualification</L>.</li>
              <li>• <strong>Créer fiche</strong> : disponible pour les numéros inconnus, crée une fiche client à partir du numéro.</li>
            </ul>
          </Section>

          <Section title="Panneau latéral client">
            <p>En cliquant sur un client dans la liste, un volet s&apos;ouvre à droite avec un résumé rapide : coordonnées, CA, scores, top produits, derniers appels et ventes. Utile pour avoir le contexte avant de rappeler sans quitter la page.</p>
          </Section>
        </div>
      );

    case "enrichment":
      return (
        <div className="space-y-4">
          <Section title="Vue d'ensemble">
            <p>Cette page décrit les fonctionnalités de gestion avancée des fiches clients : création automatique, enrichissement par IA, édition manuelle, rattachement (fusion) et audit trail. Ces outils permettent de maintenir une base client propre et complète avec un minimum d&apos;effort.</p>
          </Section>

          <Section title="1. Création automatique de fiches (numéros inconnus)">
            <p>Lorsqu&apos;un appel est passé ou reçu via Ringover depuis un numéro qui n&apos;existe pas dans la base, le système <strong>crée automatiquement une fiche client par défaut</strong> lors de la synchronisation des appels (<code className="text-xs bg-muted px-1 py-0.5 rounded">sync_calls</code>).</p>
            <ul className="text-sm space-y-1">
              <li>• La fiche est créée avec le numéro de téléphone comme seule information connue.</li>
              <li>• Sur la page <L to="calls">Appels</L>, les numéros inconnus affichent un bouton <Badge variant="outline" className="text-xs">Créer fiche</Badge> pour une création manuelle si nécessaire.</li>
              <li>• Une fois créée, la fiche peut être <strong>enrichie par l&apos;IA</strong> (voir ci-dessous) ou <strong>rattachée</strong> à un client existant.</li>
            </ul>
          </Section>

          <Section title="2. Enrichissement IA">
            <p>Sur la <L to="client360">fiche client 360°</L>, le bouton <Sparkles className="w-3 h-3 inline text-amber-500" /> <strong>Enrichir IA</strong> lance une recherche automatique d&apos;informations sur le client via plusieurs sources.</p>

            <p><strong>Sources de données :</strong></p>
            <ul className="text-sm space-y-1">
              <li>• <strong>Google Places API</strong> : recherche par numéro de téléphone pour trouver le nom de l&apos;entreprise, l&apos;adresse, le site web, etc.</li>
              <li>• <strong>Recherche inversée</strong> : si le client n&apos;a pas de téléphone mais a un nom, recherche par nom pour trouver le numéro.</li>
              <li>• <strong>Recherche par SIRET</strong> : si le client a un numéro SIRET, recherche via web search pour trouver les informations légales.</li>
              <li>• <strong>OpenAI web search (fallback)</strong> : recherche complémentaire pour les informations légales (SIRET, code NAF, email de contact).</li>
            </ul>

            <p><strong>Affichage des résultats :</strong></p>
            <p>Les résultats s&apos;affichent dans une boîte de dialogue avec pour chaque champ trouvé :</p>
            <ul className="text-sm space-y-1">
              <li>• Un <strong>niveau de confiance</strong> :
                <span className="inline-flex gap-1 ml-1">
                  <Badge variant="outline" className="text-[10px] border-green-300 text-green-700 bg-green-50">Élevée</Badge>
                  <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50">Moyenne</Badge>
                  <Badge variant="outline" className="text-[10px] border-red-300 text-red-700 bg-red-50">Faible</Badge>
                </span>
              </li>
              <li>• Un badge <Badge variant="outline" className="text-[10px] border-green-300 text-green-700 bg-green-50">nouveau</Badge> si le champ n&apos;était pas renseigné, ou <Badge variant="outline" className="text-[10px]">déjà renseigné</Badge> si la valeur existait déjà.</li>
            </ul>

            <p><strong>Règle importante :</strong> l&apos;enrichissement <strong>n&apos;écrase jamais</strong> les données existantes. Seuls les champs vides sont remplis avec les nouvelles données. Vous gardez le contrôle total.</p>
          </Section>

          <Section title="3. Édition manuelle des fiches">
            <p>Sur la <L to="client360">fiche client 360°</L>, cliquez sur l&apos;icône <Pencil className="w-3 h-3 inline text-sora" /> pour passer en <strong>mode édition</strong>.</p>
            <ul className="text-sm space-y-1">
              <li>• Tous les champs de la fiche (nom, adresse, email, téléphones, SIRET, TVA, code NAF, site web…) deviennent des <strong>inputs éditables</strong>.</li>
              <li>• Deux boutons apparaissent : <strong>Sauvegarder</strong> (valide les modifications) et <strong>Annuler</strong> (restaure les valeurs précédentes).</li>
              <li>• Chaque modification est enregistrée dans l&apos;<strong>audit trail</strong> (voir ci-dessous).</li>
            </ul>
          </Section>

          <Section title="4. Rattacher à un client existant (fusion)">
            <p>Sur la <L to="client360">fiche client 360°</L>, le bouton <Link2 className="w-3 h-3 inline text-sora" /> <strong>Rattacher</strong> permet de fusionner la fiche courante avec un client existant.</p>

            <p><strong>Cas d&apos;usage typique :</strong> un employé d&apos;une entreprise cliente appelle depuis son téléphone personnel → le système crée une fiche orpheline. Le commercial peut alors la rattacher à la fiche de l&apos;entreprise.</p>

            <p><strong>Processus :</strong></p>
            <ol className="text-sm space-y-1 list-decimal list-inside">
              <li>Cliquez sur <Link2 className="w-3 h-3 inline text-sora" /> <strong>Rattacher</strong>.</li>
              <li>Une boîte de dialogue s&apos;ouvre avec une <strong>recherche</strong> pour trouver le client cible.</li>
              <li>Sélectionnez le client cible et confirmez.</li>
              <li>Le système <strong>transfère les numéros de téléphone</strong> et l&apos;<strong>historique d&apos;appels</strong> vers le client cible.</li>
              <li>La fiche orpheline est <strong>supprimée</strong>.</li>
              <li>Vous êtes <strong>redirigé</strong> vers la fiche du client cible.</li>
            </ol>
          </Section>

          <Section title="5. Audit trail (Historique des modifications)">
            <p>Un nouvel onglet <History className="w-3 h-3 inline text-sora" /> <strong>Historique modifications</strong> est disponible sur la <L to="client360">fiche client 360°</L>.</p>

            <p><strong>Ce qui est tracé :</strong></p>
            <ul className="text-sm space-y-1">
              <li>• <strong>Création</strong> de la fiche (manuelle ou automatique).</li>
              <li>• <strong>Mises à jour</strong> de champs (édition manuelle ou enrichissement IA).</li>
              <li>• <strong>Fusions</strong> (rattachement d&apos;une fiche à une autre).</li>
              <li>• <strong>Ajout/suppression</strong> de numéros de téléphone.</li>
            </ul>

            <p><strong>Informations affichées pour chaque entrée :</strong></p>
            <ul className="text-sm space-y-1">
              <li>• <strong>Date et heure</strong> de la modification.</li>
              <li>• <strong>Auteur</strong> : qui a effectué le changement.</li>
              <li>• <strong>Champ modifié</strong> : quel champ a été touché.</li>
              <li>• <strong>Ancienne valeur → Nouvelle valeur</strong>.</li>
              <li>• <strong>Type d&apos;action</strong> : code couleur par type (création, mise à jour, fusion, téléphone).</li>
            </ul>
          </Section>
        </div>
      );

    case "qualify":
      return (
        <div className="space-y-4">
          <Section title="Pourquoi qualifier ?">
            <p>La qualification d&apos;un appel est l&apos;acte le plus important après un échange. Elle permet de :</p>
            <ul className="text-sm space-y-1">
              <li>• <strong>Alimenter la fiche client</strong> : le mood et l&apos;outcome sont enregistrés sur la <L to="client360">fiche 360°</L>.</li>
              <li>• <strong>Améliorer la playlist</strong> : les clients avec un mood &quot;chaud&quot; remontent en priorité dans les prochaines <L to="playlist">playlists</L>.</li>
              <li>• <strong>Planifier des rappels</strong> : si vous définissez une prochaine étape avec date, le client apparaîtra automatiquement dans vos rappels et dans la catégorie &quot;callback&quot; de la playlist.</li>
              <li>• <strong>Gagner de l&apos;XP</strong> : chaque qualification rapporte <strong>10 XP</strong> (15 XP si vous remplissez les tags + prochaine étape). Voir <L to="leaderboard">Classement</L>.</li>
              <li>• <strong>Déclencher le lifecycle</strong> : un outcome &quot;pas intéressé&quot; passe le client en statut <L to="statuts">Perdu (Dead)</L>.</li>
            </ul>
          </Section>

          <Section title="Les champs de qualification">
            <ul className="space-y-3 text-sm">
              <li>
                <strong>Ressenti (mood) :</strong>
                <div className="flex gap-2 mt-1">
                  <Badge variant="outline" className="border-orange-300 text-orange-700 bg-orange-50 text-xs">Chaud</Badge>
                  <Badge variant="outline" className="text-xs">Neutre</Badge>
                  <Badge variant="outline" className="border-blue-300 text-blue-700 bg-blue-50 text-xs">Froid</Badge>
                </div>
                <p className="text-muted-foreground mt-1">Votre impression globale sur la réceptivité du client.</p>
              </li>
              <li>
                <strong>Résultat (outcome) :</strong> Intéressé, Rappel prévu, Devis envoyé, Commande, Pas intéressé, Pas de réponse.
                <p className="text-muted-foreground mt-1">Ce qui s&apos;est concrètement passé pendant l&apos;appel.</p>
              </li>
              <li>
                <strong>Tags :</strong> mots-clés libres pour catégoriser (ex: &quot;promotion&quot;, &quot;nouveau produit&quot;, &quot;réclamation&quot;).
              </li>
              <li>
                <strong>Prochaine étape :</strong> texte libre décrivant l&apos;action à faire (ex: &quot;Envoyer devis gamme X&quot;).
              </li>
              <li>
                <strong>Date de rappel :</strong> si définie, le client apparaîtra dans vos rappels ce jour-là.
              </li>
              <li>
                <strong>Notes :</strong> tout contexte utile pour le prochain échange.
              </li>
            </ul>
          </Section>

          <Section title="Où qualifier ?">
            <p>Depuis la page <L to="calls">Appels</L> (bouton &quot;Qualifier&quot; sur chaque appel), ou depuis la <L to="playlist">Playlist</L> lors du traitement d&apos;un contact.</p>
          </Section>
        </div>
      );

    case "ai-analysis":
      return (
        <div className="space-y-4">
          <Section title="Comment ça marche ?">
            <p>Quand un appel est enregistré par Ringover, l&apos;IA peut l&apos;analyser automatiquement. Le processus :</p>
            <ol className="text-sm space-y-1 list-decimal list-inside">
              <li>L&apos;enregistrement audio est <strong>transcrit</strong> en texte.</li>
              <li>L&apos;IA analyse la transcription et produit un rapport complet.</li>
              <li>Les scores et le feedback sont sauvegardés et visibles partout dans le CRM.</li>
            </ol>
          </Section>

          <Section title="Les 6 scores de qualité">
            <ul className="space-y-2 text-sm">
              <li><strong>Politesse :</strong> salutation, ton, courtoisie tout au long de l&apos;appel.</li>
              <li><strong>Gestion des objections :</strong> capacité à répondre aux doutes et hésitations.</li>
              <li><strong>Tentative de closing :</strong> est-ce qu&apos;une proposition concrète a été faite ?</li>
              <li><strong>Connaissance produit :</strong> maîtrise du catalogue et des spécificités.</li>
              <li><strong>Écoute active :</strong> reformulation, questions ouvertes, attention au client.</li>
              <li><strong>Score global :</strong> note synthétique sur 100 (affichée /10 sur le dashboard).</li>
            </ul>
          </Section>

          <Section title="Vue Commercial vs Manager">
            <p>L&apos;analyse se présente en deux vues :</p>
            <ul className="text-sm space-y-1">
              <li>• <strong>Vue Commercial :</strong> résumé de la conversation, coaching personnalisé, opportunités détectées, actions recommandées, sentiment client.</li>
              <li>• <strong>Vue Manager :</strong> scores détaillés sur 6 axes avec barres visuelles, feedback manager, transcription complète.</li>
            </ul>
          </Section>

          <Section title="Où voir l'analyse ?">
            <p>L&apos;analyse IA est visible :</p>
            <ul className="text-sm space-y-1">
              <li>• Sur la page <L to="calls">Appels</L> : badge score + sentiment, et détail complet en cliquant &quot;Écouter&quot;.</li>
              <li>• Sur la <L to="client360">fiche client 360°</L> : dans l&apos;onglet Appels, chaque appel analysé montre le score, le résumé et le coaching en dépliant.</li>
              <li>• Sur le <L to="admin-dashboard">Dashboard Pilotage</L> (admin) : moyenne des scores par commercial.</li>
            </ul>
          </Section>
        </div>
      );

    case "statuts":
      return (
        <div className="space-y-4">
          <Section title="Le lifecycle d'un client">
            <p>Chaque client a un <strong>statut</strong> qui évolue automatiquement en fonction de son historique de commandes et de ses interactions téléphoniques. Règle fondamentale : <strong>un client ayant au moins une commande dans Sage n&apos;est JAMAIS un prospect</strong>. Le statut est déterminé en priorité par l&apos;historique de commandes, et secondairement par les appels. Le scoring et la sync Sage auto-corrigent les statuts incohérents.</p>
          </Section>

          <Section title="Les 6 statuts">
            <div className="space-y-3">
              <StatusExplain name="Prospect" badge="bg-kiku/10 text-sensai border-kiku/30" entry="Import Sage ou création manuelle — zéro commande en base, zéro appel CRM" exit="Appel décroché > 30s → Lead qualifié, ou commande détectée → Client actif" auto />
              <StatusExplain name="Lead qualifié" badge="bg-sora/10 text-sora border-sora/30" entry="Appel décroché > 30s enregistré, MAIS zéro commande en base" exit="Première commande détectée dans Sage → Client actif (automatique)" auto />
              <StatusExplain name="Client actif" badge="bg-sensai/5 text-sensai border-sensai/20" entry="Commande détectée dans Sage, dernière commande < 180 jours (auto-transition depuis Prospect, Lead ou Dormant)" exit="Churn ≥ 60% → À risque, ou dernière commande ≥ 180j → Dormant" auto />
              <StatusExplain name="À risque" badge="bg-ume/10 text-ume border-ume/30" entry="Commandes en base + churn ≥ 60% (scoring RFM quotidien)" exit="Dernière commande ≥ 180j → Dormant, ou churn repasse < 60% → Client actif" auto />
              <StatusExplain name="Dormant" badge="bg-ume/20 text-sensai border-ume/30" entry="Commandes en base, dernière commande ≥ 180 jours" exit="Nouvelle commande → Client actif (réactivation), ou qualification « pas intéressé » → Perdu" auto />
              <StatusExplain name="Perdu (Dead)" badge="bg-muted text-muted-foreground border-border" entry="Qualification manuelle : outcome = « pas intéressé » + confirmation" exit="Aucune sortie automatique — seule transition manuelle du système" auto={false} />
            </div>
          </Section>

          <Section title="Auto-correction des statuts">
            <p>Le scoring engine et la sync Sage détectent et corrigent automatiquement les incohérences. Par exemple, un contact marqué &quot;Prospect&quot; alors qu&apos;il a des commandes en base sera automatiquement requalifié en Client actif ou Dormant selon la date de sa dernière commande. La transition Prospect/Lead → Client ne nécessite pas d&apos;appel préalable : la seule présence d&apos;une commande suffit.</p>
          </Section>

          <Section title="Cooldown dormant">
            <p>Quand un commercial appelle un client dormant et a une conversation (&gt; 30s), le client <strong>reste dormant</strong> mais sort de la <L to="playlist">playlist</L> pendant <strong>14 jours</strong> (cooldown). Cela évite de saturer le client avec des appels trop rapprochés.</p>
            <p>Après <strong>5 tentatives sur 6 mois</strong> sans nouvelle commande, le client remonte avec une mention spéciale pour décision managériale : le manager décide s&apos;il passe en &quot;Perdu&quot; ou s&apos;il faut persister.</p>
          </Section>

          <Section title="Où voir le statut ?">
            <p>Le badge de statut apparaît sur la <L to="playlist">playlist</L>, la <L to="clients">liste clients</L> et la <L to="client360">fiche 360°</L>. Survolez-le pour lire l&apos;explication.</p>
          </Section>
        </div>
      );

    case "scoring":
      return (
        <div className="space-y-4">
          <Section title="Les 3 scores">
            <p>Le système calcule quotidiennement trois scores pour chaque client ayant au moins une commande :</p>
          </Section>

          <Section title="Score de churn (risque de perte)">
            <p>Note de 0 à 100 qui mesure le risque qu&apos;un client cesse de commander. Plus le score est élevé, plus le risque est fort.</p>
            <p><strong>3 composantes :</strong></p>
            <ul className="text-sm space-y-2">
              <li><strong>Récence (0-40 pts) :</strong> nombre de jours depuis la dernière commande. Plus c&apos;est ancien, plus ça monte.</li>
              <li><strong>Déviation fréquence (0-35 pts) :</strong> compare le délai actuel à la fréquence habituelle. Si un client commande habituellement tous les 30 jours et que ça fait 90 jours, le ratio est de 3 → score élevé. Les clients &quot;one-shot&quot; (≤ 2 commandes) inactifs depuis 180+ jours reçoivent +20 pts.</li>
              <li><strong>Tendance d&apos;activité (0-25 pts) :</strong> examine les commandes et le CA des 12 derniers mois comparés à la moyenne historique.</li>
            </ul>
            <p className="text-sm mt-2">Un bonus de +5 pts est ajouté si le panier moyen du client est supérieur au double de la médiane (client à forte valeur = risque plus impactant).</p>
            <div className="flex gap-3 mt-2">
              <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">0-29 Faible</Badge>
              <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">30-49 Modéré</Badge>
              <Badge variant="outline" className="text-orange-700 border-orange-300 bg-orange-50">50-79 Élevé</Badge>
              <Badge variant="outline" className="text-red-700 border-red-300 bg-red-50">80-100 Critique</Badge>
            </div>
          </Section>

          <Section title="Score d'upsell (potentiel de vente)">
            <p>Note de 0 à 100 basée sur la régularité de commande, la diversité du catalogue acheté, le volume et la marge. Un score élevé signifie que le client a du potentiel pour acheter plus ou de nouveaux produits.</p>
          </Section>

          <Section title="Score de priorité globale">
            <p>Combinaison pondérée du churn et de l&apos;upsell. Utilisé par la <L to="playlist">playlist</L> pour ordonner les contacts : les clients à haute priorité apparaissent en premier.</p>
          </Section>

          <Section title="Impact sur le système">
            <ul className="text-sm space-y-1">
              <li>• Churn ≥ 60% → le client passe en <L to="statuts">statut « À risque »</L>.</li>
              <li>• Dernière commande ≥ 180 jours → passe en <L to="statuts">« Dormant »</L>.</li>
              <li>• Le scoring alimente les catégories de la <L to="playlist">playlist</L>.</li>
              <li>• Le scoring auto-corrige les <L to="statuts">statuts</L> incohérents (ex : un prospect avec des commandes est requalifié automatiquement).</li>
              <li>• Visible sur la <L to="client360">fiche 360°</L> et la <L to="clients">liste clients</L> (colonnes Statut et Churn séparées).</li>
            </ul>
          </Section>
        </div>
      );

    case "products":
      return (
        <div className="space-y-4">
          <Section title="Le catalogue produits">
            <p>La page Produits affiche tous les articles synchronisés depuis Sage 100. Recherchez par nom, référence ou famille de produit.</p>
          </Section>

          <Section title="Fiche produit">
            <p>Chaque produit affiche : référence, désignation, famille, prix de vente, prix d&apos;achat, marge théorique, poids, code-barres.</p>
          </Section>

          <Section title="Stock par dépôt">
            <p>Le stock est détaillé par dépôt : quantité en stock, réservée, en commande, en préparation, disponible et prévisionnelle. La <L to="admin-sync">synchronisation</L> des stocks peut être lancée depuis l&apos;admin.</p>
          </Section>

          <Section title="Clients acheteurs">
            <p>Sur chaque fiche produit, vous voyez quels clients ont acheté ce produit, combien de fois, et pour quel montant total. Utile pour identifier des prospects de cross-selling.</p>
          </Section>
        </div>
      );

    case "leaderboard":
      return (
        <div className="space-y-4">
          <Section title="Le classement">
            <p>Le classement compare les commerciaux de l&apos;équipe sur la base de l&apos;XP accumulée. L&apos;XP récompense l&apos;activité et la qualité.</p>
          </Section>

          <Section title="Comment gagner de l'XP ?">
            <ul className="text-sm space-y-1">
              <li>• <strong>10 XP</strong> par appel <L to="qualify">qualifié</L> (mood + outcome).</li>
              <li>• <strong>15 XP</strong> si la qualification est complète (tags + prochaine étape).</li>
              <li>• Les XP sont cumulés et visibles dans le classement.</li>
            </ul>
          </Section>

          <Section title="Métriques affichées">
            <ul className="text-sm space-y-1">
              <li>• Nombre total d&apos;appels et d&apos;appels décrochés.</li>
              <li>• Temps de parole cumulé.</li>
              <li>• Nombre d&apos;appels qualifiés.</li>
              <li>• Score IA moyen (note qualité /10).</li>
            </ul>
          </Section>

          <Section title="Podium">
            <p>Les 3 premiers sont mis en avant visuellement : trophée doré pour le 1er, médailles pour le 2e et 3e.</p>
          </Section>
        </div>
      );

    case "objectives":
      return (
        <div className="space-y-4">
          <Section title="Objectifs personnalisés">
            <p>Votre manager vous fixe des objectifs sur un ou plusieurs <strong>KPIs</strong>. Chaque objectif a une cible chiffrée et une période (mois, trimestre ou année).</p>
          </Section>
          <Section title="KPIs disponibles">
            <ul className="text-sm space-y-1">
              <li>• <strong>CA</strong> — chiffre d&apos;affaires HT réalisé</li>
              <li>• <strong>Marge brute</strong> — prix de vente - coût de revient</li>
              <li>• <strong>Marge nette</strong> — après déduction des forfaits (<L to="margins">voir calcul</L>)</li>
              <li>• <strong>Quantité (kg)</strong> — poids net vendu</li>
              <li>• <strong>Quantité (unités)</strong> — nombre d&apos;unités vendues</li>
              <li>• <strong>Panier moyen</strong> — CA divisé par le nombre de commandes</li>
              <li>• <strong>CA moyen / commande</strong> — montant moyen par commande</li>
              <li>• <strong>Nombre de commandes</strong> — volume total de commandes</li>
            </ul>
          </Section>
          <Section title="Suivi en temps réel">
            <p>La progression de chaque objectif est affichée sur votre <L to="dashboard">dashboard</L> avec une jauge visuelle. La valeur actuelle est calculée automatiquement à partir des données Sage sur la période en cours.</p>
          </Section>
        </div>
      );

    case "challenges":
      return (
        <div className="space-y-4">
          <Section title="Qu&apos;est-ce qu&apos;un challenge ?">
            <p>Un challenge est un <strong>concours ponctuel</strong> lancé par votre manager pour stimuler les ventes d&apos;un produit ou un KPI spécifique. Il a une date de début et de fin.</p>
          </Section>
          <Section title="Récompense">
            <p>Chaque challenge peut avoir une <strong>récompense</strong> visible par tous : iPhone, bon d&apos;achat, week-end... La récompense est affichée en évidence sur le dashboard et le classement pour motiver l&apos;équipe.</p>
          </Section>
          <Section title="Comment ça marche ?">
            <ul className="text-sm space-y-1">
              <li>• Le classement est calculé <strong>en temps réel</strong> à partir des ventes Sage.</li>
              <li>• Si le challenge porte sur un produit, seules les ventes de ce produit comptent.</li>
              <li>• La métrique (kg, unités, CA ou marge) détermine comment les ventes sont comptabilisées.</li>
              <li>• Votre position est mise en surbrillance sur le <L to="leaderboard">classement</L> et le <L to="dashboard">dashboard</L>.</li>
            </ul>
          </Section>
          <Section title="Où voir les challenges ?">
            <p>Les challenges actifs apparaissent sur votre <strong>dashboard</strong> (top 3 + votre position) et en détail sur la page <strong>Classement</strong> (cliquez pour voir tous les participants avec barres de progression).</p>
          </Section>
        </div>
      );

    case "margins":
      return (
        <div className="space-y-4">
          <Section title="Marge brute vs Marge nette">
            <p><strong>Marge brute</strong> = Prix de vente HT - Prix de revient HT. C&apos;est la marge &quot;brute&quot; avant frais opérationnels.</p>
            <p><strong>Marge nette</strong> = Marge brute - Forfaits et déductions. C&apos;est la vraie rentabilité après les coûts logistiques.</p>
          </Section>
          <Section title="Déductions appliquées">
            <ul className="text-sm space-y-1">
              <li>• <strong>Forfait logistique</strong> : 1 €/kg (expédition, manutention)</li>
              <li>• <strong>Forfait structure</strong> : 1 €/kg (coûts fixes répartis)</li>
              <li>• <strong>Étiquetage</strong> : 0,15 €/kg (Metro uniquement)</li>
              <li>• <strong>RFA</strong> : 2% du CA (CSF + Promocash uniquement)</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-2">Ces règles sont configurables par l&apos;admin et peuvent évoluer dans le temps (dates d&apos;effet).</p>
          </Section>
          <Section title="Sur le dashboard">
            <p>Le bloc &quot;Marges&quot; de votre dashboard affiche la marge brute, nette, le total des déductions et le taux de marge nette. Tout réagit au filtre de dates et au sélecteur &quot;Voir en tant que&quot;.</p>
          </Section>
        </div>
      );

    case "admin-margins":
      return (
        <div className="space-y-4">
          <Section title="Configurer les règles de marge">
            <p>Allez dans <strong>Admin → Règles de marge</strong> pour voir et modifier les règles de déduction appliquées au calcul de la marge nette.</p>
          </Section>
          <Section title="Types de règles">
            <ul className="text-sm space-y-1">
              <li>• <strong>Par kg</strong> : montant fixe multiplié par le poids net vendu (converti de grammes en kg)</li>
              <li>• <strong>% du CA</strong> : pourcentage du chiffre d&apos;affaires HT</li>
            </ul>
          </Section>
          <Section title="Ciblage">
            <p>Chaque règle peut s&apos;appliquer à <strong>tous</strong> les clients ou à un <strong>groupe spécifique</strong> (ex: Metro, CSF+Promocash) basé sur le champ <code className="text-xs bg-muted px-1 py-0.5 rounded">margin_group</code> du client.</p>
          </Section>
          <Section title="Dates d'effet">
            <p>Les règles supportent des dates de début et fin d&apos;effet. Pour désactiver une règle, fixez sa date de fin à aujourd&apos;hui. Cela permet de garder un historique des barèmes appliqués.</p>
          </Section>
        </div>
      );

    case "admin-challenges":
      return (
        <div className="space-y-4">
          <Section title="Créer un challenge">
            <p>Allez dans <strong>Admin → Challenges</strong> et cliquez sur &quot;Nouveau challenge&quot;.</p>
            <ul className="text-sm space-y-1">
              <li>• <strong>Nom</strong> : titre accrocheur du challenge</li>
              <li>• <strong>Récompense</strong> : ce que gagne le vainqueur (affiché à tous)</li>
              <li>• <strong>Produit</strong> : recherchez et sélectionnez un produit du catalogue (optionnel)</li>
              <li>• <strong>Métrique</strong> : kg, unités, CA ou marge brute</li>
              <li>• <strong>Objectif</strong> : cible chiffrée (optionnel, pour afficher la progression)</li>
              <li>• <strong>Période</strong> : dates de début et fin</li>
              <li>• <strong>Statut</strong> : brouillon → actif → terminé</li>
            </ul>
          </Section>
          <Section title="Classement">
            <p>Le classement est calculé en temps réel à partir des lignes de vente Sage. Il est visible par tous les commerciaux sur le dashboard et la page classement.</p>
          </Section>
        </div>
      );

    case "admin-sync":
      return (
        <div className="space-y-4">
          <Section title="Comment les données arrivent dans le CRM">
            <p>Le CRM agrège des données de <strong>deux sources</strong> :</p>
            <ul className="text-sm space-y-2">
              <li><strong>Sage 100</strong> (ERP) : clients, commandes/factures, produits, stock. Connexion directe via ODBC au serveur SQL de Sage à travers un VPN Tailscale.</li>
              <li><strong>Ringover</strong> (téléphonie) : appels (entrants/sortants), enregistrements audio, présences. Connexion via l&apos;API REST Ringover.</li>
            </ul>
          </Section>

          <Section title="Full Sync vs Delta Sync">
            <p><strong>Full Sync :</strong> récupère <em>toutes</em> les données depuis Sage. Utilisé pour la première synchronisation ou en cas de doute sur l&apos;intégrité.</p>
            <p><strong>Delta Sync :</strong> récupère uniquement les données <em>modifiées depuis la dernière sync</em>. Beaucoup plus rapide.</p>
            <p>Le delta fonctionne grâce à une colonne <code className="text-xs bg-muted px-1 py-0.5 rounded">cbModification</code> que Sage maintient automatiquement sur chaque enregistrement. Le CRM enregistre le timestamp de chaque sync réussie dans la table <code className="text-xs bg-muted px-1 py-0.5 rounded">sync_logs</code>. Au prochain delta, il demande à Sage : &quot;donne-moi tout ce qui a changé après cette date&quot;.</p>
            <p><strong>Mode Auto :</strong> par défaut, le système utilise le mode auto — delta s&apos;il y a déjà eu une sync, full sinon.</p>
          </Section>

          <Section title="Merge non-destructif">
            <p>Les données importées depuis Sage ne <strong>détruisent jamais</strong> les données ajoutées manuellement dans le CRM. Si un champ est vide/null dans Sage, la valeur CRM est conservée. Seuls les champs non-null de Sage mettent à jour le CRM.</p>
          </Section>

          <Section title="Les 4 types de sync Sage">
            <ul className="text-sm space-y-1">
              <li>• <strong>Clients</strong> : table <code className="text-xs bg-muted px-1 py-0.5 rounded">F_COMPTET</code> → coordonnées, contacts, numéros de téléphone.</li>
              <li>• <strong>Ventes</strong> : table <code className="text-xs bg-muted px-1 py-0.5 rounded">F_DOCLIGNE</code> → factures et avoirs avec marge calculée. Déclenche les transitions automatiques de <L to="statuts">lifecycle</L> (prospect→client, lead→client, dormant→client). Auto-corrige les statuts incohérents (ex : un prospect avec des commandes).</li>
              <li>• <strong>Produits</strong> : table <code className="text-xs bg-muted px-1 py-0.5 rounded">F_ARTICLE</code> → catalogue avec prix et familles.</li>
              <li>• <strong>Stock</strong> : table <code className="text-xs bg-muted px-1 py-0.5 rounded">F_ARTSTOCK</code> → niveaux par dépôt.</li>
            </ul>
          </Section>

          <Section title="Sync Ringover">
            <p>La sync Ringover récupère les appels récents et lance automatiquement la transcription IA sur les nouveaux appels éligibles (décrochés, avec enregistrement). Voir <L to="ai-analysis">Analyse IA</L>.</p>
          </Section>

          <Section title="Scoring RFM">
            <p>Après une sync de ventes, lancez le <strong>Scoring RFM</strong> pour recalculer les <L to="scoring">scores de churn, upsell et priorité</L> de tous les clients. Ce scoring déclenche aussi les transitions automatiques de <L to="statuts">statut</L> (client → à risque → dormant).</p>
          </Section>

          <Section title="Historique">
            <p>Un tableau en bas de la page admin affiche l&apos;historique des 30 dernières synchronisations avec le nombre d&apos;enregistrements trouvés, traités et les erreurs éventuelles.</p>
          </Section>
        </div>
      );

    case "admin-playlist":
      return (
        <div className="space-y-4">
          <Section title="Configuration par commercial">
            <p>Chaque commercial a sa propre configuration de playlist. L&apos;admin peut régler la taille, la répartition, les seuils et le <strong>périmètre des entreprises</strong>.</p>
          </Section>

          <Section title="Variables disponibles">
            <ul className="space-y-2 text-sm">
              <li><strong>Taille totale (total_size) :</strong> nombre de contacts dans la playlist quotidienne. Défaut : 15.</li>
              <li><strong>% Rappels (pct_callback) :</strong> part dédiée aux rappels planifiés. Défaut : 10%.</li>
              <li><strong>% Dormants (pct_dormant) :</strong> part dédiée aux clients sans commande depuis 180+ jours. Défaut : 30%.</li>
              <li><strong>% Churn (pct_churn_risk) :</strong> part dédiée aux clients à risque de perte. Défaut : 25%.</li>
              <li><strong>% Upsell (pct_upsell) :</strong> part dédiée aux opportunités de vente additionnelle. Défaut : 20%.</li>
              <li><strong>% Prospect (pct_prospect) :</strong> part dédiée aux nouveaux contacts à démarcher. Défaut : 15%.</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-2">Le total des pourcentages doit faire exactement 100%.</p>
          </Section>

          <Section title="Seuils">
            <ul className="text-sm space-y-1">
              <li>• <strong>Dormant (jours min) :</strong> nombre minimum de jours d&apos;inactivité pour inclure un dormant. Défaut : 90.</li>
              <li>• <strong>Churn min % :</strong> score minimum pour qu&apos;un client apparaisse dans la catégorie risque. Défaut : 40.</li>
              <li>• <strong>Upsell min % :</strong> score minimum pour la catégorie upsell. Défaut : 30.</li>
            </ul>
          </Section>

          <Section title="Périmètre des entreprises">
            <p>Contrôle quelles entreprises remontent dans la playlist de ce commercial :</p>
            <ul className="text-sm space-y-1">
              <li>• <strong>Ses entreprises uniquement :</strong> seules les entreprises assignées au commercial dans le CRM (par défaut).</li>
              <li>• <strong>Ses entreprises + non assignées :</strong> ses clients + les entreprises sans commercial attitré.</li>
              <li>• <strong>Rep Sage spécifique :</strong> les entreprises d&apos;un représentant Sage choisi dans une liste déroulante.</li>
              <li>• <strong>Sans commercial uniquement :</strong> uniquement les entreprises orphelines (ni assignées, ni rattachées à un rep Sage).</li>
              <li>• <strong>Toutes :</strong> combine les entreprises assignées CRM et celles du rep Sage du commercial (le plus large).</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-1">Cela garantit qu&apos;une playlist ne propose jamais les clients d&apos;un autre commercial.</p>
          </Section>

          <Section title="Barre de visualisation">
            <p>La barre colorée en haut de chaque fiche commercial montre visuellement la répartition. Chaque couleur correspond à une catégorie. Le nombre de &quot;slots&quot; est calculé en temps réel.</p>
          </Section>

          <Section title="Génération & anti-doublons">
            <p>L&apos;admin peut générer les playlists pour <strong>un seul commercial</strong> ou <strong>toute l&apos;équipe</strong>.</p>
            <p>Le système anti-doublons garantit qu&apos;un client n&apos;apparaît que dans <strong>une seule playlist par jour</strong>, même lorsque les playlists sont générées individuellement : le système charge d&apos;abord les clients déjà présents dans les playlists des autres commerciaux et les exclut automatiquement.</p>
          </Section>
        </div>
      );

    case "admin-assign":
      return (
        <div className="space-y-4">
          <Section title="Pourquoi réassigner ?">
            <p>Quand un commercial part, arrive, ou quand on veut rééquilibrer les portefeuilles, l&apos;admin peut transférer des clients d&apos;un commercial à un autre.</p>
          </Section>

          <Section title="Comment faire">
            <ol className="text-sm space-y-2 list-decimal list-inside">
              <li>Sélectionnez le commercial <strong>source</strong> (ou &quot;Non assignés&quot;) dans la liste à gauche.</li>
              <li>Recherchez et <strong>cochez</strong> les clients à transférer.</li>
              <li>Choisissez le commercial <strong>cible</strong> dans le dropdown.</li>
              <li>Cliquez sur <strong>Transférer</strong>.</li>
            </ol>
            <p className="mt-2">Les champs <code className="text-xs bg-muted px-1 py-0.5 rounded">assigned_user_id</code> et <code className="text-xs bg-muted px-1 py-0.5 rounded">sales_rep</code> sont mis à jour simultanément.</p>
          </Section>

          <Section title="Impact">
            <p>Les prochaines <L to="playlist">playlists</L> générées prendront en compte la nouvelle assignation. Le commercial cible verra les clients transférés dans sa playlist.</p>
          </Section>
        </div>
      );

    case "admin-dashboard":
      return (
        <div className="space-y-4">
          <Section title="Le cockpit du manager">
            <p>Cette page permet au manager de piloter son équipe commerciale en un coup d&apos;œil, de comparer les performances et de drill-down dans le détail.</p>
          </Section>

          <Section title="Filtres de période">
            <p>Choisissez <strong>Aujourd&apos;hui</strong> pour le bilan du jour, <strong>Semaine / Mois / Trimestre</strong> pour un recap, ou utilisez le <strong>calendrier</strong> pour choisir une plage libre.</p>
          </Section>

          <Section title="Cards du haut (KPIs équipe)">
            <p>8 indicateurs agrégés pour toute l&apos;équipe :</p>
            <ul className="text-sm space-y-1">
              <li>• Appels sortants et entrants.</li>
              <li>• Taux de décroché global.</li>
              <li>• Appels qualifiés.</li>
              <li>• CA total et marge totale.</li>
              <li>• Taux de complétion playlist.</li>
              <li>• Score IA moyen.</li>
            </ul>
          </Section>

          <Section title="Note de performance A/B/C/D">
            <p>Chaque commercial reçoit une note composite basée sur :</p>
            <ul className="text-sm space-y-1">
              <li>• Volume d&apos;appels sortants (≥ 15/jour = bon).</li>
              <li>• Taux de décroché (≥ 60% = bon).</li>
              <li>• Taux de qualification (≥ 50% = bon).</li>
              <li>• Complétion playlist (≥ 80% = bon).</li>
              <li>• Atteinte objectif CA (≥ 80% = bon).</li>
            </ul>
            <p className="mt-1"><strong>A</strong> = top performer, <strong>B</strong> = en bonne voie, <strong>C</strong> = à surveiller, <strong>D</strong> = en retard.</p>
          </Section>

          <Section title="Tableau comparatif">
            <p>Toutes les colonnes sont <strong>triables</strong> (cliquez sur l&apos;en-tête). Survolez les colonnes Out/In pour voir le détail des appels décrochés. La colonne Playlist affiche X/Y avec un code couleur (vert ≥ 80%, jaune ≥ 50%, orange &lt; 50%).</p>
          </Section>

          <Section title="Drill-down">
            <p>Cliquez sur la ligne d&apos;un commercial pour déplier :</p>
            <ul className="text-sm space-y-1">
              <li>• <strong>Scores IA</strong> sur 6 axes : politesse, objections, closing, produits, écoute, global.</li>
              <li>• <strong>Portefeuille</strong> : nombre de clients actifs, à risque, dormants, prospects.</li>
              <li>• <strong>Qualifications</strong> : répartition des outcomes (rappel, vente, intéressé, etc.).</li>
              <li>• <strong>Derniers appels</strong> : liste des 50 derniers appels avec date, contact, durée, mood, outcome, score IA.</li>
            </ul>
            <p>Cliquez sur un appel pour ouvrir le volet latéral avec le <strong>lecteur audio</strong>, la <L to="qualify">qualification</L> complète et l&apos;<L to="ai-analysis">analyse IA</L> détaillée.</p>
          </Section>
        </div>
      );

    case "admin-glossaire":
      return (
        <div className="space-y-4">
          <Section title="Le glossaire technique">
            <p>La page Glossaire (accessible dans la sidebar admin) est une <strong>référence complète</strong> de toutes les variables, formules et seuils utilisés par le système.</p>
          </Section>

          <Section title="Ce qu'on y trouve">
            <ul className="text-sm space-y-1">
              <li>• Définition complète des 6 <L to="statuts">statuts du lifecycle</L> avec les conditions d&apos;entrée et de sortie.</li>
              <li>• Détail du calcul du <L to="scoring">score de churn multi-facteurs</L> avec les tables de seuils exactes.</li>
              <li>• Formules des scores d&apos;upsell et de priorité globale.</li>
              <li>• Variables de <L to="admin-playlist">configuration des playlists</L> avec valeurs par défaut.</li>
              <li>• Système de cooldown dormant : durée, tentatives max, seuil de revue managériale.</li>
            </ul>
          </Section>

          <Section title="À qui ça sert ?">
            <p>Principalement aux <strong>managers et admins</strong> qui veulent comprendre la mécanique interne du scoring et du lifecycle pour prendre de meilleures décisions. Les commerciaux n&apos;ont pas besoin d&apos;aller aussi loin — les explications de ce wiki suffisent.</p>
          </Section>
        </div>
      );

    default:
      return <p>Article en construction.</p>;
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-base font-semibold">{title}</h3>
      <div className="text-sm text-foreground/80 leading-relaxed space-y-2">{children}</div>
    </div>
  );
}

function StatusExplain({
  name,
  badge,
  entry,
  exit,
  auto,
}: {
  name: string;
  badge: string;
  entry: string;
  exit: string;
  auto: boolean;
}) {
  return (
    <div className="p-3 rounded-lg border space-y-1.5">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={`text-xs ${badge}`}>{name}</Badge>
        <Badge variant="outline" className={`text-[10px] px-1 py-0 ${auto ? "border-green-300 text-green-700 bg-green-50" : "border-gray-300 text-gray-600"}`}>
          {auto ? "Automatique" : "Manuel"}
        </Badge>
      </div>
      <div className="text-xs space-y-0.5">
        <p><span className="text-muted-foreground">Entrée :</span> {entry}</p>
        <p><span className="text-muted-foreground">Sortie :</span> {exit}</p>
      </div>
    </div>
  );
}
