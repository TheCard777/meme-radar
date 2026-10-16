# Préparation du trading automatique Pump.fun avec Turnkey (audit + plan, aucun code modifié)

## Constat de l'audit
- L'app et le worker **ne savent pas acheter ni vendre**. Aucun code de signature, d'envoi de transaction, de swap (Jupiter/Pump.fun) ni de Turnkey dans le projet.
- Trois verrous en dur, tous à `false` : `TRADING_ENABLED` (collector `constants.ts`, qui fait planter le collector s'il passe à true), `TRADING_ENABLED` (`scanner.server.ts`), `REAL_TRADING_ENABLED` (`paper-strategy.ts`).
- Architecture actuelle : worker Render (WebSocket Solana, lecture seule) → API `/api/public/worker/*` protégée par `MEME_RADAR_WORKER_TOKEN` → Lovable Cloud (scoring, alertes, Telegram). Le RPC sert uniquement à lire.
- La stratégie papier (onglet « Simulation ») existe déjà : éligibilité, positions simulées, PnL, limites. C'est la base à réutiliser.

## Principes
- Live **désactivé par défaut**, et il faut trois conditions à la fois pour l'activer : un drapeau serveur, un interrupteur dans Paramètres (protégé par mot de passe) et une **validation manuelle par ordre**.
- Turnkey utilisé **côté serveur uniquement**, jamais dans le navigateur ni dans le worker Render. Aucune clé privée : Turnkey signe dans son enclave.
- Le worker ne fait que proposer. Les ordres sont décidés et signés dans Lovable Cloud.

## Étapes
1. **Capital** : confirmer la devise (15 SOL ou 15 USDC/USD — très différent). Hypothèse par défaut : 15 USD convertis en SOL.
2. **Mode « shadow »** : la stratégie papier construit de vrais ordres Pump.fun (achat/vente) **sans les signer**, et les journalise avec le prix attendu et le slippage estimé.
3. **Intégration Turnkey (signature seule)** : module serveur qui demande à Turnkey de signer une transaction pour le compte « SMD ». Test avec `simulateTransaction` du RPC, toujours sans envoi.
4. **Politiques Turnkey (dans le tableau de bord)** : n'autoriser que le programme Pump.fun (+ System/Token/ATA), plafond de SOL par transaction, aucun transfert vers une adresse externe.
5. **Limites de risque côté app** : capital total ≤ 15, mise max par position (ex. 1,5), 3 positions ouvertes max, perte journalière max (ex. 5) puis arrêt automatique, slippage max, stop-loss / take-profit, temps de détention max, liste noire (Risk Score élevé, alerte rug).
6. **Validation manuelle** : chaque ordre live crée une demande « en attente » ; envoi seulement après clic « Valider » dans Paramètres (ou bouton Telegram, plus tard). Expiration après 60 s.
7. **Bouton d'arrêt d'urgence** : coupe tout envoi instantanément, et vente de toutes les positions sur validation.
8. **Premier essai réel** : une seule transaction minuscule (ex. 0,01 SOL), validée par vous, puis contrôle sur Solscan.

## Variables serveur nécessaires (valeurs jamais dans le chat)
- `TURNKEY_API_PUBLIC_KEY` — clé publique de l'API key Turnkey
- `TURNKEY_API_PRIVATE_KEY` — clé privée de l'**API key** (pas celle du wallet), saisie uniquement dans Project Settings → Secrets
- `TURNKEY_ORGANIZATION_ID` — ID de l'organisation Turnkey
- `TURNKEY_SIGN_WITH` — adresse Solana publique du compte « SMD »
- `TURNKEY_API_BASE_URL` — optionnel, par défaut `https://api.turnkey.com`
- `LIVE_TRADING_ENABLED` — drapeau serveur, `false` par défaut
- `SOLANA_RPC_URL` — déjà configuré (sert aussi à envoyer)

Render n'a besoin d'**aucune** nouvelle variable.

## Étapes manuelles
**Turnkey :**
- Créer un utilisateur API dédié (non-root) avec sa paire de clés API, en notant les clés hors du chat.
- Créer les politiques : autoriser la signature uniquement pour « SMD », uniquement pour Pump.fun, avec un plafond de montant. Refuser tout le reste.
- Alimenter « SMD » avec au maximum 15 et un peu de SOL pour les frais.

**Lovable :** ajouter les secrets ci-dessus dans Project Settings → Secrets, laisser `LIVE_TRADING_ENABLED=false`.

**Render :** rien à changer. Le worker reste en lecture seule.

## Détails techniques
- Nouveaux modules : `src/lib/turnkey.server.ts` (`@turnkey/sdk-server` + `@turnkey/solana`, compatible Worker à vérifier, sinon appels HTTP signés), `src/lib/pumpfun-tx.server.ts` (construction des instructions buy/sell via `@solana/web3.js`), `src/lib/live-trading.server.ts` (vérification des limites et des verrous, file d'ordres).
- Changements de base de données (étape suivante, après accord) : `trade_orders` (pending/approved/sent/failed, signature, montants), `trade_positions`, `trading_limits` dans `bot_settings`. Accès en écriture réservé au serveur, RLS appliqué.
- Les verrous existants restent à `false`. Un nouveau verrou séparé se lit au moment de l'envoi, pas au chargement.
- Tests : limites, verrous, expiration de validation, refus si le simulateur RPC échoue.
