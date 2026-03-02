"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Phone, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ClickToCallProps {
  phoneNumber: string;
  size?: "icon" | "sm" | "default" | "lg";
  variant?: "ghost" | "outline" | "default" | "cta";
  label?: string;
  className?: string;
  contactName?: string;
}

export function ClickToCall({
  phoneNumber,
  size = "icon",
  variant = "ghost",
  label,
  className,
  contactName,
}: ClickToCallProps) {
  const [calling, setCalling] = useState(false);

  const handleDial = async () => {
    setCalling(true);
    try {
      await api.dial(phoneNumber);
      toast.success(
        contactName
          ? `Appel vers ${contactName} lancé — décrochez !`
          : "Appel lancé — décrochez votre téléphone Ringover"
      );
    } catch {
      toast.error("Impossible de lancer l'appel");
    } finally {
      setCalling(false);
    }
  };

  if (variant === "cta") {
    return (
      <button
        onClick={handleDial}
        disabled={calling}
        className={cn(
          "group relative inline-flex items-center justify-center gap-2 h-9 px-5 rounded-lg",
          "text-sm font-medium text-white",
          "bg-sensai hover:bg-sensai/90",
          "active:scale-[0.97] transition-all duration-200",
          "disabled:opacity-60 disabled:cursor-not-allowed",
          className,
        )}
      >
        <span className="relative flex items-center justify-center w-4 h-4 shrink-0">
          {calling ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <>
              <span className="absolute inset-[-3px] rounded-full bg-white/20 animate-[ping_2s_ease-in-out_infinite] opacity-0 group-hover:opacity-100" />
              <Phone className="w-3.5 h-3.5 relative z-10" />
            </>
          )}
        </span>
        <span className="truncate">{calling ? "Connexion…" : "Appeler"}</span>
      </button>
    );
  }

  if (size === "icon" && !label) {
    return (
      <Button
        variant={variant === "default" ? "default" : variant}
        size="icon"
        onClick={handleDial}
        disabled={calling}
        title={`Appeler ${contactName || phoneNumber}`}
        className={cn(
          variant === "ghost" &&
            "hover:bg-green-50 dark:hover:bg-green-950 hover:text-green-600 transition-colors",
          className,
        )}
      >
        {calling ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Phone className="w-4 h-4 text-green-600" />
        )}
      </Button>
    );
  }

  return (
    <Button
      variant={(variant as string) === "cta" ? "default" : variant}
      size={size === "icon" ? "sm" : size}
      onClick={handleDial}
      disabled={calling}
      className={cn(
        variant === "outline" &&
          "border-green-200 text-green-700 hover:bg-green-50 hover:border-green-300 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950",
        className,
      )}
    >
      {calling ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : (
        <Phone className="w-4 h-4 mr-2 text-green-600" />
      )}
      {label || "Appeler"}
    </Button>
  );
}
