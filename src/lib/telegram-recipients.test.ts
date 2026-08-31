import { describe, expect, it } from "vitest";
import {
  DEFAULT_SECONDARY_PREFS,
  OWNER_PREFS,
  acceptsCategory,
  evaluateInvite,
  formatInviteCode,
  maskChatId,
  normalizeInviteCode,
  normalizePrefs,
  parseStartCommand,
} from "./telegram-recipients";

const future = () => new Date(Date.now() + 60 * 60_000).toISOString();
const past = () => new Date(Date.now() - 60_000).toISOString();

describe("invitations", () => {
  it("accepte une invitation valide", () => {
    expect(evaluateInvite({ expires_at: future(), used_at: null, revoked_at: null })).toBe("valid");
  });

  it("rejette un code inconnu", () => {
    expect(evaluateInvite(null)).toBe("unknown");
  });

  it("rejette un code expiré", () => {
    expect(evaluateInvite({ expires_at: past(), used_at: null, revoked_at: null })).toBe("expired");
  });

  it("rejette un code déjà utilisé", () => {
    expect(
      evaluateInvite({ expires_at: future(), used_at: new Date().toISOString(), revoked_at: null }),
    ).toBe("used");
  });

  it("rejette un code annulé", () => {
    expect(
      evaluateInvite({ expires_at: future(), used_at: null, revoked_at: new Date().toISOString() }),
    ).toBe("revoked");
  });

  it("génère un code lisible sans caractères ambigus", () => {
    const code = formatInviteCode(new Uint8Array(32).map((_, i) => i * 7));
    expect(code).toHaveLength(10);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]+$/);
  });

  it("normalise la saisie du code", () => {
    expect(normalizeInviteCode(" ab-cd 23 ")).toBe("ABCD23");
  });
});

describe("commande /start", () => {
  it("extrait le code", () => {
    expect(parseStartCommand("/start ABCD234XYZ")).toEqual({ code: "ABCD234XYZ" });
  });

  it("gère /start sans code", () => {
    expect(parseStartCommand("/start")).toEqual({ code: null });
  });

  it("gère /start@bot CODE", () => {
    expect(parseStartCommand("/start@meme_radar_bot abcd")).toEqual({ code: "ABCD" });
  });

  it("ignore les autres messages", () => {
    expect(parseStartCommand("bonjour")).toBeNull();
    expect(parseStartCommand("/status")).toBeNull();
    expect(parseStartCommand(null)).toBeNull();
  });
});

describe("préférences et distribution", () => {
  it("le propriétaire reçoit toujours tout, même préférences vides", () => {
    const owner = {
      role: "owner" as const,
      is_active: true,
      prefs: normalizePrefs({ early_opportunity: false, now: false }, OWNER_PREFS),
    };
    expect(acceptsCategory(owner, "early_opportunity")).toBe(true);
    expect(acceptsCategory(owner, "now")).toBe(true);
  });

  it("un secondaire ne reçoit que ses catégories activées", () => {
    const secondary = {
      role: "secondary" as const,
      is_active: true,
      prefs: normalizePrefs({ smart_wallet: false }),
    };
    expect(acceptsCategory(secondary, "smart_wallet")).toBe(false);
    expect(acceptsCategory(secondary, "early_opportunity")).toBe(true);
    expect(acceptsCategory(secondary, "now")).toBe(false); // désactivé par défaut
  });

  it("un secondaire révoqué/suspendu ne reçoit plus rien", () => {
    const suspended = {
      role: "secondary" as const,
      is_active: false,
      prefs: DEFAULT_SECONDARY_PREFS,
    };
    for (const category of ["early_opportunity", "smart_wallet", "risk", "tracking", "general"] as const) {
      expect(acceptsCategory(suspended, category)).toBe(false);
    }
  });

  it("ignore les valeurs non booléennes envoyées par l'UI", () => {
    const prefs = normalizePrefs({ risk: "oui", tracking: false });
    expect(prefs.risk).toBe(true);
    expect(prefs.tracking).toBe(false);
  });
});

describe("confidentialité", () => {
  it("masque le chat_id", () => {
    expect(maskChatId("123456789")).toBe("••••789");
  });
});
