"use client";

import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { X, Plus } from "lucide-react";

interface TypePickerProps {
  values: string[];
  options: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function TypePicker({ values, options, onChange, placeholder, className }: TypePickerProps) {
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = options.filter((o) => {
    if (values.includes(o)) return false;
    if (!search.trim()) return true;
    return o.toLowerCase().includes(search.toLowerCase().trim());
  });

  const exactMatch = search.trim() &&
    options.some((o) => o.toLowerCase() === search.trim().toLowerCase());
  const alreadyAdded = search.trim() &&
    values.some((v) => v.toLowerCase() === search.trim().toLowerCase());

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const add = (val: string) => {
    if (!values.includes(val)) {
      onChange([...values, val]);
    }
    setSearch("");
    setShowDropdown(false);
  };

  const remove = (val: string) => {
    onChange(values.filter((v) => v !== val));
  };

  const createNew = () => {
    const trimmed = search.trim();
    if (!trimmed || alreadyAdded) return;
    onChange([...values, trimmed]);
    setSearch("");
    setShowDropdown(false);
  };

  return (
    <div className={`space-y-1.5 ${className || ""}`} ref={containerRef}>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <Badge
              key={v}
              variant="outline"
              className="text-xs gap-1 pr-1 bg-blue-50 text-blue-700 border-blue-200 max-w-[200px]"
              title={v}
            >
              <span className="truncate">{v}</span>
              <button
                type="button"
                onClick={() => remove(v)}
                className="ml-0.5 hover:text-red-600 transition-colors shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="relative">
        <Input
          placeholder={placeholder || "Rechercher ou créer…"}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setShowDropdown(true); }}
          className="h-8 text-xs"
          onFocus={() => setShowDropdown(true)}
        />

        {showDropdown && (
          <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
            {filtered.map((o) => (
              <button
                key={o}
                type="button"
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                onClick={() => add(o)}
              >
                {o}
              </button>
            ))}
            {search.trim() && !exactMatch && !alreadyAdded && (
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors flex items-center gap-1.5 text-primary font-medium border-t"
                onClick={createNew}
              >
                <Plus className="w-3 h-3" />
                Créer &quot;{search.trim()}&quot;
              </button>
            )}
            {filtered.length === 0 && !search.trim() && (
              <div className="px-3 py-2 text-xs text-muted-foreground">Tapez pour rechercher…</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
