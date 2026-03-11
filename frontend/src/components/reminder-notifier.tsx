"use client";

import { useEffect, useRef, useState } from "react";
import { api, DueReminder } from "@/lib/api";
import { toast } from "sonner";
import { Bell, Phone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const POLL_INTERVAL = 30_000; // 30 seconds

export function ReminderNotifier() {
  const notifiedRef = useRef<Set<string>>(new Set());
  const [popup, setPopup] = useState<DueReminder | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const due = await api.getDueReminders();
        for (const r of due) {
          if (!notifiedRef.current.has(r.id)) {
            notifiedRef.current.add(r.id);
            setPopup(r);
            break;
          }
        }
      } catch {}
    };

    check();
    const interval = setInterval(check, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  const dismiss = (id: string) => {
    setPopup(null);
    api.updateReminder(id, { status: "done" }).catch(() => {});
  };

  if (!popup) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] animate-in slide-in-from-bottom-5 duration-500">
      <div className="bg-background border-2 border-primary/30 rounded-xl shadow-2xl p-4 w-80 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Bell className="w-4 h-4 text-primary animate-pulse" />
            </div>
            <div>
              <p className="text-sm font-semibold">Rappel</p>
              <p className="text-xs text-muted-foreground">{popup.reminder_time || "Maintenant"}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => dismiss(popup.id)}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        <div>
          <p className="text-sm font-medium">{popup.client_name}</p>
          {popup.reason_detail && (
            <p className="text-xs text-muted-foreground mt-0.5">{popup.reason_detail}</p>
          )}
        </div>

        <div className="flex gap-2">
          <Link href={`/clients/${popup.client_id}`} className="flex-1">
            <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={() => dismiss(popup.id)}>
              Voir la fiche
            </Button>
          </Link>
          <Button size="sm" className="flex-1 h-8 text-xs gap-1" onClick={() => dismiss(popup.id)}>
            <Phone className="w-3 h-3" />
            OK
          </Button>
        </div>
      </div>
    </div>
  );
}
