# Intégrer le logo Meme Radar

## Objectif
Utiliser le logo fourni (Shiba + radar) comme identité visuelle de l'app, optimisé pour le web.

## Ce qui sera fait

1. **Optimisation du logo**
   - Version détourée sur fond transparent (PNG), recadrée sans marge noire inutile.
   - Version compacte carrée pour le header (petite taille, lisible à 40px).
   - Hébergement via le CDN d'assets Lovable (le binaire ne reste pas dans le repo).

2. **Header (`AppShell`)**
   - Remplacement de l'icône générique "Activity" dans le carré vert par le logo.
   - Le texte "Meme Radar" et le sous-titre « 1M$ soon … Pseaume91 » restent inchangés.
   - Taille adaptée mobile/desktop, `alt` accessible.

3. **Favicon**
   - Génération d'un favicon carré 64x64 depuis le logo, placé dans `public/favicon.png`.
   - Mise à jour du `<link rel="icon">` dans la route racine, suppression de l'ancien `favicon.ico`.

4. **Partage social (optionnel, inclus)**
   - Ajout de l'URL absolue du logo en `og:image` / `twitter:image` sur la page Radar.

## Hors périmètre
Aucun changement du scanner, du scoring, des alertes Telegram ou du worker.

## Détails techniques
- `imagegen--edit_image` pour le détourage/nettoyage, `magick` pour le redimensionnement du favicon.
- Pointeur `src/assets/meme-radar-logo.png.asset.json` importé dans `AppShell.tsx`.
- Vérification finale : build + preview.
