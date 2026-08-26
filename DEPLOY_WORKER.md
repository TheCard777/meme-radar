# Déploiement du worker Meme Radar (24/7)

Le worker est un processus **long-running** indépendant du navigateur et du
runtime web. Il fait trois choses, **en lecture seule** :

1. Souscription WebSocket aux logs Solana (Pump.fun) → détection de nouveaux tokens.
2. Analyse on-chain des premiers acheteurs → smart wallets réels.
3. Enrichissement + scoring + alertes Telegram (SIGNAL 85-89, PRIORITÉ 90-100).

> **Aucun trading.** Le worker ne signe rien, n'utilise aucune clé privée de
> wallet et ne passe aucun ordre. Il ne fait que lire la blockchain et écrire
> dans la base.

## 1. Commande de démarrage

Le worker est bundlé en JavaScript pur (esbuild) puis exécuté par **Node ≥ 20**.
Aucune dépendance à Bun au runtime.

```bash
npm install --include=dev && npm run build:worker   # build  -> dist/worker.mjs
npm run start:worker                                # start  -> node dist/worker.mjs
```

Bun reste possible en local : `bun run worker:bun`.

> ⚠️ Ne jamais démarrer directement `src/collector/main.ts` avec Node : Node ne
> lit pas le TypeScript ni l'alias `@/`, d'où le crash
> `Error: ENOENT ... statSync` observé sur Railway.

## 2. Variables d'environnement (Railway / Render / Fly / VPS)

Le worker n'accède plus directement à la base : il passe par l'API sécurisée
Meme Radar (Edge/serveur Lovable Cloud). **Aucune service-role key sur Railway.**

| Variable | Obligatoire | Rôle |
| --- | --- | --- |
| `SOLANA_RPC_URL` | oui | RPC HTTPS Solana (lecture seule) |
| `MEME_RADAR_API_URL` | oui | Base de l'app, ex. `https://project--093cfa11-923c-45a0-9fdd-610af01e0cd1.lovable.app` |
| `MEME_RADAR_WORKER_TOKEN` | oui | Secret partagé (identique au secret Lovable Cloud du même nom) |
| `SOLANA_WS_URL` | non | WebSocket ; à défaut, dérivé du RPC (`http`→`ws`) |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | non | Restent côté Lovable Cloud ; inutiles sur Railway |

Mode hérité (local uniquement) : si `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
sont présents et que les variables `MEME_RADAR_*` sont absentes, le worker écrit
directement en base.

### API du worker (toutes en `Bearer $MEME_RADAR_WORKER_TOKEN`)

| Méthode | URL | Payload |
| --- | --- | --- |
| POST | `/api/public/worker/tokens` | `{"tokens":[{"mintAddress","signature","source"}]}` |
| POST | `/api/public/worker/snapshots` | `{"snapshots":[{"mintAddress","marketCap","volume","liquidityUsd","priceUsd","buyers","score"}]}` |
| POST | `/api/public/worker/wallets` | `{"wallets":[{"address","smartWalletScore","earlyEntries","tokensTracked","successCount","successRate","medianMultiple","dataSufficient","reasons"}],"entries":[{"walletAddress","mintAddress","signature","entryRank","amountRaw","blockTime"}]}` |
| POST | `/api/public/worker/scores` | `{"scores":[{"mintAddress","score","scoreFactors","scoreConfidence","dataSufficient","missingMetrics","status","smartWalletCount"}]}` |
| POST | `/api/public/worker/alerts` | `{"mintAddress","level":"signal|critical","score","message","channel","priceUsdAtAlert","marketCapAtAlert","alertLevel":"none|signal|priority","alertedScore"}` |
| POST | `/api/public/worker/state` | rapport heartbeat du collecteur |
| POST | `/api/public/worker/enrich` | `{}` — lance wallets + enrichissement + scoring + Telegram côté Cloud |
| GET | `/api/public/worker/read?resource=state\|settings\|tokens\|wallets` | lecture |

Toutes les écritures restent sur les données réelles (`is_simulated = false`),
RLS et service-role restent exclusivement côté serveur, et chaque appel est
journalisé (`scope: "worker-api"`) sans jamais loguer de secret.


Options :

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `COLLECTOR_PROGRAM_FILTER` | `on` | `off` = écoute tous les logs |
| `COLLECTOR_PROGRAM_ID` | Pump.fun | Program ID surveillé |
| `COLLECTOR_ENRICH` | `on` | `off` = désactive scoring/alertes dans le worker |
| `COLLECTOR_ENRICH_INTERVAL_MS` | `90000` | Intervalle du cycle (min. 30 s) |

**Aucun secret ne doit être committé dans le dépôt.** Toutes ces valeurs se
saisissent dans le panneau « Variables » de l'hébergeur.

## 3. Étapes exactes sur Railway

1. **New Project → Deploy from GitHub repo** et sélectionner ce dépôt.
2. Dans le service créé :
   - **Settings → Build → Build Command** = `npm install --include=dev && npm run build:worker`
   - **Settings → Deploy → Start Command** = `npm run start:worker`
   (Le fichier `railway.json` du dépôt configure déjà ces deux commandes.)
3. **Variables obligatoires** : ajouter `SOLANA_RPC_URL`, `MEME_RADAR_API_URL` et
   `MEME_RADAR_WORKER_TOKEN`. Optionnel : `SOLANA_WS_URL`. Telegram et la base
   restent configurés côté Lovable Cloud uniquement.


4. **Settings → Restart Policy** : `On Failure`, 10 tentatives.
5. Déployer, puis ouvrir les **Logs** : des lignes JSON
   `{"level":"info","scope":"collector",...}` doivent apparaître en continu.
6. Vérifier le dashboard : le panneau **Collecteur** doit passer de
   « Worker externe requis » à `running` avec un heartbeat récent.

Render / Fly / VPS : même principe (Background Worker / `fly.toml` process /
service systemd avec `Restart=always`).

## 4. Robustesse déjà intégrée

- Reconnexion WebSocket avec backoff exponentiel + jitter, single-flight.
- Bascule automatique entre `SOLANA_WS_URL` et l'URL dérivée du RPC.
- Heartbeat + watchdog écrits dans `collector_state` (état persistant).
- Arrêt propre sur `SIGINT`/`SIGTERM` (fermeture socket, arrêt des timers).
- Déduplication par signature et par mint côté base.
- Logs structurés JSON (compatibles avec l'agrégation Railway).

## 5. Contrôle santé

- `GET /api/public/collector-health` — état demandé/réel, activité, compteurs.
- `GET /api/public/health` — RPC, Telegram, base de données.

Tant qu'aucun heartbeat récent n'est reçu, le dashboard affiche explicitement
**« Worker externe requis »** : rien n'est simulé.
