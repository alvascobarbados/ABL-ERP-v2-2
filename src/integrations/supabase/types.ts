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
      buyers: {
        Row: {
          contact: string | null
          created_at: string
          customer_id: string
          email: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          contact?: string | null
          created_at?: string
          customer_id: string
          email?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          contact?: string | null
          created_at?: string
          customer_id?: string
          email?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "buyers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          contact_name: string | null
          country: string
          created_at: string
          default_shipping_mode: string | null
          email: string | null
          id: string
          incoterms: string | null
          name: string
          notes: string | null
          payment_terms: string
          payment_terms_custom_days: number | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          contact_name?: string | null
          country?: string
          created_at?: string
          default_shipping_mode?: string | null
          email?: string | null
          id?: string
          incoterms?: string | null
          name: string
          notes?: string | null
          payment_terms?: string
          payment_terms_custom_days?: number | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          contact_name?: string | null
          country?: string
          created_at?: string
          default_shipping_mode?: string | null
          email?: string | null
          id?: string
          incoterms?: string | null
          name?: string
          notes?: string | null
          payment_terms?: string
          payment_terms_custom_days?: number | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      line_items: {
        Row: {
          created_at: string
          description: string
          id: string
          position: number
          product_id: string | null
          project_id: string
          qty: number
          total: number | null
          unit_price: number | null
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          position: number
          product_id?: string | null
          project_id: string
          qty: number
          total?: number | null
          unit_price?: number | null
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          position?: number
          product_id?: string | null
          project_id?: string
          qty?: number
          total?: number | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "line_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          default_unit: string | null
          id: string
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_unit?: string | null
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_unit?: string | null
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      project_log_entries: {
        Row: {
          action_type: string
          actor_display_name: string
          actor_user_id: string
          description: string
          id: string
          metadata: Json | null
          project_id: string
          ts: string
        }
        Insert: {
          action_type: string
          actor_display_name: string
          actor_user_id: string
          description: string
          id: string
          metadata?: Json | null
          project_id: string
          ts?: string
        }
        Update: {
          action_type?: string
          actor_display_name?: string
          actor_user_id?: string
          description?: string
          id?: string
          metadata?: Json | null
          project_id?: string
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_log_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_notes: {
        Row: {
          author: string
          author_user_id: string | null
          auto: boolean
          id: string
          project_id: string
          text: string
          ts: string
        }
        Insert: {
          author: string
          author_user_id?: string | null
          auto?: boolean
          id: string
          project_id: string
          text: string
          ts?: string
        }
        Update: {
          author?: string
          author_user_id?: string | null
          auto?: boolean
          id?: string
          project_id?: string
          text?: string
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          cbm: number | null
          completion_date: string | null
          contact_person: string | null
          created_at: string
          customer: string
          deadline: string
          deadline_date: string | null
          deleted_at: string | null
          deleted_from_pipeline: string | null
          deleted_from_stage: string | null
          design_brief: string | null
          detail_summary: string | null
          flagged: boolean
          id: string
          invoice_issued_date: string | null
          invoice_issued_date_assumed: boolean | null
          invoice_number: string | null
          invoice_required_entered_at: string | null
          num_packages: number | null
          order_type: string
          outstanding_balance: number | null
          paid_on_date: string | null
          payment_method: string | null
          payment_reference: string | null
          payment_terms: string | null
          payment_terms_custom_days: number | null
          payment_terms_inherited: boolean | null
          pipeline_id: string
          po_number: string | null
          point_person: string
          priority: string
          project_name: string
          quote_number: string | null
          sales_shipping_label: string | null
          shipment_id: string | null
          shipment_number: string | null
          shipping_mode: string | null
          stage_id: string
          supplier_id: string | null
          supplier_label: string | null
          tag: string | null
          tracking_ref: string | null
          updated_at: string
          value: number
          weight_kg: number | null
        }
        Insert: {
          cbm?: number | null
          completion_date?: string | null
          contact_person?: string | null
          created_at?: string
          customer: string
          deadline: string
          deadline_date?: string | null
          deleted_at?: string | null
          deleted_from_pipeline?: string | null
          deleted_from_stage?: string | null
          design_brief?: string | null
          detail_summary?: string | null
          flagged?: boolean
          id: string
          invoice_issued_date?: string | null
          invoice_issued_date_assumed?: boolean | null
          invoice_number?: string | null
          invoice_required_entered_at?: string | null
          num_packages?: number | null
          order_type?: string
          outstanding_balance?: number | null
          paid_on_date?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_terms?: string | null
          payment_terms_custom_days?: number | null
          payment_terms_inherited?: boolean | null
          pipeline_id: string
          po_number?: string | null
          point_person: string
          priority?: string
          project_name: string
          quote_number?: string | null
          sales_shipping_label?: string | null
          shipment_id?: string | null
          shipment_number?: string | null
          shipping_mode?: string | null
          stage_id: string
          supplier_id?: string | null
          supplier_label?: string | null
          tag?: string | null
          tracking_ref?: string | null
          updated_at?: string
          value?: number
          weight_kg?: number | null
        }
        Update: {
          cbm?: number | null
          completion_date?: string | null
          contact_person?: string | null
          created_at?: string
          customer?: string
          deadline?: string
          deadline_date?: string | null
          deleted_at?: string | null
          deleted_from_pipeline?: string | null
          deleted_from_stage?: string | null
          design_brief?: string | null
          detail_summary?: string | null
          flagged?: boolean
          id?: string
          invoice_issued_date?: string | null
          invoice_issued_date_assumed?: boolean | null
          invoice_number?: string | null
          invoice_required_entered_at?: string | null
          num_packages?: number | null
          order_type?: string
          outstanding_balance?: number | null
          paid_on_date?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_terms?: string | null
          payment_terms_custom_days?: number | null
          payment_terms_inherited?: boolean | null
          pipeline_id?: string
          po_number?: string | null
          point_person?: string
          priority?: string
          project_name?: string
          quote_number?: string | null
          sales_shipping_label?: string | null
          shipment_id?: string | null
          shipment_number?: string | null
          shipping_mode?: string | null
          stage_id?: string
          supplier_id?: string | null
          supplier_label?: string | null
          tag?: string | null
          tracking_ref?: string | null
          updated_at?: string
          value?: number
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_shipment_fk"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          carrier: string | null
          code: string
          created_at: string
          eta: string
          etd: string
          id: string
          mode: string
          status: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          carrier?: string | null
          code: string
          created_at?: string
          eta: string
          etd: string
          id: string
          mode: string
          status?: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          carrier?: string | null
          code?: string
          created_at?: string
          eta?: string
          etd?: string
          id?: string
          mode?: string
          status?: string
          supplier_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          country: string | null
          created_at: string
          default_shipping_mode: string | null
          id: string
          legacy_id: string | null
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          default_shipping_mode?: string | null
          id?: string
          legacy_id?: string | null
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          default_shipping_mode?: string | null
          id?: string
          legacy_id?: string | null
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          initials: string
          role: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          initials: string
          role?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          initials?: string
          role?: string | null
          updated_at?: string
        }
        Relationships: []
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
