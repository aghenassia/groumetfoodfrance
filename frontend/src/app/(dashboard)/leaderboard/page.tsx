"use client";

import { useEffect, useState } from "react";
import { api, LeaderboardEntry, ChallengeEntry, ChallengeRankingEntry } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Trophy,
  Medal,
  Star,
  Zap,
  Phone,
  Clock,
  Bot,
  Target,
  Calendar,
  Package,
  BarChart3,
  Loader2,
  Gift,
  Flame,
} from "lucide-react";

function formatTalkTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h${m.toString().padStart(2, "0")}`;
  return `${m}min`;
}

const METRIC_LABELS: Record<string, string> = {
  quantity_kg: "kg",
  quantity_units: "unités",
  ca: "€ CA",
  margin_gross: "€ marge",
};

const METRIC_UNITS: Record<string, string> = {
  quantity_kg: "kg",
  quantity_units: "",
  ca: "€",
  margin_gross: "€",
};

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [challenges, setChallenges] = useState<ChallengeEntry[]>([]);
  const [challengeRankings, setChallengeRankings] = useState<Record<string, ChallengeRankingEntry[]>>({});
  const [loadingChallenges, setLoadingChallenges] = useState(true);
  const [expandedChallenge, setExpandedChallenge] = useState<string | null>(null);

  useEffect(() => {
    api
      .getLeaderboard()
      .then(setEntries)
      .catch(() => {})
      .finally(() => setLoading(false));

    api.getChallenges("active").then((chs) => {
      setChallenges(chs);
      if (chs.length > 0) setExpandedChallenge(chs[0].id);
      chs.forEach((ch) => {
        api.getChallengeRanking(ch.id).then((r) => {
          setChallengeRankings((prev) => ({ ...prev, [ch.id]: r }));
        }).catch(() => {});
      });
    }).catch(() => {}).finally(() => setLoadingChallenges(false));
  }, []);

  const rankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="w-5 h-5 text-amber-600" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-gray-400" />;
    if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />;
    return (
      <span className="text-sm font-bold text-muted-foreground">{rank}</span>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Trophy className="w-6 h-6" />
          Classement
        </h2>
        <p className="text-muted-foreground">
          Performance commerciale — Appels, Qualité IA, XP
        </p>
      </div>

      {/* Challenges en cours */}
      {!loadingChallenges && challenges.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Flame className="w-5 h-5 text-kiku" />
            Challenges en cours
          </h3>
          <div className="grid gap-4 lg:grid-cols-2">
            {challenges.map((ch) => {
              const ranks = challengeRankings[ch.id] || [];
              const isExpanded = expandedChallenge === ch.id;
              const daysLeft = Math.max(0, Math.ceil((new Date(ch.end_date).getTime() - Date.now()) / 86400000));
              const unit = METRIC_UNITS[ch.metric] || "";

              return (
                <Card
                  key={ch.id}
                  className={`cursor-pointer overflow-hidden ${isExpanded ? "shadow-md border-kiku/40" : "hover:shadow-sm"}`}
                  onClick={() => setExpandedChallenge(isExpanded ? null : ch.id)}
                >
                  {/* En-tête motivant */}
                  <div className="bg-gradient-to-r from-kiku/10 via-sora/5 to-transparent p-4 pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Trophy className="w-4 h-4 text-kiku shrink-0" />
                          <span className="text-base font-bold">{ch.name}</span>
                        </div>
                        {ch.reward && (
                          <div className="flex items-center gap-1.5 mt-1.5 ml-6">
                            <Gift className="w-3.5 h-3.5 text-ume" />
                            <span className="text-sm font-semibold text-ume">{ch.reward}</span>
                          </div>
                        )}
                        {ch.description && !ch.reward && (
                          <p className="text-xs text-muted-foreground mt-1 ml-6">{ch.description}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge variant="secondary" className="text-[10px] tabular-nums">{daysLeft}j restants</Badge>
                        {ch.target_value && (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            Obj: {ch.target_value.toLocaleString("fr-FR")} {unit}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2 ml-6">
                      {ch.article_name && (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <Package className="w-2.5 h-2.5" />
                          {ch.article_name}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <BarChart3 className="w-2.5 h-2.5" />
                        {METRIC_LABELS[ch.metric] || ch.metric}
                      </Badge>
                    </div>
                  </div>

                  {/* Classement */}
                  <CardContent className="pt-3 pb-3">
                    {!(ch.id in challengeRankings) ? (
                      <div className="flex items-center gap-2 py-3 justify-center text-muted-foreground text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Calcul du classement…
                      </div>
                    ) : ranks.length === 0 ? (
                      <p className="py-3 text-center text-muted-foreground text-sm">Aucune donnée de vente</p>
                    ) : !isExpanded ? (
                      <div className="space-y-0.5">
                        {ranks.slice(0, 3).map((r) => {
                          const medals = ["🥇", "🥈", "🥉"];
                          return (
                            <div key={r.user_id} className="flex items-center gap-2 py-1 px-1.5 rounded text-sm">
                              <span className="w-5 text-center text-xs">{medals[r.rank - 1]}</span>
                              <span className="flex-1 truncate font-medium">{r.user_name}</span>
                              <span className="font-mono text-xs tabular-nums">{r.current_value.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} {unit}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {ranks.map((r) => {
                          const medal = r.rank <= 3 ? ["🥇", "🥈", "🥉"][r.rank - 1] : `#${r.rank}`;
                          const pct = r.progress_pct ?? 0;
                          const barColor = r.rank === 1
                            ? "bg-kiku"
                            : r.rank === 2
                            ? "bg-sora/70"
                            : r.rank === 3
                            ? "bg-ume/70"
                            : "bg-muted-foreground/30";
                          return (
                            <div key={r.user_id} className={`flex items-center gap-3 p-2.5 rounded-lg ${r.rank <= 3 ? "bg-accent/30 border" : ""}`}>
                              <span className="text-base w-7 text-center shrink-0">{medal}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-sm font-medium">{r.user_name}</span>
                                  <span className="text-sm font-mono font-semibold tabular-nums">
                                    {r.current_value.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} {unit}
                                  </span>
                                </div>
                                {ch.target_value && ch.target_value > 0 && (
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                                    </div>
                                    <span className={`text-[10px] font-mono w-9 text-right ${pct >= 100 ? "text-green-600 font-bold" : "text-muted-foreground"}`}>{pct.toFixed(0)}%</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Classement XP */}
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-3">
          <Zap className="w-5 h-5 text-sora" />
          Classement XP — Appels
        </h3>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          Chargement...
        </div>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Trophy className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Pas encore de données</p>
            <p className="text-sm text-muted-foreground mt-2">
              Les classements apparaîtront après la synchronisation des appels.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <Card
              key={entry.user_id}
              className={entry.rank <= 3 ? "border-primary/30" : ""}
            >
              <CardContent className="flex items-center gap-4 py-4">
                <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
                  {rankIcon(entry.rank)}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{entry.name}</p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {entry.total_calls} appels ({entry.answered_calls} décrochés)
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatTalkTime(entry.total_talk_time)}
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Zap className="w-3 h-3 text-sora" />
                      {entry.qualified_calls} qualifiés
                    </span>
                    {entry.avg_ai_score > 0 && (
                      <span className="text-xs flex items-center gap-1">
                        <Bot className="w-3 h-3 text-sora" />
                        <span
                          className={
                            entry.avg_ai_score >= 7
                              ? "text-green-600"
                              : entry.avg_ai_score >= 5
                              ? "text-amber-600"
                              : "text-red-600"
                          }
                        >
                          {entry.avg_ai_score}/10 IA
                        </span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant="outline" className="text-lg font-bold">
                    {entry.xp_effort} XP
                  </Badge>
                  {entry.avg_ai_score > 0 && (
                    <div className="mt-1">
                      <span
                        className={`text-xs ${
                          entry.avg_ai_score >= 7
                            ? "text-green-600"
                            : entry.avg_ai_score >= 5
                            ? "text-amber-600"
                            : "text-red-600"
                        }`}
                      >
                        <Star className="w-3 h-3 inline mr-0.5" />
                        Score IA: {entry.avg_ai_score}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
