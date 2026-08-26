import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/radar/AppShell";
import { TelegramPanel } from "@/components/radar/TelegramPanel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useBotSettings, useUpdateSettings } from "@/lib/radar-hooks";
import { SIGNAL_CATEGORY_LABELS, type SignalCategories } from "@/lib/radar-types";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Paramètres de scoring — Meme Radar" },
      {
        name: "description",
        content:
          "Réglez les seuils d’alerte Telegram et critique et activez les catégories de signaux du radar Solana.",
      },
      { property: "og:title", content: "Paramètres de scoring — Meme Radar" },
      {
        property: "og:description",
        content: "Seuils d’alerte et catégories de signaux du scoring Meme Radar.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { data: settings, isLoading } = useBotSettings();
  const update = useUpdateSettings();

  const [telegram, setTelegram] = useState(85);
  const [critical, setCritical] = useState(90);
  const [categories, setCategories] = useState<SignalCategories | null>(null);

  useEffect(() => {
    if (!settings) return;
    setTelegram(settings.telegram_threshold);
    setCritical(settings.critical_threshold);
    setCategories(settings.signal_categories);
  }, [settings]);

  const save = () => {
    if (!settings || !categories) return;
    update.mutate(
      {
        id: settings.id,
        patch: {
          telegram_threshold: telegram,
          critical_threshold: critical,
          signal_categories: categories,
        },
      },
      { onSuccess: () => toast.success("Paramètres enregistrés") },
    );
  };

  return (
    <AppShell
      title="Paramètres"
      subtitle="Seuils de scoring, catégories de signaux et intégration Telegram."
    >
      {isLoading || !categories ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section aria-label="Seuils de scoring" className="panel space-y-6 p-4 sm:p-5">
            <h2 className="text-base font-semibold">Seuils de scoring</h2>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="telegram-threshold">Seuil d’alerte Telegram</Label>
                <span className="font-mono text-sm text-primary">{telegram}</span>
              </div>
              <Slider
                id="telegram-threshold"
                min={50}
                max={100}
                step={1}
                value={[telegram]}
                onValueChange={([v]) => setTelegram(v ?? 85)}
              />
              <p className="text-xs text-muted-foreground">
                Une alerte Telegram est déclenchée dès qu’un token atteint ce score.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="critical-threshold">Seuil critique</Label>
                <span className="font-mono text-sm text-destructive">{critical}</span>
              </div>
              <Slider
                id="critical-threshold"
                min={50}
                max={100}
                step={1}
                value={[critical]}
                onValueChange={([v]) => setCritical(v ?? 90)}
              />
              <p className="text-xs text-muted-foreground">
                Au-dessus de ce score, le token est marqué comme opportunité critique.
              </p>
            </div>

            <Button onClick={save} disabled={update.isPending} className="w-full sm:w-auto">
              Enregistrer
            </Button>
          </section>

          <section aria-label="Catégories de signaux" className="panel space-y-4 p-4 sm:p-5">
            <h2 className="text-base font-semibold">Catégories de signaux</h2>
            <ul className="space-y-3">
              {(Object.keys(SIGNAL_CATEGORY_LABELS) as (keyof SignalCategories)[]).map((key) => (
                <li
                  key={key}
                  className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2.5"
                >
                  <Label htmlFor={`cat-${key}`} className="text-sm font-normal">
                    {SIGNAL_CATEGORY_LABELS[key]}
                  </Label>
                  <Switch
                    id={`cat-${key}`}
                    checked={categories[key]}
                    onCheckedChange={(checked) =>
                      setCategories({ ...categories, [key]: checked })
                    }
                  />
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Les catégories désactivées ne contribuent plus au score ni aux alertes.
            </p>
          </section>

          <SystemStatus />

          <div className="lg:col-span-2">
            <TelegramPanel connected={settings?.telegram_connected ?? false} />
          </div>

        </div>
      )}
    </AppShell>
  );
}
