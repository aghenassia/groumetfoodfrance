"use client";

import { useState, useEffect, useRef } from "react";
import { api, ClientProductInterestEntry } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { X, Plus, Package, Loader2, Search } from "lucide-react";

interface ProductInterestPickerProps {
  clientId: string;
  interests: ClientProductInterestEntry[];
  onUpdate: () => void;
  compact?: boolean;
}

interface ProductResult {
  article_ref: string;
  designation: string;
}

export function ProductInterestPicker({ clientId, interests, onUpdate, compact }: ProductInterestPickerProps) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ProductResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setLoading(true);
      api.getProducts({ search: search, limit: "10" }).then((r) => {
        const existing = new Set(interests.map((i) => i.article_ref).filter(Boolean));
        setResults(
          r.products
            .map((p: any) => ({ article_ref: p.article_ref, designation: p.designation }))
            .filter((p: ProductResult) => !existing.has(p.article_ref))
        );
        setShowDropdown(true);
      }).finally(() => setLoading(false));
    }, 300);
  }, [search, interests]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const addFromCatalog = async (product: ProductResult) => {
    await api.saveClientIntel(clientId, {
      product_interests: [{ article_ref: product.article_ref, product_name: product.designation }],
    });
    setSearch("");
    setShowDropdown(false);
    onUpdate();
  };

  const addFreeform = async () => {
    if (!search.trim()) return;
    await api.saveClientIntel(clientId, {
      product_interests: [{ product_name: search.trim() }],
    });
    setSearch("");
    setShowDropdown(false);
    onUpdate();
  };

  const remove = async (interestId: string) => {
    await api.removeClientProductInterest(clientId, interestId);
    onUpdate();
  };

  return (
    <div className="space-y-2" ref={containerRef}>
      {!compact && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Package className="w-3.5 h-3.5" />
          <span className="font-medium">Produits d&apos;intérêt</span>
          {interests.length > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{interests.length}</Badge>
          )}
        </div>
      )}

      {interests.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {interests.map((pi) => (
            <Badge key={pi.id} variant="outline" className="text-xs gap-1 pr-1 bg-purple-50 text-purple-700 border-purple-200">
              {pi.article_ref ? (
                <span><span className="font-mono opacity-70">{pi.article_ref}</span> {pi.product_name}</span>
              ) : (
                <span>{pi.product_name}</span>
              )}
              <button onClick={() => remove(pi.id)} className="ml-0.5 hover:text-red-600 transition-colors">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-2 top-2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher un produit ou ajouter en texte libre..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-xs pl-8 pr-8"
          onFocus={() => search.trim() && results.length > 0 && setShowDropdown(true)}
        />
        {loading && <Loader2 className="absolute right-2 top-2 w-4 h-4 animate-spin text-muted-foreground" />}

        {showDropdown && (
          <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-md shadow-lg max-h-56 overflow-y-auto">
            {results.map((r) => (
              <button
                key={r.article_ref}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                onClick={() => addFromCatalog(r)}
              >
                <span className="font-mono text-muted-foreground mr-1.5">{r.article_ref}</span>
                {r.designation}
              </button>
            ))}
            {search.trim() && (
              <button
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors flex items-center gap-1.5 text-primary font-medium border-t"
                onClick={addFreeform}
              >
                <Plus className="w-3 h-3" />
                Ajouter &quot;{search.trim()}&quot; (texte libre)
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
