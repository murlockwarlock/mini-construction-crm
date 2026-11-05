import { useEffect } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../app/AuthProvider'
import { useTaskOverview } from '../app/TaskOverviewProvider'
import { ExecutorOverview } from '../components/ExecutorOverview'
import { TasksOverview } from '../components/TasksOverview'

export function TasksPage() {
  const { profile } = useAuth()
  const [searchParams] = useSearchParams()
  const { tasks, loading, loaded, error, ensureLoaded, reload } = useTaskOverview()
  useEffect(() => { void ensureLoaded() }, [ensureLoaded])
  if (!profile) return null
  if (profile.role !== 'manager') return <Navigate to="/my-tasks" replace />
  return <><TasksOverview title="Задачи" lead="Все активные задачи по объектам." tasks={tasks} profile={profile} manager={profile.role === 'manager'} loading={loading} loaded={loaded} error={error} initialExecutorFilter={searchParams.get('executor') ?? 'all'} onRetry={reload} />{profile.role === 'manager' && loaded && <section className="page"><ExecutorOverview tasks={tasks} /></section>}</>
}
