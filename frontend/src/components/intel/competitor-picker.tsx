"use client";

import { useState, useEffect, useRef } from "react";
import { api, ClientCompetitorEntry, NameItem } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Plus, Swords, Loader2 } from "lucide-react";

interface CompetitorPickerProps {
  clientId: string;
  competitors: ClientCompetitorEntry[];
  onUpdate: () => void;
  compact?: boolean;
}

export function CompetitorPicker({ clientId, competitors, onUpdate, compact }: CompetitorPickerProps) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<NameItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setLoading(true);
      api.searchCompetitors(search).then((r) => {
        const existing = new Set(competitors.map((c) => c.competitor_id));
        setResults(r.filter((c) => !existing.has(c.id)));
        setShowDropdown(true);
      }).finally(() => setLoading(false));
    }, 250);
  }, [search, competitors]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const addCompetitor = async (competitorId: string) => {
    await api.saveClientIntel(clientId, { competitor_ids: [competitorId] });
    setSearch("");
    setShowDropdown(false);
    onUpdate();
  };

  const createAndAdd = async () => {
    if (!search.trim()) return;
    const created = await api.createCompetitor(search.trim());
    await api.saveClientIntel(clientId, { competitor_ids: [created.id] });
    setSearch("");
    setShowDropdown(false);
    onUpdate();
  };

  const remove = async (competitorId: string) => {
    await api.removeClientCompetitor(clientId, competitorId);
    onUpdate();
  };

  return (
    <div className="space-y-2" ref={containerRef}>
      {!compact && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Swords className="w-3.5 h-3.5" />
          <span className="font-medium">Concurrents identifiés</span>
          {competitors.length > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{competitors.length}</Badge>
          )}
        </div>
      )}

      {competitors.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {competitors.map((c) => (
            <Badge key={c.id} variant="outline" className="text-xs gap-1 pr-1 bg-orange-50 text-orange-700 border-orange-200">
              {c.competitor_name}
              <button onClick={() => remove(c.competitor_id)} className="ml-0.5 hover:text-red-600 transition-colors">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="relative">
        <Input
          placeholder="Rechercher ou ajouter un concurrent..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-xs pr-8"
          onFocus={() => search.trim() && results.length > 0 && setShowDropdown(true)}
        />
        {loading && <Loader2 className="absolute right-2 top-2 w-4 h-4 animate-spin text-muted-foreground" />}

        {showDropdown && (
          <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
            {results.map((r) => (
              <button
                key={r.id}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                onClick={() => addCompetitor(r.id)}
              >
                {r.name}
              </button>
            ))}
            {search.trim() && !results.some((r) => r.name.toLowerCase() === search.trim().toLowerCase()) && (
              <button
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors flex items-center gap-1.5 text-primary font-medium border-t"
                onClick={createAndAdd}
              >
                <Plus className="w-3 h-3" />
                Créer &quot;{search.trim()}&quot;
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
