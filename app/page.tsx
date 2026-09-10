"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight, Check, ChevronDown, Copy, ExternalLink, Filter, Heart,
  LayoutGrid, Link2, List, Loader2, LogOut, MapPin, Menu, Minus, Plus,
  Search, ShieldCheck, Sparkles, Store, Tag, Trash2, X,
} from "lucide-react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import CardScanner, { type ScannedCard } from "@/app/components/card-scanner";

type View = "market" | "wanted" | "sell" | "want" | "profile";
type Card = { id: string; name: string; riftbound_id: string; rarity: string; type: string; setLabel: string; setId: string; imageUrl?: string; domains: string[]; tcgplayer_id?: string };
type DeliveryLocation = { id: string; name: string; address: string | null; city: string | null; state: string | null; available_days: number[] };
type Listing = Card & { listingId: string; sellerId: string; price: number; quantity: number; condition: string; status?: string; seller: string; sellerLocation: string; sellerPhone?: string; delivery: string; featured?: boolean };
type MarketplaceCard = Listing & { offerCount: number; totalQuantity: number };
type DraftListing = { card: Card; price: string; quantity: number; condition: string; language: string };
type WantItem = { id: string; card_id: string; quantity: number; condition: string | null; card?: Card };
type WantedEntry = WantItem & { card: Card; username: string; displayName: string; city: string; state: string };
type WantedGroup = { card: Card; entries: WantedEntry[]; totalQuantity: number };
type Profile = { id: string; username: string; display_name: string; city: string; state: string; whatsapp: string; reputation: number; completed_trades: number };
type LocationDraft = { name: string; address: string; city: string; state: string; available_days: number[] };

const weekDays = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const conditionLabels: Record<string, string> = { near_mint: "Near mint", excellent: "Excelente", good: "Boa", played: "Jogada", damaged: "Danificada" };
const emptyLocation: LocationDraft = { name: "", address: "", city: "", state: "", available_days: [6] };
const promoCards = [
  "/assets/cards/jinx-loose-cannon.png",
  "/assets/cards/akali-rogue-assassin.png",
  "/assets/cards/master-yi-wuju-master.png",
  "/assets/cards/ahri-inquisitive.png",
  "/assets/cards/baron-nashor.png",
];

