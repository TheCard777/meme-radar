# Meme Radar

Surveillance Solana en lecture seule. Aucun trading et aucune clé privée.

## Déployer le collecteur 24/7

L’application web vérifie le RPC, affiche les données et pilote l’état demandé. Le collecteur
WebSocket doit tourner sur un hébergeur à processus permanent (Railway, Fly.io, Render worker,
VPS ou machine locale). Le bouton « Démarrer » ne peut pas créer ce processus : il lui demande
seulement de commencer la surveillance via la base.

1. Synchroniser ce dépôt avec GitHub puis le connecter à l’hébergeur choisi.
2. Utiliser la commande de démarrage `bun run src/collector/main.ts`.
3. Configurer sur cet hébergeur les variables serveur `SOLANA_RPC_URL`, `SOLANA_WS_URL`,
   `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`.
4. Démarrer le service, puis cliquer sur « Démarrer le collecteur » dans Meme Radar.
5. Vérifier que l’état devient « En cours », que le heartbeat reste récent et que les compteurs
   progressent. L’endpoint `/api/public/collector-health` permet aussi une supervision externe.

Le filtre Pump.fun est actif par défaut. `COLLECTOR_PROGRAM_FILTER=off` écoute tous les logs et
`COLLECTOR_PROGRAM_ID=<id>` change le programme surveillé. Le worker ne signe ni n’envoie jamais
de transaction.

### Telegram et données de démonstration

Telegram est déjà configuré et le test manuel fonctionne. L’envoi automatique n’est pas encore
relié aux détections réelles : il sera activé seulement après validation de l’enrichissement et du
scoring, afin d’éviter le spam et les faux signaux.

Les seeds ne doivent pas être supprimés pour démarrer le collecteur. Ils restent marqués
`is_simulated=true`; chaque token confirmé par le worker est enregistré avec
`is_simulated=false`. L’interface affiche séparément les volumes « réel » et « démo ».

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
