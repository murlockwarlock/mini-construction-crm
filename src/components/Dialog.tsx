import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

export function Dialog({ open, title, onClose, children, busy = false }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode; busy?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) { onClose(); return }
      if (event.key !== 'Tab') return
      const focusable = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]') ?? [])
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previousOverflow; previous?.focus() }
  }, [busy, onClose, open])
  if (!open) return null
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" ref={ref}>
      <div className="dialog-header"><h2 id="dialog-title">{title}</h2><button className="icon-button" aria-label="Закрыть" onClick={onClose} disabled={busy}><X /></button></div>
      <div className="dialog-body">{children}</div>
    </div>
  </div>
}