const formatBRL = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const priceToCents = (value: string) => {
  const normalized = value.trim().replace(/\s/g, "").replace(/^R\$/i, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
};
const one = (value: any) => Array.isArray(value) ? value[0] : value;
const apiCardToCard = (card: any): Card => ({
  id: card.id,
  name: card.name,
  riftbound_id: card.riftbound_id,
  rarity: card.rarity ?? card.classification?.rarity ?? "Unknown",
  type: card.type ?? card.classification?.type ?? "Card",
  setLabel: card.setLabel ?? card.set?.label ?? card.set_label ?? "Unknown set",
  setId: card.setId ?? card.set?.set_id ?? card.set_id ?? "",
  imageUrl: card.imageUrl ?? card.media?.image_url ?? card.image_url,
  domains: card.domains ?? card.classification?.domain ?? [],
  tcgplayer_id: card.tcgplayer_id,
});
const normalizePhone = (value?: string) => {
  let digits = (value ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return "";
  if (!digits.startsWith("55")) digits = `55${digits}`;
  return digits;
};

export default function Home() {
  const supabase = getSupabaseBrowserClient();
  const [activeView, setActiveView] = useState<View>("market");
  const [showResults, setShowResults] = useState(false);
  const [heroQuery, setHeroQuery] = useState("");
  const [marketQuery, setMarketQuery] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [wantQuery, setWantQuery] = useState("");
  const [setFilter, setSetFilter] = useState("Todos os sets");
  const [rarityFilter, setRarityFilter] = useState("Todas as raridades");
  const [sort, setSort] = useState("Menor preço");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [listings, setListings] = useState<Listing[]>([]);
  const [ownListings, setOwnListings] = useState<Listing[]>([]);
  const [wantedEntries, setWantedEntries] = useState<WantedEntry[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [drafts, setDrafts] = useState<DraftListing[]>([]);
  const [wants, setWants] = useState<WantItem[]>([]);
  const [selectedWantCard, setSelectedWantCard] = useState<Card | null>(null);
  const [locations, setLocations] = useState<DeliveryLocation[]>([]);
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileForm, setProfileForm] = useState({ display_name: "", username: "", city: "", state: "", whatsapp: "" });
  const [locationDraft, setLocationDraft] = useState<LocationDraft>(emptyLocation);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [showLocationForm, setShowLocationForm] = useState(false);
  const [marketLoading, setMarketLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [loading, setLoading] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [toast, setToast] = useState("");

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  };

  const mapListing = (row: any, phones: Map<string, string>, deliveries: Map<string, string>): Listing => ({
    ...apiCardToCard(row),
    id: row.card_id,
    listingId: row.id,
    sellerId: row.seller_id,
    price: row.price_cents / 100,
    quantity: row.quantity,
    condition: row.condition,
    status: row.status,
    seller: row.username ?? row.display_name ?? "Jogador",
    sellerLocation: [row.city, row.state].filter(Boolean).join(", "),
    sellerPhone: phones.get(row.seller_id),
    delivery: deliveries.get(row.id) ?? "Combine com o vendedor",
  });

  const loadMarketplace = async () => {
    if (!supabase) { setMarketLoading(false); return; }
    setMarketLoading(true);
    const { data: rows, error } = await supabase.from("marketplace_listings").select("*").order("price_cents", { ascending: true }).limit(200);
    if (error) { setMarketLoading(false); notify(`Não foi possível carregar as ofertas: ${error.message}`); return; }
    const sellerIds = [...new Set((rows ?? []).map((row: any) => row.seller_id))];
    const listingIds = (rows ?? []).map((row: any) => row.id);
    const [profilesResponse, linksResponse] = await Promise.all([
      sellerIds.length ? supabase.from("profiles").select("id, whatsapp").in("id", sellerIds) : Promise.resolve({ data: [] as any[] }),
      listingIds.length ? supabase.from("listing_delivery_locations").select("listing_id, delivery_locations(name, city, state, available_days)").in("listing_id", listingIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const phones = new Map<string, string>((profilesResponse.data ?? []).map((row: any) => [String(row.id), String(row.whatsapp ?? "")] as [string, string]));
    const deliveryNames = new Map<string, string[]>();
    for (const link of linksResponse.data ?? []) {
      const location = one((link as any).delivery_locations);
      if (!location) continue;
      const label = `${location.name}${location.city ? ` · ${location.city}${location.state ? `/${location.state}` : ""}` : ""}`;
      deliveryNames.set((link as any).listing_id, [...(deliveryNames.get((link as any).listing_id) ?? []), label]);
    }
    const deliveries = new Map([...deliveryNames.entries()].map(([id, names]) => [id, names.join(" ou ")]));
    const mapped = (rows ?? []).map((row: any) => mapListing(row, phones, deliveries));
    const cheapest = new Set<string>();
    for (const item of mapped) if (!cheapest.has(item.id)) { item.featured = true; cheapest.add(item.id); }
    setListings(mapped);
    setMarketLoading(false);
  };

  const loadWantedMarket = async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("want_items").select("id, card_id, quantity, condition, cards(*), profiles(username, display_name, city, state)").order("created_at", { ascending: false }).limit(1000);
    if (error) { notify(`Não foi possível carregar as cartas procuradas: ${error.message}`); return; }
    setWantedEntries((data ?? []).map((row: any) => {
      const profileRow = one(row.profiles) ?? {};
      return { id: row.id, card_id: row.card_id, quantity: row.quantity, condition: row.condition, card: apiCardToCard(one(row.cards)), username: profileRow.username ?? "Jogador", displayName: profileRow.display_name ?? profileRow.username ?? "Jogador", city: profileRow.city ?? "", state: profileRow.state ?? "" };
    }));
  };

  const loadUserData = async (currentUser: User) => {
    if (!supabase) return;
    const [profileResponse, wantsResponse, locationsResponse, ownResponse] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", currentUser.id).maybeSingle(),
      supabase.from("want_items").select("id, card_id, quantity, condition, cards(*)").eq("profile_id", currentUser.id).order("created_at", { ascending: false }),
      supabase.from("delivery_locations").select("*").eq("profile_id", currentUser.id).eq("is_active", true).order("created_at", { ascending: true }),
      supabase.from("listings").select("id, seller_id, price_cents, quantity, condition, status, cards(*)").eq("seller_id", currentUser.id).order("created_at", { ascending: false }).limit(1000),
    ]);
    if (profileResponse.data) {
      const next = profileResponse.data as Profile;
      setProfile(next);
      setProfileForm({ display_name: next.display_name ?? "", username: next.username ?? "", city: next.city ?? "", state: next.state ?? "", whatsapp: next.whatsapp ?? "" });
    }
    setWants((wantsResponse.data ?? []).map((row: any) => ({ ...row, card: row.cards ? apiCardToCard(one(row.cards)) : undefined })));
    setLocations((locationsResponse.data ?? []) as DeliveryLocation[]);
    setOwnListings((ownResponse.data ?? []).map((row: any) => {
      const card = apiCardToCard(one(row.cards));
      return { ...card, listingId: row.id, sellerId: currentUser.id, price: row.price_cents / 100, quantity: row.quantity, condition: row.condition, status: row.status, seller: profileResponse.data?.username ?? "Você", sellerLocation: "", delivery: "" };
    }));
  };

  useEffect(() => {
    void loadMarketplace();
    void loadWantedMarket();
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data }: { data: { user: User | null } }) => { setUser(data.user); if (data.user) void loadUserData(data.user); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      setUser(session?.user ?? null);
      if (session?.user) void loadUserData(session.user);
      else { setProfile(null); setWants([]); setLocations([]); setOwnListings([]); }
    });
    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) return;
    void supabase.auth.exchangeCodeForSession(code).finally(() => window.history.replaceState({}, document.title, window.location.pathname));
  }, [supabase]);

  useEffect(() => {
    if (activeView !== "sell" && activeView !== "want") return;
    const query = (activeView === "sell" ? catalogQuery : wantQuery).trim();
    if (query.length < 2) { setCards([]); setCatalogError(""); setCatalogLoading(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setCatalogLoading(true);
      setCatalogError("");
      try {
        const response = await fetch(`/api/cards?query=${encodeURIComponent(query)}&size=24`, { signal: controller.signal });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "Catálogo indisponível");
        setCards((payload.cards ?? []).map(apiCardToCard));
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setCards([]);
          setCatalogError((error as Error).message || "O catálogo não respondeu.");
        }
      } finally { if (!controller.signal.aborted) setCatalogLoading(false); }
    }, 550);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [activeView, catalogQuery, wantQuery, catalogRetry]);

  const marketplaceCards = useMemo(() => {
    const text = marketQuery.trim().toLocaleLowerCase("pt-BR");
    const filtered = [...listings]
      .filter((item) => !text || `${item.name} ${item.riftbound_id} ${item.setLabel} ${item.seller}`.toLocaleLowerCase("pt-BR").includes(text))
      .filter((item) => setFilter === "Todos os sets" || item.setLabel === setFilter)
      .filter((item) => rarityFilter === "Todas as raridades" || item.rarity === rarityFilter);
    const groups = new Map<string, MarketplaceCard>();
    for (const item of filtered) {
      const existing = groups.get(item.id);
      if (!existing) groups.set(item.id, { ...item, offerCount: 1, totalQuantity: item.quantity });
      else {
        existing.offerCount += 1;
        existing.totalQuantity += item.quantity;
        if (item.price < existing.price) groups.set(item.id, { ...item, offerCount: existing.offerCount, totalQuantity: existing.totalQuantity });
      }
    }
    return [...groups.values()].sort((a, b) => sort === "Maior preço" ? b.price - a.price : sort === "Nome A-Z" ? a.name.localeCompare(b.name) : a.price - b.price);
  }, [listings, marketQuery, rarityFilter, setFilter, sort]);

  const wantedGroups = useMemo(() => {
    const groups = new Map<string, WantedGroup>();
    for (const entry of wantedEntries) {
      const current = groups.get(entry.card_id);
      if (current) { current.entries.push(entry); current.totalQuantity += entry.quantity; }
      else groups.set(entry.card_id, { card: entry.card, entries: [entry], totalQuantity: entry.quantity });
    }
    return [...groups.values()].sort((a, b) => b.entries.length - a.entries.length || a.card.name.localeCompare(b.card.name));
  }, [wantedEntries]);

  const demandByCard = useMemo(() => new Map(wantedGroups.map((group) => [group.card.id, group.entries.length])), [wantedGroups]);

  const requireAuth = () => {
    if (user) return true;
    setAuthOpen(true);
    notify("Entre ou crie sua conta para continuar");
    return false;
  };

  const cacheCards = async (items: Card[]) => {
    if (!supabase || !user) return false;
    const rows = items.map((card) => ({ id: card.id, name: card.name, riftbound_id: card.riftbound_id, tcgplayer_id: card.tcgplayer_id ?? null, set_id: card.setId, set_label: card.setLabel, rarity: card.rarity, card_type: card.type, domains: card.domains, image_url: card.imageUrl ?? null, payload: card }));
    const { error } = await supabase.from("cards").upsert(rows, { onConflict: "id", ignoreDuplicates: true });
    if (error) { notify(`Não foi possível salvar a carta: ${error.message}`); return false; }
    return true;
  };

  const submitHeroSearch = (event: FormEvent) => {
    event.preventDefault();
    setMarketQuery(heroQuery.trim());
    setShowResults(true);
  };

  const addDraft = (card: Card) => {
    if (!requireAuth()) return;
    setDrafts((current) => current.some((item) => item.card.id === card.id)
      ? current.map((item) => item.card.id === card.id ? { ...item, quantity: item.quantity + 1 } : item)
      : [...current, { card, price: "0,00", quantity: 1, condition: "near_mint", language: "pt-BR" }]);
  };

  const publishDrafts = async () => {
    if (!requireAuth() || !supabase || !user || !drafts.length) return;
    const invalid = drafts.find((item) => priceToCents(item.price) <= 0 || item.quantity < 1);
    if (invalid) { notify(`Informe um preço válido para ${invalid.card.name}`); return; }
    setLoading(true);
    if (!(await cacheCards(drafts.map((item) => item.card)))) { setLoading(false); return; }
    const rows = drafts.map((item) => ({ seller_id: user.id, card_id: item.card.id, price_cents: priceToCents(item.price), quantity: item.quantity, condition: item.condition, language: item.language, status: "active" }));
    const { data, error } = await supabase.from("listings").insert(rows).select("id");
    if (error) { setLoading(false); notify(`Não foi possível publicar: ${error.message}`); return; }
    if (selectedLocationIds.length && data?.length) {
      const links = data.flatMap((listing: { id: string }) => selectedLocationIds.map((locationId) => ({ listing_id: listing.id, delivery_location_id: locationId })));
      const { error: linkError } = await supabase.from("listing_delivery_locations").insert(links);
      if (linkError) notify("Anúncios publicados, mas revise os pontos de entrega.");
    }
    setDrafts([]);
    setSelectedLocationIds([]);
    await Promise.all([loadMarketplace(), loadUserData(user)]);
    setLoading(false);
    setMarketQuery("");
    setShowResults(true);
    setActiveView("market");
    notify(`${rows.length} anúncio(s) publicado(s)`);
  };

  const saveWant = async () => {
    if (!requireAuth() || !supabase || !user || !selectedWantCard) return;
    setLoading(true);
    if (await cacheCards([selectedWantCard])) {
      const { error } = await supabase.from("want_items").upsert({ profile_id: user.id, card_id: selectedWantCard.id, quantity: 1, condition: null }, { onConflict: "profile_id,card_id" });
      if (error) notify(`Não foi possível atualizar sua want list: ${error.message}`);
      else { setSelectedWantCard(null); setWantQuery(""); await Promise.all([loadUserData(user), loadWantedMarket()]); notify("Carta adicionada à want list"); }
    }
    setLoading(false);
  };

  const changeWantQuantity = async (item: WantItem, quantity: number) => {
    if (!supabase || !user) return;
    if (quantity < 1) return;
    const { error } = await supabase.from("want_items").update({ quantity }).eq("id", item.id).eq("profile_id", user.id);
    if (error) notify(`Não foi possível alterar a quantidade: ${error.message}`);
    else { setWants((current) => current.map((want) => want.id === item.id ? { ...want, quantity } : want)); await loadWantedMarket(); }
  };

  const removeWant = async (item: WantItem) => {
    if (!supabase || !user) return;
    const { error } = await supabase.from("want_items").delete().eq("id", item.id).eq("profile_id", user.id);
    if (error) notify(`Não foi possível remover a carta: ${error.message}`);
    else { setWants((current) => current.filter((want) => want.id !== item.id)); await loadWantedMarket(); notify("Carta removida"); }
  };

  const saveProfile = async () => {
    if (!requireAuth() || !supabase || !user) return;
    if (profileForm.username.length < 3) { notify("O usuário precisa ter pelo menos 3 caracteres"); return; }
    if (profileForm.whatsapp && profileForm.whatsapp.replace(/\D/g, "").length < 10) { notify("Informe DDD e número no WhatsApp"); return; }
    setLoading(true);
    const { data, error } = await supabase.from("profiles").update({ ...profileForm, state: profileForm.state.toUpperCase() }).eq("id", user.id).select().single();
    setLoading(false);
    if (error) notify(error.code === "23505" ? "Este nome de usuário já está em uso" : `Não foi possível salvar o perfil: ${error.message}`);
    else { setProfile(data as Profile); await loadMarketplace(); notify("Perfil salvo"); }
  };

  const saveLocation = async () => {
    if (!requireAuth() || !supabase || !user) return;
    if (!locationDraft.name.trim() || !locationDraft.available_days.length) { notify("Informe o local e pelo menos um dia"); return; }
    setLoading(true);
    const payload = { name: locationDraft.name.trim(), address: locationDraft.address.trim() || null, city: locationDraft.city.trim() || null, state: locationDraft.state.trim().toUpperCase() || null, available_days: [...locationDraft.available_days].sort(), is_active: true };
    const request = editingLocationId
      ? supabase.from("delivery_locations").update(payload).eq("id", editingLocationId).eq("profile_id", user.id)
      : supabase.from("delivery_locations").insert({ profile_id: user.id, ...payload });
    const { error } = await request;
    setLoading(false);
    if (error) notify(`Não foi possível salvar o local: ${error.message}`);
    else { setLocationDraft(emptyLocation); setEditingLocationId(null); setShowLocationForm(false); await loadUserData(user); notify("Ponto de entrega salvo"); }
  };

  const editLocation = (location: DeliveryLocation) => {
    setEditingLocationId(location.id);
    setLocationDraft({ name: location.name, address: location.address ?? "", city: location.city ?? "", state: location.state ?? "", available_days: location.available_days?.length ? location.available_days : [6] });
    setShowLocationForm(true);
  };

  const removeLocation = async (location: DeliveryLocation) => {
    if (!supabase || !user) return;
    const { error } = await supabase.from("delivery_locations").update({ is_active: false }).eq("id", location.id).eq("profile_id", user.id);
    if (error) notify(`Não foi possível remover o local: ${error.message}`);
    else { await loadUserData(user); notify("Ponto de entrega removido"); }
  };

  const updateListing = async (listingId: string, patch: { price_cents?: number; quantity?: number; condition?: string; status?: string }) => {
    if (!supabase || !user) return false;
    const { error } = await supabase.from("listings").update(patch).eq("id", listingId).eq("seller_id", user.id);
    if (error) { notify(`Não foi possível atualizar o anúncio: ${error.message}`); return false; }
    await Promise.all([loadUserData(user), loadMarketplace()]);
    notify("Anúncio atualizado");
    return true;
  };

  const shareList = async () => {
    if (!profile) { requireAuth(); return; }
    const url = `${window.location.origin}/u/${profile.username}`;
    try { await navigator.clipboard.writeText(url); notify("Link público copiado"); }
    catch { notify(url); }
  };

  const submitAuth = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    if (!authEmail.trim() || authPassword.length < 6) { notify("Informe um e-mail e uma senha com pelo menos 6 caracteres"); return; }
    setLoading(true);
    const base = authEmail.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 16) || "player";
    const result = authMode === "login"
      ? await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword })
      : await supabase.auth.signUp({ email: authEmail.trim(), password: authPassword, options: { emailRedirectTo: `${window.location.origin}/auth/callback`, data: { username: `${base}_${Date.now().toString().slice(-5)}`, display_name: authEmail.split("@")[0] } } });
    setLoading(false);
    if (result.error) notify(result.error.message);
    else { setAuthOpen(false); notify(authMode === "login" ? "Login realizado" : "Confira seu e-mail para confirmar o cadastro"); }
  };

  const logout = async () => {
    await supabase?.auth.signOut();
    setActiveView("market");
    setShowResults(false);
    setHeroQuery("");
  };

  const goHome = () => { setActiveView("market"); setShowResults(false); setHeroQuery(""); setMarketQuery(""); };
  const explore = () => { setActiveView("market"); setShowResults(true); setShowMobileNav(false); };

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <header className="topbar">
        <button className="brand" onClick={goHome} aria-label="Página inicial"><span className="brand-mark">R</span><span><strong>RIFT</strong><em>FOUND</em></span></button>
        <nav className={`main-nav ${showMobileNav ? "is-open" : ""}`}>
          <button className={activeView === "market" && showResults ? "active" : ""} onClick={explore}><LayoutGrid size={16} /> Explorar</button>
          <button className={activeView === "wanted" ? "active" : ""} onClick={() => { setActiveView("wanted"); setShowMobileNav(false); }}><Heart size={16} /> Procurados</button>
          {user && <button className={activeView === "sell" ? "active" : ""} onClick={() => { setActiveView("sell"); setShowMobileNav(false); }}><Tag size={16} /> Vender cartas</button>}
          {user && <button className={activeView === "want" ? "active" : ""} onClick={() => { setActiveView("want"); setShowMobileNav(false); }}><Heart size={16} /> Minha want list</button>}
        </nav>
        <div className="top-actions">
          {user ? <button className="user-chip" onClick={() => setActiveView("profile")}><span className="avatar">{(profile?.display_name ?? "PL").slice(0, 2).toUpperCase()}</span><span className="user-copy"><b>{profile?.username ?? "Jogador"}</b><small>{[profile?.city, profile?.state].filter(Boolean).join(", ") || "Perfil"}</small></span><ChevronDown size={15} /></button> : <button className="signin-button" onClick={() => setAuthOpen(true)}>Entrar <ArrowUpRight size={14} /></button>}
          <button className="menu-button" onClick={() => setShowMobileNav((open) => !open)} aria-label="Abrir menu"><Menu size={21} /></button>
        </div>
      </header>

      {activeView === "market" && !showResults && <Hero query={heroQuery} setQuery={setHeroQuery} submit={submitHeroSearch} total={listings.length} />}
      {activeView === "market" && showResults && <MarketSection listings={marketplaceCards} allListings={listings} loading={marketLoading} query={marketQuery} setQuery={setMarketQuery} setFilter={setFilter} onSetFilter={setSetFilter} rarityFilter={rarityFilter} setRarityFilter={setRarityFilter} sort={sort} setSort={setSort} viewMode={viewMode} setViewMode={setViewMode} onSell={() => user ? setActiveView("sell") : setAuthOpen(true)} onRefresh={loadMarketplace} canSell={!!user} />}
      {activeView === "wanted" && <WantedSection groups={wantedGroups} />}
      {activeView === "sell" && <SellSection query={catalogQuery} setQuery={setCatalogQuery} cards={cards} catalogLoading={catalogLoading} catalogError={catalogError} retryCatalog={() => setCatalogRetry((value) => value + 1)} drafts={drafts} setDrafts={setDrafts} addDraft={addDraft} publish={publishDrafts} loading={loading} share={shareList} locations={locations} selectedLocationIds={selectedLocationIds} setSelectedLocationIds={setSelectedLocationIds} ownListings={ownListings} updateListing={updateListing} demandByCard={demandByCard} />}
      {activeView === "want" && <WantSection query={wantQuery} setQuery={setWantQuery} cards={cards} catalogLoading={catalogLoading} catalogError={catalogError} retryCatalog={() => setCatalogRetry((value) => value + 1)} selected={selectedWantCard} setSelected={setSelectedWantCard} save={saveWant} wants={wants} remove={removeWant} changeQuantity={changeWantQuantity} loading={loading} share={shareList} />}
      {activeView === "profile" && <ProfileSection form={profileForm} setForm={setProfileForm} save={saveProfile} locations={locations} locationDraft={locationDraft} setLocationDraft={setLocationDraft} showLocationForm={showLocationForm} setShowLocationForm={setShowLocationForm} editingLocationId={editingLocationId} setEditingLocationId={setEditingLocationId} saveLocation={saveLocation} editLocation={editLocation} removeLocation={removeLocation} logout={logout} loading={loading} />}

      <Footer />
      {toast && <div className="toast"><ShieldCheck size={17} /> {toast}</div>}
      {authOpen && <AuthModal mode={authMode} setMode={setAuthMode} email={authEmail} setEmail={setAuthEmail} password={authPassword} setPassword={setAuthPassword} submit={submitAuth} close={() => setAuthOpen(false)} loading={loading} />}
    </main>
  );
}

