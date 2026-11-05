import { EmptyState } from '@/ui/EmptyState'

export default function ActivityScreen() {
  return (
    <div>
      <h1 className="px-4 pt-6 text-3xl font-bold">Activity</h1>
      <EmptyState title="Nothing here yet" hint="Your transactions will appear here." />
    </div>
  )
}
