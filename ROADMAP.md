# Money Manager v2: Delivery Roadmap

> Execution plan for the spec "Money Manager v2" (React PWA + Supabase).
> Each phase has a goal, tasks, deliverables, exit criteria (testable) and risks.
> Estimates assume **one full-time developer**; halve the calendar time for two.

---

## 0. Summary

| Phase | Name | Est. | Exit gate |
|---|---|---|---|
| 0 | Foundations and setup | 1 wk | Installs on iPhone, signs in, RLS verified |
| 1 | Money maths library (pure TS) | 1 wk | All Vitest suites green |
| 2 | Accounts, categories, Quick Add (basic), Activity | 2 wk | Scenario E passes; 5,000 rows smooth |
| 3 | Dashboard v1 (one RPC) | 1.5 wk | Home from cache < 100 ms |
| 4 | People, entries, payments, Money tab | 2 wk | Lend, part-pay, settle works |
| 5 | Plans, EMI, early/late logic, Calendar | 3 wk | Scenarios B, C, D pass |
| 6 | On-behalf link and card tracking | 1.5 wk | Scenario A passes |
| 7 | Reminders (Web Push), summaries, Settings | 2 wk | Push arrives on installed iPhone PWA |
| 8 | Insights, export/import, polish, a11y, perf | 2 wk | Quality checklist and budgets met |
| 9 | Beta, launch, migration | 1 wk | Own data migrated, daily use |
| 10 | v1.1 features | 4 to 6 wk | Per-feature criteria below |

**Total to v1 launch: about 17 weeks solo (about 9 to 10 with two people).**
Critical path: Phase 1 → 4 → 5 → 6 → 7. Dashboard (3) and Activity (2) can overlap with Phase 1 and 4 if there are two developers.

---

## 1. Decisions to lock before coding

Defaults from spec section 13 are accepted unless changed here. Review these on day 1.

| # | Decision | Default | Revisit when |
|---|---|---|---|
| Q1 | iOS reminders | PWA + Web Push | Push is unreliable in Phase 7 testing (then plan Capacitor, $99/yr) |
| Q2 | Users | Single-user, no sharing | Never in v1 |
| Q3 | Currency | INR only, per-account currency field not used | Later |
| Q4 | Interest | None / Flat / Simple (EMI: reducing + no-cost) | Compound only if used |
| Q5 | Card bills | Outstanding, utilisation, due date | Statement view in v1.1 |
| Q6 | For-others spend | Excluded from personal spend | Never |
| Q7 | Summary notifications | Off by default | Phase 7 |
| Q8 | Seed categories | Per spec | Phase 2 |

Other decisions to make now:
- **Router:** pick TanStack Router *or* React Router (recommend React Router for simplicity, lazy routes).
- **Charts:** hand-rolled SVG for donut, bars, sparkline (no chart library).
- **Hosting:** Vercel or Cloudflare Pages (one staging + one production Supabase project).
- **Migrations:** Supabase CLI, SQL migrations committed in `/supabase/migrations`.
- **Testing of RPCs:** pgTAP or SQL-level tests run against a local Supabase (`supabase start`).
- **Type generation:** `supabase gen types typescript` committed and checked in CI.

---

## 2. Phase 0: Foundations (Week 1)

**Goal:** an empty but installable, authenticated, deployed app with secure data access.

Tasks
- [ ] Scaffold Vite + React 18 + TS (strict) + Tailwind; ESLint, Prettier, path aliases.
- [ ] Folder structure per spec section 14.
- [ ] Theme tokens as CSS variables (light, dark, system) including semantic colours (green, red, blue, amber, purple, grey).
- [ ] PWA: `vite-plugin-pwa`, manifest, icons, Apple touch icon, splash colours, `black-translucent` status bar, `viewport-fit=cover`, safe-area utilities.
- [ ] App shell: fixed bottom tab bar (5 tabs), `overscroll-behavior: none`, keep-alive tabs with preserved scroll, lazy routes.
- [ ] Supabase: local dev (`supabase start`), staging and prod projects, env handling.
- [ ] Migration 001: enums, all tables, indexes, RLS policies on **every** table, `profiles` auto-create trigger on signup.
- [ ] Seed default categories on signup (trigger or RPC).
- [ ] Auth: email + password sign-up, email verification gate, login, forgot password, persistent session.
- [ ] TanStack Query provider with IndexedDB persistence (`idb-keyval`); Zustand store for UI state.
- [ ] CI: typecheck, lint, Vitest, build, bundle-size check (fail above 200 KB gz), Supabase types drift check.
- [ ] Deploy to Vercel/Cloudflare with preview deployments.

Exit criteria
- Add to Home Screen on a real iPhone, opens standalone, signs in, stays signed in after app restart.
- RLS test: user B cannot read/insert/update user A rows on any table (automated test).
- Unverified email cannot access data.

Risks: iOS PWA quirks (safe areas, keyboard). Test on a real device from day 1, not only the simulator.

---

## 3. Phase 1: Money maths library (Week 2)

**Goal:** correct, tested pure functions before any UI depends on them. These are mirrored later in SQL.

`/src/lib/money.ts`
- [ ] Paise <-> rupees parsing/formatting; Indian (12,34,567) and Western grouping; whole rupees unless paise non-zero.
- [ ] Safe amount expression parser ("450+120"), no `eval`.