function Hero({ query, setQuery, submit, total }: any) {
  return <section className="hero">
    <div className="hero-copy">
      <div className="eyebrow"><Sparkles size={15} /> A comunidade de Riftbound</div>
      <h1>Encontre sua próxima <span>jogada.</span></h1>
      <p>Compre, venda e troque cartas com quem joga perto de você.</p>
      <form className="hero-search hero-search-form" onSubmit={submit}>
        <Search size={20} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Busque entre as cartas anunciadas..." autoFocus />
        <button type="submit">Buscar <ArrowUpRight size={15} /></button>
      </form>
      <div className="hero-meta"><span><ShieldCheck size={15} /> Negociações entre jogadores</span><span><MapPin size={15} /> Encontre por local</span></div>
    </div>
    <div className="hero-stack promo-stack" aria-hidden="true">
      <div className="glow-ring" />
      {promoCards.map((src, index) => <img key={src} className={`promo-card promo-card-${index + 1}`} src={src} alt="" />)}
      <div className="hero-stat"><small>ofertas no marketplace</small><strong>{total || "—"}</strong><span>dados do RIFTFOUND</span></div>
    </div>
  </section>;
}

function MarketSection(props: any) {
  const { listings, allListings, loading, query, setQuery, setFilter, onSetFilter, rarityFilter, setRarityFilter, sort, setSort, viewMode, setViewMode, onSell, onRefresh, canSell } = props;
  const sets = [...new Set(allListings.map((item: Listing) => item.setLabel).filter(Boolean))] as string[];
  const rarities = [...new Set(allListings.map((item: Listing) => item.rarity).filter(Boolean))] as string[];
  return <section className="content-section">
    <div className="section-heading"><div><div className="section-kicker">MARKETPLACE <span>•</span> AO VIVO</div><h2>Cartas anunciadas</h2><p>Ofertas reais ordenadas pelo menor preço.</p></div>{canSell && <button className="outline-button" onClick={onSell}><Plus size={17} /> Anunciar cartas</button>}</div>
    <div className="toolbar">
      <div className="toolbar-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nos anúncios..." /></div>
      <div className="select-wrap"><Filter size={15} /><select value={setFilter} onChange={(event) => onSetFilter(event.target.value)}><option>Todos os sets</option>{sets.map((setName) => <option key={setName}>{setName}</option>)}</select></div>
      <div className="select-wrap"><select value={rarityFilter} onChange={(event) => setRarityFilter(event.target.value)}><option>Todas as raridades</option>{rarities.map((rarity) => <option key={rarity}>{rarity}</option>)}</select></div>
      <div className="toolbar-spacer" />
      <label className="sort-control">Ordenar <select value={sort} onChange={(event) => setSort(event.target.value)}><option>Menor preço</option><option>Maior preço</option><option>Nome A-Z</option></select></label>
      <div className="view-toggle"><button className={viewMode === "grid" ? "active" : ""} onClick={() => setViewMode("grid")} aria-label="Grade"><LayoutGrid size={16} /></button><button className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")} aria-label="Lista"><List size={17} /></button></div>
    </div>
    <div className={`listing-grid ${viewMode === "list" ? "list-view" : ""}`}>{loading ? <div className="loading-state"><Loader2 className="spin" size={25} /> Carregando ofertas...</div> : listings.map((listing: MarketplaceCard) => <ListingCard key={listing.id} listing={listing} />)}</div>
    {!loading && !listings.length && <div className="empty-state"><Search size={25} /><h3>Nenhuma oferta encontrada</h3><p>Ajuste a busca ou os filtros.</p></div>}
    <div className="load-more"><span>{listings.length} carta(s) · {listings.reduce((sum: number, item: MarketplaceCard) => sum + item.offerCount, 0)} oferta(s)</span><button className="text-button" onClick={onRefresh}>Atualizar <ArrowUpRight size={15} /></button></div>
  </section>;
}

