import { Building2, ClipboardList, LogOut, Menu, X } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../app/AuthProvider'
import { roleLabel } from '../lib/api'

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  async function logout() {
    setSigningOut(true)
    try { await signOut() } finally { setSigningOut(false) }
  }
  return <div className="app-shell">
    <header className="topbar">
      <Link to="/objects" className="brand" onClick={() => setOpen(false)}><Building2 size={22} aria-hidden="true" /><span>Объекты и задачи</span></Link>
      <button className="icon-button mobile-menu" aria-label={open ? 'Закрыть меню' : 'Открыть меню'} aria-expanded={open} aria-controls="main-navigation" onClick={() => setOpen(v => !v)}>{open ? <X /> : <Menu />}</button>
      <nav id="main-navigation" className={`main-nav ${open ? 'is-open' : ''}`} aria-label="Основная навигация">
        <NavLink to="/objects" onClick={() => setOpen(false)}>Объекты</NavLink>
        {profile?.role === 'executor' && <NavLink to="/my-tasks" onClick={() => setOpen(false)}><ClipboardList size={17} aria-hidden="true" />Мои задачи</NavLink>}
        <div className="account-area"><span className="account-name">{profile?.display_name}</span><span className="account-role">{profile ? roleLabel(profile.role) : ''}</span><button className="link-button" onClick={() => void logout()} disabled={signingOut}><LogOut size={16} aria-hidden="true" />{signingOut ? 'Выходим…' : 'Выйти'}</button></div>
      </nav>
    </header>
    <main className="main-content">{children}</main>
  </div>
}
