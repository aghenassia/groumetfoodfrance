"use client";

import { useEffect, useState, useCallback } from "react";
import { api, Contact, ContactCallEntry } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Plus,
  Save,
  Trash2,
  Cake,
  StickyNote,
  Heart,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import { ClickToCall } from "@/components/click-to-call";
import { toast } from "sonner";

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
  const [animKey, setAnimKey] = useState(0);
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [commercialFilter, setCommercialFilter] = useState<string>("all");
  const [salesUsers, setSalesUsers] = useState<{ id: string; name: string }[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [contactCalls, setContactCalls] = useState<ContactCallEntry[]>([]);
  const [loadingCalls, setLoadingCalls] = useState(false);

  const [showDialog, setShowDialog] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [contactForm, setContactForm] = useState({
    first_name: "", last_name: "", role: "", title: "",
    phones: [{ phone: "", label: "", is_primary: true }],
    emails: [""], is_primary: false,
    birthday: "", personal_notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [companySearch, setCompanySearch] = useState("");
  const [companyResults, setCompanyResults] = useState<{ id: string; name: string }[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [selectedCompanyName, setSelectedCompanyName] = useState("");

  const emptyForm = () => ({
    first_name: "", last_name: "", role: "", title: "",
    phones: [{ phone: "", label: "", is_primary: true }],
    emails: [""], is_primary: false,
    birthday: "", personal_notes: "",
  });

  const openNewContact = () => {
    setEditingContact(null);
    setContactForm(emptyForm());
    setSelectedCompanyId(null);
    setSelectedCompanyName("");
    setCompanySearch("");
    setCompanyResults([]);
    setShowDialog(true);
  };

  const openEditContact = (ct: Contact) => {
    setEditingContact(ct);
    const phones = ct.phones && ct.phones.length > 0
      ? ct.phones.map((p) => ({ phone: p.phone, label: p.label || "", is_primary: p.is_primary }))
      : ct.phone ? [{ phone: ct.phone, label: "", is_primary: true }] : [{ phone: "", label: "", is_primary: true }];
    setContactForm({
      first_name: ct.first_name || "",
      last_name: ct.last_name || "",
      role: ct.role || "",
      title: ct.title || "",
      phones,
      emails: ct.email ? ct.email.split(",").map((e) => e.trim()) : [""],
      is_primary: ct.is_primary,
      birthday: ct.birthday || "",
      personal_notes: ct.personal_notes || "",
    });
    setSelectedCompanyId(ct.company_id || null);
    setSelectedCompanyName(ct.company_name || "");
    setCompanySearch("");
    setCompanyResults([]);
    setShowDialog(true);
  };

  useEffect(() => {
    if (!companySearch || companySearch.length < 2) { setCompanyResults([]); return; }
    const timer = setTimeout(() => {
      api.searchClients(companySearch).then((res) => setCompanyResults(res.slice(0, 8))).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [companySearch]);

  const handleSaveContact = async () => {
    const first = contactForm.first_name.trim();
    const last = contactForm.last_name.trim();
    if (!first && !last) { toast.error("Saisissez au moins le prénom ou le nom"); return; }
    const fullName = [first, last].filter(Boolean).join(" ");
    const email = contactForm.emails.map((e) => e.trim()).filter(Boolean).join(", ") || undefined;
    const primaryPhone = contactForm.phones.find((p) => p.is_primary && p.phone.trim());
    setSaving(true);
    try {
      const payload = {
        name: fullName,
        first_name: first || undefined,
        last_name: last || undefined,
        role: contactForm.role || undefined,
        title: contactForm.title || undefined,
        phone: primaryPhone?.phone || contactForm.phones.find((p) => p.phone.trim())?.phone || undefined,
        email,
        is_primary: contactForm.is_primary,
        birthday: contactForm.birthday || undefined,
        personal_notes: contactForm.personal_notes || undefined,
      };
      if (editingContact) {
        await api.updateContact(editingContact.id, payload);
        const oldPhoneIds = new Set((editingContact.phones || []).map((p) => p.id));
        for (const oldId of oldPhoneIds) {
          await api.deleteContactPhone(editingContact.id, oldId);
        }
        for (const p of contactForm.phones) {
          if (p.phone.trim()) {
            await api.addContactPhone(editingContact.id, { phone: p.phone, label: p.label || undefined });
          }
        }
        toast.success("Contact mis à jour");
      } else {
        const created = await api.createContact({ ...payload, company_id: selectedCompanyId || undefined });
        for (let i = 1; i < contactForm.phones.length; i++) {
          const p = contactForm.phones[i];
          if (p.phone.trim()) {
            await api.addContactPhone(created.id, { phone: p.phone, label: p.label || undefined });
          }
        }
        toast.success("Contact créé");
      }
      setShowDialog(false);
      fetchContacts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteContact = async (ct: Contact) => {
    if (!confirm(`Supprimer le contact "${ct.first_name || ""} ${ct.last_name || ct.name}" ?`)) return;
    try {
      await api.deleteContact(ct.id);
      toast.success("Contact supprimé");
      if (selectedContact?.id === ct.id) closePanel();
      fetchContacts();
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  };

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
        setAnimKey((k) => k + 1);
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
        <Button size="sm" onClick={openNewContact}>
          <Plus className="w-4 h-4 mr-1.5" />
          Ajouter
        </Button>
      </div>

      {/* Filters bar */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, téléphone, email, entreprise, ville, produit acheté…"
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
      <div className={selectedContact ? "lg:pr-[380px]" : ""}>
        {/* Table */}
        <div>
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
                        <TableHead className="hidden md:table-cell">Fonction / Titre</TableHead>
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
                    <TableBody key={animKey}>
                      {contacts.map((ct, _i) => (
                        <TableRow
                          key={ct.id}
                          className={`stagger-row group cursor-pointer transition-colors ${selectedContact?.id === ct.id ? "bg-accent" : "hover:bg-accent/50"}`}
                          style={{ animationDelay: `${_i * 40}ms` }}
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
                            <div>
                              <span className="text-sm text-muted-foreground">{ct.role || "—"}</span>
                              {ct.title && <span className="block text-[11px] text-muted-foreground/70">{ct.title}</span>}
                            </div>
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

        {/* Create/edit dialog */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{editingContact ? "Modifier le contact" : "Nouveau contact"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Prénom *</Label>
                  <Input className="h-8 text-sm" value={contactForm.first_name} onChange={(e) => setContactForm({ ...contactForm, first_name: e.target.value })} placeholder="Prénom" autoFocus />
                </div>
                <div>
                  <Label className="text-xs">Nom *</Label>
                  <Input className="h-8 text-sm" value={contactForm.last_name} onChange={(e) => setContactForm({ ...contactForm, last_name: e.target.value })} placeholder="Nom de famille" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Rôle / Fonction</Label>
                <Input className="h-8 text-sm" value={contactForm.role} onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })} placeholder="Ex: Directeur, Acheteur..." />
              </div>
              <div>
                <Label className="text-xs">Titre / Poste</Label>
                <Input className="h-8 text-sm" value={contactForm.title} onChange={(e) => setContactForm({ ...contactForm, title: e.target.value })} placeholder="Ex: Chef de cuisine, Responsable achats..." />
              </div>
              <div>
                <Label className="text-xs flex items-center justify-between">
                  <span>Téléphones</span>
                  <button type="button" className="text-[10px] text-primary hover:underline" onClick={() => setContactForm({ ...contactForm, phones: [...contactForm.phones, { phone: "", label: "", is_primary: false }] })}>
                    + Ajouter un numéro
                  </button>
                </Label>
                <div className="space-y-1.5">
                  {contactForm.phones.map((ph, idx) => (
                    <div key={idx} className="flex items-center gap-1">
                      <Input className="h-8 text-sm flex-1 font-mono" value={ph.phone} onChange={(e) => {
                        const updated = [...contactForm.phones]; updated[idx] = { ...updated[idx], phone: e.target.value }; setContactForm({ ...contactForm, phones: updated });
                      }} placeholder={idx === 0 ? "+33 6 12 34 56 78" : "Autre numéro..."} />
                      <Select value={ph.label} onValueChange={(v) => {
                        const updated = [...contactForm.phones]; updated[idx] = { ...updated[idx], label: v }; setContactForm({ ...contactForm, phones: updated });
                      }}>
                        <SelectTrigger className="h-8 w-[90px] text-xs"><SelectValue placeholder="Label" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="principal">Principal</SelectItem>
                          <SelectItem value="mobile">Mobile</SelectItem>
                          <SelectItem value="direct">Direct</SelectItem>
                          <SelectItem value="standard">Standard</SelectItem>
                        </SelectContent>
                      </Select>
                      <button type="button" className={`text-[10px] px-1.5 py-0.5 rounded border ${ph.is_primary ? "bg-green-50 border-green-300 text-green-700" : "border-muted text-muted-foreground hover:border-primary"}`}
                        onClick={() => { const updated = contactForm.phones.map((p, i) => ({ ...p, is_primary: i === idx })); setContactForm({ ...contactForm, phones: updated }); }}>
                        {ph.is_primary ? "1er" : "○"}
                      </button>
                      {contactForm.phones.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => {
                          let updated = contactForm.phones.filter((_, i) => i !== idx);
                          if (ph.is_primary && updated.length > 0) updated = updated.map((p, i) => i === 0 ? { ...p, is_primary: true } : p);
                          setContactForm({ ...contactForm, phones: updated });
                        }}><X className="w-3 h-3 text-muted-foreground" /></Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs flex items-center justify-between">
                  <span>Emails</span>
                  <button type="button" className="text-[10px] text-primary hover:underline" onClick={() => setContactForm({ ...contactForm, emails: [...contactForm.emails, ""] })}>
                    + Ajouter un email
                  </button>
                </Label>
                <div className="space-y-1.5">
                  {contactForm.emails.map((email, idx) => (
                    <div key={idx} className="flex items-center gap-1">
                      <Input className="h-8 text-sm flex-1" type="email" value={email} onChange={(e) => {
                        const updated = [...contactForm.emails]; updated[idx] = e.target.value; setContactForm({ ...contactForm, emails: updated });
                      }} placeholder={idx === 0 ? "email@entreprise.fr" : "autre email..."} />
                      {contactForm.emails.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => {
                          setContactForm({ ...contactForm, emails: contactForm.emails.filter((_, i) => i !== idx) });
                        }}><X className="w-3 h-3 text-muted-foreground" /></Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="pt-1 border-t">
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <Heart className="w-3 h-3" />
                  Infos personnelles
                </p>
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs">Date d&apos;anniversaire</Label>
                    <Input className="h-8 text-sm" type="date" value={contactForm.birthday} onChange={(e) => setContactForm({ ...contactForm, birthday: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Notes personnelles</Label>
                    <Textarea className="text-sm min-h-[60px] resize-y" value={contactForm.personal_notes} onChange={(e) => setContactForm({ ...contactForm, personal_notes: e.target.value })} placeholder="Prénom des enfants, lieu de vacances, centres d'intérêt…" />
                  </div>
                </div>
              </div>
              {!editingContact && (
                <div>
                  <Label className="text-xs">Entreprise (optionnel)</Label>
                  {selectedCompanyId ? (
                    <div className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30">
                      <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-sm flex-1 truncate">{selectedCompanyName}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setSelectedCompanyId(null); setSelectedCompanyName(""); }}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Input className="h-8 text-sm" value={companySearch} onChange={(e) => setCompanySearch(e.target.value)} placeholder="Rechercher une entreprise..." />
                      {companyResults.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full bg-background border rounded-md shadow-lg max-h-40 overflow-y-auto">
                          {companyResults.map((c) => (
                            <button key={c.id} className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors" onClick={() => {
                              setSelectedCompanyId(c.id); setSelectedCompanyName(c.name); setCompanySearch(""); setCompanyResults([]);
                            }}>
                              <Building2 className="w-3 h-3 inline mr-1.5 text-muted-foreground" />{c.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2">
                <input type="checkbox" id="new_contact_primary" checked={contactForm.is_primary} onChange={(e) => setContactForm({ ...contactForm, is_primary: e.target.checked })} className="h-4 w-4 rounded border-gray-300 accent-green-600" />
                <Label htmlFor="new_contact_primary" className="text-xs cursor-pointer">Contact principal de l&apos;entreprise</Label>
              </div>
              <Button className="w-full" onClick={handleSaveContact} disabled={saving || (!contactForm.first_name.trim() && !contactForm.last_name.trim())}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                {editingContact ? "Enregistrer" : "Créer le contact"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Side panel */}
        {selectedContact && (
          <>
            {/* Mobile overlay */}
            <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={closePanel} />

            {/* Panel: fullscreen on mobile, fixed sidebar on desktop */}
            <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[400px] lg:w-[360px] bg-background border-l shadow-xl lg:shadow-none overflow-y-auto lg:z-30">
                <Card className="border-0 shadow-none rounded-none">
                  <CardContent className="p-0">
                    {/* Panel header */}
                    <div className="flex items-start justify-between p-4 border-b bg-muted/30">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base truncate">
                          {displayName(selectedContact)}
                        </h3>
                        {(selectedContact.role || selectedContact.title) && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Briefcase className="w-3 h-3" />
                            {[selectedContact.role, selectedContact.title].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 ml-2 shrink-0">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditContact(selectedContact)} title="Modifier">
                          <Save className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDeleteContact(selectedContact)} title="Supprimer">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closePanel}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Contact info */}
                    <div className="p-4 space-y-3 border-b">
                      {(() => {
                        const phonesList = selectedContact.phones && selectedContact.phones.length > 0
                          ? selectedContact.phones
                          : selectedContact.phone
                            ? [{ id: '', phone: selectedContact.phone, phone_e164: selectedContact.phone_e164, label: null, is_primary: true }]
                            : [];
                        return phonesList.length > 0 ? (
                          <div className="space-y-1.5">
                            {phonesList.map((p, idx) => (
                              <div key={p.id || idx} className="flex items-center gap-2 text-sm">
                                <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span className="font-mono flex-1">{p.phone}</span>
                                {p.label && <span className="text-[10px] text-muted-foreground border rounded px-1">{p.label}</span>}
                                {p.is_primary && <span className="text-[10px] text-green-700 bg-green-50 border border-green-300 rounded px-1">1er</span>}
                                {p.phone_e164 && (
                                  <ClickToCall
                                    phoneNumber={p.phone_e164}
                                    contactName={displayName(selectedContact)}
                                    clientId={selectedContact.company_id || undefined}
                                    clientName={selectedContact.company_name || undefined}
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        ) : null;
                      })()}
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

                    {/* Personal info */}
                    {(selectedContact.birthday || selectedContact.personal_notes) && (
                      <div className="p-4 border-b">
                        <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
                          <Heart className="w-3.5 h-3.5" />
                          Infos personnelles
                        </h4>
                        <div className="space-y-2">
                          {selectedContact.birthday && (
                            <div className="flex items-start gap-2 text-sm">
                              <Cake className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                              <div>
                                <span className="text-muted-foreground text-xs">Anniversaire</span>
                                <p className="font-medium">
                                  {new Date(selectedContact.birthday + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
                                </p>
                              </div>
                            </div>
                          )}
                          {selectedContact.personal_notes && (
                            <div className="flex items-start gap-2 text-sm">
                              <StickyNote className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <span className="text-muted-foreground text-xs">Notes personnelles</span>
                                <p className="whitespace-pre-wrap text-[13px] leading-relaxed mt-0.5">
                                  {selectedContact.personal_notes}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

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
          </>
        )}
      </div>
    </div>
  );
}
