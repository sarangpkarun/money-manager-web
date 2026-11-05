# Money and schedule maths (`src/lib`)

Pure TypeScript, no I/O. Phase 5 mirrors these rules in Postgres; `tests/fixtures/schedule-cases.json` holds the
exact expected rows both sides must reproduce (regenerate deliberately with `UPDATE_GOLDEN=1 pnpm vitest run src/lib/golden.test.ts`).

## Conventions
- **Money** = whole **paise** as a JS `number` (safe integers only; `assertPaise` guards). Never store floats.
  Percentage maths goes through `mulDiv` (BigInt, exact, half rounds up).
- **Dates** = `'yyyy-MM-dd'` strings, calendar arithmetic only (no `Date`, no timezone). "Today" is always passed in.
- **Rates**: `rateBps` = percent x 100 (12.5% = 1250).

## Rules
| Topic | Rule |
|---|---|
| Month-end | Series keep the **original day**: 31 Jan, 28 Feb, 31 Mar (no drift). |
| Equal split | Principal and interest are split **independently**: each row `floor(x/n)`, last row takes the remainder. Rows always sum exactly; no part can go negative. |
| Flat interest | One-time `principal x rate`, spread over rows (regardless of term). |
| Simple interest (plan) | `principal x annual rate x (months/12)` (weeks/52 for weekly). |
| Simple interest (single date) | `principal x rate x days/365` up to `today`. |
| Reducing EMI | `EMI = P*r / (1-(1+r)^-n)`, `r = rate/12`, rounded to paise. Each row's interest = `round(balance*r)`; the last row clears the balance exactly. |
| No-cost EMI | Seller absorbs interest: you repay the financed amount (`price - down`) only. |
| Instalment by amount | Rows of the given amount, last row smaller; with interest the term is the smallest count that covers principal + interest. |
| Minimum row | Every row must be at least 1 paise, else `RangeError`. Max 1,200 rows. |
| Payments | To a chosen row first, excess spills to the earliest unpaid rows; any order allowed; overpayment rejected; `paid_on` set when a row becomes fully paid. |
| Labels | `paid_on < due` early (N days) · `=` on time · `>` late (N days) · unpaid/part-paid after due date overdue (starts the day **after** due) · otherwise upcoming. |
| Skip period | The chosen row and every later **unpaid** row move one period later; amounts unchanged. |
| Change amount | New amount must exceed what is paid on that row; the difference is spread equally over later unpaid rows (last absorbs rounding); total payable is unchanged. |
| Extra payment | Taken off the plan from the **last row backwards** (shorter term); fully covered rows are removed (their `seq` numbers are not reused); a part-paid row that is fully covered completes with `paid_on`. |
| Foreclose estimate | Unpaid principal + interest already due (+ optional fee %). Interest not yet due is waived; interest accruing inside the current period is ignored (rows carry no accrual dates), so a lender's figure can differ slightly. |
| No due date | A loan without a due date keeps its single schedule row dated `9999-12-31` (`NO_DUE_DATE`, `hasDueDate` in `dates.ts`; the column is NOT NULL). It is never overdue and labelled "No due date". Anything that sorts or filters by due date must skip the sentinel (money stats and Home ageing do). |
| Entry interest | Fixed when the entry is created (`entryInterest`, mirrored by `create_entry`): flat = one-time % of principal, simple = principal × rate × days(start..due) / 365 and needs a due date. Open-ended simple interest that keeps growing until paid is not supported. |
| Plans on the server | The app builds rows with `buildSchedule` and sends them; `create_entry_with_plan` only validates and stores (rows numbered 1..n, dates strictly increasing and not before the start, `due = principal + interest > 0`, Σ principal = amount, flat interest recomputed, no interest when interest-free/no-cost). Plan edits send the rows they started from (`p_base`); a stale base is refused (`40001`, "reload"). |
| Allocation | Done by `record_payment` in SQL under a row lock (target row first, then earliest unpaid by `seq`), one `payments` row per part, one transaction per cash movement. Mirrors `allocatePayment`; a property test compares them. |
| Accounting | `lent` / `borrowed` = `debt_out` / `debt_in` (not spending). `emi_purchase` / `instalment`: the down payment and every instalment are `expense` in the entry's category (spend counts when money leaves). Any transaction with an `entry_id` is read-only in Activity. |
| Progress | paid = payments made (incl. extra payments); left = Σ(due − paid) over rows; total = paid + left. Extra payments have no schedule row and cannot be deleted (the shortened rows cannot be restored); they also block "mark as unpaid". |
