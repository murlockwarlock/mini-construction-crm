import { useEffect, useMemo, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Profile, Task, TaskStatus } from '../types/domain'
import { STATUS_LABELS } from '../types/domain'
import { getTaskStatusActions } from '../lib/task-workflow'
import { EmptyState } from './EmptyState'
import { ErrorMessage, LoadingInline } from './Feedback'
import { StatusBadge } from './StatusBadge'

type TaskViewMode = 'kanban' | 'list'
type StatusFilter = TaskStatus | 'all'

const STATUS_ORDER: TaskStatus[] = ['new', 'in_progress', 'review', 'rework', 'accepted']
const VIEW_MODE_STORAGE_KEY = 'mini-crm.task-view-mode'

function readInitialViewMode(): TaskViewMode {
  if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY)
      if (saved === 'kanban' || saved === 'list') return saved
    } catch {
      return window.matchMedia?.('(max-width: 760px)').matches ? 'list' : 'kanban'
    }
    return window.matchMedia?.('(max-width: 760px)').matches ? 'list' : 'kanban'
  }
  return 'list'
}

function getOptions(tasks: Task[], getValue: (task: Task) => { id: string; label: string } | null) {
  const values = new Map<string, string>()
  tasks.forEach(task => {
    const value = getValue(task)
    if (value?.id && value.label) values.set(value.id, value.label)
  })
  return Array.from(values, ([id, label]) => ({ id, label })).sort((left, right) => left.label.localeCompare(right.label, 'ru'))
}

function actionSummary(task: Task, profile: Profile) {
  return getTaskStatusActions(task, profile).map(action => action.label).join(' / ')
}

function TaskBoardCard({ task, profile, manager }: { task: Task; profile: Profile; manager: boolean }) {
  const action = actionSummary(task, profile)
  return <article className={`task-board-card${manager && task.status === 'review' ? ' needs-review' : ''}`}>
    <Link className="task-board-card-link" to={`/tasks/${task.id}`}>
      <span className="task-board-card-object">{task.object?.name ?? 'Объект'}</span>
      <strong>{task.title}</strong>
      {manager && <span className="task-board-card-assignee">{task.assignee?.display_name ?? 'Исполнитель не указан'}</span>}
    </Link>
    <div className="task-board-card-footer"><StatusBadge status={task.status} /><Link className="task-board-card-open" to={`/tasks/${task.id}`}>Открыть <ArrowRight size={14} aria-hidden="true" /></Link></div>
    {action && <span className="task-board-card-action">Действие: {action}</span>}
  </article>
}

function TaskColumn({ status, tasks, profile, manager }: { status: TaskStatus; tasks: Task[]; profile: Profile; manager: boolean }) {
  const attention = manager && status === 'review' && tasks.length > 0
  return <section className={`task-column task-column-${status}${attention ? ' needs-review' : ''}`} aria-labelledby={`task-column-${status}`}>
    <header className="task-column-header"><div><h2 id={`task-column-${status}`}>{STATUS_LABELS[status]}</h2>{attention && <span>Нужно решение</span>}</div><strong>{tasks.length}</strong></header>
    <div className="task-column-list">{tasks.length ? tasks.map(task => <TaskBoardCard key={task.id} task={task} profile={profile} manager={manager} />) : <p className="task-column-empty">Задач нет</p>}</div>
  </section>
}

function TaskListRow({ task, profile, manager }: { task: Task; profile: Profile; manager: boolean }) {
  const action = actionSummary(task, profile)
  return <article className={`task-list-row${manager ? ' is-manager' : ''}${manager && task.status === 'review' ? ' needs-review' : ''}`}>
    <div className="task-list-primary"><Link to={`/tasks/${task.id}`} className="task-list-title">{task.title}</Link><span>{task.object?.name ?? 'Объект'}</span></div>
    {manager && <span className="task-list-assignee">{task.assignee?.display_name ?? 'Исполнитель не указан'}</span>}
    <StatusBadge status={task.status} />
    <div className={`task-list-action${action ? '' : ' is-empty'}`}>{action && <span>{action}</span>}<Link to={`/tasks/${task.id}`}>Открыть <ArrowRight size={14} aria-hidden="true" /></Link></div>
  </article>
}

