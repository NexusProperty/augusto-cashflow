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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      bank_accounts: {
        Row: {
          account_number: string | null
          account_type: string | null
          created_at: string | null
          entity_id: string
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          od_limit: number | null
          updated_at: string | null
        }
        Insert: {
          account_number?: string | null
          account_type?: string | null
          created_at?: string | null
          entity_id: string
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          od_limit?: number | null
          updated_at?: string | null
        }
        Update: {
          account_number?: string | null
          account_type?: string | null
          created_at?: string | null
          entity_id?: string
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          od_limit?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          code: string
          created_at: string | null
          flow_direction: string | null
          id: string
          is_system: boolean | null
          name: string
          parent_id: string | null
          section_number: string | null
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string | null
          flow_direction?: string | null
          id?: string
          is_system?: boolean | null
          name: string
          parent_id?: string | null
          section_number?: string | null
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string | null
          flow_direction?: string | null
          id?: string
          is_system?: boolean | null
          name?: string
          parent_id?: string | null
          section_number?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      category_mappings: {
        Row: {
          category_id: string
          counterparty_pattern: string
          created_at: string | null
          entity_id: string | null
          id: string
          use_count: number | null
        }
        Insert: {
          category_id: string
          counterparty_pattern: string
          created_at?: string | null
          entity_id?: string | null
          id?: string
          use_count?: number | null
        }
        Update: {
          category_id?: string
          counterparty_pattern?: string
          created_at?: string | null
          entity_id?: string | null
          id?: string
          use_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "category_mappings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_mappings_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      document_extractions: {
        Row: {
          amount: number | null
          auto_confirmed: boolean
          category_name: string | null
          confidence: number | null
          counterparty: string | null
          created_at: string | null
          document_id: string
          entity_name: string | null
          expected_date: string | null
          forecast_line_id: string | null
          id: string
          invoice_number: string | null
          is_confirmed: boolean | null
          is_dismissed: boolean | null
          payment_terms: string | null
          raw_text: string | null
          status_reason: string | null
          suggested_bank_account_id: string | null
          suggested_category_id: string | null
          suggested_entity_id: string | null
          suggested_period_id: string | null
          suggested_status: string | null
        }
        Insert: {
          amount?: number | null
          auto_confirmed?: boolean
          category_name?: string | null
          confidence?: number | null
          counterparty?: string | null
          created_at?: string | null
          document_id: string
          entity_name?: string | null
          expected_date?: string | null
          forecast_line_id?: string | null
          id?: string
          invoice_number?: string | null
          is_confirmed?: boolean | null
          is_dismissed?: boolean | null
          payment_terms?: string | null
          raw_text?: string | null
          status_reason?: string | null
          suggested_bank_account_id?: string | null
          suggested_category_id?: string | null
          suggested_entity_id?: string | null
          suggested_period_id?: string | null
          suggested_status?: string | null
        }
        Update: {
          amount?: number | null
          auto_confirmed?: boolean
          category_name?: string | null
          confidence?: number | null
          counterparty?: string | null
          created_at?: string | null
          document_id?: string
          entity_name?: string | null
          expected_date?: string | null
          forecast_line_id?: string | null
          id?: string
          invoice_number?: string | null
          is_confirmed?: boolean | null
          is_dismissed?: boolean | null
          payment_terms?: string | null
          raw_text?: string | null
          status_reason?: string | null
          suggested_bank_account_id?: string | null
          suggested_category_id?: string | null
          suggested_entity_id?: string | null
          suggested_period_id?: string | null
          suggested_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_extractions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_extractions_forecast_line_id_fkey"
            columns: ["forecast_line_id"]
            isOneToOne: false
            referencedRelation: "forecast_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_extractions_suggested_bank_account_id_fkey"
            columns: ["suggested_bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_extractions_suggested_category_id_fkey"
            columns: ["suggested_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_extractions_suggested_entity_id_fkey"
            columns: ["suggested_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_extractions_suggested_period_id_fkey"
            columns: ["suggested_period_id"]
            isOneToOne: false
            referencedRelation: "forecast_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string | null
          doc_type: Database["public"]["Enums"]["document_type"] | null
          error_message: string | null
          file_size: number
          filename: string
          id: string
          mime_type: string
          status: Database["public"]["Enums"]["document_status"]
          storage_path: string
          updated_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          doc_type?: Database["public"]["Enums"]["document_type"] | null
          error_message?: string | null
          file_size: number
          filename: string
          id?: string
          mime_type: string
          status?: Database["public"]["Enums"]["document_status"]
          storage_path: string
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          doc_type?: Database["public"]["Enums"]["document_type"] | null
          error_message?: string | null
          file_size?: number
          filename?: string
          id?: string
          mime_type?: string
          status?: Database["public"]["Enums"]["document_status"]
          storage_path?: string
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: []
      }
      entities: {
        Row: {
          code: string
          created_at: string | null
          group_id: string
          id: string
          is_active: boolean | null
          is_pipeline_entity: boolean
          name: string
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          group_id: string
          id?: string
          is_active?: boolean | null
          is_pipeline_entity?: boolean
          name: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          group_id?: string
          id?: string
          is_active?: boolean | null
          is_pipeline_entity?: boolean
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entities_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "entity_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_groups: {
        Row: {
          created_at: string | null
          id: string
          name: string
          notes: string | null
          od_facility_limit: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          notes?: string | null
          od_facility_limit?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          notes?: string | null
          od_facility_limit?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      forecast_lines: {
        Row: {
          amount: number
          bank_account_id: string | null
          category_id: string
          confidence: number
          counterparty: string | null
          created_at: string | null
          created_by: string | null
          entity_id: string
          id: string
          line_status: string
          notes: string | null
          period_id: string
          source: Database["public"]["Enums"]["source_type"]
          source_document_id: string | null
          source_pipeline_project_id: string | null
          source_rule_id: string | null
          updated_at: string | null
        }
        Insert: {
          amount?: number
          bank_account_id?: string | null
          category_id: string
          confidence?: number
          counterparty?: string | null
          created_at?: string | null
          created_by?: string | null
          entity_id: string
          id?: string
          line_status?: string
          notes?: string | null
          period_id: string
          source?: Database["public"]["Enums"]["source_type"]
          source_document_id?: string | null
          source_pipeline_project_id?: string | null
          source_rule_id?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          category_id?: string
          confidence?: number
          counterparty?: string | null
          created_at?: string | null
          created_by?: string | null
          entity_id?: string
          id?: string
          line_status?: string
          notes?: string | null
          period_id?: string
          source?: Database["public"]["Enums"]["source_type"]
          source_document_id?: string | null
          source_pipeline_project_id?: string | null
          source_rule_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_forecast_lines_document"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_forecast_lines_rule"
            columns: ["source_rule_id"]
            isOneToOne: false
            referencedRelation: "recurring_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forecast_lines_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forecast_lines_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forecast_lines_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forecast_lines_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "forecast_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forecast_lines_source_pipeline_project_id_fkey"
            columns: ["source_pipeline_project_id"]
            isOneToOne: false
            referencedRelation: "pipeline_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_periods: {
        Row: {
          created_at: string | null
          id: string
          is_actual: boolean | null
          week_ending: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_actual?: boolean | null
          week_ending: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_actual?: boolean | null
          week_ending?: string
        }
        Relationships: []
      }
      intercompany_balances: {
        Row: {
          amount: number
          as_at_date: string
          created_at: string | null
          created_by: string | null
          description: string
          from_group_id: string
          id: string
          notes: string | null
          to_group_id: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          as_at_date: string
          created_at?: string | null
          created_by?: string | null
          description: string
          from_group_id: string
          id?: string
          notes?: string | null
          to_group_id: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          as_at_date?: string
          created_at?: string | null
          created_by?: string | null
          description?: string
          from_group_id?: string
          id?: string
          notes?: string | null
          to_group_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intercompany_balances_from_group_id_fkey"
            columns: ["from_group_id"]
            isOneToOne: false
            referencedRelation: "entity_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intercompany_balances_to_group_id_fkey"
            columns: ["to_group_id"]
            isOneToOne: false
            referencedRelation: "entity_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_allocations: {
        Row: {
          amount: number
          created_at: string
          distribution: string
          id: string
          month: string
          project_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          distribution?: string
          id?: string
          month: string
          project_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          distribution?: string
          id?: string
          month?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_allocations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pipeline_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_clients: {
        Row: {
          created_at: string
          entity_id: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_clients_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_projects: {
        Row: {
          billing_amount: number | null
          client_id: string
          created_at: string
          created_by: string | null
          entity_id: string
          gross_profit: number | null
          id: string
          invoice_date: string | null
          is_synced: boolean
          job_number: string | null
          notes: string | null
          project_name: string
          stage: string
          task_estimate: string | null
          team_member: string | null
          third_party_costs: number | null
          updated_at: string
        }
        Insert: {
          billing_amount?: number | null
          client_id: string
          created_at?: string
          created_by?: string | null
          entity_id: string
          gross_profit?: number | null
          id?: string
          invoice_date?: string | null
          is_synced?: boolean
          job_number?: string | null
          notes?: string | null
          project_name: string
          stage?: string
          task_estimate?: string | null
          team_member?: string | null
          third_party_costs?: number | null
          updated_at?: string
        }
        Update: {
          billing_amount?: number | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          entity_id?: string
          gross_profit?: number | null
          id?: string
          invoice_date?: string | null
          is_synced?: boolean
          job_number?: string | null
          notes?: string | null
          project_name?: string
          stage?: string
          task_estimate?: string | null
          team_member?: string | null
          third_party_costs?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "pipeline_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_projects_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_rules: {
        Row: {
          amount: number
          anchor_date: string
          category_id: string
          counterparty: string | null
          created_at: string | null
          created_by: string | null
          day_of_month: number | null
          description: string
          end_date: string | null
          entity_id: string
          frequency: Database["public"]["Enums"]["frequency_type"]
          id: string
          is_active: boolean | null
          notes: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          anchor_date: string
          category_id: string
          counterparty?: string | null
          created_at?: string | null
          created_by?: string | null
          day_of_month?: number | null
          description: string
          end_date?: string | null
          entity_id: string
          frequency: Database["public"]["Enums"]["frequency_type"]
          id?: string
          is_active?: boolean | null
          notes?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          anchor_date?: string
          category_id?: string
          counterparty?: string | null
          created_at?: string | null
          created_by?: string | null
          day_of_month?: number | null
          description?: string
          end_date?: string | null
          entity_id?: string
          frequency?: Database["public"]["Enums"]["frequency_type"]
          id?: string
          is_active?: boolean | null
          notes?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_rules_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_targets: {
        Row: {
          created_at: string
          entity_id: string
          id: string
          month: string
          target_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          id?: string
          month: string
          target_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          id?: string
          month?: string
          target_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_targets_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      scenario_overrides: {
        Row: {
          created_at: string | null
          id: string
          is_excluded: boolean | null
          override_amount: number | null
          override_confidence: number | null
          override_week_shift: number | null
          scenario_id: string
          target_id: string
          target_type: Database["public"]["Enums"]["override_target_type"]
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_excluded?: boolean | null
          override_amount?: number | null
          override_confidence?: number | null
          override_week_shift?: number | null
          scenario_id: string
          target_id: string
          target_type: Database["public"]["Enums"]["override_target_type"]
        }
        Update: {
          created_at?: string | null
          id?: string
          is_excluded?: boolean | null
          override_amount?: number | null
          override_confidence?: number | null
          override_week_shift?: number | null
          scenario_id?: string
          target_id?: string
          target_type?: Database["public"]["Enums"]["override_target_type"]
        }
        Relationships: [
          {
            foreignKeyName: "scenario_overrides_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      scenarios: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_default: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      sync_pipeline_project_lines: {
        Args: { p_lines: Json; p_project_id: string }
        Returns: Json
      }
      update_forecast_line_amounts: { Args: { p_updates: Json }; Returns: Json }
    }
    Enums: {
      document_status:
        | "uploaded"
        | "parsing"
        | "extracting"
        | "ready_for_review"
        | "confirmed"
        | "failed"
      document_type:
        | "aged_receivables"
        | "aged_payables"
        | "bank_statement"
        | "invoice"
        | "loan_agreement"
        | "payroll_summary"
        | "contract"
        | "board_paper"
        | "other"
      frequency_type: "weekly" | "fortnightly" | "monthly"
      override_target_type: "pipeline_item" | "recurring_rule"
      source_type: "manual" | "document" | "recurring" | "pipeline"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      document_status: [
        "uploaded",
        "parsing",
        "extracting",
        "ready_for_review",
        "confirmed",
        "failed",
      ],
      document_type: [
        "aged_receivables",
        "aged_payables",
        "bank_statement",
        "invoice",
        "loan_agreement",
        "payroll_summary",
        "contract",
        "board_paper",
        "other",
      ],
      frequency_type: ["weekly", "fortnightly", "monthly"],
      override_target_type: ["pipeline_item", "recurring_rule"],
      source_type: ["manual", "document", "recurring", "pipeline"],
    },
  },
} as const