function ListingCard({ listing }: { listing: MarketplaceCard }) {
  const detailUrl = `/c/${encodeURIComponent(listing.id)}`;
  return <article className="listing-card">
    <a href={detailUrl} className="listing-image-wrap"><div className="listing-image">{listing.imageUrl ? <img src={listing.imageUrl} alt={listing.name} /> : <div className="card-image-placeholder">Imagem indisponível</div>}</div><span className="price-badge">a partir de</span></a>
    <div className="listing-copy"><div className="listing-topline"><span>{listing.setLabel} · {listing.rarity}</span><span>{listing.totalQuantity} un.</span></div><h3>{listing.name}</h3><small className="riftbound-code">{listing.riftbound_id}</small>
      <div className="offer-summary"><span><Store size={14} /> {listing.offerCount} vendedor(es)</span><span>{listing.totalQuantity} unidade(s) disponíveis</span></div>
      <div className="listing-footer"><div><small>a partir de</small><strong>{formatBRL(listing.price)}</strong></div><a className="buy-button" href={detailUrl}>Ver ofertas <ArrowUpRight size={15} /></a></div>
    </div>
  </article>;
}

function SellSection(props: any) {
  const { query, setQuery, cards, catalogLoading, catalogError, retryCatalog, drafts, setDrafts, addDraft, publish, loading, share, locations, selectedLocationIds, setSelectedLocationIds, ownListings, updateListing, demandByCard } = props;
  const [sellTab, setSellTab] = useState<"create" | "manage">("create");
  const [manageQuery, setManageQuery] = useState("");
  const [manageStatus, setManageStatus] = useState("all");
  const [manageSet, setManageSet] = useState("all");
  const [manageCondition, setManageCondition] = useState("all");
  const [managePage, setManagePage] = useState(1);
  const pageSize = 25;
  const updateDraft = (cardId: string, patch: Partial<DraftListing>) => setDrafts((current: DraftListing[]) => current.map((item) => item.card.id === cardId ? { ...item, ...patch } : item));
  const undoScannedCard = (card: ScannedCard) => setDrafts((current: DraftListing[]) => current.flatMap((item) => {
    if (item.card.id !== card.id) return [item];
    return item.quantity > 1 ? [{ ...item, quantity: item.quantity - 1 }] : [];
  }));
  const managementSets = [...new Set(ownListings.map((item: Listing) => item.setLabel).filter(Boolean))] as string[];
  const filteredOwnListings = ownListings.filter((listing: Listing) => {
    const text = manageQuery.trim().toLocaleLowerCase("pt-BR");
    return (!text || `${listing.name} ${listing.riftbound_id} ${listing.setLabel}`.toLocaleLowerCase("pt-BR").includes(text))
      && (manageStatus === "all" || listing.status === manageStatus)
      && (manageSet === "all" || listing.setLabel === manageSet)
      && (manageCondition === "all" || listing.condition === manageCondition);
  });
  const totalPages = Math.max(1, Math.ceil(filteredOwnListings.length / pageSize));
  const visibleListings = filteredOwnListings.slice((managePage - 1) * pageSize, managePage * pageSize);
  useEffect(() => setManagePage(1), [manageQuery, manageStatus, manageSet, manageCondition]);
  useEffect(() => { if (managePage > totalPages) setManagePage(totalPages); }, [managePage, totalPages]);
  return <section className="content-section workspace-view">
    <div className="section-heading"><div><div className="section-kicker">ÁREA DO VENDEDOR <span>•</span> {ownListings.length} ANÚNCIO(S)</div><h2>Venda suas cartas</h2><p>Publique em lote ou administre seu estoque em espaços separados.</p></div><button className="outline-button" onClick={share}><Link2 size={16} /> Compartilhar minha lista</button></div>
    <div className="section-tabs" role="tablist" aria-label="Área de vendas"><button role="tab" aria-selected={sellTab === "create"} className={sellTab === "create" ? "active" : ""} onClick={() => setSellTab("create")}><Plus size={16} /> Anunciar cartas <span>{drafts.length}</span></button><button role="tab" aria-selected={sellTab === "manage"} className={sellTab === "manage" ? "active" : ""} onClick={() => setSellTab("manage")}><Tag size={16} /> Meus anúncios <span>{ownListings.length}</span></button></div>
    {sellTab === "create" && <div className="sell-layout"><div className="sell-panel"><CardScanner onCardFound={(card: ScannedCard) => addDraft(card as Card)} onUndoCard={undoScannedCard} selectedCount={drafts.reduce((total: number, item: DraftListing) => total + item.quantity, 0)} /><div className="catalog-divider"><span>ou busque pelo nome</span></div><label className="field-label">Buscar no catálogo oficial</label><div className="hero-search compact"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Digite pelo menos 2 letras..." /></div><CatalogResults query={query} cards={cards} loading={catalogLoading} error={catalogError} retry={retryCatalog} selectedIds={drafts.map((item: DraftListing) => item.card.id)} onSelect={addDraft} /></div>
      <div className="sell-panel details-panel"><div className="panel-top"><h3>Itens para publicar <span>{drafts.length}</span></h3></div>{drafts.length ? <><div className="draft-list">{drafts.map((draft: DraftListing) => <div className="draft-row" key={draft.card.id}><CardThumb card={draft.card} /><div className="draft-main"><b>{draft.card.name}</b><small>{draft.card.riftbound_id}</small><div className="draft-fields"><label>Preço<input value={draft.price} onChange={(event) => updateDraft(draft.card.id, { price: event.target.value })} placeholder="15,00" /></label><label>Qtd.<div className="quantity-input"><button type="button" onClick={() => updateDraft(draft.card.id, { quantity: Math.max(1, draft.quantity - 1) })}><Minus size={13} /></button><input type="number" min="1" value={draft.quantity} onChange={(event) => updateDraft(draft.card.id, { quantity: Math.max(1, Number(event.target.value) || 1) })} /><button type="button" onClick={() => updateDraft(draft.card.id, { quantity: draft.quantity + 1 })}><Plus size={13} /></button></div></label><label>Condição<select value={draft.condition} onChange={(event) => updateDraft(draft.card.id, { condition: event.target.value })}>{Object.entries(conditionLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div></div><button className="remove-button" onClick={() => setDrafts((current: DraftListing[]) => current.filter((item) => item.card.id !== draft.card.id))}><Trash2 size={15} /></button></div>)}</div><div className="delivery-picker"><b>Onde você entrega?</b>{locations.length ? locations.map((location: DeliveryLocation) => <label key={location.id}><input type="checkbox" checked={selectedLocationIds.includes(location.id)} onChange={() => setSelectedLocationIds((current: string[]) => current.includes(location.id) ? current.filter((id) => id !== location.id) : [...current, location.id])} /> {location.name} · {(location.available_days ?? []).map((day) => weekDays[day]).join(", ")}</label>) : <small>Cadastre um ponto de entrega no seu perfil.</small>}</div><button className="primary-button full" onClick={publish} disabled={loading}>{loading ? <Loader2 className="spin" size={16} /> : <Check size={16} />} Publicar {drafts.length} anúncio(s)</button></> : <div className="empty-form"><Tag size={26} /><h3>Sua lista está vazia</h3><p>Use a busca para adicionar quantas cartas quiser.</p></div>}</div>
    </div>}
    {sellTab === "manage" && <div className="management-panel"><div className="section-heading compact-heading"><div><h2>Meus anúncios</h2><p>Busque, filtre e altere preço, quantidade, condição ou disponibilidade.</p></div></div><div className="manage-toolbar"><div className="toolbar-search"><Search size={17} /><input value={manageQuery} onChange={(event) => setManageQuery(event.target.value)} placeholder="Buscar por carta ou código..." /></div><div className="select-wrap"><select value={manageStatus} onChange={(event) => setManageStatus(event.target.value)}><option value="all">Todos os status</option><option value="active">Ativos</option><option value="paused">Pausados</option><option value="reserved">Reservados</option><option value="sold">Vendidos</option></select></div><div className="select-wrap"><select value={manageSet} onChange={(event) => setManageSet(event.target.value)}><option value="all">Todos os sets</option>{managementSets.map((setName) => <option value={setName} key={setName}>{setName}</option>)}</select></div><div className="select-wrap"><select value={manageCondition} onChange={(event) => setManageCondition(event.target.value)}><option value="all">Todas as condições</option>{Object.entries(conditionLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div></div><div className="manage-count">{filteredOwnListings.length} de {ownListings.length} anúncio(s)</div>{visibleListings.length ? <div className="own-listings">{visibleListings.map((listing: Listing) => <OwnListingRow key={listing.listingId} listing={listing} save={updateListing} demand={demandByCard.get(listing.id) ?? 0} />)}</div> : <div className="empty-state"><Tag size={23} /><h3>Nenhum anúncio encontrado</h3><p>Ajuste a busca ou os filtros.</p></div>}{totalPages > 1 && <div className="pagination"><button className="outline-button" disabled={managePage === 1} onClick={() => setManagePage((page) => Math.max(1, page - 1))}>Anterior</button><span>Página {managePage} de {totalPages}</span><button className="outline-button" disabled={managePage === totalPages} onClick={() => setManagePage((page) => Math.min(totalPages, page + 1))}>Próxima</button></div>}</div>}
  </section>;
}

function CatalogResults({ query, cards, loading, error, retry, selectedIds, onSelect }: any) {
  if (query.trim().length < 2) return <p className="catalog-hint">Comece a digitar para pesquisar no catálogo.</p>;
  if (loading) return <div className="inline-loading"><Loader2 className="spin" size={17} /> Consultando catálogo...</div>;
  if (error) return <div className="catalog-error"><span>{error}</span><button type="button" onClick={retry}>Tentar novamente</button></div>;
  if (!cards.length) return <p className="catalog-hint">Nenhuma carta encontrada.</p>;
  return <div className="card-picker">{cards.map((card: Card) => <button className={`picker-card ${selectedIds.includes(card.id) ? "selected" : ""}`} key={card.id} onClick={() => onSelect(card)}><CardThumb card={card} /><span><b>{card.name}</b><small>{card.riftbound_id} · {card.setLabel} · {card.rarity}</small></span>{selectedIds.includes(card.id) ? <Check size={15} /> : <Plus size={15} />}</button>)}</div>;
}

function CardThumb({ card, large = false }: { card: Card; large?: boolean }) {
  return <div className={`mini-card-art ${large ? "large" : ""}`}>{card.imageUrl && <img src={card.imageUrl} alt="" />}</div>;
}

function OwnListingRow({ listing, save, demand }: { listing: Listing; save: (id: string, patch: any) => Promise<boolean>; demand: number }) {
  const [price, setPrice] = useState(listing.price.toFixed(2).replace(".", ","));
  const [quantity, setQuantity] = useState(listing.quantity);
  const [condition, setCondition] = useState(listing.condition);
  const [busy, setBusy] = useState(false);
  const submit = async () => { const cents = priceToCents(price); if (!cents || quantity < 1) return; setBusy(true); await save(listing.listingId, { price_cents: cents, quantity, condition }); setBusy(false); };
  const toggle = async () => { setBusy(true); await save(listing.listingId, { status: listing.status === "active" ? "paused" : "active" }); setBusy(false); };
  return <div className={`own-listing-row ${listing.status !== "active" ? "is-paused" : ""}`}><CardThumb card={listing} /><div className="own-listing-name"><b>{listing.name}</b><small>{listing.riftbound_id} · {listing.status === "active" ? "ativo" : listing.status}</small>{demand > 0 ? <a className="demand-badge" href={`/procurados/${encodeURIComponent(listing.id)}`}>{demand} jogador(es) procuram</a> : <span className="demand-empty">Sem procura cadastrada</span>}</div><label>Preço<input value={price} onChange={(event) => setPrice(event.target.value)} /></label><label>Qtd.<input type="number" min="1" value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} /></label><label>Condição<select value={condition} onChange={(event) => setCondition(event.target.value)}>{Object.entries(conditionLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><button className="outline-button" onClick={submit} disabled={busy}>Salvar</button><button className="text-button" onClick={toggle} disabled={busy}>{listing.status === "active" ? "Pausar" : "Reativar"}</button></div>;
}

function WantedSection({ groups }: { groups: WantedGroup[] }) {
  const [query, setQuery] = useState("");
  const [setFilter, setSetFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 24;
  const sets = [...new Set(groups.map((group) => group.card.setLabel).filter(Boolean))];
  const filtered = groups.filter((group) => {
    const text = query.trim().toLocaleLowerCase("pt-BR");
    return (!text || `${group.card.name} ${group.card.riftbound_id} ${group.card.setLabel}`.toLocaleLowerCase("pt-BR").includes(text))
      && (setFilter === "all" || group.card.setLabel === setFilter);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => setPage(1), [query, setFilter]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  return <section className="content-section workspace-view">
    <div className="section-heading"><div><div className="section-kicker">DEMANDA DA COMUNIDADE <span>•</span> WANT LISTS</div><h2>Cartas procuradas</h2><p>Veja quem está procurando uma carta e ofereça diretamente ao jogador.</p></div></div>
    <div className="toolbar wanted-toolbar"><div className="toolbar-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nas want lists..." /></div><div className="select-wrap"><Filter size={15} /><select value={setFilter} onChange={(event) => setSetFilter(event.target.value)}><option value="all">Todos os sets</option>{sets.map((setName) => <option value={setName} key={setName}>{setName}</option>)}</select></div><div className="toolbar-spacer" /><span className="demand-total">{filtered.reduce((sum, group) => sum + group.entries.length, 0)} jogador(es) procurando</span></div>
    {visible.length ? <div className="wanted-grid">{visible.map((group) => <a className="wanted-card" href={`/procurados/${encodeURIComponent(group.card.id)}`} key={group.card.id}><div className="wanted-card-art">{group.card.imageUrl ? <img src={group.card.imageUrl} alt={group.card.name} /> : <div className="card-image-placeholder">Imagem indisponível</div>}</div><div className="wanted-card-copy"><span>{group.card.setLabel} · {group.card.rarity}</span><h3>{group.card.name}</h3><small>{group.card.riftbound_id}</small><div><b>{group.entries.length}</b> jogador(es) · {group.totalQuantity} cópia(s)</div><em>Ver interessados <ArrowUpRight size={14} /></em></div></a>)}</div> : <div className="empty-state"><Heart size={25} /><h3>Nenhuma carta procurada</h3><p>Ajuste os filtros ou seja o primeiro a criar uma want list.</p></div>}
    {totalPages > 1 && <div className="pagination"><button className="outline-button" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button><span>Página {page} de {totalPages}</span><button className="outline-button" disabled={page === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Próxima</button></div>}
  </section>;
}

function WantSection(props: any) {
  const { query, setQuery, cards, catalogLoading, catalogError, retryCatalog, selected, setSelected, save, wants, remove, changeQuantity, loading, share } = props;
  return <section className="content-section workspace-view">
    <div className="section-heading"><div><div className="section-kicker">SUA COLEÇÃO <span>•</span> LISTA DE DESEJOS</div><h2>Minha want list</h2><p>As cartas aparecem com imagem no seu link público.</p></div><button className="primary-button" onClick={share}><Link2 size={16} /> Compartilhar want list</button></div>
    <div className="want-layout"><div className="want-intro"><div className="want-orbit"><Heart size={28} /></div><h3>Deixe os outros jogadores ajudarem</h3><p>Quem visitar seus anúncios poderá conferir as cartas que você aceita na negociação.</p><div className="want-share"><span><Link2 size={15} /> sua lista pública</span><button onClick={share} aria-label="Copiar link"><Copy size={15} /></button></div></div>
      <div className="want-list-panel"><div className="panel-top"><h3>Cartas que procuro <span>{wants.length}</span></h3></div><div className="hero-search compact"><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); }} placeholder="Digite pelo menos 2 letras..." /></div><CatalogResults query={query} cards={cards.slice(0, 8)} loading={catalogLoading} error={catalogError} retry={retryCatalog} selectedIds={selected ? [selected.id] : []} onSelect={setSelected} />{selected && <button className="primary-button full want-add-button" onClick={save} disabled={loading}><Plus size={16} /> Adicionar {selected.name}</button>}
        <div className="saved-wants">{wants.map((want: WantItem) => <div className="want-row" key={want.id}><CardThumb card={want.card ?? ({ id: want.card_id, name: "Carta", riftbound_id: "", rarity: "", type: "", setLabel: "", setId: "", domains: [] } as Card)} /><div><b>{want.card?.name ?? want.card_id}</b><small>{want.card?.riftbound_id ?? "Carta salva"} · {conditionLabels[want.condition ?? ""] ?? "Qualquer condição"}</small></div><div className="want-quantity"><button onClick={() => changeQuantity(want, want.quantity - 1)} disabled={want.quantity <= 1}><Minus size={12} /></button><span>{want.quantity}</span><button onClick={() => changeQuantity(want, want.quantity + 1)}><Plus size={12} /></button></div><button className="remove-button" onClick={() => remove(want)} aria-label="Remover"><X size={16} /></button></div>)}</div>
      </div>
    </div>
  </section>;
}

function ProfileSection(props: any) {
  const { form, setForm, save, locations, locationDraft, setLocationDraft, showLocationForm, setShowLocationForm, editingLocationId, setEditingLocationId, saveLocation, editLocation, removeLocation, logout, loading } = props;
  const toggleDay = (day: number) => setLocationDraft({ ...locationDraft, available_days: locationDraft.available_days.includes(day) ? locationDraft.available_days.filter((value: number) => value !== day) : [...locationDraft.available_days, day] });
  const addLocation = () => { setEditingLocationId(null); setLocationDraft(emptyLocation); setShowLocationForm(true); };
  return <section className="content-section workspace-view">
    <div className="section-heading"><div><div className="section-kicker">SEU PERFIL <span>•</span> PREFERÊNCIAS</div><h2>Onde a negociação acontece</h2><p>Defina seus contatos, pontos e dias disponíveis.</p></div><div className="heading-actions"><button className="outline-button" onClick={logout}><LogOut size={15} /> Sair</button><button className="primary-button" onClick={save} disabled={loading}><Check size={16} /> Salvar alterações</button></div></div>
    <div className="profile-layout"><div className="profile-card"><div className="profile-banner" /><div className="profile-avatar">{(form.display_name || "RF").slice(0, 2).toUpperCase()}</div><div className="profile-card-copy"><h3>{form.display_name || "Jogador"}</h3><span>@{form.username} · membro</span><div className="verified"><ShieldCheck size={14} /> Conta autenticada</div></div><div className="profile-stats"><div><b>{locations.length}</b><small>pontos</small></div><div><b>5.0</b><small>reputação</small></div><div><b>0</b><small>trocas</small></div></div></div>
      <div className="profile-settings"><h3>Dados públicos</h3><div className="form-grid"><label>Nome de exibição<input value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} /></label><label>Usuário<input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24) })} /></label><label>Cidade<input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></label><label>Estado<input value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value.toUpperCase().slice(0, 2) })} /></label><label>WhatsApp com DDD<input value={form.whatsapp} onChange={(event) => setForm({ ...form, whatsapp: event.target.value })} placeholder="(31) 99999-9999" /></label></div>
        <h3 className="subheading">Pontos de entrega</h3>{locations.map((location: DeliveryLocation) => <div className="delivery-row" key={location.id}><div className="delivery-icon"><Store size={18} /></div><div><b>{location.name}</b><small>{[location.address, location.city, location.state].filter(Boolean).join(" · ")}</small><span className="delivery-days">{(location.available_days ?? []).map((day) => weekDays[day]).join(" · ")}</span></div><span className="location-actions"><button onClick={() => editLocation(location)}>Editar</button><button onClick={() => removeLocation(location)}>Excluir</button></span></div>)}
        {showLocationForm && <div className="location-form"><input value={locationDraft.name} onChange={(event) => setLocationDraft({ ...locationDraft, name: event.target.value })} placeholder="Nome do local" /><input value={locationDraft.address} onChange={(event) => setLocationDraft({ ...locationDraft, address: event.target.value })} placeholder="Endereço" /><div className="form-grid"><input value={locationDraft.city} onChange={(event) => setLocationDraft({ ...locationDraft, city: event.target.value })} placeholder="Cidade" /><input value={locationDraft.state} onChange={(event) => setLocationDraft({ ...locationDraft, state: event.target.value.toUpperCase().slice(0, 2) })} placeholder="UF" /></div><div className="day-selector"><b>Dias disponíveis</b><div>{weekDays.map((day, index) => <button type="button" className={locationDraft.available_days.includes(index) ? "selected" : ""} key={day} onClick={() => toggleDay(index)}>{day}</button>)}</div></div><div className="location-form-actions"><button className="primary-button" onClick={saveLocation} disabled={loading}>{editingLocationId ? "Atualizar local" : "Salvar local"}</button><button className="outline-button" onClick={() => setShowLocationForm(false)}>Cancelar</button></div></div>}
        {!showLocationForm && <button className="text-button add-place" onClick={addLocation}><Plus size={16} /> Adicionar ponto de entrega</button>}
      </div>
    </div>
  </section>;
}

