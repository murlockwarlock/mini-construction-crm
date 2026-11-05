import { useEffect, useId, useRef, useState } from 'react'
import { Bell, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Profile, Task } from '../types/domain'
import { STATUS_LABELS } from '../types/domain'

function isAttentionTask(task: Task, role: Profile['role']) {
  if (task.deleted_at) return false
  return role === 'manager' ? task.status === 'review' : task.status === 'new' || task.status === 'rework'
}

export function AttentionCenter({ profile, tasks, loading, loaded, onOpen }: { profile: Profile; tasks: Task[]; loading: boolean; loaded: boolean; onOpen: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverId = `attention-popover-${useId().replaceAll(':', '')}`
  const attentionTasks = tasks.filter(task => isAttentionTask(task, profile.role))
  const countLabel = loading && !loaded ? 'загрузка' : String(attentionTasks.length)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !buttonRef.current?.parentElement?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  function toggleOpen() {
    if (!open) void onOpen()
    setOpen(value => !value)
  }

  return <div className="attention-center">
    <button ref={buttonRef} type="button" className="attention-button" aria-label={`Центр внимания: ${countLabel} задач`} aria-expanded={open} aria-controls={popoverId} onClick={toggleOpen}><Bell size={17} aria-hidden="true" /><span className="attention-count">{loading && !loaded ? '…' : attentionTasks.length}</span></button>
    {open && <div id={popoverId} className="attention-popover" role="dialog" aria-label="Центр внимания"><div className="attention-popover-header"><strong>{profile.role === 'manager' ? 'На проверке' : 'Требуют внимания'}</strong><span>{loading && !loaded ? '…' : attentionTasks.length}</span></div>{loading && !loaded ? <p className="attention-empty">Загружаем задачи…</p> : attentionTasks.length ? <ul>{attentionTasks.map(task => <li key={task.id}><Link to={`/tasks/${task.id}`} onClick={() => setOpen(false)}><span><strong>{task.title}</strong><small>{task.object?.name ?? 'Объект'}{profile.role === 'manager' && task.assignee?.display_name ? ` · ${task.assignee.display_name}` : ''} · {STATUS_LABELS[task.status]}</small></span><ArrowRight size={15} aria-hidden="true" /></Link></li>)}</ul> : <p className="attention-empty">Нет задач, требующих внимания.</p>}</div>}
  </div>
}
