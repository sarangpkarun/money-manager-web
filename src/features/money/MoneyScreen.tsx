import { EmptyState } from '@/ui/EmptyState'

export default function MoneyScreen() {
  return (
    <div>
      <h1 className="px-4 pt-6 text-3xl font-bold">Money</h1>
      <EmptyState title="Nothing here yet" hint="People, loans and EMIs will appear here." />
    </div>
  )
}
