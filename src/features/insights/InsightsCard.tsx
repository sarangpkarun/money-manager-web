import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/features/home/cards'
import { useUi } from '@/lib/uiStore'
import { useInsightFacts } from './queries'
import { buildInsights, type Insight } from './rules'

/** Up to five short, rule-based observations. Shows nothing at all when there is nothing worth saying (or while loading / on error). */
export function InsightsCard({ today }: { today: string }) {
  const navigate = useNavigate()
  const setActivitySearch = useUi((s) => s.setActivitySearch)
  const { data } = useInsightFacts(today)
  const insights = useMemo(() => (data ? buildInsights(data, today) : []), [data, today])
  if (insights.length === 0) return null

  const open = (i: Insight) => {
    if (i.drill.path === '/activity') setActivitySearch(i.drill.search ?? '')
    navigate({ pathname: i.drill.path, search: i.drill.search ?? '' })
  }
  return (
    <Card title="Insights">
      <ul className="space-y-1">
        {insights.map((i) => (
          <li key={i.id}>
            <button onClick={() => open(i)} className="flex min-h-11 w-full items-start gap-2 rounded-lg py-2 text-left">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span className="flex-1">{i.text}</span>
              <span aria-hidden className="text-muted">›</span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}
