/**
 * Alertes Telegram « Smart Wallet Entry » — SERVEUR / WORKER UNIQUEMENT.
 *
 * Réutilise entièrement le pipeline existant : le worker Railway garde le
 * WebSocket Solana, l'analyse on-chain écrit `wallet_token_entries`, et ce
 * module détecte les PREMIÈRES entrées d'un smart wallet qualifié sur un token.
 *
 * Anti-doublon : la table `smart_wallet_alerts` porte une contrainte unique
 * (wallet_address, token_mint). Un rachat après revente ne redéclenche donc
 * jamais d'alerte.
 *
 * MODE OBSERVATION UNIQUEMENT : aucun ordre, aucune clé privée.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendRawTelegramMessage } from "./telegram.server";
import { formatAge, formatUsd, shortAddress } from "./radar-service-format";

/** Seuil par défaut historique (réglage conservé pour compatibilité). */
export const DEFAULT_SMART_WALLET_ALERT_THRESHOLD = 75;
/** Score minimum requis du smart wallet pour déclencher une alerte. */
export const MIN_SMART_WALLET_SCORE = 65;
/** Nombre minimum d'acheteurs réels du token au moment de l'alerte. */
export const MIN_TOKEN_BUYERS = 60;
/** Rang d'entrée minimum : le #1 (créateur/acheteur initial) est exclu. */
export const ALERT_RANK_MIN = 2;
/** Rang d'entrée maximum retenu pour une alerte. */
export const ALERT_RANK_MAX = 100;
/** Âge maximum du token (minutes) : l'alerte doit rester « early entry ». */
export const MAX_TOKEN_AGE_MINUTES = 120;
/** Nombre maximal d'alertes envoyées par cycle (protection anti-flood). */
const MAX_ALERTS_PER_CYCLE = 15;

export interface SmartWalletAlertResult {
  candidates: number;
  created: number;
  telegramSent: number;
  errors: string[];
  disabledReason: string | null;
  threshold: number;
  minWalletScore: number;
  minBuyers: number;
  skippedLowScore: number;
  skippedFewBuyers: number;
  rankMin: number;
  rankMax: number;
  tradingEnabled: false;
}

interface EntryRow {
  wallet_address: string;
  mint_address: string;
  token_id: string;
  signature: string | null;
  amount_raw: number | null;
  entry_rank: number;
}


function fmtAmount(amountRaw: number | null): string {
  if (amountRaw === null || !Number.isFinite(amountRaw)) return "inconnu";
  return `${amountRaw.toLocaleString("fr-FR")} unités (brut on-chain)`;
}

export function buildSmartWalletAlertMessage(params: {
  walletAddress: string;
  walletScore: number;
  symbol: string;
  name: string;
  mint: string;
  entryRank: number;
  amountRaw: number | null;
  marketCap: number | null;
  volume24h: number | null;
  buyers: number | null;
  launchedAt: string | null;
  signature: string | null;
}): string {
  const lines = [
    "🚨 SMART WALLET ENTRY",
    "",
    `👛 Smart Wallet : ${shortAddress(params.walletAddress)}`,
    `⭐ Score : ${Math.round(params.walletScore)}/100`,
    `🥇 Rang acheteur : #${params.entryRank} (le #1 est exclu)`,
    `🪙 Token : $${params.symbol}`,
    `📛 Nom : ${params.name}`,
    `💰 Entrée : ${fmtAmount(params.amountRaw)}`,
    `📊 Market Cap : ${params.marketCap ? formatUsd(params.marketCap) : "inconnu"}`,
    `📈 Volume 24h : ${params.volume24h ? formatUsd(params.volume24h) : "inconnu"}`,
    `👥 Acheteurs : ${params.buyers ?? "inconnu"}`,
    `⏱️ Âge du token : ${params.launchedAt ? formatAge(params.launchedAt) : "inconnu"}`,
    `🔗 Token : https://dexscreener.com/solana/${params.mint}`,
    `🔗 Transaction : ${
      params.signature ? `https://solscan.io/tx/${params.signature}` : "inconnue"
    }`,
    `🔗 Wallet : https://solscan.io/account/${params.walletAddress}`,
    "",
    "Observation on-chain uniquement — aucun trading, aucun conseil financier.",
  ];
  return lines.join("\n");
}

