"use client";

import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { X, Plus, Check } from "lucide-react";

interface TypePickerProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function TypePicker({ value, options, onChange, placeholder, className }: TypePickerProps) {
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = search.trim()
    ? options.filter((o) => o.toLowerCase().includes(search.toLowerCase().trim()))
    : options;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = (val: string) => {
    onChange(val);
    setSearch("");
    setShowDropdown(false);
  };

  const createNew = () => {
    if (!search.trim()) return;
    onChange(search.trim());
    setSearch("");
    setShowDropdown(false);
  };

  const clear = () => {
    onChange("");
  };

  const exactMatch = search.trim() && options.some((o) => o.toLowerCase() === search.trim().toLowerCase());

  return (
    <div className={`relative ${className || ""}`} ref={containerRef}>
      {value ? (
        <Badge
          variant="outline"
          className="text-xs gap-1 pr-1 py-1 px-2 cursor-pointer hover:bg-muted transition-colors"
          onClick={() => { setSearch(""); setShowDropdown(true); }}
        >
          <Check className="w-3 h-3 text-green-600 shrink-0" />
          <span className="truncate">{value}</span>
          <button
            onClick={(e) => { e.stopPropagation(); clear(); }}
            className="ml-0.5 hover:text-red-600 transition-colors shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        </Badge>
      ) : (
        <Input
          placeholder={placeholder || "Rechercher ou créer…"}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setShowDropdown(true); }}
          className="h-8 text-xs"
          onFocus={() => setShowDropdown(true)}
        />
      )}

      {showDropdown && !value && (
        <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((o) => (
            <button
              key={o}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors"
              onClick={() => select(o)}
            >
              {o}
            </button>
          ))}
          {search.trim() && !exactMatch && (
            <button
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
  );
}
