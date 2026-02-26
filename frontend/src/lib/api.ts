const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (token) localStorage.setItem("token", token);
    else localStorage.removeItem("token");
  }

  getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== "undefined") {
      this.token = localStorage.getItem("token");
    }
    return this.token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

    if (res.status === 401) {
      this.setToken(null);
      if (typeof window !== "undefined") window.location.href = "/login";
      throw new Error("Non authentifié");
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || `Erreur ${res.status}`);
    }

    return res.json();
  }

  get<T>(path: string) {
    return this.request<T>(path);
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  put<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(path: string) {
    return this.request<T>(path, { method: "DELETE" });
  }

  // Auth
  async login(email: string, password: string) {
    const data = await this.post<{
      access_token: string;
      user: User;
    }>("/api/auth/login", { email, password });
    this.setToken(data.access_token);
    return data;
  }

  logout() {
    this.setToken(null);
  }

  me() {
    return this.get<User>("/api/auth/me");
  }

  // Clients
  getClients(params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return this.get<ClientListResponse>(`/api/clients${qs}`);
  }

  getCommercialStats() {
    return this.get<CommercialStats>("/api/clients/stats/commercial");
  }

  getClient(id: string) {
    return this.get<ClientDetail>(`/api/clients/${id}`);
  }

  createProspect(data: CreateProspectRequest) {
    return this.post<Client>("/api/clients", data);
  }

  addPhoneNumber(clientId: string, phone: string, label: string = "autre") {
    return this.post<PhoneNumber>(`/api/clients/${clientId}/phones`, {
      phone,
      label,
    });
  }

  removePhoneNumber(clientId: string, phoneId: string) {
    return this.request<{ deleted: boolean }>(
      `/api/clients/${clientId}/phones/${phoneId}`,
      { method: "DELETE" }
    );
  }

  updateClient(clientId: string, data: UpdateClientPayload) {
    return this.put<Client>(`/api/clients/${clientId}`, data);
  }

  enrichClient(clientId: string) {
    return this.post<EnrichSuggestion>(`/api/clients/${clientId}/enrich`);
  }

  mergeClient(sourceId: string, targetId: string) {
    return this.post<{ status: string; target_id: string; phones_transferred: number; calls_transferred: number }>(
      `/api/clients/${sourceId}/merge-into/${targetId}`,
    );
  }

  getClientAudit(clientId: string) {
    return this.get<ClientAuditLog[]>(`/api/clients/${clientId}/audit`);
  }

  // Margin Rules
  getMarginRules(activeOnly = true) {
    return this.get<MarginRule[]>(`/api/admin/margin-rules?active_only=${activeOnly}`);
  }
  createMarginRule(data: Partial<MarginRule>) {
    return this.post<MarginRule>("/api/admin/margin-rules", data);
  }
  updateMarginRule(id: string, data: Partial<MarginRule>) {
    return this.put<MarginRule>(`/api/admin/margin-rules/${id}`, data);
  }
  deleteMarginRule(id: string) {
    return this.delete(`/api/admin/margin-rules/${id}`);
  }
  getNetMarginStats(params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return this.get<NetMarginUserStats[]>(`/api/admin/margin-rules/net-margin-stats${qs}`);
  }

  // Objectives
  getObjectives(userId?: string) {
    const qs = userId ? `?user_id=${userId}` : "";
    return this.get<UserObjective[]>(`/api/objectives${qs}`);
  }
  getObjectiveMetrics() {
    return this.get<{ key: string; label: string }[]>("/api/objectives/metrics");
  }
  createObjective(data: { user_id: string; metric: string; period_type: string; target_value: number }) {
    return this.post<UserObjective>("/api/objectives", data);
  }
  updateObjective(id: string, data: Partial<UserObjective>) {
    return this.put<UserObjective>(`/api/objectives/${id}`, data);
  }
  deleteObjective(id: string) {
    return this.delete(`/api/objectives/${id}`);
  }
  getObjectiveProgress(userId: string) {
    return this.get<ObjectiveProgress[]>(`/api/objectives/progress?user_id=${userId}`);
  }

  // Challenges
  getChallenges(status?: string) {
    const qs = status ? `?status=${status}` : "";
    return this.get<ChallengeEntry[]>(`/api/challenges${qs}`);
  }
  createChallenge(data: Partial<ChallengeEntry>) {
    return this.post<ChallengeEntry>("/api/challenges", data);
  }
  updateChallenge(id: string, data: Partial<ChallengeEntry>) {
    return this.put<ChallengeEntry>(`/api/challenges/${id}`, data);
  }
  deleteChallenge(id: string) {
    return this.delete(`/api/challenges/${id}`);
  }
  getChallengeRanking(id: string) {
    return this.get<ChallengeRankingEntry[]>(`/api/challenges/${id}/ranking`);
  }

  // Contacts
  getContacts(params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return this.get<{ contacts: Contact[]; total: number }>(`/api/contacts${qs}`);
  }

  getContact(id: string) {
    return this.get<Contact>(`/api/contacts/${id}`);
  }

  createContact(data: { name: string; first_name?: string; last_name?: string; role?: string; phone?: string; email?: string; company_id?: string; is_primary?: boolean }) {
    return this.post<Contact>("/api/contacts", data);
  }

  updateContact(contactId: string, data: { name?: string; first_name?: string; last_name?: string; role?: string; phone?: string; email?: string; is_primary?: boolean }) {
    return this.put<Contact>(`/api/contacts/${contactId}`, data);
  }

  assignContact(contactId: string, companyId: string) {
    return this.post<{ status: string; contact_id: string; company_id: string }>(`/api/contacts/${contactId}/assign/${companyId}`);
  }

  moveContact(contactId: string, companyId: string) {
    return this.post<{ status: string; contact_id: string; from_company_id: string; to_company_id: string; calls_moved: number; phones_moved: number }>(
      `/api/contacts/${contactId}/move/${companyId}`
    );
  }

  deleteContact(contactId: string) {
    return this.delete<{ deleted: boolean }>(`/api/contacts/${contactId}`);
  }

  getContactCalls(contactId: string) {
    return this.get<ContactCallEntry[]>(`/api/contacts/${contactId}/calls`);
  }

  // Calls
  getCalls(params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return this.get<Call[]>(`/api/calls${qs}`);
  }

  getUnqualifiedCalls(params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return this.get<Call[]>(`/api/calls/unqualified${qs}`);
  }

  getCallStats(params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return this.get<CallStats>(`/api/calls/stats${qs}`);
  }

  // Qualify
  qualifyCall(data: QualifyRequest) {
    return this.post<Qualification>("/api/qualify", data);
  }

  // Playlists
  getPlaylist(params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return this.get<PlaylistItem[]>(`/api/playlists${qs}`);
  }

  updatePlaylistStatus(id: string, status: string) {
    return this.patch(`/api/playlists/${id}/status?status=${status}`);
  }

  getPlaylistInsight(playlistId: string, withAi: boolean = false) {
    return this.get<PlaylistInsight>(`/api/playlists/${playlistId}/insight?with_ai=${withAi}`);
  }

  getPlaylistConfigs() {
    return this.get<PlaylistConfigItem[]>("/api/admin/playlist/configs");
  }

  upsertPlaylistConfig(userId: string, config: PlaylistConfigPayload) {
    return this.put(`/api/admin/playlist/configs/${userId}`, config);
  }

  generatePlaylists(userId?: string) {
    const qs = userId ? `?user_id=${userId}` : "";
    return this.post<Record<string, unknown>>(`/api/admin/playlist/generate${qs}`);
  }

  clearPlaylistsToday(userId?: string) {
    const qs = userId ? `?user_id=${userId}` : "";
    return this.delete(`/api/admin/playlist/clear${qs}`);
  }

  getClientAssignments() {
    return this.get<ClientAssignment[]>("/api/admin/clients/assignments");
  }

  reassignClients(clientIds: string[], targetUserId: string) {
    return this.post<{ reassigned: number; target: string }>("/api/admin/clients/reassign", {
      client_ids: clientIds,
      target_user_id: targetUserId,
    });
  }

  getClientsByUser(userId: string, search?: string) {
    const qs = search ? `?search=${encodeURIComponent(search)}` : "";
    return this.get<ClientListItem[]>(`/api/admin/clients/by-user/${userId}${qs}`);
  }

  getUnassignedClients(search?: string) {
    const qs = search ? `?search=${encodeURIComponent(search)}` : "";
    return this.get<ClientListItem[]>(`/api/admin/clients/unassigned${qs}`);
  }

  autoAssignClients() {
    return this.post<{ processed: number; assigned: number; remaining_unassigned: number }>(
      "/api/admin/clients/auto-assign",
      {},
    );
  }

  getOrphanClients() {
    return this.get<{ total_orphans: number; groups: OrphanGroup[] }>(
      "/api/admin/clients/orphans",
    );
  }

  // AI Transcription (cached)
  transcribeCall(callId: string) {
    return this.post<AiAnalysis>(`/api/calls/${callId}/transcribe`);
  }

  getCallAnalysis(callId: string) {
    return this.get<AiAnalysis>(`/api/calls/${callId}/analysis`);
  }

  // Click-to-call
  dial(to_number: string, device: string = "ALL") {
    return this.post<{ success: boolean }>("/api/calls/dial", {
      to_number,
      device,
    });
  }

  // Reminders
  getReminders(params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return this.get<Reminder[]>(`/api/calls/reminders${qs}`);
  }

  // Admin
  getAdminDashboard() {
    return this.get<AdminDashboard>("/api/admin/dashboard");
  }

  syncRingover() {
    return this.post<{ synced: number; ai_analyzed?: number }>(
      "/api/admin/sync/ringover"
    );
  }

  runScoring() {
    return this.post<{ clients_scored: number }>("/api/admin/scoring/run");
  }

  // (supprimé — doublon avec generatePlaylists(userId?) plus haut)

  testSageConnection() {
    return this.request<{
      status: string;
      clients?: number;
      sales_lines?: number;
      error?: string;
    }>("/api/admin/sync/sage/test");
  }

  syncSageClients(mode: "full" | "delta" | "auto" = "auto") {
    return this.post<SyncResult>(`/api/admin/sync/sage/odbc/clients?mode=${mode}`);
  }

  syncSageSales(mode: "full" | "delta" | "auto" = "auto") {
    return this.post<SyncResult>(`/api/admin/sync/sage/odbc/sales?mode=${mode}`);
  }

  syncSageFull() {
    return this.post<{ clients: SyncResult; sales: SyncResult }>(
      "/api/admin/sync/sage/odbc/full"
    );
  }

  getSyncLogs() {
    return this.request<SyncLog[]>("/api/admin/sync-logs");
  }

  getLeaderboard() {
    return this.get<LeaderboardEntry[]>("/api/admin/leaderboard");
  }

  getSalesDashboard(period: string = "month", start?: string, end?: string) {
    const params = new URLSearchParams({ period });
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    return this.get<SalesDashboardResponse>(`/api/admin/sales-dashboard?${params.toString()}`);
  }

  getRepCalls(userId: string, start?: string, end?: string) {
    const params = new URLSearchParams();
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    const qs = params.toString() ? `?${params.toString()}` : "";
    return this.get<RepCallEntry[]>(`/api/admin/sales-dashboard/${userId}/calls${qs}`);
  }

  // Products
  getProducts(params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return this.get<ProductListResponse>(`/api/products${qs}`);
  }

  getProduct(articleRef: string) {
    return this.get<ProductDetailResponse>(`/api/products/detail?ref=${encodeURIComponent(articleRef)}`);
  }

  getOrderDetail(sagePieceId: string) {
    return this.get<OrderDetailResponse>(`/api/products/orders/${encodeURIComponent(sagePieceId)}`);
  }

  getProductUpsell(clientId: string) {
    return this.get<UpsellResponse>(`/api/products/upsell/${clientId}`);
  }

  getProductFamilies() {
    return this.get<{ family: string; count: number }[]>("/api/products/families");
  }

  // User management (admin)
  getUsers() {
    return this.get<UserDetail[]>("/api/admin/users");
  }

  getUsersList() {
    return this.get<{ id: string; name: string; role: string }[]>("/api/auth/users/list");
  }

  getSageReps() {
    return this.get<string[]>("/api/auth/sage-reps");
  }

  getUserDetail(userId: string) {
    return this.get<UserDetailFull>(`/api/admin/users/${userId}`);
  }

  createUser(data: CreateUserPayload) {
    return this.post<User>("/api/admin/users", data);
  }

  updateUser(userId: string, data: Partial<CreateUserPayload & { is_active: boolean }>) {
    return this.request<User>(`/api/admin/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  toggleUserActive(userId: string) {
    return this.request<{ id: string; is_active: boolean }>(`/api/admin/users/${userId}`, {
      method: "DELETE",
    });
  }

  getRingoverLines() {
    return this.get<RingoverMember[]>("/api/admin/ringover/lines");
  }

  getSageCollaborateurs() {
    return this.get<SageCollaborateur[]>("/api/admin/sage/collaborateurs");
  }

  // My dashboard (personal stats)
  getMyStats(params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return this.get<MyStats>(`/api/me/stats${qs}`);
  }

  getMyClients(params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return this.get<{ total: number; clients: MyClient[] }>(`/api/me/clients${qs}`);
  }

  getMyTopProducts(params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return this.get<MyTopProduct[]>(`/api/me/top-products${qs}`);
  }
  getMyTopClients(params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return this.get<MyTopClient[]>(`/api/me/top-clients${qs}`);
  }
  getMyMargins(params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return this.get<MyMargins>(`/api/me/margins${qs}`);
  }
}

export const api = new ApiClient();

// Types
export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  ringover_user_id?: string;
  ringover_number?: string;
  ringover_email?: string;
  sage_collaborator_id?: number;
  sage_rep_name?: string;
  phone?: string;
  target_ca_monthly?: number;
  is_active: boolean;
}

export interface Client {
  id: string;
  sage_id: string;
  name: string;
  short_name?: string;
  contact_name?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  country?: string;
  phone?: string;
  phone_e164?: string;
  email?: string;
  sales_rep?: string;
  assigned_user_name?: string;
  tariff_category?: string;
  is_prospect: boolean;
  is_dormant: boolean;
  status?: string;
  total_revenue_all?: number | null;
  total_revenue_12m?: number | null;
  order_count_total?: number | null;
  order_count_12m?: number | null;
  last_order_date?: string | null;
  avg_basket?: number | null;
  avg_margin_percent?: number | null;
  churn_risk_score?: number | null;
  upsell_score?: number | null;
  global_priority_score?: number | null;
}

export interface ClientListResponse {
  total: number;
  offset: number;
  limit: number;
  clients: Client[];
}

export interface CreateProspectRequest {
  name: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  country?: string;
  notes?: string;
  sales_rep?: string;
}

export interface ClientScore {
  last_order_date?: string;
  days_since_last_order?: number;
  order_count_12m: number;
  order_count_total: number;
  avg_frequency_days?: number;
  avg_basket: number;
  total_revenue_12m: number;
  total_revenue_all: number;
  total_margin_12m: number;
  avg_margin_percent: number;
  churn_risk_score: number;
  upsell_score: number;
  global_priority_score: number;
}

export interface SalesLineBrief {
  date: string;
  sage_piece_id: string;
  designation?: string;
  article_ref?: string;
  quantity?: number;
  unit_price?: number;
  amount_ht: number;
  margin_percent?: number;
  margin_value?: number;
  sales_rep?: string;
}

export interface CallQualificationBrief {
  mood?: string;
  outcome?: string;
  tags?: string[];
  notes?: string;
  next_step?: string;
  next_step_date?: string;
  qualified_at?: string;
}

export interface CallAiAnalysisBrief {
  overall_score?: number;
  summary?: string;
  client_sentiment?: string;
  sales_feedback?: string;
  detected_opportunities?: string;
  listening_quality?: number;
}

export interface CallBrief {
  id: string;
  direction: string;
  start_time: string;
  incall_duration: number;
  is_answered: boolean;
  user_name: string | null;
  contact_name: string | null;
  contact_id?: string | null;
  record_url?: string | null;
  qualification?: CallQualificationBrief | null;
  ai_analysis?: CallAiAnalysisBrief | null;
}

export interface PhoneNumber {
  id: string;
  phone_e164: string;
  raw_phone?: string;
  label?: string;
  source: string;
}

export interface TopProduct {
  article_ref: string | null;
  designation: string | null;
  total_qty: number;
  total_ht: number;
  order_count: number;
}

export interface MonthlySales {
  month: string;
  total_ht: number;
  order_count: number;
  margin_avg: number | null;
}

export interface SalesSummary {
  total_orders: number;
  total_ht: number;
  total_margin: number;
  avg_basket: number;
  avg_margin_percent: number;
  first_order_date: string | null;
  last_order_date: string | null;
  distinct_products: number;
}

export interface Contact {
  id: string;
  company_id?: string | null;
  company_name?: string | null;
  name: string;
  first_name?: string | null;
  last_name?: string | null;
  role?: string | null;
  phone?: string | null;
  phone_e164?: string | null;
  email?: string | null;
  is_primary: boolean;
  source: string;
  assigned_user_id?: string | null;
  assigned_user_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ContactCallEntry {
  id: string;
  direction: string;
  is_answered: boolean;
  start_time: string;
  incall_duration: number;
  total_duration: number;
  contact_number?: string;
  user_name?: string;
  record_url?: string;
  qualification?: { mood: string; outcome: string } | null;
  ai_score?: number | null;
}

export interface ClientDetail extends Client {
  website?: string;
  siret?: string;
  vat_number?: string;
  naf_code?: string;
  sage_created_at?: string;
  phone_numbers: PhoneNumber[];
  contacts: Contact[];
  score?: ClientScore;
  sales_summary?: SalesSummary;
  top_products: TopProduct[];
  monthly_sales: MonthlySales[];
  recent_sales: SalesLineBrief[];
  recent_calls: CallBrief[];
  last_qualification_mood?: string;
  last_qualification_outcome?: string;
  last_qualification_at?: string;
  qualification_hot_count?: number;
  qualification_cold_count?: number;
}

export interface AiAnalysisBrief {
  overall_score?: number;
  client_sentiment?: string;
  summary?: string;
  is_voicemail?: boolean;
}

export interface Call {
  id: string;
  ringover_cdr_id: number;
  direction: string;
  is_answered: boolean;
  last_state?: string;
  start_time: string;
  end_time?: string;
  total_duration: number;
  incall_duration: number;
  from_number?: string;
  to_number?: string;
  contact_number?: string;
  contact_e164?: string;
  record_url?: string;
  user_name?: string;
  client_id?: string;
  contact_id?: string;
  contact_name?: string;
  contact_role?: string;
  contact_email?: string;
  contact_phone?: string;
  company_id?: string;
  company_name?: string;
  client_name?: string;
  client_city?: string;
  client_ca_total?: number | null;
  client_last_order?: string | null;
  qualification?: Qualification;
  ai_analysis?: AiAnalysisBrief;
}

export interface Qualification {
  id: string;
  mood?: string;
  tags?: string[];
  outcome?: string;
  next_step?: string;
  next_step_date?: string;
  notes?: string;
  xp_earned: number;
  qualified_at: string;
}

export interface QualifyRequest {
  call_id: string;
  mood?: string;
  tags?: string[];
  outcome?: string;
  next_step?: string;
  next_step_date?: string;
  notes?: string;
}

export interface AiAnalysis {
  id: string;
  transcript?: string;
  summary?: string;
  client_sentiment?: string;
  sales_feedback?: string;
  detected_opportunities?: string;
  next_actions?: string;
  key_topics?: string[];
  politeness_score?: number;
  objection_handling?: number;
  closing_attempt?: number;
  product_knowledge?: number;
  listening_quality?: number;
  overall_score?: number;
  admin_feedback?: string;
  analyzed_at: string;
}

export interface CallStats {
  total_calls: number;
  total_answered: number;
  total_missed: number;
  total_no_answer: number;
  avg_duration_seconds: number;
  total_duration_seconds: number;
  outbound_calls: number;
  inbound_calls: number;
  qualified_calls: number;
  today_calls: number;
  today_answered: number;
}

export interface PlaylistContactInfo {
  id: string;
  name: string;
  role?: string | null;
  phone?: string | null;
  phone_e164?: string | null;
  email?: string | null;
  is_primary: boolean;
}

export interface PlaylistItem extends Client {
  playlist_id: string;
  priority: number;
  reason: string;
  reason_detail?: string;
  score: number;
  status: string;
  client_status?: string;
  primary_contact?: PlaylistContactInfo | null;
}

export interface UpsellProductItem {
  article_ref: string;
  designation: string;
  total_qty: number;
  total_ht: number;
  order_count: number;
  last_order_date?: string;
}

export interface PlaylistInsight {
  client_name: string;
  client_city?: string;
  reason: string;
  reason_detail?: string;
  score_churn: number;
  score_upsell: number;
  days_since_last_order?: number;
  ca_12m: number;
  ca_total: number;
  avg_basket: number;
  top_products: UpsellProductItem[];
  ai_suggestion?: string;
}

export interface ClientAssignment {
  user_id: string | null;
  user_name: string;
  sage_rep_name: string | null;
  client_count: number;
}

export interface OrphanGroup {
  sage_rep_name: string;
  client_count: number;
}

export interface ClientListItem {
  id: string;
  name: string;
  sage_id: string;
  city: string | null;
  sales_rep: string | null;
  phone: string | null;
}

export interface PlaylistConfigPayload {
  is_active: boolean;
  total_size: number;
  pct_callback: number;
  pct_dormant: number;
  pct_churn_risk: number;
  pct_upsell: number;
  pct_prospect: number;
  dormant_min_days: number;
  churn_min_score: number;
  upsell_min_score: number;
  client_scope: string;
  sage_rep_filter: string | null;
}

export interface PlaylistConfigItem {
  user_id: string;
  user_name: string;
  role: string;
  has_config: boolean;
  config: PlaylistConfigPayload;
  today_playlist: number;
  today_done: number;
}

export interface Reminder {
  call_id: string;
  client_id?: string;
  client_name?: string;
  next_step?: string;
  next_step_date: string;
  outcome?: string;
  contact_number?: string;
  contact_e164?: string;
  user_name?: string;
  qualified_at: string;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  name: string;
  total_calls: number;
  answered_calls: number;
  qualified_calls: number;
  total_talk_time: number;
  avg_ai_score: number;
  avg_politeness: number;
  avg_closing: number;
  xp_effort: number;
}

export interface AdminDashboard {
  total_clients: number;
  today: {
    calls: number;
    answered: number;
    qualified: number;
  };
  churn_risk_clients: number;
  presences: unknown[];
}

export interface CommercialStats {
  totals: {
    total_lines: number;
    total_ht: number;
    total_margin: number;
    unique_clients: number;
    unique_products: number;
  };
  top_clients: {
    id: string;
    name: string;
    sage_id: string;
    city: string | null;
    sales_rep: string | null;
    order_count: number;
    total_ht: number;
    avg_margin: number;
  }[];
  monthly: {
    month: string;
    total_ht: number;
    order_count: number;
    unique_clients: number;
  }[];
}

export interface SyncResult {
  sync_type: string;
  found: number;
  synced: number;
  errors: number;
}

export interface SyncLog {
  id: string;
  source: string;
  sync_type: string;
  status: string;
  records_found: number;
  records_created: number;
  records_errors: number;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
}

export interface ProductListItem {
  id: string;
  article_ref: string;
  designation?: string;
  family?: string;
  sub_family?: string;
  unit?: string;
  sale_price?: number;
  cost_price?: number;
  weight?: number;
  is_active: boolean;
  total_ca?: number;
  total_qty?: number;
  nb_clients?: number;
  nb_orders?: number;
  last_sale_date?: string;
  avg_margin_percent?: number;
  stock_quantity?: number;
  stock_reserved?: number;
  stock_ordered?: number;
  stock_preparing?: number;
  stock_available?: number;
  stock_forecast?: number;
  stock_min?: number;
  stock_max?: number;
  stock_value?: number;
  stock_synced_at?: string;
}

export interface ProductListResponse {
  total: number;
  offset: number;
  limit: number;
  products: ProductListItem[];
}

export interface StockDepotItem {
  depot_id: number;
  depot_name?: string;
  stock_quantity?: number;
  stock_reserved?: number;
  stock_ordered?: number;
  stock_preparing?: number;
  stock_available?: number;
  stock_min?: number;
  stock_max?: number;
  stock_value?: number;
  synced_at?: string;
}

export interface ProductDetailResponse extends ProductListItem {
  top_clients: {
    client_sage_id: string;
    client_name: string;
    client_id?: string;
    ca: number;
    qty: number;
    orders: number;
    last_date?: string;
  }[];
  monthly_sales: {
    month: string;
    ca: number;
    qty: number;
    clients: number;
  }[];
  co_purchased: {
    article_ref: string;
    designation: string;
    co_orders: number;
    co_clients: number;
    co_ca: number;
  }[];
  stock_depots: StockDepotItem[];
}

export interface OrderDetailResponse {
  sage_piece_id: string;
  date: string;
  client_sage_id: string;
  client_name?: string;
  client_id?: string;
  total_ht: number;
  lines: {
    article_ref?: string;
    designation?: string;
    quantity?: number;
    unit_price?: number;
    amount_ht: number;
    margin_percent?: number;
    margin_value?: number;
    net_weight?: number;
  }[];
}

export interface UpsellResponse {
  client_products_count: number;
  similar_clients_count: number;
  message?: string;
  suggestions: {
    article_ref: string;
    designation?: string;
    bought_by_similar: number;
    affinity_pct: number;
    total_ca: number;
    avg_price?: number;
    nb_orders: number;
  }[];
}

// User management
export interface UserDetail extends User {
  calls_today: number;
  total_calls: number;
  total_ca: number;
  total_orders: number;
  last_call_at?: string;
}

export interface UserDetailFull extends User {
  created_at: string;
  call_stats: {
    total: number;
    answered: number;
    total_talk_time: number;
    avg_ai_score: number;
  };
  sales_stats: {
    total_ca: number;
    total_orders: number;
    total_clients: number;
  };
  assigned_clients: number;
}

export interface CreateUserPayload {
  email: string;
  password: string;
  name: string;
  role?: string;
  ringover_user_id?: string;
  ringover_number?: string;
  ringover_email?: string;
  sage_collaborator_id?: number;
  sage_rep_name?: string;
  phone?: string;
  target_ca_monthly?: number;
}

export interface RingoverMember {
  user_id: string;
  name: string;
  email: string;
  numbers: string[];
  is_active: boolean;
}

export interface SageCollaborateur {
  CO_No: number;
  CO_Nom: string;
  CO_Prenom: string;
  CO_Telephone?: string;
  CO_EMail?: string;
}

// Sales Dashboard (admin)
export interface SalesDashboardResponse {
  period: { start: string; end: string; label: string };
  team: {
    calls_total: number; calls_answered: number; calls_qualified: number;
    calls_outbound: number; calls_inbound: number;
    calls_outbound_answered: number; calls_inbound_answered: number;
    total_talk_time: number; total_ca: number; total_orders: number;
    total_margin: number; answer_rate: number; qualification_rate: number;
    avg_ai_score: number;
    playlist_total: number; playlist_completed: number; playlist_rate: number;
  };
  reps: SalesRepStats[];
}

export interface SalesRepStats {
  user_id: string; name: string; role: string;
  calls_total: number; calls_answered: number; calls_qualified: number;
  calls_outbound: number; calls_inbound: number;
  calls_outbound_answered: number; calls_inbound_answered: number;
  answer_rate: number; qualification_rate: number;
  total_talk_time: number; avg_call_duration: number;
  total_ca: number; total_orders: number; total_margin: number; margin_rate: number;
  target_ca: number | null; target_progress: number | null;
  ai_scores: { overall: number; politeness: number; objection: number; closing: number; product: number; listening: number };
  analyzed_calls: number;
  moods: { hot: number; neutral: number; cold: number };
  outcomes: Record<string, number>;
  portfolio: { total: number; active: number; at_risk: number; dormant: number; prospects: number };
  playlist_total: number; playlist_completed: number; playlist_rate: number;
}

export interface RepCallEntry {
  id: string; start_time: string; direction: string;
  is_answered: boolean; total_duration: number; incall_duration: number;
  contact_name: string | null; contact_number: string | null;
  client_id: string | null; record_url: string | null;
  qualification: {
    mood: string; outcome: string; tags: string[];
    notes: string; next_step: string | null; next_step_date: string | null;
  } | null;
  ai_scores: {
    overall: number; politeness: number; objection: number;
    closing: number; product: number; listening: number;
    summary: string | null; feedback: string | null;
    sentiment: string | null; opportunities: string | null;
  } | null;
}

// My dashboard
export interface MyStats {
  period: { from: string; to: string };
  calls: {
    total: number;
    answered: number;
    outbound: number;
    total_duration: number;
    missed: number;
    qualified: number;
    avg_duration: number;
    answer_rate: number;
  };
  sales: {
    ca: number;
    orders: number;
    clients: number;
    avg_basket: number;
    avg_margin: number;
    ca_evolution_pct: number;
    prev_ca: number;
  };
  ai_score: number | null;
  target: {
    monthly: number | null;
    progress_pct: number | null;
  };
  monthly_ca: { month: string; ca: number; orders: number }[];
}

export interface MyClient {
  id: string;
  name: string;
  city?: string;
  sage_id: string;
  phone?: string;
  total_ca: number;
  last_order_date?: string;
  churn_risk: number;
  order_count: number;
}

export interface MyTopProduct {
  article_ref: string;
  designation?: string;
  total_ca: number;
  total_qty: number;
  nb_clients: number;
  nb_orders: number;
}

export interface MyTopClient {
  client_id: string;
  client_name: string;
  total_ca: number;
  total_margin: number;
  nb_orders: number;
  nb_products: number;
}

export interface UpdateClientPayload {
  name?: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  country?: string;
  website?: string;
  siret?: string;
  vat_number?: string;
  naf_code?: string;
  tariff_category?: string;
}

export interface EnrichSuggestion {
  name?: string | null;
  contact_name?: string | null;
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
  website?: string | null;
  siret?: string | null;
  email?: string | null;
  naf_code?: string | null;
  phone?: string | null;
  confidence?: string | null;
}

export interface ClientAuditLog {
  id: string;
  client_id: string;
  user_id?: string | null;
  user_name: string;
  action: string;
  field_name?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  details?: string | null;
  created_at: string;
}

export interface MyMargins {
  total_ca: number;
  total_margin_gross: number;
  total_margin_net: number;
  margin_gross_pct: number;
  margin_net_pct: number;
  total_weight_kg: number;
}

export interface NetMarginUserStats {
  user_id: string | null;
  user_name: string;
  total_ca: number;
  total_margin_gross: number;
  total_margin_net: number;
  total_weight_kg: number;
}

export interface MarginRule {
  id: string;
  name: string;
  description?: string | null;
  calc_type: string;
  value: number;
  applies_to: string;
  effective_from: string;
  effective_to?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface UserObjective {
  id: string;
  user_id: string;
  metric: string;
  metric_label?: string;
  period_type: string;
  target_value: number;
  start_date?: string | null;
  end_date?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ObjectiveProgress {
  id: string;
  metric: string;
  metric_label: string;
  period_type: string;
  period_start: string;
  period_end: string;
  target_value: number;
  current_value: number;
  progress_pct: number;
}

export interface ChallengeEntry {
  id: string;
  name: string;
  description?: string | null;
  article_ref?: string | null;
  article_name?: string | null;
  metric: string;
  target_value?: number | null;
  reward?: string | null;
  start_date: string;
  end_date: string;
  status: string;
  created_by: string;
  creator_name?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ChallengeRankingEntry {
  user_id: string;
  user_name: string;
  current_value: number;
  rank: number;
  progress_pct?: number | null;
}