`/src/lib/schedule.ts`
- [ ] Equal split with **last row absorbing rounding**.
- [ ] Month-end clamping (31 Jan, 28/29 Feb, 31 Mar); weekly (+7 days); custom dates.
- [ ] Flat and Simple interest (days/365).
- [ ] Reducing-balance EMI: `P·r·(1+r)^n / ((1+r)^n − 1)` in integer paise; no-cost EMI (interest 0 for the user).
- [ ] Per-row principal/interest split.
- [ ] Re-spread: change amount, skip month, extra payment (shrinks from the last row).
- [ ] Payment allocation: chosen row or earliest unpaid; overpayment blocked.
- [ ] Row label derivation (early N days, on time, late N days, overdue partial, overdue N days, upcoming).
- [ ] Prepay/foreclose estimate.

Tests (Vitest, property-based where useful with `fast-check`)
- Sum of schedule rows always equals `total_payable_paise`.
- No negative or zero rows; dates strictly increasing; clamped dates correct across leap years.
- Spec scenarios B, C, D expressed as unit-level fixtures.

Exit criteria: 100% of functions in the above list covered; coverage ≥ 95% on `/lib`.

---

## 4. Phase 2: Accounts, categories, Quick Add, Activity (Weeks 3 to 4)

**Goal:** the expense tracker works end to end and is fast.

Tasks
- [ ] Design-system primitives in `/ui`: Button, Sheet (vaul), Chip, Amount, SwipeRow, Skeleton, EmptyState, Toast with Undo.
- [ ] Accounts CRUD (cash, bank, UPI, credit card with limit, statement day, due day, wallet); archive; reorder.
- [ ] Account balance view (SQL) incl. credit card outstanding and utilisation.
- [ ] Categories CRUD with icon/colour, reorder, archive.
- [ ] **Quick Add v1:** Spent / Received / Transfer, custom keypad focus, title autocomplete from history (suggests category/account/place), category chips with recents first, account + date chips, last-used defaults, amount maths.
- [ ] `quick_add_transaction` RPC (txn only for now) with optimistic client update.
- [ ] After-save toast: Undo and Add another.
- [ ] Activity list: virtualised, sticky day headers with day totals, month total strip, per-account chips, swipe edit/delete with Undo, detail sheet with button equivalents.
- [ ] Search (title, place, notes, account, category, tags) using Postgres trigram/`ilike` with index.
- [ ] **Reusable Filter sheet** (date, type, account, category, amount, place/tag) with state in the URL query.
- [ ] Credit-card bill payment as a transfer (Bank → Card).
- [ ] Empty states with a single action; skeletons instead of spinners.

Exit criteria
- Scenario E: open → + → 120 → Food → Save, ≤ 4 taps.
- Seed 5,000 transactions; Activity scrolls at 60fps on a mid iPhone; search < 300 ms.
- Balances correct for income, expense, transfer, card outstanding (unit + SQL tests).

Risks: keypad + iOS keyboard behaviour in sheets; test 16px inputs, no zoom.

---

## 5. Phase 3: Dashboard v1 (Weeks 5 to 6)

**Goal:** Home renders from one RPC and is instant from cache.

Tasks
- [ ] `dashboard_summary(p_month, p_today, p_filters)` returning JSON: month totals (spent, income, saved, vs last month), daily series, category/account/place breakdown, recent 5, accounts and cards.
- [ ] Month switcher + global filter icon; filters apply to every card.
- [ ] SVG components: Donut, Sparkline with average line, Bars.
- [ ] Cards in this phase: This month (with projection), Where it went (toggle category/account/place), Cards, Recent activity.
- [ ] Card drill-downs → Activity with filters pre-applied.
- [ ] Stale-while-revalidate: persisted cache hydrate on launch, background refresh.
- [ ] Card hide/reorder stored in `profiles.dashboard_layout` (UI in Phase 7).
- [ ] Placeholder slots for cards delivered later (Net position, Due soon, People, EMI load, Insights).

Exit criteria
- Cold open from persisted cache paints in < 100 ms; one network call only.
- RPC returns in < 150 ms on 5,000 transactions (EXPLAIN checked, indexes used).
- Numbers reconcile with Activity totals (automated cross-check test).

---

## 6. Phase 4: People, entries, payments, Money tab (Weeks 7 to 8)

**Goal:** lend / borrow with part payments, correct balances, no plans yet.

Tasks
- [ ] People CRUD, autocomplete, "add new" inline, archive, search.
- [ ] Entries: `lent`, `borrowed` (single-date, optional due date, back-dated start, simple/flat interest to date).
- [ ] `create_entry_with_plan` (single-row variant first), `record_payment`, `delete_payment`, `mark_unpaid`.
- [ ] Auto-create linked `debt_out` / `debt_in` transactions so account balances stay correct; excluded from spend.
- [ ] Quick Add: **Lent** and **Borrowed** types (person required, due date).
- [ ] Money tab: They owe me / I owe grouped by person, summary card with overdue; People tab with net per person, filters and sorts; History tab (settled).
- [ ] Entry detail screen: progress bar, payments list, receive/pay, mark as unpaid, notes.
- [ ] Status labels (Pending / Partial / Overdue / Paid) consistent everywhere.
- [ ] Dashboard cards: Net position, Money with people (with ageing buckets).
- [ ] Duplicate-people detection + `merge_people`.
- [ ] Paste / CSV people import.

