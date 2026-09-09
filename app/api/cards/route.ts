import { NextRequest, NextResponse } from "next/server";

const RIFTCODEX_URL = "https://api.riftcodex.com";

function normalizeCard(card: any) {
  return {
    id: card.id,
    name: card.name,
    riftbound_id: card.riftbound_id,
    rarity: card.classification?.rarity ?? "Unknown",
    type: card.classification?.type ?? "Card",
    setLabel: card.set?.label ?? card.set?.set_id ?? "Unknown set",
    setId: card.set?.set_id ?? "",
    imageUrl: card.media?.image_url,
    domains: card.classification?.domain ?? [],
    tcgplayer_id: card.tcgplayer_id,
    orientation: card.orientation ?? "portrait",
  };
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = params.get("query");
  const isRiftboundId = !!query && /^[a-z]{3}-\d/i.test(query.trim());
  const endpoint = isRiftboundId ? `/cards/riftbound/${encodeURIComponent(query!.trim())}` : query ? "/cards/name" : "/cards";
  const upstreamParams = new URLSearchParams();
  upstreamParams.set("size", params.get("size") ?? "12");
  upstreamParams.set("sort", "name");
  upstreamParams.set("dir", "1");
  if (query && !isRiftboundId) upstreamParams.set("fuzzy", query);
  if (params.get("set_id")) upstreamParams.set("set_id", params.get("set_id") as string);
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 8000);
  try {
    const response = await fetch(`${RIFTCODEX_URL}${endpoint}?${upstreamParams.toString()}`, { cache: "no-store", signal: abortController.signal, headers: { Accept: "application/json" } });
    if (!response.ok) return NextResponse.json({ cards: [], error: "Riftcodex indisponível" }, { status: 502 });
    const payload = await response.json();
    const cards = Array.isArray(payload) ? payload : (payload.items ?? payload.data ?? payload.cards ?? (payload.id ? [payload] : []));
    return NextResponse.json({ cards: cards.map(normalizeCard), source: "riftcodex" });
  } catch {
    return NextResponse.json({ cards: [], error: "Não foi possível consultar o catálogo" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
