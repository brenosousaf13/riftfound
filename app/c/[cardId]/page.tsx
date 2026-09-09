import { ArrowLeft, ArrowUpRight, MapPin, ShieldCheck, Store } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

const conditionLabels: Record<string, string> = { near_mint: "Near mint", excellent: "Excelente", good: "Boa", played: "Jogada", damaged: "Danificada" };
const weekDays = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const one = (value: any) => Array.isArray(value) ? value[0] : value;
const formatBRL = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const normalizePhone = (value?: string | null) => {
  let digits = (value ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (digits && !digits.startsWith("55")) digits = `55${digits}`;
  return digits;
};

function Header() {
  return <header className="public-header"><a className="public-brand" href="/"><span className="brand-mark">R</span><span><strong>RIFT</strong><em>FOUND</em></span></a><a className="public-back" href="/"><ArrowLeft size={15} /> Voltar ao marketplace</a></header>;
}

export default async function CardOffersPage({ params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params;
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    : null;
  if (!supabase) return <main className="public-page"><Header /><section className="auth-gate"><h1>RIFTFOUND indisponível</h1></section></main>;

  const { data: listings } = await supabase.from("marketplace_listings").select("*").eq("card_id", cardId).order("price_cents", { ascending: true }).limit(500);
  if (!listings?.length) return <main className="public-page"><Header /><section className="auth-gate"><h1>Nenhuma oferta disponível</h1><p>Esta carta não possui anúncios ativos no momento.</p><a className="primary-button" href="/">Explorar outras cartas <ArrowUpRight size={16} /></a></section></main>;

  const sellerIds = [...new Set(listings.map((listing: any) => listing.seller_id))];
  const listingIds = listings.map((listing: any) => listing.id);
  const [{ data: profiles }, { data: locationLinks }] = await Promise.all([
    supabase.from("profiles").select("id, username, display_name, whatsapp, city, state, reputation, completed_trades").in("id", sellerIds),
    supabase.from("listing_delivery_locations").select("listing_id, delivery_locations(name, city, state, available_days)").in("listing_id", listingIds),
  ]);
  const profilesById = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]));
  const locationsByListing = new Map<string, string[]>();
  for (const link of locationLinks ?? []) {
    const location = one((link as any).delivery_locations);
    if (!location) continue;
    const days = (location.available_days ?? []).map((day: number) => weekDays[day]).join(", ");
    const label = `${location.name}${location.city ? ` · ${location.city}${location.state ? `/${location.state}` : ""}` : ""}${days ? ` · ${days}` : ""}`;
    locationsByListing.set((link as any).listing_id, [...(locationsByListing.get((link as any).listing_id) ?? []), label]);
  }
  const card = listings[0] as any;

  return <main className="public-page">
    <Header />
    <section className="card-detail-page">
      <div className="card-detail-layout">
        <aside className="card-detail-visual"><div className="section-kicker">CARTA SELECIONADA</div><div className="detail-card-art">{card.image_url ? <img src={card.image_url} alt={card.name} /> : <div className="card-image-placeholder">Imagem indisponível</div>}</div><span>{card.set_label} · {card.rarity}</span><h1>{card.name}</h1><small>{card.riftbound_id}</small></aside>
        <div className="offers-panel"><div className="offers-heading"><div><div className="section-kicker">OFERTAS DISPONÍVEIS</div><h2>Escolha o vendedor</h2><p>{listings.length} oferta(s), da mais barata para a mais cara.</p></div><div><small>a partir de</small><strong>{formatBRL(card.price_cents)}</strong></div></div>
          <div className="offer-list">{listings.map((listing: any, index: number) => {
            const profile: any = profilesById.get(listing.seller_id) ?? { username: listing.username, display_name: listing.display_name, city: listing.city, state: listing.state };
            const phone = normalizePhone(profile.whatsapp);
            const message = encodeURIComponent(`Oi! Vi seu anúncio de ${listing.name} (${listing.riftbound_id}) no RIFTFOUND por ${formatBRL(listing.price_cents)} e tenho interesse.`);
            return <article className="offer-row" key={listing.id}><div className="offer-rank">{String(index + 1).padStart(2, "0")}</div><div className="offer-seller"><a href={`/u/${profile.username}`}><span className="seller-avatar">{(profile.display_name ?? profile.username ?? "RF").slice(0, 2).toUpperCase()}</span><span><b>{profile.display_name ?? profile.username}</b><small>@{profile.username} · <MapPin size={11} /> {[profile.city, profile.state].filter(Boolean).join(", ") || "Local não informado"}</small></span></a><span className="offer-reputation"><ShieldCheck size={14} /> {profile.reputation?.toFixed?.(1) ?? "5.0"}</span></div><div className="offer-meta"><span>{conditionLabels[listing.condition] ?? listing.condition}</span><span>{listing.quantity} unidade(s)</span><small><Store size={12} /> {(locationsByListing.get(listing.id) ?? []).join(" ou ") || "Combine o local com o vendedor"}</small></div><strong className="offer-price">{formatBRL(listing.price_cents)}</strong>{phone ? <a className="buy-button offer-contact" href={`https://wa.me/${phone}?text=${message}`} target="_blank" rel="noreferrer">Chamar no WhatsApp <ArrowUpRight size={15} /></a> : <span className="contact-missing">Contato não informado</span>}</article>;
          })}</div>
        </div>
      </div>
    </section>
  </main>;
}
