import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../app/AuthProvider'
import { listMyTasks } from '../lib/api'
import { userMessage } from '../lib/errors'
import type { Task } from '../types/domain'
import { EmptyState } from '../components/EmptyState'
import { ErrorMessage, LoadingInline } from '../components/Feedback'
import { TaskCard } from '../components/TaskCard'

export function MyTasksPage() {
  const { profile } = useAuth(); const [tasks, setTasks] = useState<Task[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  const load = useCallback(async () => { if (!profile) return; setLoading(true); setError(''); try { setTasks(await listMyTasks(profile.id)) } catch (e) { setError(userMessage(e)) } finally { setLoading(false) } }, [profile])
  useEffect(() => { void load() }, [load])
  return <section className="page"><div className="page-header"><div><h1>Мои задачи</h1><p className="page-lead">Назначенные вам задачи.</p></div></div>{error && <ErrorMessage message={error} />}{loading ? <div className="loading-block"><LoadingInline label="Загружаем задачи…" /></div> : tasks.length === 0 ? <EmptyState title="Задач пока нет" text="Новые задачи появятся здесь после назначения." /> : <div className="task-grid">{tasks.map(task => <TaskCard key={task.id} task={task} />)}</div>}</section>
}