/**
 * Détecte les premières entrées de smart wallets qualifiés et envoie une
 * notification Telegram par couple (wallet, token). Idempotent.
 */
export async function detectSmartWalletEntries(): Promise<SmartWalletAlertResult> {
  const errors: string[] = [];

  const { data: settings } = await supabaseAdmin
    .from("bot_settings")
    .select("smart_wallet_alerts_enabled, smart_wallet_alert_threshold")
    .limit(1)
    .maybeSingle();

  const threshold =
    settings?.smart_wallet_alert_threshold ?? DEFAULT_SMART_WALLET_ALERT_THRESHOLD;

  const result: SmartWalletAlertResult = {
    candidates: 0,
    created: 0,
    telegramSent: 0,
    errors,
    disabledReason: null,
    threshold,
    minWalletScore: MIN_SMART_WALLET_SCORE,
    minBuyers: MIN_TOKEN_BUYERS,
    skippedLowScore: 0,
    skippedFewBuyers: 0,
    rankMin: ALERT_RANK_MIN,
    rankMax: ALERT_RANK_MAX,
    tradingEnabled: false,
  };

  if (settings && settings.smart_wallet_alerts_enabled === false) {
    result.disabledReason = "Alertes Smart Wallet désactivées dans les réglages.";
    return result;
  }

  const { data: wallets, error: walletError } = await supabaseAdmin
    .from("smart_wallets")
    .select("address, smart_wallet_score")
    .eq("is_simulated", false)
    .eq("data_sufficient", true);
  if (walletError) throw new Error(walletError.message);

  const scoreByWallet = new Map<string, number>();
  for (const wallet of (wallets ?? []) as Array<{
    address: string;
    smart_wallet_score: number | null;
  }>) {
    scoreByWallet.set(wallet.address, wallet.smart_wallet_score ?? 0);
  }
  if (scoreByWallet.size === 0) return result;

  // Règle 1 : seuls les wallets au score >= MIN_SMART_WALLET_SCORE sont retenus.
  const qualifiedWallets = [...scoreByWallet.entries()].filter(
    ([, score]) => score >= MIN_SMART_WALLET_SCORE,
  );
  result.skippedLowScore = scoreByWallet.size - qualifiedWallets.length;
  const qualifiedAddresses = qualifiedWallets.map(([address]) => address);
  if (qualifiedAddresses.length === 0) return result;

  const { data: entryRows, error: entryError } = await supabaseAdmin
    .from("wallet_token_entries")
    .select("wallet_address, mint_address, token_id, signature, amount_raw, entry_rank")
    .in("wallet_address", qualifiedAddresses)
    .gte("entry_rank", ALERT_RANK_MIN)
    .lte("entry_rank", ALERT_RANK_MAX)
    .order("block_time", { ascending: true, nullsFirst: false })
    .limit(5_000);
  if (entryError) throw new Error(entryError.message);

  // Première entrée observée par couple (wallet, mint).
  const firstEntries = new Map<string, EntryRow>();
  for (const row of (entryRows ?? []) as EntryRow[]) {
    const key = `${row.wallet_address}::${row.mint_address}`;
    if (!firstEntries.has(key)) firstEntries.set(key, row);
  }
  result.candidates = firstEntries.size;
  if (firstEntries.size === 0) return result;

  const { data: known } = await supabaseAdmin
    .from("smart_wallet_alerts")
    .select("wallet_address, token_mint")
    .in("wallet_address", qualifiedAddresses);
  const alreadyAlerted = new Set(
    ((known ?? []) as Array<{ wallet_address: string; token_mint: string }>).map(
      (row) => `${row.wallet_address}::${row.token_mint}`,
    ),
  );

  // Candidats non encore notifiés (l'anti-doublon wallet+token reste actif).
  const fresh = [...firstEntries.entries()]
    .filter(([key]) => !alreadyAlerted.has(key))
    .map(([, entry]) => entry);
  if (fresh.length === 0) return result;

  const candidateTokenIds = [...new Set(fresh.map((entry) => entry.token_id))];

  const { data: tokenRows } = await supabaseAdmin
    .from("tokens")
    .select("id, symbol, name, mint_address, market_cap, volume_24h, new_buyers, launched_at")
    .in("id", candidateTokenIds);
  const tokenById = new Map(
    ((tokenRows ?? []) as Array<{
      id: string;
      symbol: string;
      name: string;
      mint_address: string;
      market_cap: number;
      volume_24h: number;
      new_buyers: number;
      launched_at: string;
    }>).map((token) => [token.id, token]),
  );

  // Règle 2 : nombre d'acheteurs réels du token. On combine la métrique
  // enrichie `tokens.new_buyers` et le nombre d'acheteurs distincts réellement
  // observés on-chain dans `wallet_token_entries` (indépendant du Radar).
  const distinctBuyers = new Map<string, Set<string>>();
  const { data: buyerRows } = await supabaseAdmin
    .from("wallet_token_entries")
    .select("token_id, wallet_address")
    .in("token_id", candidateTokenIds)
    .limit(50_000);
  for (const row of (buyerRows ?? []) as Array<{ token_id: string; wallet_address: string }>) {
    const set = distinctBuyers.get(row.token_id) ?? new Set<string>();
    set.add(row.wallet_address);
    distinctBuyers.set(row.token_id, set);
  }
  const buyersForToken = (tokenId: string): number =>
    Math.max(tokenById.get(tokenId)?.new_buyers ?? 0, distinctBuyers.get(tokenId)?.size ?? 0);

  const eligible = fresh.filter((entry) => {
    if (!tokenById.has(entry.token_id)) return false;
    if (buyersForToken(entry.token_id) < MIN_TOKEN_BUYERS) {
      result.skippedFewBuyers += 1;
      return false;
    }
    return true;
  });

  const pending = eligible.slice(0, MAX_ALERTS_PER_CYCLE);
  if (pending.length === 0) return result;


  for (const entry of pending) {
    const token = tokenById.get(entry.token_id);
    const walletScore = scoreByWallet.get(entry.wallet_address) ?? 0;

    // L'insertion sert de verrou anti-doublon : si une autre exécution a déjà
    // inséré la ligne, `select()` ne renvoie rien et aucun message n'est envoyé.
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("smart_wallet_alerts")
      .upsert(
        {
          wallet_address: entry.wallet_address,
          token_mint: entry.mint_address,
          token_id: entry.token_id,
          token_symbol: token?.symbol ?? null,
          wallet_score: walletScore,
          transaction_signature: entry.signature,
        } as never,
        { onConflict: "wallet_address,token_mint", ignoreDuplicates: true },
      )
      .select("id");

    if (insertError) {
      errors.push(`${entry.wallet_address}/${entry.mint_address}: ${insertError.message}`);
      continue;
    }
    const row = (inserted ?? [])[0] as { id: string } | undefined;
    if (!row) continue; // déjà signalé par une exécution concurrente
    result.created += 1;

    const message = buildSmartWalletAlertMessage({
      walletAddress: entry.wallet_address,
      walletScore,
      symbol: token?.symbol ?? "?",
      name: token?.name ?? "inconnu",
      mint: entry.mint_address,
      entryRank: entry.entry_rank,
      amountRaw: entry.amount_raw,
      marketCap: token?.market_cap ?? null,
      volume24h: token?.volume_24h ?? null,
      buyers: buyersForToken(entry.token_id),
      launchedAt: token?.launched_at ?? null,
      signature: entry.signature,
    });

    // Telegram indisponible ne doit jamais bloquer le worker.
    try {
      const sent = await sendRawTelegramMessage(message);
      if (sent.sent) {
        result.telegramSent += 1;
        await supabaseAdmin
          .from("smart_wallet_alerts")
          .update({ telegram_sent: true, telegram_error: null })
          .eq("id", row.id);
      } else {
        errors.push(`telegram: ${sent.reason ?? "envoi refusé"}`);
        await supabaseAdmin
          .from("smart_wallet_alerts")
          .update({ telegram_sent: false, telegram_error: sent.reason ?? "envoi refusé" })
          .eq("id", row.id);
      }
    } catch (error) {
      const message_ = error instanceof Error ? error.message : String(error);
      errors.push(`telegram: ${message_}`);
      await supabaseAdmin
        .from("smart_wallet_alerts")
        .update({ telegram_sent: false, telegram_error: message_ })
        .eq("id", row.id);
    }
  }

  return result;
}
