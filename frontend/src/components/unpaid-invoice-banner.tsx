"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

const ENABLED = true;

const INVOICE_ISSUE_DATE = "2026-03-19";

const IBAN = "FR7630066106370002043240182";

const LEGACY_SNOOZE_KEY = "unpaid_invoice_snoozed_until";

function daysSince(dateIso: string): number {
  const start = new Date(dateIso).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - start) / (1000 * 60 * 60 * 24)));
}

export function UnpaidInvoiceBanner() {
  const [copied, setCopied] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(LEGACY_SNOOZE_KEY);
    }
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!ENABLED) return null;

  const days = daysSince(INVOICE_ISSUE_DATE);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(IBAN);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="sticky top-0 z-50 w-full bg-orange-500 text-white shadow-md">
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
        <AlertTriangle className="w-5 h-5 shrink-0 animate-pulse" />
        <div className="flex-1 min-w-0">
          <span className="font-semibold">
            Facture en attente depuis {days} jour{days > 1 ? "s" : ""}
          </span>
          <span className="hidden sm:inline"> — merci de régulariser la facture.</span>
        </div>

        <div className="flex items-center gap-2">
          <code className="hidden md:inline-block bg-orange-600/40 px-2 py-1 rounded text-xs font-mono tracking-wider">
            {IBAN}
          </code>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleCopy}
            className="h-7 px-2 bg-white text-orange-700 hover:bg-orange-50"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 mr-1" /> Copié
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 mr-1" /> Copier l'IBAN
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