function AuthModal(props: any) {
  const { mode, setMode, email, setEmail, password, setPassword, submit, close, loading } = props;
  return <div className="modal-backdrop" onMouseDown={close}><form className="auth-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={close}><X size={17} /></button><div className="eyebrow dark"><Sparkles size={14} /> ENTRE PARA NEGOCIAR</div><h2>{mode === "login" ? "Bom te ver de novo." : "Crie seu lugar na mesa."}</h2><p>Salve suas listas, anuncie cartas e combine trocas.</p><label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label><label>Senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={6} required /></label><button className="primary-button full" type="submit" disabled={loading}>{loading ? <Loader2 className="spin" size={16} /> : mode === "login" ? "Entrar" : "Criar conta"} <ArrowUpRight size={16} /></button><button type="button" className="switch-auth" onClick={() => setMode(mode === "login" ? "signup" : "login")}>{mode === "login" ? "Ainda não tenho conta" : "Já tenho uma conta"}</button></form></div>;
}

function Footer() {
  return <footer className="footer"><div><span className="brand-mark small">R</span><span>RIFTFOUND</span></div><span>Feito por jogadores, para jogadores.</span><div><a href="https://riftcodex.com/docs/" target="_blank" rel="noreferrer">Dados das cartas <ExternalLink size={13} /></a><span>·</span><a href="https://playriftbound.com/en-us/" target="_blank" rel="noreferrer">Sobre Riftbound <ExternalLink size={13} /></a></div></footer>;
}
