/**
 * Bloc « contrat » commun aux notifications Telegram — LOGIQUE PURE.
 *
 * Règle : le mint affiché est EXACTEMENT celui reçu de la base (aucune
 * troncature, normalisation ni reconstruction). Les liens Solscan et
 * DexScreener sont construits à partir de cette même valeur, encodée
 * uniquement dans le composant d'URL.
 *
 * Telegram Bot API ≥ 7.11 supporte le bouton inline `copy_text`
 * (CopyTextButton, 1–256 caractères) : il copie la valeur exacte dans le
 * presse-papiers, sans callback. Messages envoyés en texte brut (pas de
 * parse_mode) pour éviter toute injection via nom/symbole.
 */

export const NOT_AVAILABLE = "Non disponible";

export function solscanTokenUrl(mint: string): string {
  return `https://solscan.io/token/${encodeURIComponent(mint)}`;
}

export function dexscreenerTokenUrl(mint: string): string {
  return `https://dexscreener.com/solana/${encodeURIComponent(mint)}`;
}

/** Ligne CA complète, isolée, copiable par appui long. */
export function contractLines(mint: string): string[] {
  return ["📋 CA (appui long pour copier) :", mint];
}

/** Liens basés sur le même mint ; la paire DEX existante est ajoutée en plus. */
export function contractLinkLines(mint: string, pairUrl?: string | null): string[] {
  const dex = dexscreenerTokenUrl(mint);
  const lines = [`🔗 Solscan : ${solscanTokenUrl(mint)}`, `🔗 DexScreener : ${dex}`];
  if (pairUrl && pairUrl !== dex) lines.push(`🔗 Paire DEX : ${pairUrl}`);
  return lines;
}

export type CopyKeyboard = {
  inline_keyboard: Array<Array<{ text: string; copy_text: { text: string } }>>;
};

/** Clavier inline « Copier le CA » (null si le mint est hors limites Bot API). */
export function copyMintKeyboard(mint: string | null | undefined): CopyKeyboard | null {
  if (typeof mint !== "string" || mint.length < 1 || mint.length > 256) return null;
  return { inline_keyboard: [[{ text: "📋 Copier le CA", copy_text: { text: mint } }]] };
}

export function usdOrNA(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? NOT_AVAILABLE
    : `${Math.round(value).toLocaleString("fr-FR")} $`;
}

/** Âge lisible depuis launched_at (base). */
export function ageFromLaunch(iso: string | null | undefined, nowMs = Date.now()): string {
  if (!iso) return NOT_AVAILABLE;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return NOT_AVAILABLE;
  const minutes = Math.max(0, Math.floor((nowMs - ts) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${minutes % 60} min`;
  return `${Math.floor(hours / 24)} j`;
}
