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
      account_plans: {
        Row: {
          account_id: string
          created_at: string
          ended_at: string | null
          id: string
          plan_id: string
          started_at: string
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          plan_id: string
          started_at?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          plan_id?: string
          started_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_plans_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_plans_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          created_at: string
          currency_zone: string
          display_currency: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency_zone: string
          display_currency: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency_zone?: string
          display_currency?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_currency_zone_fkey"
            columns: ["currency_zone"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "accounts_display_currency_fkey"
            columns: ["display_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      checkout_sessions: {
        Row: {
          closed_at: string | null
          created_at: string
          customer_id: string
          delivery_status: string
          expires_at: string
          id: string
          is_test: boolean
          metadata: Json
          payment_link_id: string
          space_id: string
          status: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          customer_id: string
          delivery_status?: string
          expires_at: string
          id?: string
          is_test?: boolean
          metadata?: Json
          payment_link_id: string
          space_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          customer_id?: string
          delivery_status?: string
          expires_at?: string
          id?: string
          is_test?: boolean
          metadata?: Json
          payment_link_id?: string
          space_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkout_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_sessions_payment_link_id_fkey"
            columns: ["payment_link_id"]
            isOneToOne: false
            referencedRelation: "payment_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_sessions_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          code: string
          created_at: string
          currency_code: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          currency_code: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          currency_code?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "countries_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      currencies: {
        Row: {
          code: string
          created_at: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          created_at: string
          email: string
          id: string
          phone: string | null
          space_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          phone?: string | null
          space_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          phone?: string | null
          space_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_visit_counts: {
        Row: {
          created_at: string
          dimension_type: string
          dimension_value: string | null
          id: string
          impressions: number
          offer_id: string | null
          payment_link_id: string | null
          sales_page_id: string | null
          space_id: string
          unique_visits: number
          updated_at: string
          visit_date: string
        }
        Insert: {
          created_at?: string
          dimension_type: string
          dimension_value?: string | null
          id?: string
          impressions?: number
          offer_id?: string | null
          payment_link_id?: string | null
          sales_page_id?: string | null
          space_id: string
          unique_visits?: number
          updated_at?: string
          visit_date: string
        }
        Update: {
          created_at?: string
          dimension_type?: string
          dimension_value?: string | null
          id?: string
          impressions?: number
          offer_id?: string | null
          payment_link_id?: string | null
          sales_page_id?: string | null
          space_id?: string
          unique_visits?: number
          updated_at?: string
          visit_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_visit_counts_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_visit_counts_payment_link_id_fkey"
            columns: ["payment_link_id"]
            isOneToOne: false
            referencedRelation: "payment_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_visit_counts_sales_page_id_fkey"
            columns: ["sales_page_id"]
            isOneToOne: false
            referencedRelation: "sales_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_visit_counts_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          attempts: number
          created_at: string
          delivered_at: string | null
          id: string
          integration_id: string | null
          last_error: string | null
          payload: Json
          provider: string
          session_id: string
          space_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          id?: string
          integration_id?: string | null
          last_error?: string | null
          payload?: Json
          provider: string
          session_id: string
          space_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          id?: string
          integration_id?: string | null
          last_error?: string | null
          payload?: Json
          provider?: string
          session_id?: string
          space_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "checkout_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          customer_id: string | null
          id: string
          payload: Json
          session_id: string | null
          space_id: string
          transaction_id: string | null
          type: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          id?: string
          payload?: Json
          session_id?: string | null
          space_id: string
          transaction_id?: string | null
          type: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          id?: string
          payload?: Json
          session_id?: string | null
          space_id?: string
          transaction_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "checkout_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      gateway_credentials: {
        Row: {
          created_at: string
          credentials_encrypted: string
          currency: string
          gateway: string
          id: string
          is_default: boolean
          space_id: string
          status: string
          status_updated_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credentials_encrypted: string
          currency: string
          gateway: string
          id?: string
          is_default?: boolean
          space_id: string
          status?: string
          status_updated_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credentials_encrypted?: string
          currency?: string
          gateway?: string
          id?: string
          is_default?: boolean
          space_id?: string
          status?: string
          status_updated_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gateway_credentials_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "gateway_credentials_gateway_fkey"
            columns: ["gateway"]
            isOneToOne: false
            referencedRelation: "gateways"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "gateway_credentials_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      gateways: {
        Row: {
          code: string
          created_at: string
          is_active: boolean
          logo_url: string | null
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      integrations: {
        Row: {
          created_at: string
          credentials_encrypted: string
          id: string
          label: string
          provider: string
          space_id: string
          status: string
          status_updated_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credentials_encrypted: string
          id?: string
          label: string
          provider: string
          space_id: string
          status?: string
          status_updated_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credentials_encrypted?: string
          id?: string
          label?: string
          provider?: string
          space_id?: string
          status?: string
          status_updated_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          base_price_amount: number
          base_price_currency: string
          compare_at_price_amount: number | null
          created_at: string
          delivery_config: Json
          id: string
          payment_mode: string
          promo_active: boolean
          promo_price_amount: number | null
          space_id: string
          suggested_price_amount: number | null
          thumbnail_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          base_price_amount?: number
          base_price_currency: string
          compare_at_price_amount?: number | null
          created_at?: string
          delivery_config: Json
          id?: string
          payment_mode: string
          promo_active?: boolean
          promo_price_amount?: number | null
          space_id: string
          suggested_price_amount?: number | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          base_price_amount?: number
          base_price_currency?: string
          compare_at_price_amount?: number | null
          created_at?: string
          delivery_config?: Json
          id?: string
          payment_mode?: string
          promo_active?: boolean
          promo_price_amount?: number | null
          space_id?: string
          suggested_price_amount?: number | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offers_base_price_currency_fkey"
            columns: ["base_price_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "offers_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_links: {
        Row: {
          base_price_amount: number | null
          created_at: string
          description: string | null
          id: string
          offer_id: string
          payment_mode: string | null
          slug: string
          space_id: string
          title: string
          updated_at: string
        }
        Insert: {
          base_price_amount?: number | null
          created_at?: string
          description?: string | null
          id?: string
          offer_id: string
          payment_mode?: string | null
          slug: string
          space_id: string
          title: string
          updated_at?: string
        }
        Update: {
          base_price_amount?: number | null
          created_at?: string
          description?: string | null
          id?: string
          offer_id?: string
          payment_mode?: string | null
          slug?: string
          space_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_links_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_links_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          country_code: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          processor_code: string | null
          updated_at: string
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          processor_code?: string | null
          updated_at?: string
        }
        Update: {
          country_code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          processor_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "payment_methods_processor_code_fkey"
            columns: ["processor_code"]
            isOneToOne: false
            referencedRelation: "processors"
            referencedColumns: ["code"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          credit_allowance: number
          id: string
          name: string
          price_monthly: number
          price_monthly_currency: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credit_allowance: number
          id?: string
          name: string
          price_monthly?: number
          price_monthly_currency: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credit_allowance?: number
          id?: string
          name?: string
          price_monthly?: number
          price_monthly_currency?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plans_price_monthly_currency_fkey"
            columns: ["price_monthly_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      processors: {
        Row: {
          code: string
          created_at: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      promo_code_uses: {
        Row: {
          created_at: string
          customer_id: string
          discount_applied_amount: number
          discount_applied_currency: string
          id: string
          promo_code_id: string
          session_id: string
          space_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          discount_applied_amount: number
          discount_applied_currency: string
          id?: string
          promo_code_id: string
          session_id: string
          space_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          discount_applied_amount?: number
          discount_applied_currency?: string
          id?: string
          promo_code_id?: string
          session_id?: string
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_code_uses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_code_uses_discount_applied_currency_fkey"
            columns: ["discount_applied_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "promo_code_uses_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_code_uses_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "checkout_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_code_uses_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          code: string
          created_at: string
          customer_id: string | null
          discount_amount: number | null
          discount_currency: string | null
          discount_percentage: number | null
          discount_type: string
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          offer_id: string | null
          payment_link_id: string | null
          source: string
          space_id: string
          updated_at: string
          uses_count: number
        }
        Insert: {
          code: string
          created_at?: string
          customer_id?: string | null
          discount_amount?: number | null
          discount_currency?: string | null
          discount_percentage?: number | null
          discount_type: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          offer_id?: string | null
          payment_link_id?: string | null
          source?: string
          space_id: string
          updated_at?: string
          uses_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          customer_id?: string | null
          discount_amount?: number | null
          discount_currency?: string | null
          discount_percentage?: number | null
          discount_type?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          offer_id?: string | null
          payment_link_id?: string | null
          source?: string
          space_id?: string
          updated_at?: string
          uses_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_codes_discount_currency_fkey"
            columns: ["discount_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "promo_codes_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_codes_payment_link_id_fkey"
            columns: ["payment_link_id"]
            isOneToOne: false
            referencedRelation: "payment_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_codes_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      reserved_slugs: {
        Row: {
          created_at: string
          id: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      sales_pages: {
        Row: {
          active_sections: Json
          brand_color: string
          content: Json
          created_at: string
          id: string
          payment_link_id: string
          slug: string
          space_id: string
          template_id: string
          title: string
          updated_at: string
        }
        Insert: {
          active_sections?: Json
          brand_color?: string
          content?: Json
          created_at?: string
          id?: string
          payment_link_id: string
          slug: string
          space_id: string
          template_id: string
          title: string
          updated_at?: string
        }
        Update: {
          active_sections?: Json
          brand_color?: string
          content?: Json
          created_at?: string
          id?: string
          payment_link_id?: string
          slug?: string
          space_id?: string
          template_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_pages_payment_link_id_fkey"
            columns: ["payment_link_id"]
            isOneToOne: true
            referencedRelation: "payment_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_pages_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      spaces: {
        Row: {
          account_id: string
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "spaces_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          created_at: string
          currency: string
          external_id: string
          failure_reason: string | null
          gateway_credential_id: string | null
          id: string
          payment_method_id: string | null
          payment_status: string
          processor_code: string | null
          session_id: string
          space_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency: string
          external_id: string
          failure_reason?: string | null
          gateway_credential_id?: string | null
          id?: string
          payment_method_id?: string | null
          payment_status?: string
          processor_code?: string | null
          session_id: string
          space_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          external_id?: string
          failure_reason?: string | null
          gateway_credential_id?: string | null
          id?: string
          payment_method_id?: string | null
          payment_status?: string
          processor_code?: string | null
          session_id?: string
          space_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "transactions_gateway_credential_id_fkey"
            columns: ["gateway_credential_id"]
            isOneToOne: false
            referencedRelation: "gateway_credentials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_processor_code_fkey"
            columns: ["processor_code"]
            isOneToOne: false
            referencedRelation: "processors"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "transactions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "checkout_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_dedup: {
        Row: {
          created_at: string
          id: string
          offer_id: string | null
          payment_link_id: string | null
          sales_page_id: string | null
          space_id: string
          visit_date: string
          visitor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          offer_id?: string | null
          payment_link_id?: string | null
          sales_page_id?: string | null
          space_id: string
          visit_date: string
          visitor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          offer_id?: string | null
          payment_link_id?: string | null
          sales_page_id?: string | null
          space_id?: string
          visit_date?: string
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_dedup_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_dedup_payment_link_id_fkey"
            columns: ["payment_link_id"]
            isOneToOne: false
            referencedRelation: "payment_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_dedup_sales_page_id_fkey"
            columns: ["sales_page_id"]
            isOneToOne: false
            referencedRelation: "sales_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_dedup_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
