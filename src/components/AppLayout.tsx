import { Building2, LogOut, Menu, X } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../app/AuthProvider'
import { roleLabel } from '../lib/api'

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const previousActive = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(document.querySelectorAll<HTMLElement>('.sidebar.is-open a[href], .sidebar.is-open button:not([disabled])'))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    closeButtonRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      if (previousActive?.isConnected) previousActive.focus()
    }
  }, [open])

  function closeMenu() {
    setOpen(false)
  }

  async function logout() {
    setSigningOut(true)
    try { await signOut() } finally { setSigningOut(false); closeMenu() }
  }
  return <div className="app-shell">
    <aside className={`sidebar${open ? ' is-open' : ''}`} aria-label="Навигация">
      <div className="sidebar-header">
        <Link to="/objects" className="brand" onClick={closeMenu}><span className="brand-mark"><Building2 size={19} aria-hidden="true" /></span><span>Объекты и задачи</span></Link>
        <button ref={closeButtonRef} type="button" className="icon-button sidebar-close" aria-label="Закрыть меню" onClick={closeMenu}><X size={20} /></button>
      </div>
      <nav id="main-navigation" className="sidebar-nav" aria-label="Основная навигация">
        <NavLink to="/objects" onClick={closeMenu}>Объекты</NavLink>
        {profile?.role === 'executor' && <NavLink to="/my-tasks" onClick={closeMenu}>Мои задачи</NavLink>}
      </nav>
      <div className="sidebar-account">
        <span className="account-name">{profile?.display_name}</span>
        <span className="account-role">{profile ? roleLabel(profile.role) : ''}</span>
        <button type="button" className="sidebar-logout" onClick={() => void logout()} disabled={signingOut}><LogOut size={16} aria-hidden="true" />{signingOut ? 'Выходим…' : 'Выйти'}</button>
      </div>
    </aside>
    {open && <button type="button" className="drawer-backdrop" aria-label="Закрыть меню" onClick={closeMenu} />}
    <header className="topbar">
      <Link to="/objects" className="brand" onClick={closeMenu}><span className="brand-mark"><Building2 size={19} aria-hidden="true" /></span><span>Объекты и задачи</span></Link>
      <button type="button" className="icon-button mobile-menu" aria-label={open ? 'Закрыть меню' : 'Открыть меню'} aria-expanded={open} aria-controls="main-navigation" onClick={() => setOpen(value => !value)}>{open ? <X /> : <Menu />}</button>
    </header>
    <main className="main-content">{children}</main>
  </div>
}
