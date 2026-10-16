import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { getLivePrepStatus, getShadowQuote, type LivePrepStatus, type ShadowQuote } from "@/lib/live-prep.functions";

const Row = ({ ok, label, detail }: { ok: boolean | null; label: string; detail?: string }) => (
  <li className="flex items-start justify-between gap-3 text-sm">
    <span>{label}</span>
    <span className={ok ? "text-primary" : ok === false ? "text-destructive" : "text-muted-foreground"}>
      {detail ?? (ok ? "OK" : "Manquant")}
    </span>
  </li>
);

export function LivePrepPanel() {
  const check = useServerFn(getLivePrepStatus);
  const quote = useServerFn(getShadowQuote);
  const [s, setS] = useState<LivePrepStatus | null>(null);
  const [q, setQ] = useState<ShadowQuote | null>(null);
  const [mint, setMint] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try { setS(await check()); } finally { setBusy(false); }
  };
  const runQuote = async () => {
    setBusy(true);
    try { setQ(await quote({ data: { mint: mint.trim(), usd: 5 } })); }
    catch { setQ({ ok: false, message: "Adresse invalide", side: "buy", inAmountUsd: 5, outTokens: null, priceImpactPct: null, route: null }); }
    finally { setBusy(false); }
  };

  return (
    <section aria-label="Préparation trading réel" className="panel space-y-4 p-4 sm:p-5">
      <div>
        <h2 className="text-base font-semibold">Préparation du trading réel</h2>
        <p className="text-xs text-muted-foreground">
          Lecture seule. Aucun ordre n'est signé ni envoyé : l'envoi réel n'existe pas encore dans l'app.
        </p>
      </div>
      <Button onClick={run} disabled={busy} size="sm">Vérifier Turnkey et le compte SMD</Button>
      {s && (
        <ul className="space-y-1.5">
          {Object.entries(s.secrets).map(([k, v]) => <Row key={k} ok={v} label={k} />)}
          <Row ok={s.turnkey.ok} label="Connexion Turnkey" detail={s.turnkey.message} />
          <Row ok={s.signAddressValid} label="Adresse SMD" detail={s.signAddressValid ? "Format valide" : "Invalide"} />
          <Row ok={s.balanceSol !== null} label="Solde SMD"
            detail={s.balanceSol === null ? "Non disponible" : `${s.balanceSol.toFixed(4)} SOL${s.balanceUsd ? ` (~${s.balanceUsd.toFixed(2)} $)` : ""}`} />
          <Row ok={s.liveFlagSecret === "false"} label="LIVE_TRADING_ENABLED" detail={s.liveFlagSecret} />
          <Row ok label="Envoi réel dans le code" detail="Désactivé" />
        </ul>
      )}
      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-sm font-medium">Achat fantôme (devis Jupiter, 5 $)</p>
        <input value={mint} onChange={(e) => setMint(e.target.value)} placeholder="Adresse du contrat"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
        <Button onClick={runQuote} disabled={busy || mint.trim().length < 32} size="sm" variant="secondary">Obtenir un devis</Button>
        {q && (
          <p className={`text-sm ${q.ok ? "" : "text-destructive"}`}>
            {q.message}
            {q.ok && <> — ~{q.outTokens?.toLocaleString("fr-FR")} tokens, impact {q.priceImpactPct?.toFixed(2)} %, via {q.route ?? "?"}</>}
          </p>
        )}
      </div>
    </section>
  );
}
