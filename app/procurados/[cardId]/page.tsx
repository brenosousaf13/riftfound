import { ArrowLeft, ArrowUpRight, Heart, MapPin } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

const conditionLabels: Record<string, string> = { near_mint: "Near mint", excellent: "Excelente", good: "Boa", played: "Jogada", damaged: "Danificada" };
const one = (value: any) => Array.isArray(value) ? value[0] : value;
const normalizePhone = (value?: string | null) => {
  let digits = (value ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (digits && !digits.startsWith("55")) digits = `55${digits}`;
  return digits;
};

function Header() {
  return <header className="public-header"><a className="public-brand" href="/"><span className="brand-mark">R</span><span><strong>RIFT</strong><em>FOUND</em></span></a><a className="public-back" href="/"><ArrowLeft size={15} /> Voltar ao RIFTFOUND</a></header>;
}

export default async function WantedCardPage({ params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params;
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    : null;
  if (!supabase) return <main className="public-page"><Header /><section className="auth-gate"><h1>RIFTFOUND indisponível</h1></section></main>;

  const { data: wants } = await supabase.from("want_items").select("id, profile_id, quantity, condition, cards(name, riftbound_id, image_url, set_label, rarity)").eq("card_id", cardId).limit(500);
  if (!wants?.length) return <main className="public-page"><Header /><section className="auth-gate"><Heart size={28} /><h1>Ninguém procura esta carta agora</h1><p>Confira novamente quando novas want lists forem publicadas.</p><a className="primary-button" href="/">Ver cartas procuradas <ArrowUpRight size={16} /></a></section></main>;

  const profileIds = [...new Set(wants.map((want: any) => want.profile_id))];
  const { data: profiles } = await supabase.from("profiles").select("id, username, display_name, whatsapp, city, state").in("id", profileIds);
  const profilesById = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]));
  const card: any = one(wants[0].cards);
  const totalQuantity = wants.reduce((sum: number, want: any) => sum + want.quantity, 0);

  return <main className="public-page"><Header /><section className="card-detail-page"><div className="card-detail-layout"><aside className="card-detail-visual"><div className="section-kicker">CARTA PROCURADA</div><div className="detail-card-art">{card?.image_url ? <img src={card.image_url} alt={card.name} /> : <div className="card-image-placeholder">Imagem indisponível</div>}</div><span>{card?.set_label} · {card?.rarity}</span><h1>{card?.name}</h1><small>{card?.riftbound_id}</small></aside><div className="offers-panel"><div className="offers-heading"><div><div className="section-kicker">OPORTUNIDADE DE VENDA</div><h2>Jogadores interessados</h2><p>{wants.length} jogador(es) procurando {totalQuantity} cópia(s).</p></div></div><div className="offer-list">{wants.map((want: any, index: number) => {
    const profile: any = profilesById.get(want.profile_id) ?? { username: "jogador", display_name: "Jogador" };
    const phone = normalizePhone(profile.whatsapp);
    const message = encodeURIComponent(`Oi! Vi no RIFTFOUND que você procura ${card?.name} (${card?.riftbound_id}). Tenho essa carta para negociar.`);
    return <article className="offer-row wanted-person" key={want.id}><div className="offer-rank">{String(index + 1).padStart(2, "0")}</div><div className="offer-seller"><a href={`/u/${profile.username}`}><span className="seller-avatar">{(profile.display_name ?? profile.username).slice(0, 2).toUpperCase()}</span><span><b>{profile.display_name ?? profile.username}</b><small>@{profile.username} · <MapPin size={11} /> {[profile.city, profile.state].filter(Boolean).join(", ") || "Local não informado"}</small></span></a></div><div className="offer-meta"><span>Procura {want.quantity} unidade(s)</span><span>{conditionLabels[want.condition] ?? "Qualquer condição"}</span></div>{phone ? <a className="buy-button offer-contact" href={`https://wa.me/${phone}?text=${message}`} target="_blank" rel="noreferrer">Oferecer carta <ArrowUpRight size={15} /></a> : <a className="outline-button" href={`/u/${profile.username}`}>Ver perfil</a>}</article>;
  })}</div></div></div></section></main>;
}
