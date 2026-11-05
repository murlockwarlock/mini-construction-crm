import { ArrowRight, CalendarDays } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Task } from '../types/domain'
import { STATUS_LABELS } from '../types/domain'
import { StatusBadge } from './StatusBadge'

export function TaskCard({ task }: { task: Task }) {
  return <Link className="task-card" to={`/tasks/${task.id}`}>
    <div className="task-card-main"><div><p className="task-card-object">{task.object?.name ?? 'Объект'}</p><h3>{task.title}</h3>{task.description && <p className="task-card-description">{task.description}</p>}</div><div className="task-card-side"><StatusBadge status={task.status} /><span className="task-card-action">Открыть <ArrowRight size={16} aria-hidden="true" /></span></div></div>
    <div className="task-card-meta"><span><CalendarDays size={14} aria-hidden="true" />{new Date(task.created_at).toLocaleDateString('ru-RU')}</span></div>
    <span className="sr-only">Статус: {STATUS_LABELS[task.status]}. Открыть задачу</span>
  </Link>
}
