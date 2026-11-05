import type { Database } from './database.types'

type Pub = Database['public']
export type Row<T extends keyof Pub['Tables']> = Pub['Tables'][T]['Row']
export type InsertRow<T extends keyof Pub['Tables']> = Pub['Tables'][T]['Insert']
export type UpdateRow<T extends keyof Pub['Tables']> = Pub['Tables'][T]['Update']

export type Account = Row<'accounts'>
export type Category = Row<'categories'>
export type Transaction = Row<'transactions'>
export type AccountBalance = Pub['Views']['account_balances']['Row']
type SearchRow = Pub['Functions']['search_transactions']['Returns'][number]
type Nullable = 'account_id' | 'account_name' | 'to_account_id' | 'to_account_name' | 'category_id' | 'category_name'
  | 'category_icon' | 'category_color' | 'title' | 'place' | 'notes' | 'entry_id'
/**
 * One row of the search_transactions RPC (transaction joined with account/category names).
 * Generated types cannot express nullable columns of a `returns table`, so they are declared here.
 */
/** What a friend still owes on a purchase paid for them. */
export interface OtherPending { entry_id: string; person_id: string | null; person_name: string | null; amount_paise: number; pending_paise: number }
/** `others` is optional: rows cached before Phase 6 do not have it. */
export type ActivityRow = Omit<SearchRow, Nullable | 'tags' | 'others'> & { [K in Nullable]: string | null } & { tags: string[] | null; others?: OtherPending[] | null }
export type TxnKind = Pub['Enums']['txn_kind']
export type AccountType = Pub['Enums']['account_type']
export type Person = Row<'people'>
export type Entry = Row<'entries'>
export type ScheduleItem = Row<'schedule_items'>
export type Payment = Row<'payments'>
export type PayMode = Pub['Enums']['pay_mode']
