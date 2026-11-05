import { useMemo } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Task } from '../types/domain'

export function ExecutorOverview({ tasks }: { tasks: Task[] }) {
  const rows = useMemo(() => {
    const counts = new Map<string, { id: string; name: string; count: number }>()
    tasks.filter(task => task.status !== 'accepted' && task.assignee).forEach(task => {
      const assignee = task.assignee!
      const current = counts.get(assignee.id)
      counts.set(assignee.id, { id: assignee.id, name: assignee.display_name, count: (current?.count ?? 0) + 1 })
    })
    return Array.from(counts.values()).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'ru'))
  }, [tasks])

  return <section className="panel executor-overview"><div className="executor-overview-header"><div><h2>Исполнители</h2><p>Активные задачи по исполнителям.</p></div><span>{rows.reduce((total, row) => total + row.count, 0)}</span></div>{rows.length ? <div className="executor-overview-list">{rows.map(row => <div className="executor-overview-row" key={row.id}><strong>{row.name}</strong><span>{row.count}</span><Link to={`/tasks?executor=${encodeURIComponent(row.id)}`}>Показать <ArrowRight size={14} aria-hidden="true" /></Link></div>)}</div> : <p className="executor-overview-empty">Активных назначений нет.</p>}</section>
}
