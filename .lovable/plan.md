# Ajouter les identifiants Turnkey au backend (aucun code, aucune transaction)

## Constat
- Aucun secret Turnkey n'est encore configuré. Les secrets déjà présents sont ceux du RPC Solana, de Telegram, du worker et des Paramètres.
- Le code ne contient encore **aucune** intégration Turnkey : rien ne lira ces secrets tant que l'étape suivante n'est pas faite. Le trading réel reste désactivé : les trois verrous du code sont à `false`.
- Le fichier `turnkey-api-credentials-….json` contient les **identifiants de l'API key** (clé publique + clé privée de l'API), **pas** la clé du wallet. Ne le téléversez et ne le collez jamais dans le chat.

## Secrets à créer (noms exacts)
| Nom | Contenu | Où le trouver | Secret ? |
|---|---|---|---|
| `TURNKEY_API_PUBLIC_KEY` | clé publique de l'API | champ `publicKey` du JSON | peu sensible |
| `TURNKEY_API_PRIVATE_KEY` | clé privée de l'API | champ `privateKey` du JSON | **OUI, très sensible** |
| `TURNKEY_ORGANIZATION_ID` | ID de l'organisation | menu en haut à droite de Turnkey (bouton copier), parfois aussi dans le JSON | non |
| `TURNKEY_SIGN_WITH` | adresse publique Solana du compte « SMD » | Turnkey → Wallets → Meme radar → SMD | non |
| `LIVE_TRADING_ENABLED` | `false` | à saisir tel quel | non |

`TURNKEY_API_BASE_URL` est optionnel : il ne sert que si vous voulez une autre adresse que celle par défaut, `https://api.turnkey.com`.

Les noms de champs exacts du JSON peuvent varier selon la version de Turnkey. Si vous ne trouvez pas `publicKey` / `privateKey`, cherchez des noms proches, par exemple `apiPublicKey` / `apiPrivateKey`.

## Lire le JSON localement, sans rien exposer
1. Ouvrez le fichier sur votre ordinateur avec un éditeur de texte simple (Bloc-notes, TextEdit). Évitez un navigateur ou un outil en ligne.
2. Repérez les champs de clé publique et de clé privée. Ne copiez que la valeur entre guillemets, sans les guillemets.
3. Copiez une valeur, collez-la directement dans le formulaire des secrets (étape suivante), puis passez à la suivante. Ne la collez nulle part ailleurs : ni chat, ni e-mail, ni note.
4. Une fois tout enregistré, rangez le fichier dans un endroit sûr (gestionnaire de mots de passe, dossier chiffré) ou supprimez-le, et videz la corbeille. Si la clé fuit un jour, supprimez cette API key dans Turnkey et créez-en une nouvelle.

## Où les ajouter dans Lovable
- Dans le projet, ouvrez **Project Settings → Secrets**, puis ajoutez chaque nom ci-dessus avec sa valeur.
- Autre option, après votre accord : j'ouvre moi-même un formulaire sécurisé ici, où vous saisissez les valeurs. Elles vont directement dans le stockage chiffré, sans jamais passer par le chat ni par moi.
- Rien à ajouter sur Render.

## Étapes suivantes (chacune sur votre accord)
1. Vous ajoutez les 5 secrets. Je vérifie seulement qu'ils existent, sans jamais lire leur contenu.
2. Je construis un module serveur Turnkey en **lecture seule** : il vérifie l'identité de l'API et l'adresse SMD, sans rien signer.
3. Mode « shadow » : les ordres sont construits mais pas signés.
4. Signature, puis simulation par le RPC, toujours sans envoi.
5. Premier vrai envoi uniquement sur votre validation explicite.

## Limites confirmées pour le trading réel
- Capital engagé en même temps : **15 USD maximum** (au lieu de 60). La simulation et la mémoire du projet seront alignées à l'étape de code, sur votre accord.
- Inchangé : 5 USD par position, 15 USD par token, 3 achats et 15 USD de nouvelles entrées par jour, perte journalière maximale de -15 USD, mêmes règles d'entrée et de sortie.
- **Compatibilité** : 5 USD par position avec 15 USD au total, cela fait au plus 3 positions ouvertes en même temps. C'est cohérent avec les 3 achats par jour. Comme on ne renforce jamais une position, le plafond de 15 USD par token ne sera jamais atteint.
- **Le stop de -15 USD n'est pas une garantie** : c'est une règle du logiciel. En cas de chute brutale, de liquidité retirée (rug), de glissement de prix ou de frais, la vente peut se faire bien plus bas que prévu. Un token peut même devenir invendable. La vraie limite, c'est le montant laissé sur le compte SMD : n'y mettez pas plus de 15 USD, plus un peu de SOL pour les frais.
