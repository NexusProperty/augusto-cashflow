// Minimal hand-written DB types matching migrations 001-010.
// Run `npm run gen:types` once connected to Supabase to regenerate.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      entity_groups: {
        Row: {
          id: string
          name: string
          od_facility_limit: number
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          od_facility_limit?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          od_facility_limit?: number
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      entities: {
        Row: {
          id: string
          group_id: string
          name: string
          code: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          group_id: string
          name: string
          code: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          group_id?: string
          name?: string
          code?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          id: string
          entity_id: string
          name: string
          account_type: string
          od_limit: number
          notes: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          entity_id: string
          name: string
          account_type?: string
          od_limit?: number
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          entity_id?: string
          name?: string
          account_type?: string
          od_limit?: number
          notes?: string | null
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          id: string
          parent_id: string | null
          name: string
          code: string
          section_number: string | null
          sort_order: number
          is_system: boolean
          flow_direction: string | null
          created_at: string
        }
        Insert: {
          id?: string
          parent_id?: string | null
          name: string
          code: string
          section_number?: string | null
          sort_order?: number
          is_system?: boolean
          flow_direction?: string | null
          created_at?: string
        }
        Update: {
          parent_id?: string | null
          name?: string
          code?: string
          section_number?: string | null
          sort_order?: number
          is_system?: boolean
          flow_direction?: string | null
        }
        Relationships: []
      }
      forecast_periods: {
        Row: {
          id: string
          week_ending: string
          is_actual: boolean
          created_at: string
        }
        Insert: {
          id?: string
          week_ending: string
          is_actual?: boolean
          created_at?: string
        }
        Update: {
          week_ending?: string
          is_actual?: boolean
        }
        Relationships: []
      }
      forecast_lines: {
        Row: {
          id: string
          entity_id: string
          category_id: string
          period_id: string
          amount: number
          confidence: number
          source: string
          source_document_id: string | null
          source_rule_id: string | null
          counterparty: string | null
          notes: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          entity_id: string
          category_id: string
          period_id: string
          amount?: number
          confidence?: number
          source?: string
          source_document_id?: string | null
          source_rule_id?: string | null
          counterparty?: string | null
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          entity_id?: string
          category_id?: string
          period_id?: string
          amount?: number
          confidence?: number
          source?: string
          source_document_id?: string | null
          source_rule_id?: string | null
          counterparty?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      recurring_rules: {
        Row: {
          id: string
          entity_id: string
          category_id: string
          description: string
          amount: number
          frequency: string
          anchor_date: string
          day_of_month: number | null
          end_date: string | null
          is_active: boolean
          counterparty: string | null
          notes: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          entity_id: string
          category_id: string
          description: string
          amount: number
          frequency: string
          anchor_date: string
          day_of_month?: number | null
          end_date?: string | null
          is_active?: boolean
          counterparty?: string | null
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          entity_id?: string
          category_id?: string
          description?: string
          amount?: number
          frequency?: string
          anchor_date?: string
          day_of_month?: number | null
          end_date?: string | null
          is_active?: boolean
          counterparty?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      scenarios: {
        Row: {
          id: string
          name: string
          description: string | null
          is_default: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          is_default?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          description?: string | null
          is_default?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      scenario_overrides: {
        Row: {
          id: string
          scenario_id: string
          target_type: string
          target_id: string
          override_confidence: number | null
          override_amount: number | null
          override_week_shift: number
          is_excluded: boolean
          created_at: string
        }
        Insert: {
          id?: string
          scenario_id: string
          target_type: string
          target_id: string
          override_confidence?: number | null
          override_amount?: number | null
          override_week_shift?: number
          is_excluded?: boolean
          created_at?: string
        }
        Update: {
          scenario_id?: string
          target_type?: string
          target_id?: string
          override_confidence?: number | null
          override_amount?: number | null
          override_week_shift?: number
          is_excluded?: boolean
        }
        Relationships: []
      }
      documents: {
        Row: {
          id: string
          filename: string
          mime_type: string
          file_size: number
          storage_path: string
          status: string
          doc_type: string | null
          error_message: string | null
          uploaded_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          filename: string
          mime_type: string
          file_size: number
          storage_path: string
          status?: string
          doc_type?: string | null
          error_message?: string | null
          uploaded_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          filename?: string
          mime_type?: string
          file_size?: number
          storage_path?: string
          status?: string
          doc_type?: string | null
          error_message?: string | null
          uploaded_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      document_extractions: {
        Row: {
          id: string
          document_id: string
          entity_name: string | null
          category_name: string | null
          counterparty: string | null
          amount: number | null
          expected_date: string | null
          payment_terms: string | null
          invoice_number: string | null
          confidence: number
          raw_text: string | null
          is_confirmed: boolean
          is_dismissed: boolean
          forecast_line_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          document_id: string
          entity_name?: string | null
          category_name?: string | null
          counterparty?: string | null
          amount?: number | null
          expected_date?: string | null
          payment_terms?: string | null
          invoice_number?: string | null
          confidence?: number
          raw_text?: string | null
          is_confirmed?: boolean
          is_dismissed?: boolean
          forecast_line_id?: string | null
          created_at?: string
        }
        Update: {
          entity_name?: string | null
          category_name?: string | null
          counterparty?: string | null
          amount?: number | null
          expected_date?: string | null
          payment_terms?: string | null
          invoice_number?: string | null
          confidence?: number
          raw_text?: string | null
          is_confirmed?: boolean
          is_dismissed?: boolean
          forecast_line_id?: string | null
        }
        Relationships: []
      }
      intercompany_balances: {
        Row: {
          id: string
          from_group_id: string
          to_group_id: string
          description: string
          amount: number
          as_at_date: string
          notes: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          from_group_id: string
          to_group_id: string
          description: string
          amount: number
          as_at_date: string
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          from_group_id?: string
          to_group_id?: string
          description?: string
          amount?: number
          as_at_date?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      category_mappings: {
        Row: {
          id: string
          counterparty_pattern: string
          category_id: string
          entity_id: string | null
          use_count: number
          created_at: string
        }
        Insert: {
          id?: string
          counterparty_pattern: string
          category_id: string
          entity_id?: string | null
          use_count?: number
          created_at?: string
        }
        Update: {
          counterparty_pattern?: string
          category_id?: string
          entity_id?: string | null
          use_count?: number
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
  }
}
