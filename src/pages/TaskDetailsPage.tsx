import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, Pencil, RotateCcw, Send, Trash2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../app/AuthProvider'
import { useTaskOverview } from '../app/TaskOverviewProvider'
import { addTaskComment, changeTaskStatus, deleteTask, getTask, listExecutors, listObjects, updateTask } from '../lib/api'
import { getTaskStatusActions } from '../lib/task-workflow'
import { userMessage } from '../lib/errors'
import { validateComment } from '../lib/validation'
import type { CrmObject, Profile, StatusHistory, Task, TaskComment, TaskStatus } from '../types/domain'
import { STATUS_LABELS } from '../types/domain'
import { Dialog } from '../components/Dialog'
import { ErrorMessage, LoadingInline, SuccessMessage } from '../components/Feedback'
import { StatusBadge } from '../components/StatusBadge'
import { TaskActivity } from '../components/TaskActivity'
import { TaskForm } from '../components/TaskForm'

const actionIcons: Record<TaskStatus, React.ReactNode> = {
  new: null,
  in_progress: <Send size={17} aria-hidden="true" />,
  review: <Send size={17} aria-hidden="true" />,
  accepted: <Check size={17} aria-hidden="true" />,
  rework: <RotateCcw size={17} aria-hidden="true" />
}

