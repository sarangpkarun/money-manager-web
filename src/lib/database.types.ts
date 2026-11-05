
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
                    "category_id": string | null,"created_at": string | null,"direction": Database["public"]['Enums']["entry_dir"],"down_payment_paise": number | null,"due_date": string | null,"id": string,"interest": Database["public"]['Enums']["interest_type"],"kind": Database["public"]['Enums']["entry_kind"],"no_cost": boolean | null,"notes": string | null,"party_name": string | null,"person_id": string | null,"principal_paise": number,"rate_bps": number | null,"remind": boolean,"settled_on": string | null,"source_txn_id": string | null,"start_date": string,"status": Database["public"]['Enums']["entry_status"],"title": string,"total_payable_paise": number,"user_id": string
                  }
                  Insert: {
                    "category_id"?: string | null,"created_at"?: string | null,"direction": Database["public"]['Enums']["entry_dir"],"down_payment_paise"?: number | null,"due_date"?: string | null,"id"?: string,"interest"?: Database["public"]['Enums']["interest_type"],"kind": Database["public"]['Enums']["entry_kind"],"no_cost"?: boolean | null,"notes"?: string | null,"party_name"?: string | null,"person_id"?: string | null,"principal_paise": number,"rate_bps"?: number | null,"remind"?: boolean,"settled_on"?: string | null,"source_txn_id"?: string | null,"start_date": string,"status"?: Database["public"]['Enums']["entry_status"],"title": string,"total_payable_paise": number,"user_id"?: string
                  }
                  Update: {
                    "category_id"?: string | null,"created_at"?: string | null,"direction"?: Database["public"]['Enums']["entry_dir"],"down_payment_paise"?: number | null,"due_date"?: string | null,"id"?: string,"interest"?: Database["public"]['Enums']["interest_type"],"kind"?: Database["public"]['Enums']["entry_kind"],"no_cost"?: boolean | null,"notes"?: string | null,"party_name"?: string | null,"person_id"?: string | null,"principal_paise"?: number,"rate_bps"?: number | null,"remind"?: boolean,"settled_on"?: string | null,"source_txn_id"?: string | null,"start_date"?: string,"status"?: Database["public"]['Enums']["entry_status"],"title"?: string,"total_payable_paise"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "entries_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entries_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entries_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people_balances"
      referencedColumns: ["person_id"]
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
                    "account_id": string | null,"amount_paise": number,"created_at": string | null,"entry_id": string,"id": string,"mode": Database["public"]['Enums']["pay_mode"] | null,"note": string | null,"paid_on": string,"schedule_item_id": string | null,"txn_id": string | null,"user_id": string
                  }
                  Insert: {
                    "account_id"?: string | null,"amount_paise": number,"created_at"?: string | null,"entry_id": string,"id"?: string,"mode"?: Database["public"]['Enums']["pay_mode"] | null,"note"?: string | null,"paid_on": string,"schedule_item_id"?: string | null,"txn_id"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "account_id"?: string | null,"amount_paise"?: number,"created_at"?: string | null,"entry_id"?: string,"id"?: string,"mode"?: Database["public"]['Enums']["pay_mode"] | null,"note"?: string | null,"paid_on"?: string,"schedule_item_id"?: string | null,"txn_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "account_balances"
      referencedColumns: ["account_id"]
    },{
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
    },{
      foreignKeyName: "payments_txn_id_fkey"
      columns: ["txn_id"]
isOneToOne: false
      referencedRelation: "transactions"
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
      referencedRelation: "account_balances"
      referencedColumns: ["account_id"]
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
      referencedRelation: "account_balances"
      referencedColumns: ["account_id"]
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
            "account_balances": {
                  Row: {
                    "account_id": string | null,"archived": boolean | null,"balance_paise": number | null,"credit_limit_paise": number | null,"due_day": number | null,"name": string | null,"outstanding_paise": number | null,"sort": number | null,"statement_day": number | null,"type": Database["public"]['Enums']["account_type"] | null,"user_id": string | null
                  }
                  Relationships: [
                    
                  ]
                },"people_balances": {
                  Row: {
                    "archived": boolean | null,"email": string | null,"entry_count": number | null,"i_owe_paise": number | null,"last_entry_date": string | null,"name": string | null,"open_count": number | null,"owed_to_me_paise": number | null,"person_id": string | null,"phone": string | null,"user_id": string | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "_calendar_items":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"_calendar_notes":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"_plan_replace":
{ Args: { "p_action": string,"p_base": Json,"p_entry": string,"p_extra": number,"p_rows": Json }; Returns: undefined
                           },
"_sync_for_other":
{ Args: { "p_txn": string }; Returns: undefined
                           },
"_txn_others":
{ Args: { "p_txn": string }; Returns: Json
                           },
"activity_summary":
{ Args: { "p_filters"?: Json }; Returns: Json
                           },
"calendar_agenda":
{ Args: { "p_from": string,"p_to": string,"p_today": string }; Returns: Json
                           },
"calendar_month":
{ Args: { "p_filters"?: Json,"p_month": string,"p_today": string }; Returns: Json
                           },
"create_entry":
{ Args: { "p_account": string,"p_amount": number,"p_due"?: string,"p_id": string,"p_interest"?: Database["public"]['Enums']["interest_type"],"p_kind": Database["public"]['Enums']["entry_kind"],"p_notes"?: string,"p_person": string,"p_rate_bps"?: number,"p_start": string,"p_title": string }; Returns: {
              "category_id": string | null,
"created_at": string | null,
"direction": Database["public"]['Enums']["entry_dir"],
"down_payment_paise": number | null,
"due_date": string | null,
"id": string,
"interest": Database["public"]['Enums']["interest_type"],
"kind": Database["public"]['Enums']["entry_kind"],
"no_cost": boolean | null,
"notes": string | null,
"party_name": string | null,
"person_id": string | null,
"principal_paise": number,
"rate_bps": number | null,
"remind": boolean,
"settled_on": string | null,
"source_txn_id": string | null,
"start_date": string,
"status": Database["public"]['Enums']["entry_status"],
"title": string,
"total_payable_paise": number,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "entries"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_entry_with_plan":
{ Args: { "p_account": string,"p_category": string,"p_down": number,"p_id": string,"p_interest": Database["public"]['Enums']["interest_type"],"p_kind": Database["public"]['Enums']["entry_kind"],"p_no_cost": boolean,"p_party": string,"p_person": string,"p_principal": number,"p_rate_bps": number,"p_rows": Json,"p_source"?: string,"p_start": string,"p_title": string }; Returns: {
              "category_id": string | null,
"created_at": string | null,
"direction": Database["public"]['Enums']["entry_dir"],
"down_payment_paise": number | null,
"due_date": string | null,
"id": string,
"interest": Database["public"]['Enums']["interest_type"],
"kind": Database["public"]['Enums']["entry_kind"],
"no_cost": boolean | null,
"notes": string | null,
"party_name": string | null,
"person_id": string | null,
"principal_paise": number,
"rate_bps": number | null,
"remind": boolean,
"settled_on": string | null,
"source_txn_id": string | null,
"start_date": string,
"status": Database["public"]['Enums']["entry_status"],
"title": string,
"total_payable_paise": number,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "entries"
        isOneToOne: true
        isSetofReturn: false
      } },
"dashboard_core":
{ Args: { "p_filters"?: Json,"p_month": string,"p_today": string }; Returns: Json
                           },
"dashboard_summary":
{ Args: { "p_filters"?: Json,"p_month": string,"p_today": string }; Returns: Json
                           },
"delete_entry":
{ Args: { "p_id": string }; Returns: undefined
                           },
"delete_payment":
{ Args: { "p_id": string }; Returns: {
              "category_id": string | null,
"created_at": string | null,
"direction": Database["public"]['Enums']["entry_dir"],
"down_payment_paise": number | null,
"due_date": string | null,
"id": string,
"interest": Database["public"]['Enums']["interest_type"],
"kind": Database["public"]['Enums']["entry_kind"],
"no_cost": boolean | null,
"notes": string | null,
"party_name": string | null,
"person_id": string | null,
"principal_paise": number,
"rate_bps": number | null,
"remind": boolean,
"settled_on": string | null,
"source_txn_id": string | null,
"start_date": string,
"status": Database["public"]['Enums']["entry_status"],
"title": string,
"total_payable_paise": number,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "entries"
        isOneToOne: true
        isSetofReturn: false
      } },
"delete_transaction":
{ Args: { "p_id": string }; Returns: Json
                           },
"filter_transactions":
{ Args: { "p_filters": Json }; Returns: {
              "account_id": string | null,
"amount_paise": number,
"category_id": string | null,
"created_at": string | null,
"date": string,
"entry_id": string | null,
"for_other_paise": number,
"id": string,
"kind": Database["public"]['Enums']["txn_kind"],
"notes": string | null,
"payment_id": string | null,
"place": string | null,
"receipt_path": string | null,
"recurring_id": string | null,
"tags": (string)[] | null,
"title": string | null,
"to_account_id": string | null,
"updated_at": string | null,
"user_id": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "transactions"
        isOneToOne: false
        isSetofReturn: true
      } },
"is_verified":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"mark_unpaid":
{ Args: { "p_entry": string }; Returns: {
              "category_id": string | null,
"created_at": string | null,
"direction": Database["public"]['Enums']["entry_dir"],
"down_payment_paise": number | null,
"due_date": string | null,
"id": string,
"interest": Database["public"]['Enums']["interest_type"],
"kind": Database["public"]['Enums']["entry_kind"],
"no_cost": boolean | null,
"notes": string | null,
"party_name": string | null,
"person_id": string | null,
"principal_paise": number,
"rate_bps": number | null,
"remind": boolean,
"settled_on": string | null,
"source_txn_id": string | null,
"start_date": string,
"status": Database["public"]['Enums']["entry_status"],
"title": string,
"total_payable_paise": number,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "entries"
        isOneToOne: true
        isSetofReturn: false
      } },
"merge_people":
{ Args: { "p_drop": string,"p_keep": string }; Returns: {
              "archived": boolean | null,
"email": string | null,
"id": string,
"name": string,
"notes": string | null,
"phone": string | null,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "people"
        isOneToOne: true
        isSetofReturn: false
      } },
"money_history":
{ Args: { "p_cursor"?: Json,"p_limit"?: number }; Returns: {
              "direction": Database["public"]['Enums']["entry_dir"],"due_date": string,"id": string,"kind": Database["public"]['Enums']["entry_kind"],"paid_paise": number,"person_id": string,"person_name": string,"principal_paise": number,"settled_on": string,"start_date": string,"title": string,"total_paise": number
            }[]
                           },
"money_overview":
{ Args: { "p_today": string }; Returns: Json
                           },
"money_stats":
{ Args: { "p_today": string }; Returns: Json
                           },
"plan_change_amount":
{ Args: { "p_base": Json,"p_entry": string,"p_rows": Json }; Returns: {
              "category_id": string | null,
"created_at": string | null,
"direction": Database["public"]['Enums']["entry_dir"],
"down_payment_paise": number | null,
"due_date": string | null,
"id": string,
"interest": Database["public"]['Enums']["interest_type"],
"kind": Database["public"]['Enums']["entry_kind"],
"no_cost": boolean | null,
"notes": string | null,
"party_name": string | null,
"person_id": string | null,
"principal_paise": number,
"rate_bps": number | null,
"remind": boolean,
"settled_on": string | null,
"source_txn_id": string | null,
"start_date": string,
"status": Database["public"]['Enums']["entry_status"],
"title": string,
"total_payable_paise": number,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "entries"
        isOneToOne: true
        isSetofReturn: false
      } },
"plan_extra_payment":
{ Args: { "p_account": string,"p_amount": number,"p_base": Json,"p_entry": string,"p_id": string,"p_mode": Database["public"]['Enums']["pay_mode"],"p_note": string,"p_paid_on": string,"p_rows": Json }; Returns: {
              "category_id": string | null,
"created_at": string | null,
"direction": Database["public"]['Enums']["entry_dir"],
"down_payment_paise": number | null,
"due_date": string | null,
"id": string,
"interest": Database["public"]['Enums']["interest_type"],
"kind": Database["public"]['Enums']["entry_kind"],
"no_cost": boolean | null,
"notes": string | null,
"party_name": string | null,
"person_id": string | null,
"principal_paise": number,
"rate_bps": number | null,
"remind": boolean,
"settled_on": string | null,
"source_txn_id": string | null,
"start_date": string,
"status": Database["public"]['Enums']["entry_status"],
"title": string,
"total_payable_paise": number,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "entries"
        isOneToOne: true
        isSetofReturn: false
      } },
"plan_skip_month":
{ Args: { "p_base": Json,"p_entry": string,"p_rows": Json }; Returns: {
              "category_id": string | null,
"created_at": string | null,
"direction": Database["public"]['Enums']["entry_dir"],
"down_payment_paise": number | null,
"due_date": string | null,
"id": string,
"interest": Database["public"]['Enums']["interest_type"],
"kind": Database["public"]['Enums']["entry_kind"],
"no_cost": boolean | null,
"notes": string | null,
"party_name": string | null,
"person_id": string | null,
"principal_paise": number,
"rate_bps": number | null,
"remind": boolean,
"settled_on": string | null,
"source_txn_id": string | null,
"start_date": string,
"status": Database["public"]['Enums']["entry_status"],
"title": string,
"total_payable_paise": number,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "entries"
        isOneToOne: true
        isSetofReturn: false
      } },
"quick_add_transaction":
{ Args: { "p_account": string,"p_amount": number,"p_category"?: string,"p_date": string,"p_id": string,"p_kind": Database["public"]['Enums']["txn_kind"],"p_notes"?: string,"p_place"?: string,"p_tags"?: (string)[],"p_title"?: string,"p_to_account"?: string }; Returns: {
              "account_id": string | null,
"amount_paise": number,
"category_id": string | null,
"created_at": string | null,
"date": string,
"entry_id": string | null,
"for_other_paise": number,
"id": string,
"kind": Database["public"]['Enums']["txn_kind"],
"notes": string | null,
"payment_id": string | null,
"place": string | null,
"receipt_path": string | null,
"recurring_id": string | null,
"tags": (string)[] | null,
"title": string | null,
"to_account_id": string | null,
"updated_at": string | null,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "transactions"
        isOneToOne: true
        isSetofReturn: false
      } },
"quick_add_with_others":
{ Args: { "p_account": string,"p_amount": number,"p_category"?: string,"p_date": string,"p_id": string,"p_notes"?: string,"p_others"?: Json,"p_place"?: string,"p_tags"?: (string)[],"p_title"?: string }; Returns: Json
                           },
"record_payment":
{ Args: { "p_account": string,"p_amount": number,"p_entry": string,"p_id": string,"p_mode"?: Database["public"]['Enums']["pay_mode"],"p_note"?: string,"p_paid_on": string,"p_target_seq"?: number }; Returns: {
              "category_id": string | null,
"created_at": string | null,
"direction": Database["public"]['Enums']["entry_dir"],
"down_payment_paise": number | null,
"due_date": string | null,
"id": string,
"interest": Database["public"]['Enums']["interest_type"],
"kind": Database["public"]['Enums']["entry_kind"],
"no_cost": boolean | null,
"notes": string | null,
"party_name": string | null,
"person_id": string | null,
"principal_paise": number,
"rate_bps": number | null,
"remind": boolean,
"settled_on": string | null,
"source_txn_id": string | null,
"start_date": string,
"status": Database["public"]['Enums']["entry_status"],
"title": string,
"total_payable_paise": number,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "entries"
        isOneToOne: true
        isSetofReturn: false
      } },
"search_transactions":
{ Args: { "p_cursor"?: Json,"p_filters"?: Json,"p_limit"?: number }; Returns: {
              "account_id": string,"account_name": string,"amount_paise": number,"category_color": string,"category_icon": string,"category_id": string,"category_name": string,"created_at": string,"date": string,"entry_id": string,"for_other_paise": number,"id": string,"kind": Database["public"]['Enums']["txn_kind"],"notes": string,"others": Json,"place": string,"tags": (string)[],"title": string,"to_account_id": string,"to_account_name": string
            }[]
                           },
"title_suggestions":
{ Args: { "p_limit"?: number,"p_prefix": string }; Returns: {
              "account_id": string,"category_id": string,"last_date": string,"place": string,"title": string,"uses": number
            }[]
                           },
"update_entry":
{ Args: { "p_id": string,"p_patch": Json }; Returns: {
              "category_id": string | null,
"created_at": string | null,
"direction": Database["public"]['Enums']["entry_dir"],
"down_payment_paise": number | null,
"due_date": string | null,
"id": string,
"interest": Database["public"]['Enums']["interest_type"],
"kind": Database["public"]['Enums']["entry_kind"],
"no_cost": boolean | null,
"notes": string | null,
"party_name": string | null,
"person_id": string | null,
"principal_paise": number,
"rate_bps": number | null,
"remind": boolean,
"settled_on": string | null,
"source_txn_id": string | null,
"start_date": string,
"status": Database["public"]['Enums']["entry_status"],
"title": string,
"total_payable_paise": number,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "entries"
        isOneToOne: true
        isSetofReturn: false
      } },
"update_expense_for_others":
{ Args: { "p_id": string,"p_others"?: Json,"p_patch": Json }; Returns: Json
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
