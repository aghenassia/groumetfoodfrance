"use client";

import { useEffect, useState, useCallback } from "react";
import { api, Contact, ContactCallEntry } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ContactRound,
  Search,
  ChevronRight,
  ChevronLeft,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Mail,
  Building2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  UserX,
  X,
  Clock,
  Briefcase,
  ExternalLink,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { ClickToCall } from "@/components/click-to-call";

const PAGE_SIZE = 50;

type SortKey = "name" | "created_at" | "company_name";

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [commercialFilter, setCommercialFilter] = useState<string>("all");
  const [salesUsers, setSalesUsers] = useState<{ id: string; name: string }[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [contactCalls, setContactCalls] = useState<ContactCallEntry[]>([]);
  const [loadingCalls, setLoadingCalls] = useState(false);

  useEffect(() => {
    api.getUsersList().then((users) => {
      setSalesUsers(
        users
          .filter((u) => ["sales", "manager", "admin"].includes(u.role))
          .map((u) => ({ id: u.id, name: u.name }))
      );
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchContacts = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = {
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
      sort_by: sortBy,
      sort_dir: sortDir,
    };
    if (debouncedSearch) params.search = debouncedSearch;
    if (companyFilter === "orphan") params.orphan_only = "true";
    if (commercialFilter !== "all") params.assigned_user_id = commercialFilter;

    api.getContacts(params)
      .then((res) => {
        setContacts(res.contacts);
        setTotal(res.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [debouncedSearch, companyFilter, commercialFilter, sortBy, sortDir, page]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const selectContact = (ct: Contact) => {
    setSelectedContact(ct);
    setLoadingCalls(true);
    setContactCalls([]);
    api.getContactCalls(ct.id)
      .then(setContactCalls)
      .catch(() => {})
      .finally(() => setLoadingCalls(false));
  };

  const closePanel = () => {
    setSelectedContact(null);
    setContactCalls([]);
  };

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir(key === "name" || key === "company_name" ? "asc" : "desc");
    }
    setPage(0);
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortBy !== col)
      return <ArrowUpDown className="w-3 h-3 ml-1 opacity-30" />;
    return sortDir === "asc" ? (
      <ArrowUp className="w-3 h-3 ml-1 text-primary" />
    ) : (
      <ArrowDown className="w-3 h-3 ml-1 text-primary" />
    );
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const displayName = (ct: Contact) => {
    const parts = [ct.first_name, ct.last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : ct.name || "—";
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ContactRound className="w-6 h-6" />
            Contacts
          </h2>
          <p className="text-muted-foreground text-sm">
            {total} contact{total > 1 ? "s" : ""} en base
            {debouncedSearch && ` · recherche "${debouncedSearch}"`}
          </p>
        </div>
      </div>

      {/* Filters bar */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, prénom, téléphone, email, entreprise…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <Select
            value={companyFilter}
            onValueChange={(v) => {
              setCompanyFilter(v);
              setPage(0);
            }}
          >
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les contacts</SelectItem>
              <SelectItem value="attached">Rattachés</SelectItem>
              <SelectItem value="orphan">Orphelins</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={commercialFilter}
            onValueChange={(v) => {
              setCommercialFilter(v);
              setPage(0);
            }}
          >
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue placeholder="Commercial" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les commerciaux</SelectItem>
              {salesUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="w-px h-6 bg-border" />

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Trier par :</span>
            <Select
              value={sortBy}
              onValueChange={(v) => {
                setSortBy(v as SortKey);
                setSortDir(v === "created_at" ? "desc" : "asc");
                setPage(0);
              }}
            >
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Nom</SelectItem>
                <SelectItem value="company_name">Entreprise</SelectItem>
                <SelectItem value="created_at">Date de création</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            >
              {sortDir === "asc" ? (
                <ArrowUp className="w-4 h-4" />
              ) : (
                <ArrowDown className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Main layout: table + side panel */}
      <div className="flex gap-4 items-start">
        {/* Table */}
        <div className={`flex-1 min-w-0 transition-all ${selectedContact ? "max-w-[calc(100%-380px)]" : ""}`}>
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="text-center py-12 text-muted-foreground">
                  Chargement…
                </div>
              ) : contacts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  Aucun contact trouvé
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead
                          className="cursor-pointer select-none"
                          onClick={() => toggleSort("name")}
                        >
                          <span className="flex items-center">
                            Contact
                            <SortIcon col="name" />
                          </span>
                        </TableHead>
                        <TableHead
                          className="cursor-pointer select-none"
                          onClick={() => toggleSort("company_name")}
                        >
                          <span className="flex items-center">
                            Entreprise
                            <SortIcon col="company_name" />
                          </span>
                        </TableHead>
                        <TableHead className="hidden md:table-cell">Fonction</TableHead>
                        <TableHead className="hidden sm:table-cell">Téléphone</TableHead>
                        <TableHead className="hidden lg:table-cell">Email</TableHead>
                        <TableHead className="hidden xl:table-cell">Source</TableHead>
                        <TableHead
                          className="hidden md:table-cell cursor-pointer select-none"
                          onClick={() => toggleSort("created_at")}
                        >
                          <span className="flex items-center">
                            Créé le
                            <SortIcon col="created_at" />
                          </span>
                        </TableHead>
                        <TableHead className="w-[60px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contacts.map((ct) => (
                        <TableRow
                          key={ct.id}
                          className={`group cursor-pointer transition-colors ${selectedContact?.id === ct.id ? "bg-accent" : "hover:bg-accent/50"}`}
                          onClick={() => selectContact(ct)}
                        >
                          <TableCell>
                            <div>
                              <span className="font-medium text-sm">{displayName(ct)}</span>
                              {ct.is_primary && (
                                <Badge variant="outline" className="ml-2 text-[10px] py-0 px-1.5 border-primary/40 text-primary">
                                  Principal
                                </Badge>
                              )}
                              {ct.assigned_user_name && (
                                <span className="block text-[11px] text-muted-foreground mt-0.5">
                                  {ct.assigned_user_name}
                                </span>
                              )}
                            </div>
                          </TableCell>

                          <TableCell>
                            {ct.company_id ? (
                              <span className="text-sm flex items-center gap-1">
                                <Building2 className="w-3 h-3 shrink-0 text-muted-foreground" />
                                {ct.company_name || "—"}
                              </span>
                            ) : (
                              <Badge variant="outline" className="text-[10px] border-amber-400/50 text-amber-600 bg-amber-50 gap-1">
                                <UserX className="w-2.5 h-2.5" />
                                Orphelin
                              </Badge>
                            )}
                          </TableCell>

                          <TableCell className="hidden md:table-cell">
                            <span className="text-sm text-muted-foreground">{ct.role || "—"}</span>
                          </TableCell>

                          <TableCell className="hidden sm:table-cell">
                            {ct.phone ? (
                              <span className="text-sm font-mono">{ct.phone}</span>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </TableCell>

                          <TableCell className="hidden lg:table-cell">
                            {ct.email ? (
                              <span className="text-sm truncate max-w-[180px] block">{ct.email}</span>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </TableCell>

                          <TableCell className="hidden xl:table-cell">
                            <Badge variant="secondary" className="text-[10px]">
                              {ct.source || "—"}
                            </Badge>
                          </TableCell>

                          <TableCell className="hidden md:table-cell">
                            <span className="text-sm text-muted-foreground">
                              {formatDate(ct.created_at)}
                            </span>
                          </TableCell>

                          <TableCell>
                            <div className="flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                              {ct.company_id ? (
                                <Link href={`/clients/${ct.company_id}`} onClick={(e) => e.stopPropagation()}>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <ChevronRight className="w-4 h-4" />
                                  </Button>
                                </Link>
                              ) : (
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" disabled>
                                  <ChevronRight className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} sur{" "}
                {total}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Précédent
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page + 1}/{totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Suivant
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Side panel */}
        {selectedContact && (
          <>
            {/* Mobile overlay */}
            <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={closePanel} />

            {/* Panel: fullscreen on mobile, sidebar on desktop */}
            <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[400px] bg-background border-l shadow-xl overflow-y-auto lg:relative lg:inset-auto lg:z-auto lg:w-[360px] lg:shrink-0 lg:border-l-0 lg:shadow-none">
              <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
                <Card className="border-0 lg:border shadow-none lg:shadow-md rounded-none lg:rounded-lg">
                  <CardContent className="p-0">
                    {/* Panel header */}
                    <div className="flex items-start justify-between p-4 border-b bg-muted/30">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base truncate">
                          {displayName(selectedContact)}
                        </h3>
                        {selectedContact.role && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Briefcase className="w-3 h-3" />
                            {selectedContact.role}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 ml-2 shrink-0">
                        {selectedContact.phone_e164 && (
                          <ClickToCall
                            phoneNumber={selectedContact.phone_e164}
                            contactName={displayName(selectedContact)}
                            variant="cta"
                            label="Appeler"
                          />
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closePanel}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Contact info */}
                    <div className="p-4 space-y-3 border-b">
                      {selectedContact.phone && (
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="font-mono">{selectedContact.phone}</span>
                        </div>
                      )}
                      {selectedContact.email && (
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <a href={`mailto:${selectedContact.email.split(",")[0].trim()}`} className="hover:underline truncate">
                            {selectedContact.email}
                          </a>
                        </div>
                      )}

                      {/* Company card */}
                      {selectedContact.company_id ? (
                        <Link
                          href={`/clients/${selectedContact.company_id}`}
                          className="flex items-center gap-2 p-2.5 rounded-lg border bg-background hover:bg-accent/50 transition-colors group/company"
                        >
                          <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium truncate flex-1">
                            {selectedContact.company_name || "Entreprise"}
                          </span>
                          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover/company:opacity-100 transition-opacity" />
                        </Link>
                      ) : (
                        <div className="flex items-center gap-2 p-2.5 rounded-lg border border-amber-200 bg-amber-50/50">
                          <UserX className="w-4 h-4 text-amber-500 shrink-0" />
                          <span className="text-sm text-amber-700">Contact orphelin</span>
                        </div>
                      )}

                      {/* Meta */}
                      <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground pt-1">
                        {selectedContact.is_primary && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-primary/40 text-primary">
                            Contact principal
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-[10px]">
                          {selectedContact.source || "—"}
                        </Badge>
                        {selectedContact.assigned_user_name && (
                          <span>Commercial : {selectedContact.assigned_user_name}</span>
                        )}
                      </div>
                    </div>

                    {/* Call history */}
                    <div className="p-4">
                      <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
                        <Phone className="w-3.5 h-3.5" />
                        Historique appels
                        {!loadingCalls && (
                          <span className="text-muted-foreground font-normal">({contactCalls.length})</span>
                        )}
                      </h4>

                      {loadingCalls ? (
                        <div className="flex items-center justify-center py-6 text-muted-foreground">
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Chargement…
                        </div>
                      ) : contactCalls.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Aucun appel enregistré
                        </p>
                      ) : (
                        <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
                          {contactCalls.map((call) => {
                            const isIn = call.direction === "in";
                            const CallIcon = isIn
                              ? (call.is_answered ? PhoneIncoming : PhoneMissed)
                              : PhoneOutgoing;
                            const statusLabel = call.is_answered
                              ? formatDuration(call.incall_duration)
                              : (isIn ? "Manqué" : "N/R");
                            const statusColor = call.is_answered
                              ? "text-green-600"
                              : "text-muted-foreground";

                            return (
                              <div
                                key={call.id}
                                className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-accent/50 transition-colors text-sm"
                              >
                                <CallIcon className={`w-3.5 h-3.5 shrink-0 ${call.is_answered ? "text-green-600" : "text-muted-foreground"}`} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs text-muted-foreground">
                                      {formatDateTime(call.start_time)}
                                    </span>
                                    {call.user_name && (
                                      <span className="text-[11px] text-muted-foreground truncate">
                                        · {call.user_name}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <span className={`text-xs font-medium tabular-nums ${statusColor}`}>
                                  {statusLabel}
                                </span>
                                {call.ai_score != null && (
                                  <Badge variant="outline" className="text-[10px] py-0 px-1 tabular-nums">
                                    {call.ai_score}/10
                                  </Badge>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Footer: link to company page */}
                    {selectedContact.company_id && (
                      <div className="p-3 border-t bg-muted/20">
                        <Link href={`/clients/${selectedContact.company_id}`}>
                          <Button variant="outline" size="sm" className="w-full text-xs">
                            <Building2 className="w-3.5 h-3.5 mr-1.5" />
                            Voir la fiche entreprise
                            <ExternalLink className="w-3 h-3 ml-auto" />
                          </Button>
                        </Link>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
