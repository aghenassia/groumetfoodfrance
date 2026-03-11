"use client";

import { useState, useEffect, useRef } from "react";
import { api, ClientSupplierEntry, NameItem } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Plus, Truck, Loader2 } from "lucide-react";

interface SupplierPickerProps {
  clientId: string;
  suppliers: ClientSupplierEntry[];
  onUpdate: () => void;
  compact?: boolean;
}

export function SupplierPicker({ clientId, suppliers, onUpdate, compact }: SupplierPickerProps) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<NameItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setLoading(true);
      api.searchSuppliers(search).then((r) => {
        const existing = new Set(suppliers.map((s) => s.supplier_id));
        setResults(r.filter((s) => !existing.has(s.id)));
        setShowDropdown(true);
      }).finally(() => setLoading(false));
    }, 250);
  }, [search, suppliers]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const addSupplier = async (supplierId: string) => {
    await api.saveClientIntel(clientId, { supplier_ids: [supplierId] });
    setSearch("");
    setShowDropdown(false);
    onUpdate();
  };

  const createAndAdd = async () => {
    if (!search.trim()) return;
    const created = await api.createSupplier(search.trim());
    await api.saveClientIntel(clientId, { supplier_ids: [created.id] });
    setSearch("");
    setShowDropdown(false);
    onUpdate();
  };

  const remove = async (supplierId: string) => {
    await api.removeClientSupplier(clientId, supplierId);
    onUpdate();
  };

  return (
    <div className="space-y-2" ref={containerRef}>
      {!compact && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Truck className="w-3.5 h-3.5" />
          <span className="font-medium">Fournisseurs actuels</span>
          {suppliers.length > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{suppliers.length}</Badge>
          )}
        </div>
      )}

      {suppliers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suppliers.map((s) => (
            <Badge key={s.id} variant="outline" className="text-xs gap-1 pr-1 bg-blue-50 text-blue-700 border-blue-200">
              {s.supplier_name}
              <button onClick={() => remove(s.supplier_id)} className="ml-0.5 hover:text-red-600 transition-colors">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="relative">
        <Input
          placeholder="Rechercher ou ajouter un fournisseur..."
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
                onClick={() => addSupplier(r.id)}
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
            {results.length === 0 && !search.trim() && (
              <div className="px-3 py-2 text-xs text-muted-foreground">Tapez pour rechercher...</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
