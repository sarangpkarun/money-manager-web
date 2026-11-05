import { EmptyState } from '@/ui/EmptyState'

export default function CalendarScreen() {
  return (
    <div>
      <h1 className="px-4 pt-6 text-3xl font-bold">Calendar</h1>
      <EmptyState title="Nothing here yet" hint="Dues, payments, spends and notes will show here." />
    </div>
  )
}
