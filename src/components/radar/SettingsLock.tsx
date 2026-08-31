import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { Lock, LockOpen, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getSettingsGateStatus,
  lockSettings,
  unlockSettings,
} from "@/lib/settings-gate.functions";
import { clearUnlockToken, storeUnlockToken } from "@/lib/settings-gate.storage";

const GATE_KEY = ["settings_gate"] as const;

export function useSettingsGate() {
  const status = useServerFn(getSettingsGateStatus);
  return useQuery({
    queryKey: GATE_KEY,
    queryFn: () => status(),
    staleTime: 30_000,
  });
}

export function useLockSettings() {
  const lock = useServerFn(lockSettings);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => lock(),
    onSuccess: () => {
      clearUnlockToken();
      return queryClient.invalidateQueries({ queryKey: GATE_KEY });
    },
  });
}

/** Écran de verrouillage : le mot de passe n'est jamais stocké côté client. */
export function SettingsLockScreen() {
  const queryClient = useQueryClient();
  const unlock = useServerFn(unlockSettings);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (value: string) => unlock({ data: { password: value } }),
    onSuccess: async (result) => {
      if (result.ok) {
        if (result.token) storeUnlockToken(result.token);
        setPassword("");
        setError(null);
        await queryClient.invalidateQueries({ queryKey: GATE_KEY });
      } else {
        setPassword("");
        setError(result.message ?? "Mot de passe incorrect.");
      }
    },
    onError: () => setError("Vérification impossible pour le moment."),
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password) {
      setError("Saisissez le mot de passe.");
      return;
    }
    mutation.mutate(password);
  };

  return (
    <section
      aria-label="Accès protégé aux paramètres"
      className="panel mx-auto max-w-md space-y-5 p-5 sm:p-6"
    >
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-secondary">
          <Lock className="size-5 text-primary" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-base font-semibold">Paramètres verrouillés</h2>
          <p className="text-xs text-muted-foreground">
            Saisissez le mot de passe pour accéder aux réglages.
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <Label htmlFor="settings-password">Mot de passe</Label>
        <Input
          id="settings-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
        {error ? (
          <p role="alert" className="flex items-start gap-2 text-xs text-destructive">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={mutation.isPending} className="w-full">
          <LockOpen className="size-4" aria-hidden="true" />
          Déverrouiller
        </Button>
      </form>

      <p className="text-xs text-muted-foreground">
        La collecte, le scoring et les alertes Telegram continuent de fonctionner même
        lorsque les Paramètres sont verrouillés.
      </p>
    </section>
  );
}

/** Bouton « Verrouiller » : ferme immédiatement la session Paramètres. */
export function SettingsLockButton() {
  const lock = useLockSettings();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => lock.mutate()}
      disabled={lock.isPending}
    >
      <Lock className="size-4" aria-hidden="true" />
      Verrouiller
    </Button>
  );
}
