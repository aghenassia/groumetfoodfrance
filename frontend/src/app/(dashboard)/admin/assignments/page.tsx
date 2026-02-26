"use client";

import { useEffect, useState, useCallback } from "react";
import {
  api,
  ClientAssignment,
  ClientListItem,
  OrphanGroup,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  Users,
  ArrowRight,
  Search,
  CheckSquare,
  Square,
  Loader2,
  UserPlus,
  AlertTriangle,
  Wand2,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState<ClientAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetUserId, setTargetUserId] = useState<string>("");
  const [reassigning, setReassigning] = useState(false);
  const [orphans, setOrphans] = useState<OrphanGroup[]>([]);
  const [totalOrphans, setTotalOrphans] = useState(0);
  const [autoAssigning, setAutoAssigning] = useState(false);

  const fetchAssignments = useCallback(() => {
    setLoading(true);
    api
      .getClientAssignments()
      .then(setAssignments)
      .catch(() => toast.error("Erreur chargement"))
      .finally(() => setLoading(false));
  }, []);

  const fetchOrphans = useCallback(() => {
    api
      .getOrphanClients()
      .then((data) => {
        setOrphans(data.groups);
        setTotalOrphans(data.total_orphans);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchAssignments();
    fetchOrphans();
  }, [fetchAssignments, fetchOrphans]);

  const handleAutoAssign = async () => {
    setAutoAssigning(true);
    try {
      const result = await api.autoAssignClients();
      toast.success(
        `${result.assigned} client(s) auto-assigné(s), ${result.remaining_unassigned} restant(s)`
      );
      fetchAssignments();
      fetchOrphans();
    } catch {
      toast.error("Erreur lors de l'auto-assignation");
    } finally {
      setAutoAssigning(false);
    }
  };

  const loadClients = useCallback(
    (sourceId: string | null, q: string) => {
      if (!sourceId) return;
      setClientsLoading(true);
      const promise =
        sourceId === "__unassigned__"
          ? api.getUnassignedClients(q || undefined)
          : api.getClientsByUser(sourceId, q || undefined);
      promise
        .then((data) => {
          setClients(data);
          setSelected(new Set());
        })
        .catch(() => toast.error("Erreur chargement clients"))
        .finally(() => setClientsLoading(false));
    },
    []
  );

  useEffect(() => {
    const timer = setTimeout(() => loadClients(selectedSource, search), 300);
    return () => clearTimeout(timer);
  }, [selectedSource, search, loadClients]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === clients.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(clients.map((c) => c.id)));
    }
  };

  const handleReassign = async () => {
    if (!targetUserId || selected.size === 0) return;
    setReassigning(true);
    try {
      const result = await api.reassignClients(
        Array.from(selected),
        targetUserId
      );
      toast.success(
        `${result.reassigned} client(s) réassigné(s) à ${result.target}`
      );
      setSelected(new Set());
      fetchAssignments();
      loadClients(selectedSource, search);
    } catch {
      toast.error("Erreur de réassignation");
    } finally {
      setReassigning(false);
    }
  };

  const sourceUsers = assignments.filter((a) => a.client_count > 0);
  const targetUsers = assignments.filter(
    (a) => a.user_id !== null && a.user_id !== selectedSource
  );
  const sourceName =
    assignments.find(
      (a) =>
        (a.user_id || "__unassigned__") ===
        (selectedSource || "__unassigned__")
    )?.user_name || "";

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link href="/admin">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <UserPlus className="w-5 h-5 sm:w-6 sm:h-6" />
            Réassignation des clients
          </h2>
          <p className="text-sm text-muted-foreground">
            Transférez des clients entre commerciaux pour optimiser les playlists
          </p>
        </div>
      </div>

      {/* Résumé des affectations */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">
          Chargement...
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {assignments.map((a) => {
            const key = a.user_id || "__unassigned__";
            const isActive = selectedSource === key;
            return (
              <Card
                key={key}
                className={`cursor-pointer transition-all hover:shadow-md ${
                  isActive
                    ? "ring-2 ring-sora border-sora"
                    : ""
                }`}
                onClick={() => {
                  setSelectedSource(key);
                  setSearch("");
                }}
              >
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    {a.user_name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold">
                      {a.client_count}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      clients
                    </Badge>
                  </div>
                  {a.sage_rep_name && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Sage : {a.sage_rep_name}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Section orphelins */}
      {totalOrphans > 0 && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Clients sans commercial CRM
              <Badge variant="outline" className="ml-auto border-amber-300 text-amber-700">
                {totalOrphans} orphelin(s)
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Ces clients n&apos;ont pas de commercial CRM attribue. L&apos;ancien nom Sage est affiche a titre indicatif.
            </p>

            <div className="border rounded-lg divide-y bg-background max-h-[200px] overflow-y-auto">
              {orphans.map((g) => (
                <div
                  key={g.sage_rep_name}
                  className="flex items-center justify-between px-3 py-2 text-sm"
                >
                  <span className="text-muted-foreground">
                    {g.sage_rep_name}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {g.client_count} client(s)
                  </Badge>
                </div>
              ))}
            </div>

            <Button
              onClick={handleAutoAssign}
              disabled={autoAssigning}
              variant="outline"
              className="w-full border-amber-300 hover:bg-amber-100"
            >
              {autoAssigning ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Wand2 className="w-4 h-4 mr-2" />
              )}
              Auto-assigner (matching Sage + historique ventes)
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Section de transfert */}
      {selectedSource && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              Clients de {sourceName}
              <Badge variant="outline" className="ml-auto">
                {clients.length} résultat(s)
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Barre actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher un client..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex gap-2 items-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectAll}
                  disabled={clients.length === 0}
                >
                  {selected.size === clients.length && clients.length > 0
                    ? "Tout désélectionner"
                    : "Tout sélectionner"}
                </Button>
                {selected.size > 0 && (
                  <Badge>{selected.size} sélectionné(s)</Badge>
                )}
              </div>
            </div>

            {/* Liste clients */}
            {clientsLoading ? (
              <div className="text-center py-6 text-muted-foreground">
                <Loader2 className="w-5 h-5 mx-auto animate-spin" />
              </div>
            ) : clients.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                Aucun client trouvé
              </div>
            ) : (
              <div className="border rounded-lg divide-y max-h-[400px] overflow-y-auto">
                {clients.map((c) => {
                  const isChecked = selected.has(c.id);
                  return (
                    <div
                      key={c.id}
                      className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-accent/50 transition-colors ${
                        isChecked ? "bg-sora/5" : ""
                      }`}
                      onClick={() => toggleSelect(c.id)}
                    >
                      {isChecked ? (
                        <CheckSquare className="w-4 h-4 text-sora shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">
                            {c.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            #{c.sage_id}
                          </span>
                        </div>
                        <div className="flex gap-3 text-xs text-muted-foreground">
                          {c.city && <span>{c.city}</span>}
                          {c.sales_rep && <span>Rep: {c.sales_rep}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Transfert */}
            {selected.size > 0 && (
              <div className="flex items-center gap-3 p-4 bg-accent/30 rounded-lg">
                <div className="text-sm font-medium shrink-0">
                  {selected.size} client(s)
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                <Select
                  value={targetUserId}
                  onValueChange={setTargetUserId}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Sélectionner le commercial cible" />
                  </SelectTrigger>
                  <SelectContent>
                    {targetUsers.map((u) =>
                      u.user_id ? (
                        <SelectItem key={u.user_id} value={u.user_id}>
                          {u.user_name}{" "}
                          ({u.client_count} clients)
                        </SelectItem>
                      ) : null
                    )}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleReassign}
                  disabled={!targetUserId || reassigning}
                  className="shrink-0"
                >
                  {reassigning ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                  ) : (
                    <ArrowRight className="w-4 h-4 mr-1.5" />
                  )}
                  Transférer
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
