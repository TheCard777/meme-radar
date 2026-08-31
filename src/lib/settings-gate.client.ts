/**
 * Stockage client du jeton de session Paramètres (repli quand le cookie
 * HttpOnly est bloqué, p. ex. aperçu affiché en iframe).
 *
 * Le jeton est signé côté serveur, expire avec la session et ne contient
 * jamais le mot de passe. Il vit en sessionStorage : effacé à la fermeture
 * de l'onglet et par le bouton « Verrouiller ».
 */
export const SETTINGS_UNLOCK_HEADER = "x-settings-unlock";
const STORAGE_KEY = "mr-settings-unlock";

export function storeUnlockToken(token: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, token);
  } catch {
    /* stockage indisponible : le cookie de session prend le relais */
  }
}

export function readUnlockToken(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearUnlockToken(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