Exit criteria
- Lend ₹10,000 → part pay ₹4,000 → settle ₹6,000; balances, statuses, History, and account balances correct.
- Overpayment blocked; deleting a payment reverses its transaction.
- All RPCs are atomic (tested with forced mid-failure).

---

## 7. Phase 5: Plans, EMI, early/late logic, Calendar (Weeks 9 to 11)

**Goal:** schedules and the calendar, the highest-complexity phase.

Tasks (plans)
- [ ] `create_entry_with_plan`: equal, by monthly amount, weekly, custom, reducing EMI, no-cost EMI (with down payment).
- [ ] Mirror TS schedule maths in SQL; add **golden-file tests** asserting TS and SQL produce identical rows for a table of cases.
- [ ] Quick Add chip **EMI / instalments** with live preview (monthly amount, total interest, last date).
- [ ] Entry types: `emi_purchase` (party name, product), `instalment`.
- [ ] Plan row UI: mark paid, pay in any order, change amount, skip month, extra payment, prepay/foreclose estimate (`prepay_estimate`).
- [ ] RPCs: `plan_skip_month`, `plan_change_amount`, `plan_extra_payment`.
- [ ] `paid_on` set when a row completes; derived early/on-time/late labels everywhere.
- [ ] Dashboard cards: Due soon (with Pay), EMI & loan load (12-month bars, debt-free date).

Tasks (calendar)
- [ ] `calendar_month(p_month, p_today, p_filters)` RPC: per-day markers + totals.
- [ ] Month grid with up to 3 dots/day, optional day spend, totals strip (Spent, Received, Dues).
- [ ] Marker set per spec: red, amber, green ✓, **blue ✓ on both due and paid dates**, amber ✓ late, grey, purple.
- [ ] Layer chips: Dues, Spending, Notes. Month | Agenda switch; agenda infinite scroll with Today anchor.
- [ ] Day sheet: Due, Paid today (with badge + original due date), Spending & income, Notes & tasks; `+` adds with date pre-filled.
- [ ] Notes/tasks CRUD (`notes` table), checkbox done, repeat rule parsing.

