# Valeurs déjà définies + création de la clé API Turnkey (aucun code modifié)

## 1. Valeurs exactes déjà fournies (message du 16/10 à 04:43, codées dans la stratégie de simulation)
Devise : **USD**.

**Limites de risque (argent)**
- Mise par position : 5 USD
- Plafond par token : 15 USD
- Nouvelles entrées par jour : 15 USD au maximum, et 3 achats au maximum
- Budget engagé total : 60 USD
- Perte journalière maximale : -15 USD (pertes réalisées + latentes), puis plus aucune entrée jusqu'au lendemain (UTC)
- Pas de renforcement à la baisse, pas de réentrée sur le même token le même jour

**Seuils d'entrée (trading)**
- Score d'opportunité supérieur ou égal à 90
- Risk Score strictement inférieur à 30
- Confiance d'au moins 80 % sur les deux scores
- Âge du token entre 5 min et 2 h, pool DEX actif après migration
- Liquidité d'au moins 20 000 USD, volume 1 h d'au moins 5 000 USD, accélération d'au moins 1,5x, volume jamais supérieur à 15x la liquidité

**Sorties**
- Stop-loss -20 %, take-profit +30 %, durée de détention maximale 60 min
- Sortie aussi si le Risk Score atteint 55 ou si la liquidité baisse de 30 % ou plus

**Seuils de détection (alertes, pas trading)**
- Seuils Telegram Signal/Critique et Smart Wallet réglés dans Paramètres, à ne pas confondre avec le seuil d'entrée de 90.

**Écart à signaler**
- Ma réponse précédente parlait de 15 pour le capital et de 1,5 par position. Les vraies valeurs sont 5 USD par position, 15 USD par jour et 60 USD engagés au total.
- Votre dernier message parle d'un capital maximum de 15. Il faut choisir entre :
  - 15 USD par jour avec 60 USD engagés au total (déjà prévu) ;
  - ramener le total engagé à 15 USD. C'est la solution la plus sûre si vous acceptez de perdre seulement 15.

## 2. Créer la clé API Turnkey (app.turnkey.com)
1. Connectez-vous à app.turnkey.com.
2. **Organization ID** : cliquez sur votre nom ou sur l'organisation en haut à droite. L'ID est affiché dans le menu, avec un bouton pour le copier. Il n'est pas secret.
3. Créez un utilisateur dédié : menu **Users** → **Add user** → type **API key only**, nommez-le par exemple « meme-radar-server ». Ne lui donnez pas les droits root.
4. Pendant cette création, ou plus tard depuis la fiche de l'utilisateur (**Create API key**), choisissez la clé **générée dans le navigateur**, de type P-256.
5. Turnkey affiche la **clé publique** et la **clé privée** de l'API. La clé privée n'apparaît **qu'une seule fois**.
6. Confirmez avec votre passkey.
7. **Wallets** → « Meme radar » → compte « SMD » : copiez l'adresse publique Solana. Elle n'est pas secrète.
8. **Policies** : autorisez cet utilisateur à signer seulement avec « SMD ». Le reste des règles (Pump.fun, plafond par opération) sera fait à l'étape suivante.

**À garder secret** : la clé privée de l'API. Saisissez-la **uniquement** dans Project Settings → Secrets sous le nom `TURNKEY_API_PRIVATE_KEY`. Ne l'envoyez **jamais dans le chat**.

Les menus de Turnkey peuvent changer : si un intitulé diffère, cherchez « API keys » dans la fiche de l'utilisateur.

## Aucune action
Aucun code modifié, aucun déploiement, aucune transaction.
