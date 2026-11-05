import { Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from '../app/AuthProvider'
import { useTaskOverview } from '../app/TaskOverviewProvider'
import { TasksOverview } from '../components/TasksOverview'

export function MyTasksPage() {
  const { profile } = useAuth()
  const { tasks, loading, loaded, error, ensureLoaded, reload } = useTaskOverview()
  useEffect(() => { void ensureLoaded() }, [ensureLoaded])
  if (!profile) return null
  if (profile.role !== 'executor') return <Navigate to="/tasks" replace />
  return <TasksOverview title="Мои задачи" lead="Задачи, назначенные вам." tasks={tasks} profile={profile} manager={false} loading={loading} loaded={loaded} error={error} onRetry={reload} />
}
