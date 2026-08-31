export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alerts: {
        Row: {
          channel: string
          created_at: string
          id: string
          is_simulated: boolean
          level: string
          market_cap_at_alert: number | null
          message: string
          price_usd_at_alert: number | null
          score: number
          token_id: string | null
          token_mint: string | null
          token_symbol: string
        }
        Insert: {
          channel?: string
          created_at?: string
          id?: string
          is_simulated?: boolean
          level?: string
          market_cap_at_alert?: number | null
          message: string
          price_usd_at_alert?: number | null
          score?: number
          token_id?: string | null
          token_mint?: string | null
          token_symbol: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          is_simulated?: boolean
          level?: string
          market_cap_at_alert?: number | null
          message?: string
          price_usd_at_alert?: number | null
          score?: number
          token_id?: string | null
          token_mint?: string | null
          token_symbol?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_settings: {
        Row: {
          created_at: string
          critical_threshold: number
          demo_mode: boolean
          early_opportunity_acceleration_factor: number
          early_opportunity_enabled: boolean
          early_opportunity_max_age_minutes: number
          early_opportunity_max_buyers: number
          early_opportunity_min_buyers: number
          early_opportunity_min_liquidity_usd: number
          early_opportunity_min_score: number
          early_opportunity_min_volume_1h_usd: number
          id: string
          last_scan_at: string | null
          signal_categories: Json
          singleton: boolean
          smart_wallet_alert_threshold: number
          smart_wallet_alerts_enabled: boolean
          smart_wallet_max_age_minutes: number
          smart_wallet_min_buyers: number
          smart_wallet_min_score: number
          smart_wallet_rank_max: number
          status: string
          telegram_connected: boolean
          telegram_threshold: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          critical_threshold?: number
          demo_mode?: boolean
          early_opportunity_acceleration_factor?: number
          early_opportunity_enabled?: boolean
          early_opportunity_max_age_minutes?: number
          early_opportunity_max_buyers?: number
          early_opportunity_min_buyers?: number
          early_opportunity_min_liquidity_usd?: number
          early_opportunity_min_score?: number
          early_opportunity_min_volume_1h_usd?: number
          id?: string
          last_scan_at?: string | null
          signal_categories?: Json
          singleton?: boolean
          smart_wallet_alert_threshold?: number
          smart_wallet_alerts_enabled?: boolean
          smart_wallet_max_age_minutes?: number
          smart_wallet_min_buyers?: number
          smart_wallet_min_score?: number
          smart_wallet_rank_max?: number
          status?: string
          telegram_connected?: boolean
          telegram_threshold?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          critical_threshold?: number
          demo_mode?: boolean
          early_opportunity_acceleration_factor?: number
          early_opportunity_enabled?: boolean
          early_opportunity_max_age_minutes?: number
          early_opportunity_max_buyers?: number
          early_opportunity_min_buyers?: number
          early_opportunity_min_liquidity_usd?: number
          early_opportunity_min_score?: number
          early_opportunity_min_volume_1h_usd?: number
          id?: string
          last_scan_at?: string | null
          signal_categories?: Json
          singleton?: boolean
          smart_wallet_alert_threshold?: number
          smart_wallet_alerts_enabled?: boolean
          smart_wallet_max_age_minutes?: number
          smart_wallet_min_buyers?: number
          smart_wallet_min_score?: number
          smart_wallet_rank_max?: number
          status?: string
          telegram_connected?: boolean
          telegram_threshold?: number
          updated_at?: string
        }
        Relationships: []
      }
      collector_state: {
        Row: {
          desired_state: string
          events_received: number
          id: string
          last_error: string | null
          last_event_at: string | null
          last_heartbeat_at: string | null
          last_signature: string | null
          reconnects: number
          runtime_state: string
          singleton: boolean
          source: string
          tokens_confirmed: number
          updated_at: string
        }
        Insert: {
          desired_state?: string
          events_received?: number
          id?: string
          last_error?: string | null
          last_event_at?: string | null
          last_heartbeat_at?: string | null
          last_signature?: string | null
          reconnects?: number
          runtime_state?: string
          singleton?: boolean
          source?: string
          tokens_confirmed?: number
          updated_at?: string
        }
        Update: {
          desired_state?: string
          events_received?: number
          id?: string
          last_error?: string | null
          last_event_at?: string | null
          last_heartbeat_at?: string | null
          last_signature?: string | null
          reconnects?: number
          runtime_state?: string
          singleton?: boolean
          source?: string
          tokens_confirmed?: number
          updated_at?: string
        }
        Relationships: []
      }
      demo_archive: {
        Row: {
          archived_at: string
          id: string
          rows_removed: number
          table_name: string
        }
        Insert: {
          archived_at?: string
          id?: string
          rows_removed?: number
          table_name: string
        }
        Update: {
          archived_at?: string
          id?: string
          rows_removed?: number
          table_name?: string
        }
        Relationships: []
      }
      early_opportunity_alerts: {
        Row: {
          acceleration: number | null
          age_minutes: number | null
          buyers: number | null
          created_at: string
          detected_at: string
          early_strength: number | null
          id: string
          liquidity_usd: number | null
          market_cap: number | null
          score: number | null
          telegram_error: string | null
          telegram_sent: boolean
          token_id: string | null
          token_mint: string
          token_symbol: string | null
          updated_at: string
          volume_1h_usd: number | null
        }
        Insert: {
          acceleration?: number | null
          age_minutes?: number | null
          buyers?: number | null
          created_at?: string
          detected_at?: string
          early_strength?: number | null
          id?: string
          liquidity_usd?: number | null
          market_cap?: number | null
          score?: number | null
          telegram_error?: string | null
          telegram_sent?: boolean
          token_id?: string | null
          token_mint: string
          token_symbol?: string | null
          updated_at?: string
          volume_1h_usd?: number | null
        }
        Update: {
          acceleration?: number | null
          age_minutes?: number | null
          buyers?: number | null
          created_at?: string
          detected_at?: string
          early_strength?: number | null
          id?: string
          liquidity_usd?: number | null
          market_cap?: number | null
          score?: number | null
          telegram_error?: string | null
          telegram_sent?: boolean
          token_id?: string | null
          token_mint?: string
          token_symbol?: string | null
          updated_at?: string
          volume_1h_usd?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "early_opportunity_alerts_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      smart_wallet_alerts: {
        Row: {
          created_at: string
          first_entry_detected_at: string
          id: string
          telegram_error: string | null
          telegram_sent: boolean
          token_id: string | null
          token_mint: string
          token_symbol: string | null
          transaction_signature: string | null
          updated_at: string
          wallet_address: string
          wallet_score: number | null
        }
        Insert: {
          created_at?: string
          first_entry_detected_at?: string
          id?: string
          telegram_error?: string | null
          telegram_sent?: boolean
          token_id?: string | null
          token_mint: string
          token_symbol?: string | null
          transaction_signature?: string | null
          updated_at?: string
          wallet_address: string
          wallet_score?: number | null
        }
        Update: {
          created_at?: string
          first_entry_detected_at?: string
          id?: string
          telegram_error?: string | null
          telegram_sent?: boolean
          token_id?: string | null
          token_mint?: string
          token_symbol?: string | null
          transaction_signature?: string | null
          updated_at?: string
          wallet_address?: string
          wallet_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "smart_wallet_alerts_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      smart_wallets: {
        Row: {
          address: string
          created_at: string
          data_sufficient: boolean
          early_entries: number
          first_seen_at: string
          id: string
          is_simulated: boolean
          label: string | null
          last_active_at: string
          median_multiple: number | null
          reasons: Json
          simulated_pnl: number
          smart_wallet_score: number | null
          success_count: number
          success_rate: number | null
          tokens_tracked: number
          trade_count: number
          updated_at: string
          win_rate: number
        }
        Insert: {
          address: string
          created_at?: string
          data_sufficient?: boolean
          early_entries?: number
          first_seen_at?: string
          id?: string
          is_simulated?: boolean
          label?: string | null
          last_active_at?: string
          median_multiple?: number | null
          reasons?: Json
          simulated_pnl?: number
          smart_wallet_score?: number | null
          success_count?: number
          success_rate?: number | null
          tokens_tracked?: number
          trade_count?: number
          updated_at?: string
          win_rate?: number
        }
        Update: {
          address?: string
          created_at?: string
          data_sufficient?: boolean
          early_entries?: number
          first_seen_at?: string
          id?: string
          is_simulated?: boolean
          label?: string | null
          last_active_at?: string
          median_multiple?: number | null
          reasons?: Json
          simulated_pnl?: number
          smart_wallet_score?: number | null
          success_count?: number
          success_rate?: number | null
          tokens_tracked?: number
          trade_count?: number
          updated_at?: string
          win_rate?: number
        }
        Relationships: []
      }
      telegram_invites: {
        Row: {
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          label: string
          prefs: Json
          recipient_id: string | null
          revoked_at: string | null
          updated_at: string
          used_at: string | null
        }
        Insert: {
          code_hash: string
          created_at?: string
          expires_at: string
          id?: string
          label?: string
          prefs?: Json
          recipient_id?: string | null
          revoked_at?: string | null
          updated_at?: string
          used_at?: string | null
        }
        Update: {
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          label?: string
          prefs?: Json
          recipient_id?: string | null
          revoked_at?: string | null
          updated_at?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_invites_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "telegram_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_recipients: {
        Row: {
          activated_at: string | null
          chat_id: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          prefs: Json
          role: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          chat_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          prefs?: Json
          role?: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          chat_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          prefs?: Json
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      token_snapshots: {
        Row: {
          buyers: number
          captured_at: string
          id: string
          liquidity_usd: number
          market_cap: number
          price_usd: number
          score: number
          token_id: string
          volume: number
        }
        Insert: {
          buyers?: number
          captured_at?: string
          id?: string
          liquidity_usd?: number
          market_cap?: number
          price_usd?: number
          score?: number
          token_id: string
          volume?: number
        }
        Update: {
          buyers?: number
          captured_at?: string
          id?: string
          liquidity_usd?: number
          market_cap?: number
          price_usd?: number
          score?: number
          token_id?: string
          volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "token_snapshots_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      tokens: {
        Row: {
          alert_level: string
          alerted_score: number
          coordination_flags: Json
          created_at: string
          creator_address: string | null
          creator_previous_tokens: number | null
          creator_share: number | null
          data_sufficient: boolean
          detection_signature: string | null
          detection_source: string
          early_buyers_found: number
          holders_excluded: Json
          holders_top10_share: number | null
          holders_top20_share: number | null
          id: string
          is_simulated: boolean
          last_alert_at: string | null
          last_enriched_at: string | null
          launched_at: string
          liquidity_usd: number
          lp_status: string
          market_cap: number
          market_metrics: Json
          market_source: string
          mint_address: string
          missing_metrics: Json
          name: string
          new_buyers: number
          price_change_1h: number
          price_usd: number
          risk_confidence: number
          risk_factors: Json
          risk_level: string | null
          risk_score: number | null
          score: number
          score_confidence: number
          score_factors: Json
          smart_wallet_count: number
          status: string
          symbol: string
          updated_at: string
          volume_1h: number
          volume_24h: number
          wallets_analyzed_at: string | null
        }
        Insert: {
          alert_level?: string
          alerted_score?: number
          coordination_flags?: Json
          created_at?: string
          creator_address?: string | null
          creator_previous_tokens?: number | null
          creator_share?: number | null
          data_sufficient?: boolean
          detection_signature?: string | null
          detection_source?: string
          early_buyers_found?: number
          holders_excluded?: Json
          holders_top10_share?: number | null
          holders_top20_share?: number | null
          id?: string
          is_simulated?: boolean
          last_alert_at?: string | null
          last_enriched_at?: string | null
          launched_at?: string
          liquidity_usd?: number
          lp_status?: string
          market_cap?: number
          market_metrics?: Json
          market_source?: string
          mint_address: string
          missing_metrics?: Json
          name: string
          new_buyers?: number
          price_change_1h?: number
          price_usd?: number
          risk_confidence?: number
          risk_factors?: Json
          risk_level?: string | null
          risk_score?: number | null
          score?: number
          score_confidence?: number
          score_factors?: Json
          smart_wallet_count?: number
          status?: string
          symbol: string
          updated_at?: string
          volume_1h?: number
          volume_24h?: number
          wallets_analyzed_at?: string | null
        }
        Update: {
          alert_level?: string
          alerted_score?: number
          coordination_flags?: Json
          created_at?: string
          creator_address?: string | null
          creator_previous_tokens?: number | null
          creator_share?: number | null
          data_sufficient?: boolean
          detection_signature?: string | null
          detection_source?: string
          early_buyers_found?: number
          holders_excluded?: Json
          holders_top10_share?: number | null
          holders_top20_share?: number | null
          id?: string
          is_simulated?: boolean
          last_alert_at?: string | null
          last_enriched_at?: string | null
          launched_at?: string
          liquidity_usd?: number
          lp_status?: string
          market_cap?: number
          market_metrics?: Json
          market_source?: string
          mint_address?: string
          missing_metrics?: Json
          name?: string
          new_buyers?: number
          price_change_1h?: number
          price_usd?: number
          risk_confidence?: number
          risk_factors?: Json
          risk_level?: string | null
          risk_score?: number | null
          score?: number
          score_confidence?: number
          score_factors?: Json
          smart_wallet_count?: number
          status?: string
          symbol?: string
          updated_at?: string
          volume_1h?: number
          volume_24h?: number
          wallets_analyzed_at?: string | null
        }
        Relationships: []
      }
      tracked_token_alerts: {
        Row: {
          created_at: string
          details: Json
          event_state: string
          event_type: string
          id: string
          message: string
          severity: string
          telegram_error: string | null
          telegram_sent: boolean
          token_id: string | null
          token_mint: string
          token_symbol: string | null
          tracked_token_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json
          event_state?: string
          event_type: string
          id?: string
          message: string
          severity?: string
          telegram_error?: string | null
          telegram_sent?: boolean
          token_id?: string | null
          token_mint: string
          token_symbol?: string | null
          tracked_token_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json
          event_state?: string
          event_type?: string
          id?: string
          message?: string
          severity?: string
          telegram_error?: string | null
          telegram_sent?: boolean
          token_id?: string | null
          token_mint?: string
          token_symbol?: string | null
          tracked_token_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tracked_token_alerts_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracked_token_alerts_tracked_token_id_fkey"
            columns: ["tracked_token_id"]
            isOneToOne: false
            referencedRelation: "tracked_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      tracked_tokens: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          last_evaluated_at: string | null
          last_metrics: Json
          last_state: string
          token_id: string | null
          token_mint: string
          token_name: string | null
          token_symbol: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          last_evaluated_at?: string | null
          last_metrics?: Json
          last_state?: string
          token_id?: string | null
          token_mint: string
          token_name?: string | null
          token_symbol?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          last_evaluated_at?: string | null
          last_metrics?: Json
          last_state?: string
          token_id?: string | null
          token_mint?: string
          token_name?: string | null
          token_symbol?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracked_tokens_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_token_entries: {
        Row: {
          amount_raw: number | null
          block_time: string | null
          created_at: string
          entry_rank: number
          id: string
          mint_address: string
          signature: string
          token_id: string
          wallet_address: string
        }
        Insert: {
          amount_raw?: number | null
          block_time?: string | null
          created_at?: string
          entry_rank?: number
          id?: string
          mint_address: string
          signature: string
          token_id: string
          wallet_address: string
        }
        Update: {
          amount_raw?: number | null
          block_time?: string | null
          created_at?: string
          entry_rank?: number
          id?: string
          mint_address?: string
          signature?: string
          token_id?: string
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_token_entries_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_trades: {
        Row: {
          amount_sol: number
          id: string
          is_simulated: boolean
          side: string
          token_id: string | null
          token_symbol: string
          traded_at: string
          wallet_id: string
        }
        Insert: {
          amount_sol?: number
          id?: string
          is_simulated?: boolean
          side?: string
          token_id?: string | null
          token_symbol: string
          traded_at?: string
          wallet_id: string
        }
        Update: {
          amount_sol?: number
          id?: string
          is_simulated?: boolean
          side?: string
          token_id?: string | null
          token_symbol?: string
          traded_at?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_trades_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_trades_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "smart_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
