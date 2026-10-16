# Intégration Turnkey côté serveur (trading réel désactivé par défaut)

## État vérifié
- Secrets déjà présents : `SOLANA_RPC_URL`, `SOLANA_WS_URL`, Telegram, `MEME_RADAR_WORKER_TOKEN`, `SETTINGS_PASSWORD`, `SETTINGS_SESSION_SECRET`. **Aucun secret Turnkey n'est encore enregistré.**
- Aucun code Turnkey, de signature ou d'envoi de transaction. Les verrous `TRADING_ENABLED` / `REAL_TRADING_ENABLED` sont à `false`.
- Les règles de la stratégie existent déjà en simulation (`paper-strategy.ts`), mais avec un plafond engagé de 60 USD, à passer à 30 USD.

## Étape 1 : vous ajoutez les secrets (aucune valeur dans le chat)
Où : dans le projet, **Project Settings → Secrets → Add secret**. Autre option : je vous ouvre un formulaire sécurisé ici, et les valeurs vont directement dans le stockage chiffré, sans jamais passer par moi.

| Nom exact | Source | Obligatoire |
|---|---|---|
| `TURNKEY_API_PUBLIC_KEY` | JSON téléchargé, champ de clé publique | oui |
| `TURNKEY_API_PRIVATE_KEY` | JSON téléchargé, champ de clé privée (clé de l'API, pas du wallet) | oui, très sensible |
| `TURNKEY_ORGANIZATION_ID` | Turnkey, menu en haut à droite | oui |
| `TURNKEY_SIGN_WITH` | adresse publique Solana du compte « SMD » | oui |
| `LIVE_TRADING_ENABLED` | saisir `false` | oui |
| `TURNKEY_API_BASE_URL` | seulement pour une autre adresse que `https://api.turnkey.com` | non |

Lisez le JSON localement, dans un éditeur de texte, et copiez-collez chaque valeur directement dans le formulaire des secrets. Ensuite, rangez le fichier dans un endroit sûr ou supprimez-le. Render : rien à ajouter.

## Étape 2 : prérequis manquants à régler
1. **Règles (policies) Turnkey** : l'utilisateur API ne doit pouvoir signer qu'avec SMD, sans transfert de SOL vers une adresse externe. Je fournirai le texte exact de la règle à coller dans Turnkey → Policies.
2. **Solde de SMD** : à alimenter seulement avant le premier test réel. Au maximum ce que vous acceptez de perdre (environ 30 USD), plus environ 0,05 SOL pour les frais.
3. **Où se font les achats** : la règle « pool DEX actif après migration » exclut la courbe de lancement Pump.fun. Les achats passent donc par le pool où le token a migré (PumpSwap ou Raydium), via l'agrégateur public **Jupiter**, sans clé. À confirmer par vous.
4. **RPC** : le `SOLANA_RPC_URL` actuel doit accepter l'envoi de transactions. C'est à vérifier par une simulation, sans aucun envoi.

## Étape 3 : code (après votre accord, trading réel toujours désactivé)
1. `turnkey.server.ts` : vérification de l'identité de l'API et de l'adresse SMD, en lecture seule. Expose seulement « configuré oui/non ».
2. `live-limits.ts` (logique pure + tests) : 30 USD engagés en même temps, 5 USD par position, 15 USD par token, 3 achats et 15 USD de nouvelles entrées par jour, -15 USD de perte par jour, ainsi que les critères d'entrée et de sortie demandés. La simulation passe aussi à 30 USD.
3. Base de données : tables `trade_orders` (en attente / validé / envoyé / échoué) et `trade_positions`, écriture réservée au serveur.
4. **Mode shadow** : ordres construits via Jupiter, journalisés, ni signés ni envoyés.
5. **Signature + simulation** : signature Turnkey, puis simulation par le RPC, **sans envoi**.
6. **Validation manuelle** dans Paramètres (protégés par mot de passe) : chaque ordre expire après 60 s, avec un bouton d'arrêt d'urgence.
7. L'envoi réel n'est possible que si `LIVE_TRADING_ENABLED=true`, l'interrupteur des Paramètres est activé **et** vous validez l'ordre. Premier essai : une seule transaction minuscule, validée par vous.

## Garanties
- Rien n'est publié ni déployé, et aucune transaction n'est faite sans votre validation explicite.
- Le stop de -15 USD par jour est une règle du logiciel. Le glissement de prix, une liquidité retirée ou un token devenu invendable peuvent faire perdre davantage. La vraie limite, c'est le solde de SMD.
