import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { AppLayout } from '../components/AppLayout'
import { LoginPage } from '../pages/LoginPage'
import { ObjectsPage } from '../pages/ObjectsPage'
import { ObjectDetailsPage } from '../pages/ObjectDetailsPage'
import { TaskDetailsPage } from '../pages/TaskDetailsPage'
import { MyTasksPage } from '../pages/MyTasksPage'
import { LoadingPage } from '../components/LoadingPage'

function Protected() {
  const { session, loading, profile } = useAuth()
  if (loading) return <LoadingPage />
  if (!session) return <Navigate to="/login" replace />
  if (!profile) return <div className="screen-center"><div className="panel narrow"><h1>Профиль недоступен</h1><p>Обратитесь к руководителю, чтобы получить доступ.</p></div></div>
  return <AppLayout><Outlet /></AppLayout>
}

export function App() {
  return <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<Protected />}>
      <Route index element={<Navigate to="/objects" replace />} />
      <Route path="objects" element={<ObjectsPage />} />
      <Route path="objects/:objectId" element={<ObjectDetailsPage />} />
      <Route path="tasks/:taskId" element={<TaskDetailsPage />} />
      <Route path="my-tasks" element={<MyTasksPage />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
}
