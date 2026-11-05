import { useRef, useState } from 'react'
import type { CrmObject } from '../types/domain'
import { validateObject } from '../lib/validation'
import { ErrorMessage, LoadingInline } from './Feedback'

export function ObjectForm({ object, busy, onSubmit, onCancel }: { object?: CrmObject; busy: boolean; onSubmit: (name: string, address: string) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState(object?.name ?? '')
  const [address, setAddress] = useState(object?.address ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState('')
  const submitting = useRef(false)
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy || submitting.current) return
    const nextErrors = validateObject(name, address)
    setErrors(nextErrors)
    setServerError('')
    if (Object.keys(nextErrors).length) return
    submitting.current = true
    try { await onSubmit(name.trim(), address.trim()) } catch (error) { setServerError(error instanceof Error ? error.message : 'Не удалось сохранить объект.') } finally { submitting.current = false }
  }
  return <form className="form-stack" onSubmit={submit} noValidate>
    {serverError && <ErrorMessage message={serverError} />}
    <label>Название объекта<input data-autofocus value={name} onChange={e => setName(e.target.value)} aria-invalid={Boolean(errors.name)} maxLength={200} />{errors.name && <small className="field-error">{errors.name}</small>}</label>
    <label>Адрес<input value={address} onChange={e => setAddress(e.target.value)} aria-invalid={Boolean(errors.address)} maxLength={500} />{errors.address && <small className="field-error">{errors.address}</small>}</label>
    <div className="form-actions"><button type="button" className="button secondary" onClick={onCancel} disabled={busy}>Отмена</button><button className="button primary" disabled={busy}>{busy ? <LoadingInline /> : object ? 'Сохранить' : 'Создать объект'}</button></div>
  </form>
}
