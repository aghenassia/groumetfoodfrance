"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { api, ImportParseResponse, ImportJobStatus } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  ChevronLeft,
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  ArrowRight,
  Users,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

type Step = "upload" | "preview" | "duplicates" | "importing";
type ImportMode = "single" | "companies" | "contacts";

const MODE_LABELS: Record<ImportMode, { label: string; desc: string; icon: typeof FileSpreadsheet }> = {
  single: {
    label: "Entreprises + Contacts",
    desc: "Un CSV avec entreprise et contact principal par ligne",
    icon: Users,
  },
  companies: {
    label: "Entreprises seules",
    desc: "Un CSV avec uniquement les données entreprise",
    icon: FileSpreadsheet,
  },
  contacts: {
    label: "Contacts seuls",
    desc: "Un CSV de contacts rattachés à des entreprises existantes",
    icon: UserPlus,
  },
};

export default function AdminImportPage() {
  const [step, setStep] = useState<Step>("upload");
  const [mode, setMode] = useState<ImportMode>("single");
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState<ImportParseResponse | null>(null);
  const [dupActions, setDupActions] = useState<Record<string, string>>({});
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<ImportJobStatus | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const handleFile = useCallback((f: File) => {
    if (!f.name.toLowerCase().endsWith(".csv")) {
      toast.error("Seuls les fichiers .csv sont acceptés");
      return;
    }
    setFile(f);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const handleParse = useCallback(async () => {
    if (!file) return;
    setParsing(true);
    try {
      const result = await api.parseImportCSV(file, mode);
      setParseResult(result);
      if (result.duplicates.length > 0) {
        const defaultActions: Record<string, string> = {};
        result.duplicates.forEach((d) => {
          defaultActions[`line_${d.line}`] = "skip";
        });
        setDupActions(defaultActions);
        setStep("duplicates");
      } else {
        setStep("preview");
      }
    } catch (e) {
      toast.error((e as Error).message || "Erreur lors du parsing");
    } finally {
      setParsing(false);
    }
  }, [file, mode]);

  const handleExecute = useCallback(async () => {
    if (!parseResult) return;
    try {
      const res = await api.executeImport(parseResult.parsed_file_id, dupActions);
      setJobId(res.job_id);
      setStep("importing");
    } catch (e) {
      toast.error((e as Error).message || "Erreur lors du lancement de l'import");
    }
  }, [parseResult, dupActions]);

  useEffect(() => {
    if (step !== "importing" || !jobId) return;

    const poll = async () => {
      try {
        const s = await api.getImportStatus(jobId);
        setJobStatus(s);
        if (s.status === "completed" || s.status === "error") {
          clearInterval(pollRef.current);
        }
      } catch {
        clearInterval(pollRef.current);
      }
    };

    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => clearInterval(pollRef.current);
  }, [step, jobId]);

  const handleReset = () => {
    setStep("upload");
    setFile(null);
    setParseResult(null);
    setDupActions({});
    setJobId(null);
    setJobStatus(null);
  };

  const handleDownloadTemplate = async () => {
    const url = api.getImportTemplateUrl(mode);
    const token = api.getToken();
    try {
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Erreur téléchargement");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = mode === "single" ? "template_import_leads.csv"
        : mode === "companies" ? "template_import_entreprises.csv"
        : "template_import_contacts.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch {
      toast.error("Erreur lors du téléchargement du template");
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Upload className="w-5 h-5 sm:w-6 sm:h-6" />
            Import de leads CSV
          </h2>
          <p className="text-sm text-muted-foreground">
            Importez des entreprises et contacts depuis un fichier CSV
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm">
        {(["upload", "preview", "duplicates", "importing"] as Step[]).map((s, i) => {
          const labels = ["Upload", "Aperçu", "Doublons", "Import"];
          const isCurrent = step === s;
          const isPast =
            (["upload", "preview", "duplicates", "importing"] as Step[]).indexOf(step) > i;
          return (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <div className="w-6 h-px bg-border" />}
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  isCurrent
                    ? "bg-primary text-primary-foreground"
                    : isPast
                    ? "bg-green-100 text-green-700"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {labels[i]}
              </span>
            </div>
          );
        })}
      </div>

      {/* Step 1: Upload */}
      {step === "upload" && (
        <div className="space-y-4">
          {/* Mode selection */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(Object.entries(MODE_LABELS) as [ImportMode, typeof MODE_LABELS.single][]).map(
              ([key, m]) => {
                const Icon = m.icon;
                return (
                  <button
                    key={key}
                    onClick={() => setMode(key)}
                    className={`p-4 rounded-lg border text-left transition-all ${
                      mode === key
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-4 h-4" />
                      <span className="text-sm font-medium">{m.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{m.desc}</p>
                  </button>
                );
              }
            )}
          </div>

          {/* Template download */}
          <div className="flex items-center gap-2 text-sm">
            <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Télécharger le template
            </Button>
            <span className="text-muted-foreground">
              CSV avec en-têtes et exemples (séparateur point-virgule)
            </span>
          </div>

          {/* Drop zone */}
          <div
            className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
              dragOver
                ? "border-primary bg-primary/5"
                : file
                ? "border-green-400 bg-green-50/50"
                : "border-border hover:border-primary/40"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            {file ? (
              <div className="space-y-2">
                <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} Ko
                </p>
                <Button variant="outline" size="sm" onClick={() => setFile(null)}>
                  Changer de fichier
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <FileSpreadsheet className="w-12 h-12 text-muted-foreground mx-auto" />
                <div>
                  <p className="text-sm font-medium">
                    Glissez votre fichier CSV ici
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    ou{" "}
                    <button
                      className="text-primary underline"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      parcourir vos fichiers
                    </button>
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Parse button */}
          {file && (
            <div className="flex justify-end">
              <Button onClick={handleParse} disabled={parsing}>
                {parsing ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <ArrowRight className="w-4 h-4 mr-1.5" />
                )}
                {parsing ? "Analyse en cours..." : "Analyser le fichier"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Preview */}
      {step === "preview" && parseResult && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-2xl font-bold">{parseResult.total}</p>
                <p className="text-xs text-muted-foreground">Lignes lues</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-2xl font-bold text-green-600">{parseResult.valid}</p>
                <p className="text-xs text-muted-foreground">Nouveaux leads</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-2xl font-bold text-amber-600">{parseResult.duplicates.length}</p>
                <p className="text-xs text-muted-foreground">Doublons détectés</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-2xl font-bold text-red-500">{parseResult.errors.length}</p>
                <p className="text-xs text-muted-foreground">Erreurs</p>
              </CardContent>
            </Card>
          </div>

          {/* Errors */}
          {parseResult.errors.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-red-600">
                  <XCircle className="w-4 h-4" />
                  Erreurs de validation ({parseResult.errors.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {parseResult.errors.slice(0, 30).map((e, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        L.{e.line}
                      </Badge>
                      <span className="text-muted-foreground">{e.field} :</span>
                      <span>{e.message}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Preview table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                Aperçu ({Math.min(parseResult.preview.length, 20)} premières lignes)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="px-3 py-2 text-left font-medium">L.</th>
                      <th className="px-3 py-2 text-left font-medium">Entreprise</th>
                      <th className="px-3 py-2 text-left font-medium">Téléphone</th>
                      <th className="px-3 py-2 text-left font-medium">Email</th>
                      <th className="px-3 py-2 text-left font-medium">Ville</th>
                      <th className="px-3 py-2 text-left font-medium">Contact</th>
                      <th className="px-3 py-2 text-left font-medium">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {parseResult.preview.map((row, i) => (
                      <tr key={i} className="hover:bg-muted/20">
                        <td className="px-3 py-1.5 text-muted-foreground">{row.line as number}</td>
                        <td className="px-3 py-1.5 font-medium truncate max-w-[200px]">
                          {row.nom_entreprise as string}
                        </td>
                        <td className="px-3 py-1.5 font-mono">
                          {(row.phone_e164 as string) || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 truncate max-w-[150px]">
                          {(row.email as string) || "—"}
                        </td>
                        <td className="px-3 py-1.5">{(row.ville as string) || "—"}</td>
                        <td className="px-3 py-1.5 truncate max-w-[150px]">
                          {(row.contact_nom as string) || "—"}
                        </td>
                        <td className="px-3 py-1.5">
                          {row.status === "new" ? (
                            <Badge className="text-[10px] bg-green-100 text-green-700 border-transparent">
                              Nouveau
                            </Badge>
                          ) : (
                            <Badge className="text-[10px] bg-amber-100 text-amber-700 border-transparent">
                              Doublon
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-between">
            <Button variant="outline" onClick={handleReset}>
              Annuler
            </Button>
            <Button onClick={handleExecute}>
              <Upload className="w-4 h-4 mr-1.5" />
              Importer {parseResult.valid} lead{parseResult.valid > 1 ? "s" : ""}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Duplicates review */}
      {step === "duplicates" && parseResult && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                {parseResult.duplicates.length} doublon{parseResult.duplicates.length > 1 ? "s" : ""} détecté{parseResult.duplicates.length > 1 ? "s" : ""}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Bulk actions */}
              <div className="flex gap-2 mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const a: Record<string, string> = {};
                    parseResult.duplicates.forEach((d) => { a[`line_${d.line}`] = "skip"; });
                    setDupActions(a);
                  }}
                >
                  Tout ignorer
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const a: Record<string, string> = {};
                    parseResult.duplicates.forEach((d) => { a[`line_${d.line}`] = "update"; });
                    setDupActions(a);
                  }}
                >
                  Tout mettre à jour
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const a: Record<string, string> = {};
                    parseResult.duplicates.forEach((d) => { a[`line_${d.line}`] = "create"; });
                    setDupActions(a);
                  }}
                >
                  Tout créer quand même
                </Button>
              </div>

              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {parseResult.duplicates.map((d) => {
                  const key = `line_${d.line}`;
                  const action = dupActions[key] || "skip";
                  return (
                    <div
                      key={key}
                      className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">
                            {d.csv_name}
                          </span>
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            L.{d.line}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Correspond à{" "}
                          <Link
                            href={`/clients/${d.existing_id}`}
                            className="text-primary underline"
                            target="_blank"
                          >
                            {d.existing_name}
                          </Link>
                          {" "}
                          <span className="text-[10px]">
                            (match par{" "}
                            {d.match_type === "phone"
                              ? "téléphone"
                              : d.match_type === "contact_phone"
                              ? "tél. contact"
                              : "nom + ville"}
                            )
                          </span>
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {(
                          [
                            { val: "skip", label: "Ignorer" },
                            { val: "update", label: "Mettre à jour" },
                            { val: "create", label: "Créer" },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.val}
                            onClick={() =>
                              setDupActions((prev) => ({ ...prev, [key]: opt.val }))
                            }
                            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                              action === opt.val
                                ? opt.val === "skip"
                                  ? "bg-slate-200 text-slate-700"
                                  : opt.val === "update"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-amber-100 text-amber-700"
                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Stats recap */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              <span className="font-semibold text-foreground">{parseResult.valid}</span>{" "}
              nouveaux
            </span>
            <span>
              <span className="font-semibold text-foreground">
                {Object.values(dupActions).filter((a) => a === "skip").length}
              </span>{" "}
              ignorés
            </span>
            <span>
              <span className="font-semibold text-foreground">
                {Object.values(dupActions).filter((a) => a === "update").length}
              </span>{" "}
              mis à jour
            </span>
            <span>
              <span className="font-semibold text-foreground">
                {Object.values(dupActions).filter((a) => a === "create").length}
              </span>{" "}
              créés en double
            </span>
          </div>

          {/* Actions */}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("upload")}>
              Retour
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("preview")}>
                Voir l&apos;aperçu
              </Button>
              <Button onClick={handleExecute}>
                <Upload className="w-4 h-4 mr-1.5" />
                Lancer l&apos;import
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Importing */}
      {step === "importing" && (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6 pb-6">
              <div className="text-center space-y-4">
                {!jobStatus || jobStatus.status === "running" ? (
                  <>
                    <Loader2 className="w-10 h-10 text-primary mx-auto animate-spin" />
                    <div>
                      <p className="text-sm font-medium">Import en cours...</p>
                      {jobStatus && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {jobStatus.done} / {jobStatus.total} traités
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
                    <p className="text-sm font-medium">Import terminé</p>
                  </>
                )}

                {/* Progress bar */}
                {jobStatus && (
                  <div className="max-w-md mx-auto">
                    <div className="h-3 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{
                          width: `${
                            jobStatus.total > 0
                              ? Math.round((jobStatus.done / jobStatus.total) * 100)
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {jobStatus.total > 0
                        ? Math.round((jobStatus.done / jobStatus.total) * 100)
                        : 0}
                      %
                    </p>
                  </div>
                )}

                {/* Results */}
                {jobStatus && jobStatus.status === "completed" && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 max-w-lg mx-auto">
                    <div className="text-center">
                      <p className="text-xl font-bold text-green-600">{jobStatus.created}</p>
                      <p className="text-[11px] text-muted-foreground">Créés</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-bold text-blue-600">{jobStatus.updated}</p>
                      <p className="text-[11px] text-muted-foreground">Mis à jour</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-bold text-slate-500">{jobStatus.skipped}</p>
                      <p className="text-[11px] text-muted-foreground">Ignorés</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-bold text-red-500">
                        {jobStatus.errors.length}
                      </p>
                      <p className="text-[11px] text-muted-foreground">Erreurs</p>
                    </div>
                  </div>
                )}

                {/* Import errors */}
                {jobStatus && jobStatus.errors.length > 0 && (
                  <div className="mt-4 max-w-lg mx-auto text-left">
                    <p className="text-xs font-medium text-red-600 mb-2">
                      Erreurs ({jobStatus.errors.length}) :
                    </p>
                    <div className="max-h-32 overflow-y-auto space-y-1 text-xs">
                      {jobStatus.errors.slice(0, 20).map((e, i) => (
                        <div key={i} className="flex gap-2">
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            L.{e.line}
                          </Badge>
                          <span className="text-muted-foreground truncate">{e.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {jobStatus?.status === "completed" && (
            <div className="flex justify-between">
              <Button variant="outline" onClick={handleReset}>
                Nouvel import
              </Button>
              <Link href="/clients">
                <Button>
                  Voir les clients
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
