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
