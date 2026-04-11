// Minimal hand-written DB types. Run `npm run gen:types` once connected to Supabase to regenerate.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
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
          id?: string
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
          amount: number
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
      entities: {
        Row: {
          id: string
          name: string
          abn: string | null
          entity_group_id: string
          bank_account_id: string | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          abn?: string | null
          entity_group_id: string
          bank_account_id?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          name?: string
          abn?: string | null
          entity_group_id?: string
          bank_account_id?: string | null
          is_active?: boolean
        }
        Relationships: []
      }
      entity_groups: {
        Row: {
          id: string
          name: string
          od_facility_limit: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          od_facility_limit?: number
          created_at?: string
        }
        Update: {
          name?: string
          od_facility_limit?: number
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
          flow_direction: string
          created_at: string
        }
        Insert: {
          id?: string
          parent_id?: string | null
          name: string
          code: string
          section_number?: string | null
          sort_order?: number
          flow_direction: string
          created_at?: string
        }
        Update: {
          parent_id?: string | null
          name?: string
          code?: string
          section_number?: string | null
          sort_order?: number
          flow_direction?: string
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
      bank_accounts: {
        Row: {
          id: string
          entity_id: string
          bsb: string | null
          account_number: string | null
          account_name: string | null
          opening_balance: number
          balance_date: string | null
          created_at: string
        }
        Insert: {
          id?: string
          entity_id: string
          bsb?: string | null
          account_number?: string | null
          account_name?: string | null
          opening_balance?: number
          balance_date?: string | null
          created_at?: string
        }
        Update: {
          bsb?: string | null
          account_number?: string | null
          account_name?: string | null
          opening_balance?: number
          balance_date?: string | null
        }
        Relationships: []
      }
      scenarios: {
        Row: {
          id: string
          entity_id: string
          name: string
          scenario_type: string
          pipeline_confidence_multiplier: number
          is_active: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          entity_id: string
          name: string
          scenario_type: string
          pipeline_confidence_multiplier?: number
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          scenario_type?: string
          pipeline_confidence_multiplier?: number
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      intercompany_transactions: {
        Row: {
          id: string
          from_entity_id: string
          to_entity_id: string
          amount: number
          description: string | null
          period_id: string
          status: string
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          from_entity_id: string
          to_entity_id: string
          amount: number
          description?: string | null
          period_id: string
          status?: string
          created_by?: string | null
          created_at?: string
        }
        Update: {
          amount?: number
          description?: string | null
          status?: string
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
