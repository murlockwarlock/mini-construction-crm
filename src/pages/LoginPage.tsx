import { useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Building2, LockKeyhole } from 'lucide-react'
import { useAuth } from '../app/AuthProvider'
import { ErrorMessage, LoadingInline } from '../components/Feedback'

export function LoginPage() {
  const { session, signIn, loading, configurationError } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  if (!loading && session) return <Navigate to="/" replace />
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy || submitting.current) return; setError(''); setBusy(true); submitting.current = true
    try { await signIn(email, password); navigate('/', { replace: true }) } catch { setError('Не удалось войти. Проверьте email и пароль.') } finally { submitting.current = false; setBusy(false) }
  }
  return <div className="login-screen"><div className="login-card"><div className="login-brand"><span className="brand-mark"><Building2 size={24} /></span><div><strong>Объекты и задачи</strong><span>Рабочий список компании</span></div></div><div className="login-title"><LockKeyhole size={20} aria-hidden="true" /><h1>Вход</h1></div>{configurationError ? <ErrorMessage message={configurationError} /> : error && <ErrorMessage message={error} />}<form className="form-stack" onSubmit={submit} noValidate><label>Email<input data-autofocus type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required disabled={Boolean(configurationError)} /></label><label>Пароль<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required disabled={Boolean(configurationError)} /></label><button className="button primary full" disabled={busy || Boolean(configurationError)}>{busy ? <LoadingInline label="Входим…" /> : 'Войти'}</button></form><p className="login-note">Регистрация отключена. Доступ выдаёт руководитель.</p></div></div>
}
