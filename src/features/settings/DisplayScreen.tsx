import { explain } from '@/lib/online'
import { useState } from 'react'
import { EDITABLE_CARDS, isDefaultItems, itemsToLayout, layoutToItems, moveItem, toggleHidden, type LayoutItem } from '@/features/home/layoutEdit'
import { useProfile, useUpdateProfile } from '@/features/profile/useProfile'
import { DATE_FORMATS, NUMBER_FORMATS, formatDisplayDate, getDisplay, setDisplay, type DateFormatId, type NumberFormat } from '@/lib/display'
import { formatMoney } from '@/lib/money'
import { useTheme, type ThemePref } from '@/lib/theme'
import { Chip } from '@/ui/Chip'
import { PageHeader } from '@/ui/PageHeader'
import { secondaryBtn, primaryBtn } from '@/ui/Field'
import { useToasts } from '@/ui/toastStore'

const THEMES: { v: ThemePref; label: string }[] = [{ v: 'system', label: 'System' }, { v: 'light', label: 'Light' }, { v: 'dark', label: 'Dark' }]
const SAMPLE_PAISE = 123_456_789

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <fieldset className="space-y-2 rounded-2xl bg-surface p-4"><legend className="px-1 text-sm font-medium text-muted">{title}</legend><div className="flex flex-wrap gap-2">{children}</div></fieldset>
}

/** Cards on Home: reorder (up/down), hide. Saved with the button, "Reset" returns to the default arrangement. */
function LayoutEditor({ layout }: { layout: unknown }) {
  const save = useUpdateProfile()
  const [items, setItems] = useState<LayoutItem[]>(() => layoutToItems(layout))
  const [saved, setSaved] = useState(JSON.stringify(itemsToLayout(layoutToItems(layout))))
  const dirty = JSON.stringify(itemsToLayout(items)) !== saved
  const commit = async (next: LayoutItem[]) => {
    try {
      await save.mutateAsync({ dashboard_layout: itemsToLayout(next) as never })
      setSaved(JSON.stringify(itemsToLayout(next)))
      useToasts.getState().show({ message: 'Home layout saved' })
    } catch (e) {
      useToasts.getState().show({ message: `Couldn't save: ${explain(e)}` })
    }
  }
  return (
    <section aria-label="Home cards" className="space-y-3 rounded-2xl bg-surface p-4">
      <h2 className="font-medium">Home cards</h2>
      <p className="text-sm text-muted">Choose the order and hide what you do not need. Cards with nothing to show hide themselves anyway.</p>
      <ul className="divide-y divide-line">
        {items.map((it, i) => (
          <li key={it.id} className="flex min-h-14 items-center gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-3">
              <input type="checkbox" role="switch" aria-label={`Show ${it.label}`} checked={!it.hidden} onChange={() => setItems(toggleHidden(items, it.id))} className="h-6 w-6 shrink-0" />
              <span className={`truncate ${it.hidden ? 'text-muted line-through' : ''}`}>{it.label}</span>
            </label>
            <button aria-label={`Move ${it.label} up`} disabled={i === 0} onClick={() => setItems(moveItem(items, it.id, 'up'))} className="h-11 w-11 rounded-lg bg-surface-2 disabled:opacity-30">↑</button>
            <button aria-label={`Move ${it.label} down`} disabled={i === items.length - 1} onClick={() => setItems(moveItem(items, it.id, 'down'))} className="h-11 w-11 rounded-lg bg-surface-2 disabled:opacity-30">↓</button>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-3">
        <button className={secondaryBtn} disabled={isDefaultItems(items) && !dirty && saved === 'null'} onClick={() => { const d = layoutToItems(null); setItems(d); void commit(d) }}>Reset</button>
        <button className={primaryBtn} disabled={!dirty || save.isPending} onClick={() => void commit(items)}>Save layout</button>
      </div>
    </section>
  )
}

export default function DisplayScreen() {
  const { data: profile } = useProfile()
  const save = useUpdateProfile()
  const { pref, setPref } = useTheme()
  const [numberFmt, setNumberFmt] = useState<NumberFormat>(getDisplay().number)
  const [dateFmt, setDateFmt] = useState<DateFormatId>(getDisplay().date)
  const week = profile?.week_starts_on === 0 ? 0 : 1

  /** Applies the choice on screen at once, then saves it; if saving fails the screen goes back. */
  const choose = async (patch: { number_format?: NumberFormat; date_format?: DateFormatId; week_starts_on?: 0 | 1 }) => {
    const before = getDisplay()
    if (patch.number_format) { setNumberFmt(patch.number_format); setDisplay({ number: patch.number_format }) }
    if (patch.date_format) { setDateFmt(patch.date_format); setDisplay({ date: patch.date_format }) }
    try {
      await save.mutateAsync(patch)
    } catch (e) {
      setDisplay(before); setNumberFmt(before.number); setDateFmt(before.date)
      useToasts.getState().show({ message: `Couldn't save: ${explain(e)}` })
    }
  }

  return (
    <div>
      <PageHeader title="Display" back="/settings" backLabel="Settings" />
      <div className="space-y-4 px-4 pb-8">
        <Group title="Numbers">
          {NUMBER_FORMATS.map((f) => <Chip key={f.id} selected={numberFmt === f.id} onClick={() => void choose({ number_format: f.id })}>{f.label}</Chip>)}
          <p className="basis-full text-sm text-muted" aria-live="polite">Example: <span className="tabular text-fg">{formatMoney(SAMPLE_PAISE)}</span></p>
        </Group>
        <Group title="Dates">
          {DATE_FORMATS.map((f) => <Chip key={f.id} selected={dateFmt === f.id} onClick={() => void choose({ date_format: f.id })}>{f.label}</Chip>)}
          <p className="basis-full text-sm text-muted" aria-live="polite">Example: <span className="text-fg">{formatDisplayDate('2026-11-05', { weekday: 'short' })}</span></p>
        </Group>
        <Group title="Week starts on">
          <Chip selected={week === 1} onClick={() => void choose({ week_starts_on: 1 })}>Monday</Chip>
          <Chip selected={week === 0} onClick={() => void choose({ week_starts_on: 0 })}>Sunday</Chip>
        </Group>
        <Group title="Theme">
          {THEMES.map((t) => <Chip key={t.v} selected={pref === t.v} onClick={() => setPref(t.v)}>{t.label}</Chip>)}
        </Group>
        {profile && <LayoutEditor key={JSON.stringify(profile.dashboard_layout ?? null)} layout={profile.dashboard_layout} />}
        <p className="sr-only">{EDITABLE_CARDS.length} cards</p>
      </div>
    </div>
  )
}
