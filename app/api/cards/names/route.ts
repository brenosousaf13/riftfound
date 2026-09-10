import { NextResponse } from "next/server";
import catalogData from "@/data/riftcodex-catalog.json";

const catalog = catalogData as { updatedAt: string; cards: Array<{ name: string }> };
const names = [...new Set(catalog.cards.map((card) => card.name))].sort((left, right) => left.localeCompare(right));

export async function GET() {
  return NextResponse.json(
    { names, source: "riftcodex-snapshot", updatedAt: catalog.updatedAt },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
  );
}
