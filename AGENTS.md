<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Live trading
- Real orders flow only through `src/lib/live-trading.server.ts` (Jupiter quote → pending order 60 s → manual confirm → Turnkey sign → RPC simulate → send); pure limits/preflight live in `src/lib/live-orders.ts`. Why: one audited path, testable rules.
- Sending requires env `LIVE_TRADING_ENABLED=true` AND `bot_settings.live_trading_armed` AND no kill switch; otherwise confirm does sign+simulate only. Why: real money needs three independent gates.
