import { NextRequest, NextResponse } from "next/server";

const RIFTCODEX_URL = "https://api.riftcodex.com";
const FRESH_CACHE_MS = 10 * 60 * 1000;
const STALE_CACHE_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
const resultCache = new Map<string, { cards: NormalizedCard[]; savedAt: number }>();
const inFlightRequests = new Map<string, Promise<NormalizedCard[]>>();

export const dynamic = "force-dynamic";

type NormalizedCard = ReturnType<typeof normalizeCard>;

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

function readCards(payload: any) {
  const items = Array.isArray(payload)
    ? payload
    : (payload?.items ?? payload?.data ?? payload?.cards ?? (payload?.id ? [payload] : []));
  return Array.isArray(items) ? items.filter((card) => card?.id && card?.name).map(normalizeCard) : [];
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "RIFTFOUND/1.0" },
    });
    if (!response.ok) throw new Error(`RiftCodex respondeu ${response.status}`);
    return readCards(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchCards(url: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fetchWithTimeout(url);
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw lastError;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = params.get("query")?.trim().slice(0, 100) ?? "";
  const size = Math.min(50, Math.max(1, Number(params.get("size")) || 12));
  const setId = params.get("set_id")?.trim() ?? "";
  const isRiftboundId = /^[a-z]{3}-\d/i.test(query);
  const endpoint = isRiftboundId ? `/cards/riftbound/${encodeURIComponent(query)}` : query ? "/cards/name" : "/cards";
  const upstreamParams = new URLSearchParams({ size: String(size), sort: "name", dir: "1" });
  if (query && !isRiftboundId) upstreamParams.set("fuzzy", query);
  if (setId) upstreamParams.set("set_id", setId);
  const url = `${RIFTCODEX_URL}${endpoint}?${upstreamParams.toString()}`;
  const cacheKey = `${endpoint}?${upstreamParams.toString()}`.toLocaleLowerCase("pt-BR");
  const cached = resultCache.get(cacheKey);
  const cacheAge = cached ? Date.now() - cached.savedAt : Number.POSITIVE_INFINITY;

  if (cached && cacheAge < FRESH_CACHE_MS) {
    return NextResponse.json(
      { cards: cached.cards, source: "riftcodex-cache" },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400" } },
    );
  }

  try {
    let requestPromise = inFlightRequests.get(cacheKey);
    if (!requestPromise) {
      requestPromise = fetchCards(url);
      inFlightRequests.set(cacheKey, requestPromise);
    }
    const cards = await requestPromise;
    resultCache.set(cacheKey, { cards, savedAt: Date.now() });
    if (resultCache.size > 150) resultCache.delete(resultCache.keys().next().value as string);
    return NextResponse.json(
      { cards, source: "riftcodex" },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400" } },
    );
  } catch {
    if (cached && cacheAge < STALE_CACHE_MS) {
      return NextResponse.json({ cards: cached.cards, source: "riftcodex-stale-cache" });
    }
    return NextResponse.json(
      { cards: [], error: "O catálogo demorou para responder. Tente novamente." },
      { status: 503, headers: { "Retry-After": "2" } },
    );
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}