export function TaskDetailsPage() {
  const { taskId } = useParams<{ taskId: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { reload: reloadOverview } = useTaskOverview()
  const [task, setTask] = useState<Task | null>(null)
  const [history, setHistory] = useState<StatusHistory[]>([])
  const [comments, setComments] = useState<TaskComment[]>([])
  const [commentsAvailable, setCommentsAvailable] = useState(true)
  const [objects, setObjects] = useState<CrmObject[]>([])
  const [executors, setExecutors] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [commentOpen, setCommentOpen] = useState(false)
  const [comment, setComment] = useState('')
  const [commentError, setCommentError] = useState('')
  const [newComment, setNewComment] = useState('')
  const [newCommentError, setNewCommentError] = useState('')
  const [pendingNext, setPendingNext] = useState<TaskStatus | null>(null)

  const load = useCallback(async () => {
    if (!taskId) return
    setLoading(true)
    setError('')
    try {
      const data = await getTask(taskId)
      setTask(data.task)
      setHistory(data.history)
      setComments(data.comments)
      setCommentsAvailable(data.commentsAvailable)
      if (profile?.role === 'manager') {
        const [nextObjects, nextExecutors] = await Promise.all([listObjects(), listExecutors()])
        setObjects(nextObjects)
        setExecutors(nextExecutors)
      }
    } catch (nextError) {
      setError(userMessage(nextError))
      setTask(null)
    } finally {
      setLoading(false)
    }
  }, [profile?.role, taskId])

  useEffect(() => { void load() }, [load])

  const availableActions = useMemo(() => task && profile ? getTaskStatusActions(task, profile) : [], [profile, task])
  const action = availableActions[0]
  const canRework = availableActions.some(item => item.requiresComment)

  async function refreshAfterChange() {
    await Promise.all([load(), reloadOverview()])
  }

  async function performStatus(next: TaskStatus, note?: string) {
    if (!task || busy) return
    setBusy(true)
    setError('')
    try {
      await changeTaskStatus(task.id, task.status, next, note)
      setCommentOpen(false)
      setComment('')
      setSuccess(`Статус изменён: ${STATUS_LABELS[next]}.`)
      await refreshAfterChange()
    } catch (nextError) {
      setError(userMessage(nextError))
      await load()
    } finally {
      setBusy(false)
      setPendingNext(null)
    }
  }

  function beginRework() {
    setCommentError('')
    setPendingNext('rework')
    setCommentOpen(true)
  }

  async function submitReworkComment(event: React.FormEvent) {
    event.preventDefault()
    const issue = validateComment(comment)
    setCommentError(issue ?? '')
    if (issue || !pendingNext) return
    await performStatus(pendingNext, comment.trim())
  }

  async function submitTaskComment(event: React.FormEvent) {
    event.preventDefault()
    if (!task || busy) return
    const issue = validateComment(newComment)
    setNewCommentError(issue ?? '')
    if (issue) return
    setBusy(true)
    setError('')
    try {
      await addTaskComment(task.id, newComment.trim())
      setNewComment('')
      setNewCommentError('')
      setSuccess('Комментарий добавлен.')
      await refreshAfterChange()
    } catch (nextError) {
      setError(userMessage(nextError))
    } finally {
      setBusy(false)
    }
  }

  async function saveTask(title: string, description: string, objectId: string, assigneeId: string) {
    if (!task) return
    setBusy(true)
    try {
      await updateTask(task.id, title, description, objectId, assigneeId)
      setEditing(false)
      setSuccess('Задача обновлена.')
      await refreshAfterChange()
    } catch (nextError) {
      throw new Error(userMessage(nextError))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!task || !window.confirm(`Удалить задачу «${task.title}»?`)) return
    setBusy(true)
    try {
      await deleteTask(task.id)
      await reloadOverview()
      navigate('/objects', { replace: true })
    } catch (nextError) {
      setError(userMessage(nextError))
      setBusy(false)
    }
  }

  if (loading) return <section className="page"><div className="loading-block"><LoadingInline label="Загружаем задачу…" /></div></section>
  if (!task) return <section className="page"><ErrorMessage message={error || 'Задача недоступна.'} /><Link className="button secondary" to="/objects">К объектам</Link></section>

  return <section className="page"><Link className="back-link" to={profile?.role === 'executor' ? '/my-tasks' : `/objects/${task.object_id}`}><ArrowLeft size={17} aria-hidden="true" />Назад</Link><div className="detail-header"><div><p className="eyebrow">Задача</p><h1>{task.title}</h1><p className="detail-context"><Link to={`/objects/${task.object_id}`}>{task.object?.name ?? 'Объект недоступен'}</Link>{task.object?.address ? ` · ${task.object.address}` : ''}</p><div className="detail-status"><StatusBadge status={task.status} /><span>Создана {new Date(task.created_at).toLocaleString('ru-RU')}</span></div></div>{!task.deleted_at && <div className="header-actions task-actions">{action && <button className="button primary" onClick={() => void performStatus(action.next)} disabled={busy}>{busy ? <LoadingInline /> : actionIcons[action.next]}{action.label}</button>}{canRework && <button className="button warning" onClick={beginRework} disabled={busy}><RotateCcw size={16} aria-hidden="true" />Вернуть на доработку</button>}{profile?.role === 'manager' && <><button className="button secondary" onClick={() => setEditing(true)} disabled={busy}><Pencil size={16} aria-hidden="true" />Изменить</button><button className="button secondary danger-text" onClick={() => void remove()} disabled={busy}><Trash2 size={16} aria-hidden="true" />Удалить</button></>}</div>}</div>{task.deleted_at && <div className="message notice" role="status">Задача удалена. История изменений сохранена.</div>}{success && <SuccessMessage message={success} />}{error && <ErrorMessage message={error} />}<div className="detail-grid"><div className="panel"><h2>Данные задачи</h2><dl className="data-list"><div><dt>Объект</dt><dd><Link to={`/objects/${task.object_id}`}>{task.object?.name ?? 'Объект недоступен'}</Link></dd></div><div><dt>Адрес</dt><dd>{task.object?.address ?? '—'}</dd></div><div><dt>Исполнитель</dt><dd>{task.assignee?.display_name ?? '—'}</dd></div><div><dt>Постановщик</dt><dd>{task.author?.display_name ?? '—'}</dd></div><div><dt>Описание</dt><dd className="description">{task.description || 'Описание не добавлено.'}</dd></div></dl></div><div className="panel activity-panel"><div className="activity-heading"><div><h2>Активность</h2><p>Статусы и обсуждение задачи.</p></div></div>{task.deleted_at ? <div className="message notice">Новые комментарии недоступны для удалённой задачи.</div> : commentsAvailable ? <form className="task-comment-form" onSubmit={submitTaskComment}><label>Комментарий<textarea data-autofocus={false} rows={3} value={newComment} onChange={event => setNewComment(event.target.value)} maxLength={2000} aria-invalid={Boolean(newCommentError)} placeholder="Напишите, что важно знать по задаче" />{newCommentError && <small className="field-error">{newCommentError}</small>}</label><div className="form-actions"><button className="button primary" disabled={busy}>{busy ? <LoadingInline label="Добавляем…" /> : 'Добавить комментарий'}</button></div></form> : <div className="message notice">Комментарии появятся после обновления базы данных.</div>}<TaskActivity task={task} history={history} comments={comments} /></div></div><Dialog open={editing} title="Изменить задачу" onClose={() => { if (!busy) setEditing(false) }} busy={busy}><TaskForm task={task} objects={objects} executors={executors} busy={busy} onSubmit={saveTask} onCancel={() => setEditing(false)} /></Dialog><Dialog open={commentOpen} title="Вернуть на доработку" onClose={() => { if (!busy) setCommentOpen(false) }} busy={busy}><form className="form-stack" onSubmit={submitReworkComment}><label>Комментарий<textarea data-autofocus rows={6} value={comment} onChange={event => setComment(event.target.value)} maxLength={2000} aria-invalid={Boolean(commentError)} placeholder="Что нужно исправить?" />{commentError && <small className="field-error">{commentError}</small>}</label><div className="form-actions"><button type="button" className="button secondary" onClick={() => setCommentOpen(false)} disabled={busy}>Отмена</button><button className="button warning" disabled={busy}>{busy ? <LoadingInline /> : 'Вернуть на доработку'}</button></div></form></Dialog></section>
}
