# Going live with your real money

You are replacing the old app, so the first weeks are about trust: every number the app shows must match your real world. This is the order that works.

## Day 0: set up the structure (about 30 minutes)

1. **Sign up** on the deployed app with your real email, confirm it, choose a password (8+ characters, letters and digits), and install the app to the iPhone Home Screen (Share > Add to Home Screen). Open it from the Home Screen icon from now on.
2. **Settings > Profile:** check your name and the time zone (it decides what "today" is and when reminders fire).
3. **Settings > Accounts:** one per place money lives: Cash, each bank account, UPI apps, wallets, each credit card (with its limit, statement day and bill due day). **Leave every opening balance at 0 for now**; step "Day 0: open loans" below sets the real balances last, because entering an existing loan also moves the account it is recorded against.
4. **Settings > Categories:** rename or add what you really use; archive the rest.
5. **Settings > Display:** number format (Indian or Western), date format, week start, Home cards. **Settings > Reminders:** turn notifications on for this device, send the test, set your alarm time and quiet hours.

## Day 0: open loans, EMIs and friends

Enter each running thing once, with what is **still left** today, recorded against the account it would naturally come from or go to (any account is fine; the numbered steps below correct the balances afterwards):

| Situation | How |
|---|---|
| You lent someone money and it is unpaid | Money tab > Owed to me > Add, amount = what is still owed, due date if agreed |
| You borrowed and still owe | Money tab > I owe > Add, amount = what is still owed |
| Part of a loan is already paid | Enter only the remaining amount (the old payments are history, not needed) |
| A loan with fixed instalments | Quick Add > EMI / instalments; enter the months that are **left** and the next due date |
| A card purchase you paid for a friend | Quick Add > Spent > For someone else; your spend stays zero and it shows what they owe |

Each of these also records a transaction on the account you pick (a loan you gave leaves it, a loan you took arrives in it), so the balances now include money that really moved in the past. That is why the balances are set **last**:

1. Open Settings > Accounts. For every account, look at the balance the app shows now (it is the sum of what you entered).
2. Look up the **real balance today** in the bank app, UPI app or wallet (for a credit card: what you owe, entered as a negative number).
3. Edit the account and set **Opening balance = real balance − the balance the app shows now + the opening balance it already has** (with openings at 0: real − shown). The account then shows exactly the real balance.
4. Write down the date. From this day on, enter only things that happen **after** it; never back-fill older history.

## Daily, 2 minutes

- Enter each expense as it happens (Quick Add: amount, category, Save).
- Glance at Home: "Due soon" and the Insights lines.
- When someone pays you back or you pay an instalment, record it from the entry (Pay / Receive).

## Weekly, 10 minutes (the reconcile routine)

1. For each bank account, UPI app and card: compare **Settings > Accounts** with the bank app's balance. They must match to the rupee. If not, find the difference (a missed expense, a wrong amount, a transfer entered as an expense) and fix it in the app.
2. Compare each card's "Owed" with the card app's outstanding.
3. For each friend with an open balance, check Money > the person against your memory or chat.
4. Run the data health report (`scripts/health.sql` in the Supabase SQL editor, or `pnpm health:data` locally): all "problem" rows 0.
5. Take a backup (`pnpm backup`) and copy it off this computer.
6. Write what was off and why in `docs/ISSUES.md`.

Do this every week for the first month. After four clean weeks, once a month is enough.

## The old app

Keep it installed but read-only for a month. Do not enter anything in both. Use it only to look up history. After four clean weeks, export what you still want (screenshots or its own export) and retire it.

## What counts as success

Two consecutive weeks of daily use with **no data errors** (weekly reconcile matches, health report clean) and **no missed reminders** (everything due was notified once, on time). Track it in the table at the end of `ROADMAP.md` ("Phase 9 status"). If a week fails, the clock restarts after the fix.

## If something goes wrong

- A wrong entry: edit or delete it in the app (Undo appears after deletes). Do not touch the database by hand.
- The app shows an error screen: reload; the error is in Settings > About > Recent errors.
- Anything else: `docs/RUNBOOK.md`, "When the numbers look wrong" and "When reminders stop".
