/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { listAllTasks, listMyTasks } from '../lib/api'
import type { Profile, Task } from '../types/domain'

interface TaskOverviewContextValue {
  tasks: Task[]
  loading: boolean
  loaded: boolean
  error: string
  ensureLoaded: () => Promise<void>
  reload: () => Promise<void>
}

const TaskOverviewContext = createContext<TaskOverviewContextValue | undefined>(undefined)

export function TaskOverviewProvider({ profile, children }: { profile: Profile | null; children: React.ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const requestRef = useRef<Promise<void> | null>(null)

  const load = useCallback(async (force: boolean) => {
    if (!profile || (!force && loaded)) return
    if (requestRef.current) return requestRef.current
    const request = (async () => {
      setLoading(true)
      setError('')
      try {
        const nextTasks = profile.role === 'manager' ? await listAllTasks() : await listMyTasks(profile.id)
        setTasks(nextTasks.filter(task => !task.deleted_at))
        setLoaded(true)
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Не удалось загрузить задачи.')
      } finally {
        setLoading(false)
      }
    })()
    requestRef.current = request
    try {
      await request
    } finally {
      if (requestRef.current === request) requestRef.current = null
    }
  }, [loaded, profile])

  useEffect(() => {
    if (!loaded) return
    const refresh = () => {
      if (document.visibilityState === 'visible') void load(true)
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [load, loaded])

  const value = useMemo<TaskOverviewContextValue>(() => ({
    tasks,
    loading,
    loaded,
    error,
    ensureLoaded: () => load(false),
    reload: () => load(true)
  }), [error, loaded, load, loading, tasks])

  return <TaskOverviewContext.Provider value={value}>{children}</TaskOverviewContext.Provider>
}

export function useTaskOverview() {
  const value = useContext(TaskOverviewContext)
  if (!value) throw new Error('TaskOverviewProvider is missing')
  return value
}
