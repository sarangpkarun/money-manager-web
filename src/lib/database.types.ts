
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "accounts": {
                  Row: {
                    "archived": boolean | null,"color": string | null,"credit_limit_paise": number | null,"due_day": number | null,"id": string,"name": string,"opening_balance_paise": number,"sort": number | null,"statement_day": number | null,"type": Database["public"]['Enums']["account_type"],"user_id": string
                  }
                  Insert: {
                    "archived"?: boolean | null,"color"?: string | null,"credit_limit_paise"?: number | null,"due_day"?: number | null,"id"?: string,"name": string,"opening_balance_paise"?: number,"sort"?: number | null,"statement_day"?: number | null,"type": Database["public"]['Enums']["account_type"],"user_id"?: string
                  }
                  Update: {
                    "archived"?: boolean | null,"color"?: string | null,"credit_limit_paise"?: number | null,"due_day"?: number | null,"id"?: string,"name"?: string,"opening_balance_paise"?: number,"sort"?: number | null,"statement_day"?: number | null,"type"?: Database["public"]['Enums']["account_type"],"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"budgets": {
                  Row: {
                    "category_id": string | null,"id": string,"limit_paise": number,"user_id": string
                  }
                  Insert: {
                    "category_id"?: string | null,"id"?: string,"limit_paise": number,"user_id"?: string
                  }
                  Update: {
                    "category_id"?: string | null,"id"?: string,"limit_paise"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "budgets_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "archived": boolean | null,"color": string | null,"icon": string | null,"id": string,"kind": string,"name": string,"sort": number | null,"user_id": string
                  }
                  Insert: {
                    "archived"?: boolean | null,"color"?: string | null,"icon"?: string | null,"id"?: string,"kind": string,"name": string,"sort"?: number | null,"user_id"?: string
                  }
                  Update: {
                    "archived"?: boolean | null,"color"?: string | null,"icon"?: string | null,"id"?: string,"kind"?: string,"name"?: string,"sort"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"entries": {
                  Row: {
                    "created_at": string | null,"direction": Database["public"]['Enums']["entry_dir"],"down_payment_paise": number | null,"due_date": string | null,"id": string,"interest": Database["public"]['Enums']["interest_type"],"kind": Database["public"]['Enums']["entry_kind"],"no_cost": boolean | null,"notes": string | null,"party_name": string | null,"person_id": string | null,"principal_paise": number,"rate_bps": number | null,"remind": boolean,"settled_on": string | null,"source_txn_id": string | null,"start_date": string,"status": Database["public"]['Enums']["entry_status"],"title": string,"total_payable_paise": number,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string | null,"direction": Database["public"]['Enums']["entry_dir"],"down_payment_paise"?: number | null,"due_date"?: string | null,"id"?: string,"interest"?: Database["public"]['Enums']["interest_type"],"kind": Database["public"]['Enums']["entry_kind"],"no_cost"?: boolean | null,"notes"?: string | null,"party_name"?: string | null,"person_id"?: string | null,"principal_paise": number,"rate_bps"?: number | null,"remind"?: boolean,"settled_on"?: string | null,"source_txn_id"?: string | null,"start_date": string,"status"?: Database["public"]['Enums']["entry_status"],"title": string,"total_payable_paise": number,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string | null,"direction"?: Database["public"]['Enums']["entry_dir"],"down_payment_paise"?: number | null,"due_date"?: string | null,"id"?: string,"interest"?: Database["public"]['Enums']["interest_type"],"kind"?: Database["public"]['Enums']["entry_kind"],"no_cost"?: boolean | null,"notes"?: string | null,"party_name"?: string | null,"person_id"?: string | null,"principal_paise"?: number,"rate_bps"?: number | null,"remind"?: boolean,"settled_on"?: string | null,"source_txn_id"?: string | null,"start_date"?: string,"status"?: Database["public"]['Enums']["entry_status"],"title"?: string,"total_payable_paise"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "entries_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entries_source_txn_id_fkey"
      columns: ["source_txn_id"]
isOneToOne: false
      referencedRelation: "transactions"
      referencedColumns: ["id"]
    }
                  ]
                },"notes": {
                  Row: {
                    "body": string | null,"date": string,"done": boolean | null,"entry_id": string | null,"id": string,"kind": string,"remind_at": string | null,"repeat_rule": string | null,"title": string,"user_id": string
                  }
                  Insert: {
                    "body"?: string | null,"date": string,"done"?: boolean | null,"entry_id"?: string | null,"id"?: string,"kind": string,"remind_at"?: string | null,"repeat_rule"?: string | null,"title": string,"user_id"?: string
                  }
                  Update: {
                    "body"?: string | null,"date"?: string,"done"?: boolean | null,"entry_id"?: string | null,"id"?: string,"kind"?: string,"remind_at"?: string | null,"repeat_rule"?: string | null,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notes_entry_id_fkey"
      columns: ["entry_id"]
isOneToOne: false
      referencedRelation: "entries"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "account_id": string | null,"amount_paise": number,"created_at": string | null,"entry_id": string,"id": string,"mode": Database["public"]['Enums']["pay_mode"] | null,"note": string | null,"paid_on": string,"schedule_item_id": string | null,"user_id": string
                  }
                  Insert: {
                    "account_id"?: string | null,"amount_paise": number,"created_at"?: string | null,"entry_id": string,"id"?: string,"mode"?: Database["public"]['Enums']["pay_mode"] | null,"note"?: string | null,"paid_on": string,"schedule_item_id"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "account_id"?: string | null,"amount_paise"?: number,"created_at"?: string | null,"entry_id"?: string,"id"?: string,"mode"?: Database["public"]['Enums']["pay_mode"] | null,"note"?: string | null,"paid_on"?: string,"schedule_item_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_entry_id_fkey"
      columns: ["entry_id"]
isOneToOne: false
      referencedRelation: "entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_schedule_item_id_fkey"
      columns: ["schedule_item_id"]
isOneToOne: false
      referencedRelation: "schedule_items"
      referencedColumns: ["id"]
    }
                  ]
                },"people": {
                  Row: {
                    "archived": boolean | null,"email": string | null,"id": string,"name": string,"notes": string | null,"phone": string | null,"user_id": string
                  }
                  Insert: {
                    "archived"?: boolean | null,"email"?: string | null,"id"?: string,"name": string,"notes"?: string | null,"phone"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "archived"?: boolean | null,"email"?: string | null,"id"?: string,"name"?: string,"notes"?: string | null,"phone"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "alarm_time": string | null,"created_at": string | null,"currency": string | null,"dashboard_layout": Json | null,"date_format": string | null,"id": string,"name": string | null,"number_format": string | null,"quiet_from": string | null,"quiet_until": string | null,"summary_mode": string | null,"summary_time": string | null,"summary_weekday": number | null,"theme": string | null,"timezone": string | null,"week_starts_on": number | null
                  }
                  Insert: {
                    "alarm_time"?: string | null,"created_at"?: string | null,"currency"?: string | null,"dashboard_layout"?: Json | null,"date_format"?: string | null,"id": string,"name"?: string | null,"number_format"?: string | null,"quiet_from"?: string | null,"quiet_until"?: string | null,"summary_mode"?: string | null,"summary_time"?: string | null,"summary_weekday"?: number | null,"theme"?: string | null,"timezone"?: string | null,"week_starts_on"?: number | null
                  }
                  Update: {
                    "alarm_time"?: string | null,"created_at"?: string | null,"currency"?: string | null,"dashboard_layout"?: Json | null,"date_format"?: string | null,"id"?: string,"name"?: string | null,"number_format"?: string | null,"quiet_from"?: string | null,"quiet_until"?: string | null,"summary_mode"?: string | null,"summary_time"?: string | null,"summary_weekday"?: number | null,"theme"?: string | null,"timezone"?: string | null,"week_starts_on"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"push_subscriptions": {
                  Row: {
                    "created_at": string | null,"endpoint": string,"id": string,"keys": NonNullable<Json>,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string | null,"endpoint": string,"id"?: string,"keys": NonNullable<Json>,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string | null,"endpoint"?: string,"id"?: string,"keys"?: NonNullable<Json>,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"recurring": {
                  Row: {
                    "active": boolean | null,"id": string,"next_date": string,"rule": string,"template": NonNullable<Json>,"user_id": string
                  }
                  Insert: {
                    "active"?: boolean | null,"id"?: string,"next_date": string,"rule": string,"template": NonNullable<Json>,"user_id"?: string
                  }
                  Update: {
                    "active"?: boolean | null,"id"?: string,"next_date"?: string,"rule"?: string,"template"?: NonNullable<Json>,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"schedule_items": {
                  Row: {
                    "due_date": string,"due_paise": number,"entry_id": string,"id": string,"interest_paise": number,"paid_on": string | null,"paid_paise": number,"principal_paise": number,"seq": number,"user_id": string
                  }
                  Insert: {
                    "due_date": string,"due_paise": number,"entry_id": string,"id"?: string,"interest_paise"?: number,"paid_on"?: string | null,"paid_paise"?: number,"principal_paise"?: number,"seq": number,"user_id"?: string
                  }
                  Update: {
                    "due_date"?: string,"due_paise"?: number,"entry_id"?: string,"id"?: string,"interest_paise"?: number,"paid_on"?: string | null,"paid_paise"?: number,"principal_paise"?: number,"seq"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "schedule_items_entry_id_fkey"
      columns: ["entry_id"]
isOneToOne: false
      referencedRelation: "entries"
      referencedColumns: ["id"]
    }
                  ]
                },"transactions": {
                  Row: {
                    "account_id": string | null,"amount_paise": number,"category_id": string | null,"created_at": string | null,"date": string,"entry_id": string | null,"for_other_paise": number,"id": string,"kind": Database["public"]['Enums']["txn_kind"],"notes": string | null,"payment_id": string | null,"place": string | null,"receipt_path": string | null,"recurring_id": string | null,"tags": (string)[] | null,"title": string | null,"to_account_id": string | null,"updated_at": string | null,"user_id": string
                  }
                  Insert: {
                    "account_id"?: string | null,"amount_paise": number,"category_id"?: string | null,"created_at"?: string | null,"date": string,"entry_id"?: string | null,"for_other_paise"?: number,"id"?: string,"kind": Database["public"]['Enums']["txn_kind"],"notes"?: string | null,"payment_id"?: string | null,"place"?: string | null,"receipt_path"?: string | null,"recurring_id"?: string | null,"tags"?: (string)[] | null,"title"?: string | null,"to_account_id"?: string | null,"updated_at"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "account_id"?: string | null,"amount_paise"?: number,"category_id"?: string | null,"created_at"?: string | null,"date"?: string,"entry_id"?: string | null,"for_other_paise"?: number,"id"?: string,"kind"?: Database["public"]['Enums']["txn_kind"],"notes"?: string | null,"payment_id"?: string | null,"place"?: string | null,"receipt_path"?: string | null,"recurring_id"?: string | null,"tags"?: (string)[] | null,"title"?: string | null,"to_account_id"?: string | null,"updated_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fk_txn_entry"
      columns: ["entry_id"]
isOneToOne: false
      referencedRelation: "entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_to_account_id_fkey"
      columns: ["to_account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "is_verified":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           }
          }
          Enums: {
            "account_type": "cash"|"bank"|"upi"|"credit_card"|"wallet","entry_dir": "receive"|"pay","entry_kind": "lent"|"on_behalf"|"borrowed"|"emi_purchase"|"instalment","entry_status": "open"|"settled"|"cancelled","interest_type": "none"|"flat"|"simple"|"reducing","pay_mode": "cash"|"upi"|"bank"|"card"|"other","txn_kind": "expense"|"income"|"transfer"|"debt_out"|"debt_in"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "account_type": ["cash", "bank", "upi", "credit_card", "wallet"],"entry_dir": ["receive", "pay"],"entry_kind": ["lent", "on_behalf", "borrowed", "emi_purchase", "instalment"],"entry_status": ["open", "settled", "cancelled"],"interest_type": ["none", "flat", "simple", "reducing"],"pay_mode": ["cash", "upi", "bank", "card", "other"],"txn_kind": ["expense", "income", "transfer", "debt_out", "debt_in"]
          }
        }
} as const