export function TasksOverview({ title, lead, tasks, profile, manager, loading, loaded, error, initialExecutorFilter = 'all', onRetry }: { title: string; lead: string; tasks: Task[]; profile: Profile; manager: boolean; loading: boolean; loaded: boolean; error: string; initialExecutorFilter?: string; onRetry: () => Promise<void> }) {
  const [viewMode, setViewMode] = useState<TaskViewMode>(readInitialViewMode)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [objectFilter, setObjectFilter] = useState('all')
  const [executorFilter, setExecutorFilter] = useState(initialExecutorFilter)

  useEffect(() => {
    if (manager) setExecutorFilter(initialExecutorFilter || 'all')
  }, [initialExecutorFilter, manager])

  useEffect(() => {
    try { window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode) } catch { return }
  }, [viewMode])

  const objectOptions = useMemo(() => getOptions(tasks, task => task.object ? { id: task.object.id, label: task.object.name } : null), [tasks])
  const executorOptions = useMemo(() => getOptions(tasks, task => task.assignee ? { id: task.assignee.id, label: task.assignee.display_name } : null), [tasks])
  const filteredTasks = useMemo(() => tasks.filter(task => {
    if (statusFilter !== 'all' && task.status !== statusFilter) return false
    if (manager && objectFilter !== 'all' && task.object?.id !== objectFilter) return false
    if (manager && executorFilter !== 'all' && task.assignee?.id !== executorFilter) return false
    return true
  }), [executorFilter, manager, objectFilter, statusFilter, tasks])
  const activeTaskCount = tasks.filter(task => task.status !== 'accepted').length
  const tasksByStatus = useMemo(() => {
    const result = STATUS_ORDER.reduce((groups, status) => ({ ...groups, [status]: [] as Task[] }), {} as Record<TaskStatus, Task[]>)
    filteredTasks.forEach(task => result[task.status].push(task))
    return result
  }, [filteredTasks])

  return <section className="page task-overview">
    <div className="page-header task-overview-header"><div><h1>{title}</h1><p className="page-lead">{lead}</p></div>{loaded && <div className="task-overview-total"><strong>{activeTaskCount}</strong><span>активных задач</span></div>}</div>
    {error && <div className="task-load-error"><ErrorMessage message={error} /><button type="button" className="button secondary" onClick={() => void onRetry()} disabled={loading}>Повторить</button></div>}
    {!loaded && loading ? <div className="loading-block"><LoadingInline label="Загружаем задачи…" /></div> : loaded && <>
      <div className="task-summary" aria-label="Количество задач по статусам">{STATUS_ORDER.map(status => { const count = tasksByStatus[status].length; const attention = manager && status === 'review' && count > 0; return <div key={status} className={`task-summary-item task-summary-${status}${attention ? ' needs-review' : ''}`}><span>{STATUS_LABELS[status]}</span><strong>{count}</strong>{attention && <small>Нужно решение</small>}</div> })}</div>
      <div className="task-toolbar"><div className="task-filters"><label className="task-filter">Статус<select value={statusFilter} onChange={event => setStatusFilter(event.target.value as StatusFilter)}><option value="all">Все статусы</option>{STATUS_ORDER.map(status => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label>{manager && <><label className="task-filter">Объект<select value={objectFilter} onChange={event => setObjectFilter(event.target.value)}><option value="all">Все объекты</option>{objectOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label><label className="task-filter">Исполнитель<select value={executorFilter} onChange={event => setExecutorFilter(event.target.value)}><option value="all">Все исполнители</option>{executorOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label></>}</div><div className="task-view-toggle" role="group" aria-label="Режим отображения задач"><button type="button" className={viewMode === 'kanban' ? 'is-active' : ''} aria-pressed={viewMode === 'kanban'} onClick={() => setViewMode('kanban')}>Канбан</button><button type="button" className={viewMode === 'list' ? 'is-active' : ''} aria-pressed={viewMode === 'list'} onClick={() => setViewMode('list')}>Список</button></div></div>
      {filteredTasks.length === 0 ? <EmptyState title={tasks.length ? 'По фильтру задач нет' : 'Задач пока нет'} text={tasks.length ? 'Измените фильтры, чтобы увидеть другие задачи.' : 'Новые задачи появятся здесь после назначения.'} /> : viewMode === 'kanban' ? <div className="task-board">{STATUS_ORDER.map(status => <TaskColumn key={status} status={status} tasks={tasksByStatus[status]} profile={profile} manager={manager} />)}</div> : <div className="task-list-view"><div className={`task-list-header${manager ? ' is-manager' : ''}`}><span>Задача и объект</span>{manager && <span>Исполнитель</span>}<span>Статус</span><span>Действие</span></div>{filteredTasks.map(task => <TaskListRow key={task.id} task={task} profile={profile} manager={manager} />)}</div>}
    </>}
  </section>
}
