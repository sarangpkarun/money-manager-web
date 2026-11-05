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
export type ActivityRow = Omit<SearchRow, Nullable | 'tags'> & { [K in Nullable]: string | null } & { tags: string[] | null }
export type TxnKind = Pub['Enums']['txn_kind']
export type AccountType = Pub['Enums']['account_type']
