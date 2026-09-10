import { NextRequest, NextResponse } from "next/server";
import catalogData from "@/data/riftcodex-catalog.json";

type CatalogCard = {
  id: string;
  name: string;
  riftbound_id: string;
  rarity: string;
  type: string;
  setLabel: string;
  setId: string;
  imageUrl: string | null;
  domains: string[];
  tcgplayer_id: string | null;
  orientation: string;
};

const catalog = catalogData as { updatedAt: string; total: number; cards: CatalogCard[] };

const normalize = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("en-US")
  .replace(/[^a-z0-9*]+/g, " ")
  .trim();

function levenshtein(left: string, right: string) {
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function matchScore(card: CatalogCard, query: string) {
  const name = normalize(card.name);
  const code = normalize(card.riftbound_id);
  const words = name.split(" ");
  const tokens = query.split(" ").filter(Boolean);

  if (code === query) return 0;
  if (code.startsWith(query)) return 2;
  if (name === query) return 4;
  if (name.startsWith(query)) return 7;
  if (words.some((word) => word.startsWith(query))) return 10;
  if (name.includes(query) || code.includes(query)) return 15;
  if (tokens.every((token) => words.some((word) => word.startsWith(token) || word.includes(token)))) return 22;

  const distance = levenshtein(name, query);
  const similarity = 1 - distance / Math.max(name.length, query.length);
  return similarity >= (query.length <= 4 ? 0.58 : 0.48) ? 100 - Math.round(similarity * 60) : null;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const rawQuery = params.get("query")?.trim().slice(0, 100) ?? "";
  const query = normalize(rawQuery);
  const size = Math.min(50, Math.max(1, Number(params.get("size")) || 12));
  const setId = normalize(params.get("set_id")?.trim() ?? "");

  const cards = catalog.cards
    .filter((card) => !setId || normalize(card.setId) === setId)
    .map((card) => ({ card, score: query ? matchScore(card, query) : 0 }))
    .filter((result): result is { card: CatalogCard; score: number } => result.score !== null)
    .sort((left, right) => left.score - right.score
      || left.card.name.localeCompare(right.card.name)
      || left.card.riftbound_id.localeCompare(right.card.riftbound_id))
    .slice(0, size)
    .map(({ card }) => card);

  return NextResponse.json(
    { cards, source: "riftcodex-snapshot", updatedAt: catalog.updatedAt },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
