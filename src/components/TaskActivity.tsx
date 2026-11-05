import { useMemo } from 'react'
import { roleLabel } from '../lib/api'
import { STATUS_LABELS } from '../types/domain'
import type { StatusHistory, Task, TaskComment } from '../types/domain'

type ActivityEvent =
  | { kind: 'status'; item: StatusHistory }
  | { kind: 'comment'; item: TaskComment }

function timestamp(value: string) {
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

function eventOrder(event: ActivityEvent) {
  const order = event.item.activity_order
  return typeof order === 'number' && Number.isFinite(order) ? order : null
}

function compareActivity(left: ActivityEvent, right: ActivityEvent) {
  const leftOrder = eventOrder(left)
  const rightOrder = eventOrder(right)
  if (leftOrder !== null && rightOrder !== null && leftOrder !== rightOrder) return leftOrder - rightOrder
  const timeDifference = timestamp(left.item.created_at) - timestamp(right.item.created_at)
  if (timeDifference) return timeDifference
  if (left.kind !== right.kind) return left.kind === 'status' && left.item.from_status === null ? -1 : 1
  if (left.kind === 'status' && right.kind === 'status') {
    if (left.item.from_status === null && right.item.from_status !== null) return -1
    if (left.item.from_status !== null && right.item.from_status === null) return 1
  }
  return left.item.id.localeCompare(right.item.id)
}

function statusAction(item: StatusHistory) {
  if (!item.from_status) return 'Создал задачу'
  if (item.from_status === 'new' && item.to_status === 'in_progress') return 'Взял в работу'
  if (item.from_status === 'in_progress' && item.to_status === 'review') return 'Отправил на проверку'
  if (item.from_status === 'review' && item.to_status === 'rework') return 'Вернул на доработку'
  if (item.from_status === 'review' && item.to_status === 'accepted') return 'Принял задачу'
  if (item.from_status === 'rework' && item.to_status === 'in_progress') return 'Взял в работу'
  return `Изменил статус: ${STATUS_LABELS[item.to_status]}`
}

function eventTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'medium' }).format(date)
}

export function TaskActivity({ task, history, comments }: { task: Task; history: StatusHistory[]; comments: TaskComment[] }) {
  const events = useMemo<ActivityEvent[]>(() => [
    ...history.map(item => ({ kind: 'status' as const, item })),
    ...comments.map(item => ({ kind: 'comment' as const, item }))
  ].sort(compareActivity), [comments, history])

  if (!events.length) return <p className="activity-empty">Событий пока нет.</p>

  return <div className="activity-list">{events.map(event => {
    const actor = event.kind === 'status' ? event.item.actor : event.item.author
    const action = event.kind === 'status' ? statusAction(event.item) : 'Оставил комментарий'
    const comment = event.kind === 'status' ? event.item.comment : event.item.body
    const isCreation = event.kind === 'status' && event.item.from_status === null
    return <article className="activity-item" key={`${event.kind}-${event.item.id}`}>
      <span className="activity-marker" aria-hidden="true" />
      <div className="activity-content">
        <div className="activity-meta"><strong>{actor?.display_name ?? 'Пользователь'}</strong>{actor?.role && <span>{roleLabel(actor.role)}</span>}<time dateTime={event.item.created_at}>{eventTime(event.item.created_at)}</time></div>
        <p className="activity-action">{action}</p>
        {isCreation && task.author?.display_name && task.author.id !== actor?.id && <p className="activity-detail">Постановщик: {task.author.display_name}</p>}
        {comment && <blockquote>{comment}</blockquote>}
      </div>
    </article>
  })}</div>
}
