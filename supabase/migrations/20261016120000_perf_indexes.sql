-- Index de performance : les requêtes les plus fréquentes parcouraient des tables entières.

-- Historique de prix d'un token (calcul du risque à chaque cycle, page Performance, suivi après signal).
CREATE INDEX IF NOT EXISTS token_snapshots_token_captured_idx
  ON public.token_snapshots (token_id, captured_at DESC);

-- Liste du radar (page d'accueil) : meilleur score puis plus récent, tokens réels.
CREATE INDEX IF NOT EXISTS tokens_real_score_idx
  ON public.tokens (score DESC, launched_at DESC, id)
  WHERE is_simulated = false;

-- Suivi des tokens alertés (file d'enrichissement).
CREATE INDEX IF NOT EXISTS tokens_last_alert_idx
  ON public.tokens (last_alert_at)
  WHERE last_alert_at IS NOT NULL;

-- Dernières alertes (page Alertes, Performance, tableau de bord).
CREATE INDEX IF NOT EXISTS alerts_created_idx
  ON public.alerts (created_at DESC);
