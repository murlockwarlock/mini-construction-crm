import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../app/AuthProvider'
import { createObject, deleteObject, listObjects, updateObject } from '../lib/api'
import { userMessage } from '../lib/errors'
import type { CrmObject } from '../types/domain'
import { Dialog } from '../components/Dialog'
import { EmptyState } from '../components/EmptyState'
import { ErrorMessage, LoadingInline, SuccessMessage } from '../components/Feedback'
import { ObjectForm } from '../components/ObjectForm'

export function ObjectsPage() {
  const { profile } = useAuth()
  const [objects, setObjects] = useState<CrmObject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editing, setEditing] = useState<CrmObject | undefined>()
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => { setLoading(true); setError(''); try { setObjects(await listObjects()) } catch (e) { setError(userMessage(e)) } finally { setLoading(false) } }, [])
  useEffect(() => { void load() }, [load])
  async function save(name: string, address: string) { setBusy(true); try { if (editing) await updateObject(editing.id, name, address); else await createObject(name, address); setEditing(undefined); setCreating(false); setSuccess(editing ? 'Объект обновлён.' : 'Объект создан.'); await load() } catch (e) { throw new Error(userMessage(e)) } finally { setBusy(false) } }
  async function remove(item: CrmObject) { if (!window.confirm(`Удалить объект «${item.name}» вместе с его задачами?`)) return; setBusy(true); setError(''); try { await deleteObject(item.id); setSuccess('Объект удалён.'); await load() } catch (e) { setError(userMessage(e)) } finally { setBusy(false) } }
  return <section className="page"><div className="page-header"><div><h1>Объекты</h1><p className="page-lead">Список объектов.</p></div>{profile?.role === 'manager' && <button className="button primary" onClick={() => setCreating(true)} disabled={busy}><Plus size={18} aria-hidden="true" />Создать объект</button>}</div>{success && <SuccessMessage message={success} />}{error && <ErrorMessage message={error} />}{loading ? <div className="loading-block"><LoadingInline label="Загружаем объекты…" /></div> : objects.length === 0 ? <EmptyState title="Объектов пока нет" text={profile?.role === 'manager' ? 'Создайте первый объект, чтобы добавить задачи.' : 'Вам пока не назначены задачи по объектам.'} /> : <div className="object-grid">{objects.map(item => <article className="object-card" key={item.id}><Link to={`/objects/${item.id}`} className="object-main"><div className="object-icon"><MapPin size={20} aria-hidden="true" /></div><div><h2>{item.name}</h2><p>{item.address}</p></div></Link>{profile?.role === 'manager' && <div className="card-actions"><button className="icon-button" title="Изменить объект" aria-label={`Изменить ${item.name}`} onClick={() => setEditing(item)} disabled={busy}><Pencil size={17} /></button><button className="icon-button danger" title="Удалить объект" aria-label={`Удалить ${item.name}`} onClick={() => void remove(item)} disabled={busy}><Trash2 size={17} /></button></div>}</article>)}</div>}<Dialog open={Boolean(creating || editing)} title={editing ? 'Изменить объект' : 'Новый объект'} onClose={() => { if (!busy) { setCreating(false); setEditing(undefined) } }} busy={busy}><ObjectForm object={editing} busy={busy} onSubmit={save} onCancel={() => { setCreating(false); setEditing(undefined) }} /></Dialog></section>
}