Exit criteria
- Scenario B (borrow ₹50,000, 10 instalments, #2 paid early: blue ✓ on both dates, removed from Due soon).
- Scenario C (₹60,000 EMI, ₹6,000 down, 9 months, no-cost, 9 rows, last row absorbs rounding, clamped dates).
- Scenario D (weekly 4 × ₹500, pay row 3 first, one amber ✓ "2 days late").
- Calendar month opens in < 150 ms from cache; day sheet opens instantly.

Risks: SQL/TS divergence → mitigated by golden tests. Timezone: always use client `p_today`; never `now()` for business dates.

---

## 8. Phase 6: On-behalf link and card tracking (Weeks 12 to 13)

**Goal:** "paid for someone else" works with full connection between purchase and debt.

Tasks
- [ ] Quick Add chip **For someone else**: multiple people, amount each (default full), partial support.
- [ ] `quick_add_transaction` extended: creates `for_other_paise`, `on_behalf` entries per person with `source_txn_id`, optional plan per person, all atomic.
- [ ] Personal spend = `amount − for_other` in every view (dashboard, activity totals, calendar, filters).
- [ ] Activity row badge "₹X pending from Name" → opens entry; entry detail shows linked purchase card.
- [ ] Editing/deleting the source txn updates or blocks with a clear message when payments exist.
- [ ] Filter chip "Paid for others, not returned yet".
- [ ] Dashboard: Cards card with "₹X to get back from friends"; card bill due date.
- [ ] Remaining entry-detail features: linked purchase tap-through, reminder toggle.

Exit criteria
- Scenario A in full (₹30,000 on HDFC for Arun; spend +₹0; card outstanding +₹30,000; ₹10,000 UPI part-pay; ₹20,000 cash settles; badge disappears; History).
- Partial case: ₹5,000 bill, ₹4,000 for friend → spend ₹1,000.
- Split across 3 people reconciles to the txn amount.

---

## 9. Phase 7: Reminders, summaries, Settings (Weeks 14 to 15)

**Goal:** the app tells you before you forget; Settings is complete but short.

Tasks
- [ ] Web Push: VAPID keys, service worker push handler, subscription flow (iOS requires installed PWA + user gesture), `push_subscriptions` table, unsubscribe on logout.
- [ ] Edge Function `send-reminders` + `pg_cron` every 5 min: day-before, on-day, day-after at `alarm_time`; manual `notes.remind_at`; per-entry opt-out; dedupe table so nothing sends twice.
- [ ] Quiet hours (automatic wait, manual ring on time).
- [ ] Daily/weekly summary (off by default) with quiet-hours respect.
- [ ] Notification deep links (tap → entry or day sheet).
- [ ] Settings: Profile, Accounts, Categories, Display (number/date format, theme, dashboard cards reorder/hide), Reminders, Export, Import, Privacy, About, Log out, Delete account.
- [ ] Delete account: cascade all tables + storage, then auth user (Edge Function with service role).
- [ ] Remind-me chip in Quick Add.

Exit criteria
- Push arrives on an installed iPhone PWA for: due tomorrow, due today, overdue, manual note, summary.
- Quiet hours behave as specified; duplicate sends = 0 over a 7-day soak.
- **Go/no-go on Q1:** if delivery is unreliable, schedule the Capacitor wrapper as a separate track (Section 12).

Risks: iOS push is best-effort; Safari permission prompts; service role key must only live in Edge Functions.

---

## 10. Phase 8: Insights, export/import, polish (Weeks 16 to 17)

**Goal:** finish v1 to the quality bar.

Tasks
- [ ] Insights engine (rule-based, SQL/TS) implementing rules 1 to 8 (rule 7 only when budgets exist), cap at 5, ranked by importance, each tappable to a filtered list.
- [ ] Export: JSON full backup + CSV of transactions.
- [ ] `import_backup(json)` for the old Firebase v1 export (people, entries + payments, reminders → notes); dry-run preview and error report; idempotent.
- [ ] Dark mode audit; contrast ≥ 4.5:1.
- [ ] Accessibility: labels, focus order in sheets, swipe actions mirrored as buttons, reduced-motion support.
- [ ] Animation pass (transform/opacity only, 60fps).
- [ ] Empty states for every screen; error states with retry; offline shell with "offline" banner.
- [ ] Performance pass: bundle analysis (≤ 200 KB gz initial), lazy images, query tuning, Lighthouse.
- [ ] Playwright suites for scenarios A to E.

Exit criteria
- Full quality checklist (spec section 11) ticked.
- Lighthouse PWA + Performance ≥ 90 on mid-phone profile.
- Old backup imports with totals matching the source.

---

## 11. Phase 9: Beta, launch, migration (Week 18)

- [ ] Production Supabase: backups on, PITR if on paid plan, auth email templates, SMTP provider set up (the default Supabase mail is rate limited).
- [ ] Privacy review: RLS audit, storage bucket policy, no service-role key in client bundle (CI grep), no trackers.
- [ ] Error monitoring (Sentry, with PII scrubbed) and basic uptime check.
- [ ] Migrate real data from the old app; reconcile balances manually for one month.
- [ ] 2 weeks of daily dogfooding; log issues in a single list; fix P0/P1.
- [ ] Documentation: README, runbook (deploy, rollback, restore backup), env var list.

Exit criteria: two consecutive weeks of daily use with no data errors and no missed reminders.

---

## 12. Phase 10: v1.1 backlog (after launch, priority order)

| # | Feature | Notes / acceptance |
|---|---|---|
| 1 | **Budgets** | Overall + per category, dashboard progress, enables insight 7 |
| 2 | **Recurring transactions** | Rent, subscriptions, salary; auto-post or confirm prompt; `pg_cron` generator |
| 3 | **Offline write queue** | Add expenses offline, sync in order, conflict-safe (idempotency keys) |
| 4 | **Receipt photo** | Compress client-side, private Storage bucket (≤ 10 MB), lazy thumbnails |
| 5 | **Smart text add** | Regex parser ("chai 40 upi"), unit-tested, no AI |
| 6 | **Credit card statement view** | Group by statement cycle, bill estimate |
| 7 | **CSV bank-statement import** | Mapping UI, duplicate detection |
| 8 | **Saved filters** | Named, stored per user |
| 9 | Share image of "this month" | Canvas render |

**Conditional track: Capacitor wrapper**
Trigger: push reminders unreliable on iOS. Work: wrap build with Capacitor, local notifications scheduled from the schedule table, TestFlight, Apple Developer account ($99/yr). Est. 2 to 3 weeks.

**Later / only if needed:** multi-currency, net-worth chart, bill-splitting groups, shared ledgers, Siri shortcut.

---

## 13. Cross-cutting workstreams (run through all phases)

| Stream | Practice |
|---|---|
| **Testing** | Vitest for `/lib`; SQL tests for RPCs; Playwright for scenarios A to E (added as each phase lands); RLS isolation test in CI |
| **Data integrity** | Integer paise only; `date` not timestamps; client-passed `p_today`; every multi-write is one RPC; idempotency keys for retried writes |
| **Performance** | Bundle budget in CI; RPC timings tracked on seeded 5k/50k datasets; no layout-animating CSS |
| **Security** | RLS on every new table in the same migration; no service-role key in client; storage policies; email verification enforced |
| **Design/UX** | Semantic colour tokens only; 44px targets; 16px inputs; Undo over confirm dialogs |
| **Device testing** | A real iPhone (notch + home bar), one older/mid iPhone, Safari and installed-PWA modes, light + dark |
| **Migrations** | One forward-only migration per change; never edit applied ones; staging first |
| **Docs** | Update spec/ADR notes when behaviour changes; keep a CHANGELOG |

---

## 14. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| iOS Web Push unreliable / no loud alarm | High | High | Test early (Phase 0 spike: send a test push to an installed PWA); fallback plan = Capacitor |
| TS and SQL schedule maths diverge | Medium | High | Golden-file tests, single source of truth for fixtures |
| Rounding / month-end bugs in EMI | Medium | High | Property tests; Phase 1 built first |
| Dashboard RPC slows with data growth | Medium | Medium | Indexes, `EXPLAIN` in CI on 50k rows, summary caching if needed |
| iOS keyboard/safe-area layout glitches in sheets | High | Medium | Real-device testing every phase; `visualViewport` handling |
| Scope creep (v1.1 items pulled in) | High | Medium | Strict v1 gate; backlog list in Section 12 only |
| Email deliverability (verification, reset) | Medium | Medium | Custom SMTP in Phase 0, not Phase 9 |
| Old-backup import mismatches | Medium | Medium | Dry-run preview, totals reconciliation, keep original file |
| Single-developer bottleneck on Phase 5 | Medium | Medium | Cut Agenda view or prepay estimates first if late |

---

## 15. Milestones and review points

| Milestone | End of | Demo |
|---|---|---|
| M1: "Installable and secure" | Phase 0 | Sign in on iPhone, RLS test green |
| M2: "I can track expenses" | Phase 2 | Daily expense logging replaces the old app for spending |
| M3: "Home tells me where I stand" | Phase 3 + 4 | Dashboard + lend/borrow flows |
| M4: "Calendar and EMIs" | Phase 5 | Scenarios B, C, D |
| M5: "Full feature parity + for-others" | Phase 6 | Scenario A |
| M6: "Never miss a due date" | Phase 7 | Push on iPhone |
| M7: **v1 release candidate** | Phase 8 | All scenarios + quality checklist |
| M8: v1 launch | Phase 9 | Real data migrated |

**Scope-cut order if time runs short** (cut from top):
1. Agenda view (keep Month grid), 2. Place breakdown toggle, 3. Prepay/foreclose estimates, 4. Weekly summary, 5. Duplicate-merge UI, 6. Dashboard card reorder UI (keep fixed order), 7. Insight rules 6 and 8.

**Never cut:** RLS, atomic RPCs, integer paise, Undo, 16px inputs, the early/late logic, the on-behalf link.

---

## 16. Definition of Done (every task)

- [ ] Typed end to end; no `any` on money or date fields.
- [ ] Unit/SQL tests added; relevant Playwright scenario updated.
- [ ] RLS policy present for any new table.
- [ ] Works in light + dark, on iPhone Safari and installed PWA.
- [ ] No new spinner on navigation; optimistic where it is a write.
- [ ] Bundle size within budget.
- [ ] Empty, loading and error states handled.

---

## Phase 0 status (updated 2026-11-05)

**Done and verified locally:** scaffold (Vite 8, TS 6 strict, Tailwind 4), theme tokens, app shell with keep-alive tabs, PWA (injectManifest + push handlers), schema + RLS on all 12 tables + verified-email gate (folded into migration 0001), signup trigger (profile + 17 categories), auth screens, persisted query cache, CI workflow. `pnpm test:rls` 51/51, unit 12/12, initial JS 146.9 KB gz. Real local flow verified: sign up → mail → verify → login → profile + categories seeded; login before verify is blocked.

**Remaining (needs your accounts / a device):**
- [ ] Create staging Supabase project, `supabase link` + `db push`, configure auth URLs + custom SMTP.
- [ ] Create Vercel project, set env vars, deploy.
- [ ] iPhone test: Add to Home Screen, safe areas, no input zoom, session survives force-quit.
- [ ] Push spike on the installed iPhone PWA. Result: ______ (go / no-go for Phase 7, see Q1).

**Notes:** Node 22 required (`.nvmrc`). TypeScript pinned to 6.x because typescript-eslint does not support 7 yet.

---

## Phase 1 status (updated 2026-11-05)

**Done:** `src/lib` money/dates/interest/EMI/schedule/allocate/labels/respread/prepay with rules documented in `src/lib/README.md`. 207 tests (incl. property tests and scenarios B, C, D), coverage 99.6% statements / 98.5% branches (gate: 95/90), golden fixture `tests/fixtures/schedule-cases.json` (14 cases) ready for Phase 5 SQL parity. Textbook check: ₹1,00,000 at 12% over 12 months gives EMI ₹8,884.88.

**Decisions recorded:** flat = one-time % of principal; simple (plan) = months/12 or weeks/52; skip shifts the row and later unpaid rows; change amount re-spreads over later unpaid rows; extra payment shrinks from the last row; principal and interest split independently so no row can go negative.

---

## Phase 2 status (updated 2026-11-05)

**Built and verified locally:** migration `20260102000001_activity.sql` (Cash account seeded on signup, `account_balances` view, `filter_transactions`/`search_transactions` with keyset pagination, `activity_summary`, `title_suggestions`, idempotent `quick_add_transaction`); Settings for accounts and categories; Quick Add (spent / received / transfer, amount expressions, suggestions, ranked categories, Undo and Add another, edit mode); Activity (virtualised list with sticky day headers, month totals, per-account chips, search, swipe edit/delete with Undo, detail sheet, filter sheet with URL state).

**Numbers:** 355 unit/component tests, 75 SQL/RLS tests, 5 Playwright e2e tests, coverage 99% (src/lib). With 5,000 rows: search 10 to 42 ms server-side (budget 300), summary 8 ms (budget 150), only a window of rows in the DOM. Initial JS 150.8 KB gz (budget 200). Scenario E passes in 3 taps in a real (mobile-emulated) browser.

**Bugs found by tests and fixed:** swipe wrapper swallowed taps on rows (`filterTaps`); stale persisted account list hid a just-created account after a reload; `-0` days in labels (Phase 1).

**Not done / needs you:**
- [ ] Push migration `20260102000001` to the Supabase cloud project (`supabase db push`), then try Quick Add on the deployed app.
- [ ] On-device iPhone checks: sheet opens fast with the keypad up, no input zoom, smooth scroll, swipe feels right, safe areas.
- [ ] Phase 0 leftovers still open: installed-app viewport gap, push spike, Supabase redirect URLs.

**Known limits:** entry-based types (lent, on behalf, borrowed, EMI) and Person/Status filters arrive with Phases 4 to 6; there is no offline write queue yet (v1.1); Playwright runs on Chromium emulation, not real iOS Safari.

## Phase 3 status (updated 2026-11-05)

**Built and verified locally:** migration `20260103000001_dashboard.sql` (`dashboard_summary(p_month, p_today, p_filters)`: one call returns month totals with last-month comparison and projection, a zero-filled daily series, category/account/place breakdowns, the 5 latest rows and account balances/cards; built on `filter_transactions` so RLS and filter rules match Activity); Home with This month (sparkline + dashed average, scrub to read a day), Where it went (Category/Account/Place toggle, donut, ranked bars), Credit cards (outstanding, utilisation, due day), Recent activity; month switcher and filter sheet (date section hidden, filters in the URL at `/`); drill-downs into Activity with the same month and filters; `profiles.dashboard_layout` applied (order/hide), reserved ids for later cards; theme, log out and the push spike moved into Settings.

**Numbers:** 384 unit/component tests, 87 SQL/RLS tests (incl. a property test that dashboard totals equal `activity_summary` for random data and filters), 7 Playwright e2e tests, coverage 98.8% overall. `dashboard_summary` on 5,000 rows: 17 to 25 ms (budget 150), month read uses the `(user_id, date)` index. Cold reload with the dashboard request held for 4 s still paints the cached numbers (about 400 ms in the dev build including page load and sign-in restore); exactly one `dashboard_summary` request. Initial JS 183.1 KB gz (budget 200).

**Decisions:** charts are hand-written SVG; zod was removed from `filters.ts` and the dashboard guard because it added ~50 KB gz to the initial bundle (plain validators, same tests); balances on Home are as-of-now and not date-filtered; projection only for the current month after 3 days.

**Not done / needs you:**
- [ ] `supabase db push` for `20260103000001_dashboard.sql` (after your approval), then check Home on the deployed app.
- [ ] On-device iPhone check of Home (cached paint, scrubbing the sparkline, drill-downs, safe areas).
- [ ] Earlier open items: Phase 0 viewport gap, push spike, Supabase redirect URLs; Phase 1/2/3 commits are not pushed to GitHub.

**Known limits:** Net position, Due soon, People, EMI load and Insights cards arrive with later phases; the layout editor is Phase 7; Home cannot yet edit or delete a recent row (it opens Activity).

## Phase 4 status (updated 2026-11-05)

**Built and verified locally:** migration `20260104000001_money.sql` (`create_entry`, `record_payment` with row lock and overpayment check, `delete_payment`, `mark_unpaid`, `update_entry`, `delete_entry`, `merge_people`, `money_stats`, `money_overview`, `money_history`, view `people_balances`, and `dashboard_summary` extended with `people` and `net_position` in the same single call); Money tab (Owed to me / I owe grouped by person with Pending / Partial / Overdue / Paid chips, People with search, filters, sort, duplicate review and merge, CSV/paste import, History); entry detail overlay (`/money/entry/:id`: progress, payments with Undo, receive/pay sheet that blocks overpayment, edit, mark as unpaid, delete with a plain-language confirm); Quick Add **Lent** and **Borrowed** (person autocomplete with inline create, due date, flat/simple interest with live total); Home **Net position** and **Money with people** (ageing buckets); loan transactions in Activity cannot be deleted directly (they open the loan, so balances stay correct).

**Numbers:** 445 unit/component tests, 110 SQL/RLS tests, 10 Playwright e2e tests, coverage 99.8% lines on `src/lib`. Money overview 37 ms, history 7 ms and dashboard 23 ms with 2,000 entries (budget 150). Initial JS 183.8 KB gz (budget 200); Money, People and the entry screen are lazy chunks. The exit scenario (lend ₹10,000 → part pay ₹4,000 → settle ₹6,000) is an e2e test that also checks the account balance at every step, the overpayment refusal, History, and that loans never count as spending. Atomicity is tested by forcing a failure in the middle of `record_payment` and `create_entry` (nothing persists); two simultaneous payments cannot overpay.

**Decisions:** every entry has one schedule row (single-row plan); no due date = sentinel `9999-12-31`, never overdue; interest is fixed at creation (None / Flat / Simple up to the due date); `mark_unpaid` removes all payments and their transactions; deleting an entry removes everything it created and has no Undo (confirm sheet explains); net position counts card bills once.

**Not done / needs you:**
- [ ] `supabase db push` for `20260104000001_money.sql` (after your approval), then try lending on the deployed app.
- [ ] On-device iPhone check of Quick Add Lent/Borrowed (person suggestions with the keypad up), the Money tab and the entry screen.
- [ ] Earlier open items: Phase 0 viewport gap, push spike, Supabase redirect URLs; Phase 1 to 4 commits are not pushed to GitHub.

**Known limits:** no Person or Status filter in Activity yet; no offline write queue; open-ended simple interest, multi-row schedules, EMIs and On-behalf arrive in Phases 5 and 6; reminders are Phase 7.

## Phase 5A status (updated 2026-11-06): plans, EMI, plan-row actions

**Built and verified locally:** migration `20260105000001_plans.sql` (`create_entry_with_plan`, multi-row `record_payment` with a target row, `delete_payment` that reverses a whole cash movement, `plan_skip_month`, `plan_change_amount`, `plan_extra_payment` with a stale-plan check, rows-based `money_stats` / `money_overview` / `money_history` / `people_balances`, `dashboard_summary` extended with `due_soon` and `emi_load`, `entries.category_id`); Quick Add **Repay in instalments** (equal split, by monthly amount, weekly, custom dates, EMI with interest) and the **EMI / instalments** sheet (store, product, price, down payment, no-cost EMI, category, live preview); entry screen with instalment rows (early / on time / late / overdue / upcoming labels), pay any row, skip month, change amount and extra payment with a preview of what changes, prepay / foreclose estimate sheet; Home **Due soon** (with Pay) and **EMI & loan load** (12 monthly bars, debt-free date); Money rows show "3 of 10 paid" and an EMI tag; EMI instalments and down payments are expenses; entry-linked transactions are read-only in Activity.

**Decision (yours):** the app computes plan rows with the tested TypeScript and the server validates and stores them (no SQL copy of the maths). The 14-case golden fixture is replayed against SQL: every case is accepted and round-trips exactly.

**Numbers:** 501 unit/component tests, 152 SQL/RLS tests, 14 Playwright e2e tests, coverage 99.8% lines on `src/lib`. Scenarios B, C and D pass end to end in the browser (including balances and the "paid early" / "paid late (2 days)" labels). Money overview 61 ms and dashboard 104 ms with 2,000 plans × 12 rows (budget 150). Initial JS 185.3 KB gz (budget 200).

**Bugs the tests caught:** two RPC calls dropped arguments without SQL defaults (PostgREST then cannot find the function); fixed and guarded by payload tests.

**Not done / needs you:**
- [ ] `supabase db push` for `20260105000001_plans.sql` (after your approval), then try an EMI and a plan on the deployed app.
- [ ] On-device iPhone check of the plan form, the entry screen rows and Home cards.
- [ ] Stage 5B (Calendar, day sheet, notes/tasks, repeat rules) and the blue ✓ marker acceptance for scenario B come next.

## Phase 5B status (updated 2026-11-06): Calendar, notes and tasks

**Built and verified locally:** migration `20260106000001_calendar.sql` (`calendar_month` returns totals, per-day spend, plan rows due or paid in the month, up to 25 spending rows per day with the true count, and notes/tasks in one call; `calendar_agenda` for 30-day windows; indexes on `schedule_items.paid_on` and `notes.date`); Calendar tab (month grid with up to 3 markers per day, compact day spend, totals strip with overdue, layer chips Dues / Spending / Notes, month arrows shared with Home and Activity, filter button for the Spending layer, Month | Agenda switch); day sheet from the cached payload (Due with Pay / Receive, Paid with early/late label and the other date, Spending & income, Notes & tasks with checkbox, Add transaction with the date pre-filled, Add note / task); Agenda (dated items only, Today anchor, loads both ways); notes/tasks with repeat rules (daily, weekly, monthly, yearly, every N units) where ticking a repeating task moves it to its next date with Undo; the current month is prefetched when idle.

**Numbers:** 558 unit/component tests, 165 SQL/RLS tests, 19 Playwright e2e tests, coverage 99.7% lines on `src/lib`. Scenario B (blue ✓ on both the due date and the paid date) and scenario D (amber ✓ "paid late" on both dates, earlier unpaid rows red) pass in the real grid. `calendar_month` takes about 40 ms with 5,000 transactions and 500 plans (~500 plan rows a month); an extreme 24,000-plan-row dataset (2,000 plans due every month) takes 120 to 170 ms because the payload itself grows (~0.2 KB per plan row), so a real month stays far below that. Cold reload with the request held for 4 s still paints the cached calendar (about 750 ms in the dev build including page load), one request. Initial JS 186.5 KB gz (budget 200); the Calendar, day sheet, notes and agenda are a lazy chunk.

**Decisions:** markers are derived in TypeScript from row data; filters affect Spending and totals only; no swipe between months (arrows); the day sheet closes while another sheet is open (no nested bottom sheets); ticking a repeating task moves it instead of marking it done.

**Not done / needs you:**
- [ ] `supabase db push` for `20260106000001_calendar.sql` (after your approval), then try the Calendar on the deployed app.
- [ ] On-device iPhone check of the Calendar (cell size and markers, day sheet, Agenda scrolling) and Phases 1 to 5 together.
- [ ] Earlier open items: Phase 0 viewport gap, push spike, Supabase redirect URLs; Phases 1 to 5 are not pushed to GitHub.

**Known limits:** `remind_at` on notes is unused until Phase 7 (reminders); one e2e test (loan transaction in Activity) failed once in a full run and passed in two re-runs, cause not found; Agenda does not list spending.

## Phase 6 status (updated 2026-11-06): paying for someone else, card tracking

**Built and verified locally:** migration `20260107000001_others.sql` (`quick_add_with_others` adds the purchase and every friend's entry/plan in one transaction; `delete_transaction` (blocked once a friend has paid, with a snapshot for Undo) and `update_expense_for_others`; `create_entry_with_plan` accepts `on_behalf` + a source purchase; payments to on-behalf entries are `debt_in`; `for_other_paise` kept in sync by every mutation; `others=pending` filter; Activity and Calendar rows carry who still owes what; `dashboard_summary` gains `friends`); Quick Add **For someone else** (one or many people, equal split when you add people, partial amounts, optional due date or instalments per friend, "Your share" live, edit mode that locks friends who already paid); Activity shows "₹X pending from Arun" in the row, the detail sheet lists friends with Open entry and "your share", delete blocks with a clear message and offers Undo; the shared filter sheet gets "Paid for others, not returned yet"; entry detail has a **Linked purchase** card and a **Remind me** switch; Money tags these entries "Paid for"; the Cards card shows "₹X to get back from friends", "₹X of this is for friends" per card and the next bill due date.

**Numbers:** 607 unit/component tests, 191 SQL/RLS tests, 23 Playwright e2e tests, coverage 99.7% lines on `src/lib`. Scenario A (₹30,000 on HDFC for Arun: spend ₹0, card outstanding +₹30,000, ₹10,000 by UPI, ₹20,000 cash settles, badge gone, History), the partial case (₹5,000 bill, ₹4,000 for a friend → spend ₹1,000) and a three-way split pass end to end, as do blocked delete → remove payment → delete → Undo and the "not returned yet" filter. Search with friends on 500 of 5,000 purchases: 11 ms plain, 30 ms filtered (budget 300). Initial JS 187.0 KB gz (budget 200).

**Decisions:** the purchase stays editable and uncontrolled by an entry; no debt transaction at purchase time (the expense already moved the money); the badge is text in the row's second line (fixed row height for the virtualised list); no interest on money paid for friends; edits of a friend's amount are for single-row entries (instalment plans are changed from their entry); a sibling RPC was added instead of widening `quick_add_transaction`.

**Not done / needs you:**
- [ ] `supabase db push` for `20260107000001_others.sql` (after your approval), then try For someone else on the deployed app.
- [ ] On-device iPhone check of the For someone else form (keypad with several friend rows), the Activity badge and the Cards card.
- [ ] Earlier open items: Phase 0 viewport gap, push spike, Supabase redirect URLs; Phases 1 to 6 are not pushed to GitHub.

**Known limits:** reminders themselves are Phase 7 (the Remind me switch only stores the choice); income paid for others is not supported; one SQL test used a failure trigger that interfered with other test files running in parallel (fixed by scoping it to its own entry).

## Phase 7A status (updated 2026-11-06): push, scheduler, Reminders settings

**Built and verified locally:** migration `20260108000001_reminders.sql` (`claim_due_reminders` selects and claims in one statement with a unique key per user, a 10-minute lease for unsent claims and `release_reminder` / `mark_reminder_sent`; due tomorrow / today / overdue as one notification per kind per day at `alarm_time` in each user's own time zone; quiet hours that wait (wrapping midnight, skipped rather than shifted to another day); manual note reminders that ring on time even in quiet hours, up to 6 hours late; daily and weekly summaries off by default; `entries.remind = false` and paid or no-due-date rows skipped; `claim_push_subscription` moves a device to whoever signs in; `pg_cron` job every 5 minutes through `private.tick()`, with a cron secret generated inside the database); Web Push in plain WebCrypto (`supabase/functions/_shared/webpush.ts`: VAPID ES256 + RFC 8291 aes128gcm, byte-for-byte identical to the reference `http_ece` for the same keys and salt) and the sender orchestration (success, retry, dead-device pruning, time budget); Edge Functions `send-reminders` and `send-test`; Settings, Reminders (this device: install hint on iPhone Safari, permission states, turn on/off, send a test; alarm time, quiet hours with a plain-words note when the alarm falls inside them, summary off/daily/weekly) replacing the Phase 0 spike; logout removes this device; notification deep links (`/calendar?day=…` opens that day's sheet, entries open directly); note and task reminder times that follow the wall clock across daylight saving (also when a repeating task is ticked); a Reminders on/off chip for loans, EMIs and money paid for friends.

**Numbers:** 697 unit/component tests, 218 SQL/RLS tests (27 for reminders: time zones incl. DST, quiet hours, exactly-once under parallel runs and over random run times, leases, devices, permissions, account deletion cascade), 26 Playwright e2e tests, coverage 99.4% lines on `src/lib`. Initial JS 188.3 KB gz (budget 200).

**Bugs found on the way:** the device check hung forever where no service worker is registered (now gives up after 4 s); the Reminders form could keep a stale cached profile (the profile now always revalidates and the form follows it until you edit).

**Not done / needs you:**
- [ ] `supabase db push` for `20260108000001_reminders.sql`, `supabase secrets set` (VAPID keys made locally, never shown to you) and `supabase functions deploy send-reminders send-test`: all cloud actions, only after you approve.
- [ ] **The exit gate itself:** on your iPhone, install the app, turn notifications on, send a test, then check that due tomorrow, due today, overdue, a manual note and a summary each arrive, quiet hours behave, and run the 7-day duplicate check. Whether iOS delivery is reliable enough is the **Q1 go/no-go**; I cannot judge it from here.
- [ ] Stage 7B (Settings suite: Profile, Display, dashboard card layout editor, Export, Privacy, About, Delete account).
