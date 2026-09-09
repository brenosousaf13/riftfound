import { ArrowUpRight, MapPin, ShieldCheck, Store } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

const normalizePhone = (value?: string | null) => {
  let digits = (value ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (digits && !digits.startsWith("55")) digits = `55${digits}`;
  return digits;
};
const one = (value: any) => Array.isArray(value) ? value[0] : value;

export default async function PublicList({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    : null;
  if (!supabase) return <main className="public-page"><h1>RIFTFOUND indisponível</h1></main>;

  const { data: profile } = await supabase.from("profiles").select("id, display_name, username, city, state, whatsapp, reputation, completed_trades").ilike("username", username).maybeSingle();
  if (!profile) return <main className="public-page"><PublicHeader /><section className="auth-gate"><h1>Lista não encontrada</h1><p>Confira o nome do usuário no link compartilhado.</p><a className="primary-button" href="/">Voltar ao RIFTFOUND <ArrowUpRight size={16} /></a></section></main>;

  const [{ data: listings }, { data: wants }] = await Promise.all([
    supabase.from("marketplace_listings").select("*").eq("username", profile.username).order("price_cents", { ascending: true }),
    supabase.from("want_items").select("id, quantity, condition, cards(name, riftbound_id, image_url, set_label, rarity)").eq("profile_id", profile.id),
  ]);
  const listingIds = (listings ?? []).map((item: any) => item.id);
  const { data: links } = listingIds.length
    ? await supabase.from("listing_delivery_locations").select("listing_id, delivery_locations(name, city, state, available_days)").in("listing_id", listingIds)
    : { data: [] as any[] };
  const locations = new Map<string, string[]>();
  for (const link of links ?? []) {
    const location = one((link as any).delivery_locations);
    if (!location) continue;
    const label = `${location.name}${location.city ? ` · ${location.city}${location.state ? `/${location.state}` : ""}` : ""}`;
    locations.set((link as any).listing_id, [...(locations.get((link as any).listing_id) ?? []), label]);
  }
  const phone = normalizePhone(profile.whatsapp);

  return <main className="public-page">
    <PublicHeader />
    <section className="public-profile"><div className="profile-avatar">{profile.display_name.slice(0, 2).toUpperCase()}</div><div><div className="section-kicker">LISTA PÚBLICA DE VENDAS</div><h1>{profile.display_name}</h1><p>@{profile.username} · <MapPin size={13} /> {[profile.city, profile.state].filter(Boolean).join(", ") || "Brasil"}</p><div className="verified"><ShieldCheck size={14} /> {profile.reputation?.toFixed?.(1) ?? "5.0"} de reputação · {profile.completed_trades ?? 0} trocas</div></div></section>
    <section className="public-list"><div className="section-heading"><div><h2>Cartas disponíveis</h2><p>{listings?.length ?? 0} anúncio(s) publicado(s)</p></div></div>
      <div className="listing-grid">{(listings ?? []).map((listing: any) => {
        const message = encodeURIComponent(`Oi! Vi seu anúncio de ${listing.name} (${listing.riftbound_id}) no RIFTFOUND e tenho interesse.`);
        return <article className="listing-card" key={listing.id}><div className="listing-image-wrap"><div className="listing-image">{listing.image_url ? <img src={listing.image_url} alt={listing.name} /> : <div className="card-image-placeholder">Imagem indisponível</div>}</div></div><div className="listing-copy"><div className="listing-topline"><span>{listing.set_label} · {listing.rarity}</span><span>{listing.quantity} un.</span></div><h3>{listing.name}</h3><small className="riftbound-code">{listing.riftbound_id}</small><div className="listing-footer"><div><small>preço</small><strong>{(listing.price_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></div>{phone ? <a className="buy-button" href={`https://wa.me/${phone}?text=${message}`} target="_blank" rel="noreferrer">Tenho interesse <ArrowUpRight size={15} /></a> : <span className="contact-missing">Contato indisponível</span>}</div><div className="delivery-line"><Store size={13} /> Entrega: {(locations.get(listing.id) ?? []).join(" ou ") || "combine com o vendedor"}</div></div></article>;
      })}</div>
      {!listings?.length && <div className="empty-state"><h3>Esta lista ainda está vazia</h3><p>Volte mais tarde para conferir novas cartas.</p></div>}
      <div className="public-want"><div className="section-kicker">TAMBÉM PROCURA</div><h2>Want list de {profile.display_name}</h2><div className="public-want-grid">{(wants ?? []).map((want: any) => { const card = one(want.cards); return <div className="public-want-card" key={want.id}><div className="public-want-art">{card?.image_url && <img src={card.image_url} alt={card.name} />}</div><span>{card?.riftbound_id}</span><b>{card?.name}</b><small>{want.quantity} unidade(s) · {card?.set_label}</small></div>; })}</div>{!wants?.length && <p className="public-muted">Nenhuma carta na want list.</p>}</div>
    </section>
    <footer className="footer"><span>RIFTFOUND · feito por jogadores</span><span>Dados das cartas: RiftCodex</span></footer>
  </main>;
}

function PublicHeader() {
  return <header className="public-header"><a className="public-brand" href="/"><span className="brand-mark">R</span><span><strong>RIFT</strong><em>FOUND</em></span></a><a className="public-back" href="/">Explorar RIFTFOUND <ArrowUpRight size={15} /></a></header>;
}
