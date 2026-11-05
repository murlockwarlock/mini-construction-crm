import { ArrowRight, CalendarDays } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Task } from '../types/domain'
import { STATUS_LABELS } from '../types/domain'
import { StatusBadge } from './StatusBadge'

export function TaskCard({ task }: { task: Task }) {
  return <Link className="task-card" to={`/tasks/${task.id}`}>
    <div className="task-card-top"><StatusBadge status={task.status} /><ArrowRight size={18} aria-hidden="true" /></div>
    <h3>{task.title}</h3>
    {task.description && <p>{task.description}</p>}
    <div className="task-card-meta"><span>{task.object?.name ?? 'Объект'}</span><span><CalendarDays size={15} aria-hidden="true" />{new Date(task.created_at).toLocaleDateString('ru-RU')}</span></div>
    <span className="sr-only">Статус: {STATUS_LABELS[task.status]}. Открыть задачу</span>
  </Link>
}
