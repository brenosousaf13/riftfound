import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const API_URL = "https://api.riftcodex.com/cards";
const PAGE_SIZE = 100;
const OUTPUT = path.join(process.cwd(), "data", "riftcodex-catalog.json");

async function requestPage(page) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const params = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE), sort: "name", dir: "1" });
      const response = await fetch(`${API_URL}?${params}`, {
        signal: controller.signal,
        headers: { Accept: "application/json", "User-Agent": "RIFTFOUND catalog sync/1.0" },
      });
      if (!response.ok) throw new Error(`Página ${page}: HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

function normalize(card) {
  return {
    id: card.id,
    name: card.name,
    riftbound_id: card.riftbound_id,
    rarity: card.classification?.rarity ?? "Unknown",
    type: card.classification?.type ?? "Card",
    setLabel: card.set?.label ?? card.set?.set_id ?? "Unknown set",
    setId: card.set?.set_id ?? "",
    imageUrl: card.media?.image_url ?? null,
    domains: card.classification?.domain ?? [],
    tcgplayer_id: card.tcgplayer_id ?? null,
    orientation: card.orientation ?? "portrait",
  };
}

const first = await requestPage(1);
const pages = Math.max(1, Number(first.pages) || Math.ceil(Number(first.total || 0) / PAGE_SIZE));
const payloads = [first];

for (let start = 2; start <= pages; start += 4) {
  const batch = Array.from({ length: Math.min(4, pages - start + 1) }, (_, index) => start + index);
  payloads.push(...await Promise.all(batch.map(requestPage)));
  process.stdout.write(`\rSincronizando catálogo: ${Math.min(start + batch.length - 1, pages)}/${pages} páginas`);
}

const cards = payloads
  .flatMap((payload) => Array.isArray(payload.items) ? payload.items : [])
  .filter((card) => card?.id && card?.name && card?.riftbound_id)
  .map(normalize)
  .sort((left, right) => left.name.localeCompare(right.name) || left.riftbound_id.localeCompare(right.riftbound_id));

await mkdir(path.dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify({ updatedAt: new Date().toISOString(), total: cards.length, cards })}\n`, "utf8");
process.stdout.write(`\n${cards.length} cartas salvas em ${OUTPUT}\n`);
