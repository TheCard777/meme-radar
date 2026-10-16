import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Bell, FlaskConical, LineChart, Radar, Settings, Wallet } from "lucide-react";

import logoAsset from "@/assets/meme-radar-logo-v2.png.asset.json";

const NAV = [
  { to: "/", label: "Radar", icon: Radar },
  { to: "/wallets", label: "Smart Wallets", icon: Wallet },
  { to: "/alerts", label: "Alertes", icon: Bell },
  { to: "/performance", label: "Performance", icon: LineChart },
  { to: "/strategy", label: "Réel", icon: FlaskConical },
  { to: "/settings", label: "Paramètres", icon: Settings },
] as const;

export function AppShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen pb-24 md:pb-10">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <img
              src={logoAsset.url}
              alt="Logo Meme Radar"
              width={44}
              height={44}
              className="size-11 shrink-0 rounded-xl object-contain drop-shadow-[0_0_12px_oklch(0.78_0.19_155/0.35)]"
            />
            <div>
              <p className="font-display text-lg font-semibold leading-tight text-gradient">
                Meme Radar
              </p>
              <p className="text-xs text-muted-foreground">
                1M$ soon … Psaume91
              </p>
            </div>
          </div>

          <nav aria-label="Navigation principale" className="hidden lg:block">
            <ul className="flex items-center gap-1">
              {NAV.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    activeProps={{ className: "bg-secondary text-foreground" }}
                    activeOptions={{ exact: item.to === "/" }}
                  >
                    <item.icon className="size-4" aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {children}
      </main>

      <nav
        aria-label="Navigation mobile"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur-xl lg:hidden"
      >
        <ul className="mx-auto flex max-w-lg">
          {NAV.map((item) => (
            <li key={item.to} className="flex-1">
              <Link
                to={item.to}
                className="flex flex-col items-center gap-1 py-2.5 text-[0.7rem] text-muted-foreground transition-colors"
                activeProps={{ className: "text-primary" }}
                activeOptions={{ exact: item.to === "/" }}
              >
                <item.icon className="size-5" aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
