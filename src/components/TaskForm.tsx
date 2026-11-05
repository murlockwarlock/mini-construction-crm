import { useRef, useState } from 'react'
import type { CrmObject, Profile, Task } from '../types/domain'
import { validateTask } from '../lib/validation'
import { ErrorMessage, LoadingInline } from './Feedback'

export function TaskForm({ task, objects, executors, busy, onSubmit, onCancel }: { task?: Task; objects: CrmObject[]; executors: Profile[]; busy: boolean; onSubmit: (title: string, description: string, objectId: string, assigneeId: string) => Promise<void>; onCancel: () => void }) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [objectId, setObjectId] = useState(task?.object_id ?? objects[0]?.id ?? '')
  const [assigneeId, setAssigneeId] = useState(task?.assignee_id ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState('')
  const submitting = useRef(false)
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy || submitting.current) return
    const nextErrors = validateTask(title, description, objectId, assigneeId)
    setErrors(nextErrors)
    setServerError('')
    if (Object.keys(nextErrors).length) return
    submitting.current = true
    try { await onSubmit(title.trim(), description.trim(), objectId, assigneeId) } catch (error) { setServerError(error instanceof Error ? error.message : 'Не удалось сохранить задачу.') } finally { submitting.current = false }
  }
  return <form className="form-stack" onSubmit={submit} noValidate>
    {serverError && <ErrorMessage message={serverError} />}
    <label>Название задачи<input data-autofocus value={title} onChange={e => setTitle(e.target.value)} aria-invalid={Boolean(errors.title)} maxLength={200} />{errors.title && <small className="field-error">{errors.title}</small>}</label>
    <label>Описание<textarea rows={5} value={description} onChange={e => setDescription(e.target.value)} aria-invalid={Boolean(errors.description)} maxLength={5000} />{errors.description && <small className="field-error">{errors.description}</small>}</label>
    <label>Объект<select value={objectId} onChange={e => setObjectId(e.target.value)} aria-invalid={Boolean(errors.objectId)}><option value="">Выберите объект</option>{objects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{errors.objectId && <small className="field-error">{errors.objectId}</small>}</label>
    <label>Исполнитель<select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} aria-invalid={Boolean(errors.assigneeId)}><option value="">Выберите исполнителя</option>{executors.map(item => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select>{errors.assigneeId && <small className="field-error">{errors.assigneeId}</small>}</label>
    <div className="form-actions"><button type="button" className="button secondary" onClick={onCancel} disabled={busy}>Отмена</button><button className="button primary" disabled={busy}>{busy ? <LoadingInline /> : task ? 'Сохранить' : 'Создать задачу'}</button></div>
  </form>
}
