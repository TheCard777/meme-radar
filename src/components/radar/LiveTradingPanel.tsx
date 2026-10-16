import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  cancelLiveOrder, confirmLiveOrder, createLiveBuy, createLiveSell, getLiveOverview, setLiveArmed, setLiveKillSwitch, testLiveSignature,
} from "@/lib/live-trading.functions";

const STATUS: Record<string, string> = {
  pending: "En attente", sending: "Envoi…", sent: "Envoyé", failed: "Échoué", expired: "Expiré", cancelled: "Annulé",
};

function Countdown({ until }: { until: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.ceil((Date.parse(until) - now) / 1000));
  return <span className={s <= 10 ? "text-destructive" : ""}>{s} s</span>;
}

export function LiveTradingPanel() {
  const qc = useQueryClient();
  const overview = useServerFn(getLiveOverview);
  const buy = useServerFn(createLiveBuy);
  const sell = useServerFn(createLiveSell);
  const confirm = useServerFn(confirmLiveOrder);
  const cancel = useServerFn(cancelLiveOrder);
  const kill = useServerFn(setLiveKillSwitch);
  const arm = useServerFn(setLiveArmed);
  const testSig = useServerFn(testLiveSignature);
  const [refusal, setRefusal] = useState<{ title: string; reasons: string[] } | null>(null);
  const [sigResult, setSigResult] = useState<Awaited<ReturnType<typeof testSig>> | null>(null);
  const q = useQuery({ queryKey: ["live-overview"], queryFn: () => overview(), refetchInterval: 5000, refetchIntervalInBackground: false });
  const [mint, setMint] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["live-overview"] });

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(null); refresh(); }
  };

  const d = q.data;
  const g = d?.gates;

  return (
    <section aria-label="Trading réel" className="panel space-y-4 p-4 sm:p-5">
      <div>
        <h2 className="text-base font-semibold">Trading réel (validation manuelle)</h2>
        <p className="text-xs text-muted-foreground">
          Chaque achat ou vente attend votre validation et expire après 60 s. Tant que LIVE_TRADING_ENABLED n'est pas à
          true, la validation signe et simule l'ordre sans jamais l'envoyer.
        </p>
      </div>

      {q.isError && (
        <p className="text-sm text-destructive">
          {q.error instanceof Error && q.error.message ? q.error.message : "Impossible de charger l'état (base de données injoignable ?)."}
        </p>
      )}
      {d?.dbError && <p className="text-sm text-destructive">{d.dbError}</p>}

      {g && (
        <div className="space-y-3">
          <Button
            variant={g.killSwitch ? "secondary" : "destructive"} className="w-full" disabled={busy === "kill"}
            onClick={() => act("kill", () => kill({ data: { on: !g.killSwitch } }))}
          >
            {g.killSwitch ? "Lever l'arrêt d'urgence" : "ARRÊT D'URGENCE — bloquer tous les ordres"}
          </Button>
          <ul className="space-y-1 text-sm">
            <li className="flex justify-between"><span>Envoi réel (LIVE_TRADING_ENABLED)</span><span>{g.envFlag ? "Activé" : "Désactivé"}</span></li>
            <li className="flex items-center justify-between">
              <span>Trading réel armé</span>
              <Switch checked={g.armed} disabled={g.killSwitch || busy === "arm"}
                onCheckedChange={(v) => act("arm", async () => { const r = await arm({ data: { on: v } }); if (!r.ok) toast.error(r.error); })} />
            </li>
            <li className="flex justify-between"><span>Arrêt d'urgence</span><span className={g.killSwitch ? "text-destructive" : ""}>{g.killSwitch ? "ACTIF" : "Non"}</span></li>
          </ul>
        </div>
      )}

      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-sm font-medium">Préparer un achat (5 $)</p>
        <input value={mint} onChange={(e) => setMint(e.target.value)} placeholder="Adresse du contrat"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
        <Button size="sm" disabled={!!busy || mint.trim().length < 32 || g?.killSwitch}
          onClick={() => act("buy", async () => {
            setRefusal(null);
            const r = await buy({ data: { mint: mint.trim() } });
            if (r.ok) toast.success("Ordre prêt — vérifiez puis validez sous 60 s");
            else setRefusal({ title: r.error ?? "Erreur", reasons: r.reasons ?? [] });
          })}>Préparer l'ordre d'achat</Button>
        {refusal && (
          <div className="rounded-md border border-destructive/50 p-3 text-xs">
            <p className="font-medium text-destructive">{refusal.title}</p>
            {refusal.reasons.length > 0 && (
              <ul className="mt-1 space-y-0.5">{refusal.reasons.map((r) => <li key={r}>• {r}</li>)}</ul>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-sm font-medium">Tester la signature Turnkey</p>
        <p className="text-xs text-muted-foreground">
          Fait signer un virement de 0 SOL du compte SMD vers lui-même puis le simule, et vérifie que la policy refuse un
          virement vers une autre adresse. Rien n'est jamais envoyé, aucun SOL requis.
        </p>
        <Button size="sm" variant="secondary" disabled={!!busy || g?.killSwitch}
          onClick={() => act("sig", async () => { setSigResult(await testSig()); })}>Tester la signature (sans envoi)</Button>
        {sigResult && !sigResult.ok && <p className="text-xs text-destructive">{sigResult.message}</p>}
        {sigResult?.ok && (
          <ul className="space-y-1 text-xs">
            {[
              { label: "Policy / signature", ok: sigResult.result.signature.ok, detail: sigResult.result.signature.detail },
              { label: "Simulation", ok: sigResult.result.simulation.ok, detail: sigResult.result.simulation.detail },
              { label: "Virement externe (sonde)", ok: sigResult.result.externalTransfer.refused, detail: sigResult.result.externalTransfer.detail },
              { label: "Envoi", ok: true, detail: "Aucun : sendTransaction n'est jamais appelé par ce test" },
            ].map((r) => (
              <li key={r.label} className="flex justify-between gap-3">
                <span className="shrink-0">{r.ok ? "✓" : r.ok === false ? "✗" : "?"} {r.label}</span>
                <span className={`text-right ${r.ok ? "text-primary" : r.ok === false ? "text-destructive" : "text-muted-foreground"}`}>{r.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {d && d.orders.filter((o) => o.status === "pending").map((o) => (
        <div key={o.id} className="space-y-2 rounded-md border border-primary/40 p-3">
          <div className="flex justify-between text-sm font-medium">
            <span>{o.side === "buy" ? "ACHAT" : "VENTE"} {o.symbol ?? ""}</span>
            <Countdown until={o.expires_at} />
          </div>
          <p className="break-all text-xs text-muted-foreground">{o.mint}</p>
          <ul className="space-y-0.5 text-xs">
            {(d.checks[o.id] ?? []).map((c) => (
              <li key={c.key} className="flex justify-between gap-2">
                <span>{c.pass ? "✓" : "✗"} {c.label}</span>
                <span className={c.pass ? "" : "text-destructive"}>{c.key === "token" ? "conforme" : c.detail}</span>
              </li>
            ))}
            <li className="flex justify-between"><span>Route</span><span>{o.route ?? "?"}</span></li>
          </ul>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" disabled={!!busy}
              onClick={() => act(o.id, async () => {
                const r = await confirm({ data: { id: o.id } });
                (r.status === "sent" || r.status === "dry_run" ? toast.success : toast.error)(r.message);
              })}>Valider</Button>
            <Button size="sm" variant="secondary" disabled={!!busy}
              onClick={() => act(o.id, () => cancel({ data: { id: o.id } }))}>Annuler</Button>
          </div>
        </div>
      ))}

      {d && d.positions.some((p) => p.status === "open") && (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-sm font-medium">Positions réelles ouvertes</p>
          {d.positions.filter((p) => p.status === "open").map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
              <span>{p.symbol} · {Number(p.stake_usd)} ${d.suggestions[p.id] ? ` · vente conseillée (${d.suggestions[p.id]})` : ""}</span>
              <Button size="sm" variant={d.suggestions[p.id] ? "destructive" : "secondary"} disabled={!!busy || g?.killSwitch}
                onClick={() => act(p.id, async () => {
                  const r = await sell({ data: { positionId: p.id, reason: d.suggestions[p.id] ?? null } });
                  if (r.ok) toast.success("Vente prête — validez sous 60 s"); else toast.error(r.error);
                })}>Préparer la vente</Button>
            </div>
          ))}
        </div>
      )}

      {d && d.orders.length > 0 && (
        <div className="space-y-1 border-t border-border pt-3 text-xs">
          <p className="text-sm font-medium">Derniers ordres</p>
          {d.orders.filter((o) => o.status !== "pending").slice(0, 8).map((o) => (
            <p key={o.id} className="break-words">
              {new Date(o.created_at).toLocaleTimeString("fr-FR")} · {o.side === "buy" ? "Achat" : "Vente"} {o.symbol} · {STATUS[o.status] ?? o.status}
              {o.error ? ` — ${o.error}` : ""}
              {o.signature && <> · <a className="underline" href={`https://solscan.io/tx/${o.signature}`} target="_blank" rel="noreferrer">Solscan</a></>}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
