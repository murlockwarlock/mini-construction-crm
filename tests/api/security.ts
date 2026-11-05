import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { TaskStatus } from '../../src/types/domain'

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const password = process.env.TEST_PASSWORD
if (!url || !anonKey || !password) throw new Error('SUPABASE_URL, SUPABASE_ANON_KEY and TEST_PASSWORD are required')
const requiredUrl = url
const requiredAnonKey = anonKey
const requiredPassword = password

type Actor = { email: string; role: 'manager' | 'executor'; id: string; client: SupabaseClient }
const credentials = [
  { email: 'ci.manager1@example.test', role: 'manager' as const },
  { email: 'ci.manager2@example.test', role: 'manager' as const },
  { email: 'ci.executor1@example.test', role: 'executor' as const },
  { email: 'ci.executor2@example.test', role: 'executor' as const }
]

async function actorFor(item: typeof credentials[number]): Promise<Actor> {
  const client = createClient(requiredUrl, requiredAnonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data, error } = await client.auth.signInWithPassword({ email: item.email, password: requiredPassword })
  if (error || !data.user) throw error ?? new Error(`Could not sign in ${item.email}`)
  return { ...item, id: data.user.id, client }
}

async function expectDenied(label: string, action: () => Promise<{ error: unknown }>) {
  const result = await action()
  if (!result.error) throw new Error(`${label}: expected denial`)
}

async function expectNoRowsOrDenied(label: string, action: () => Promise<{ data: unknown[] | null; error: unknown }>) {
  const result = await action()
  if (result.error) return
  if (!result.data?.length) return
  throw new Error(`${label}: returned rows to an unauthenticated user`)
}

const actors = await Promise.all(credentials.map(actorFor))
const manager = actors[0]
const manager2 = actors[1]
const executor1 = actors[2]
const executor2 = actors[3]
const anon = createClient(requiredUrl, requiredAnonKey, { auth: { autoRefreshToken: false, persistSession: false } })
const noProfile = createClient(requiredUrl, requiredAnonKey, { auth: { autoRefreshToken: false, persistSession: false } })
const noProfileLogin = await noProfile.auth.signInWithPassword({ email: 'ci.noprofile@example.test', password: requiredPassword })
if (noProfileLogin.error || !noProfileLogin.data.user) throw noProfileLogin.error ?? new Error('no-profile user could not sign in')

const { data: object, error: objectError } = await manager.client.rpc('create_object', { p_name: `CI object ${Date.now()}`, p_address: 'CI address' })
if (objectError || !object) throw objectError ?? new Error('manager could not create object')
const objectId = (object as { id: string }).id
const taskTitle = `CI task ${Date.now()}`
const { data: task, error: taskError } = await manager.client.rpc('create_task', { p_title: taskTitle, p_description: 'security test', p_object_id: objectId, p_assignee_id: executor1.id })
if (taskError || !task) throw taskError ?? new Error('manager could not create task')
const taskId = (task as { id: string }).id
if ((task as { author_id: string }).author_id !== manager.id) throw new Error('task author was not assigned by the database')

await expectNoRowsOrDenied('anon profiles read', async () => await anon.from('profiles').select('id').limit(1))
await expectNoRowsOrDenied('anon objects read', async () => await anon.from('objects').select('id').limit(1))
await expectNoRowsOrDenied('anon tasks read', async () => await anon.from('tasks').select('id').limit(1))
await expectNoRowsOrDenied('anon history read', async () => await anon.from('task_status_history').select('id').limit(1))

const initialHistory = await manager.client.from('task_status_history').select('id').eq('task_id', taskId).order('created_at', { ascending: true })
if (initialHistory.error || !initialHistory.data?.length) throw initialHistory.error ?? new Error('initial history is missing')
const initialState = await Promise.all([
  manager.client.from('objects').select('*').eq('id', objectId).single(),
  manager.client.from('tasks').select('*').eq('id', taskId).single(),
  manager.client.from('task_status_history').select('*').eq('task_id', taskId).order('created_at', { ascending: true })
])
if (initialState.some(result => result.error)) throw initialState.find(result => result.error)?.error

await expectDenied('executor object insert', async () => await executor1.client.from('objects').insert({ name: 'forbidden', address: 'forbidden' }))
await expectDenied('executor object update', async () => await executor1.client.from('objects').update({ name: 'forbidden' }).eq('id', objectId))
await expectDenied('executor task insert', async () => await executor1.client.from('tasks').insert({ title: 'forbidden', object_id: objectId, assignee_id: executor1.id, author_id: executor1.id }))
await expectDenied('executor task update', async () => await executor1.client.from('tasks').update({ title: 'forbidden' }).eq('id', taskId))
await expectDenied('executor task delete', async () => await executor1.client.from('tasks').delete().eq('id', taskId))
await expectDenied('executor role update', async () => await executor1.client.from('profiles').update({ role: 'manager' }).eq('id', executor1.id))
await expectDenied('executor status for foreign task', async () => await executor2.client.rpc('change_task_status', { p_task_id: taskId, p_expected_status: 'new', p_new_status: 'in_progress', p_comment: null }))
await expectDenied('executor direct history insert', async () => await executor1.client.from('task_status_history').insert({ task_id: taskId, actor_id: executor2.id, to_status: 'in_progress' }))
await expectDenied('executor direct history update', async () => await executor1.client.from('task_status_history').update({ comment: 'tampered' }).eq('id', initialHistory.data[0].id))
await expectDenied('executor direct history delete', async () => await executor1.client.from('task_status_history').delete().eq('id', initialHistory.data[0].id))
const { data: unchangedTask, error: unchangedTaskError } = await manager.client.from('tasks').select('title,status').eq('id', taskId).single()
if (unchangedTaskError) throw unchangedTaskError
if (unchangedTask.title !== taskTitle || unchangedTask.status !== 'new') throw new Error('denied API operation changed task state')
const finalState = await Promise.all([
  manager.client.from('objects').select('*').eq('id', objectId).single(),
  manager.client.from('tasks').select('*').eq('id', taskId).single(),
  manager.client.from('task_status_history').select('*').eq('task_id', taskId).order('created_at', { ascending: true })
])
if (finalState.some(result => result.error)) throw finalState.find(result => result.error)?.error
if (JSON.stringify(initialState.map(result => result.data)) !== JSON.stringify(finalState.map(result => result.data))) throw new Error('denied API operation changed persisted data')

const { data: visibleToExecutor2, error: readError } = await executor2.client.from('tasks').select('id').eq('id', taskId)
if (readError) throw readError
if (visibleToExecutor2?.length) throw new Error('executor read a foreign task')
const { data: foreignObject, error: foreignObjectError } = await executor2.client.from('objects').select('id').eq('id', objectId)
if (foreignObjectError) throw foreignObjectError
if (foreignObject?.length) throw new Error('executor read an object without an assigned task')
const { data: foreignHistory, error: foreignHistoryError } = await executor2.client.from('task_status_history').select('id').eq('task_id', taskId)
if (foreignHistoryError) throw foreignHistoryError
if (foreignHistory?.length) throw new Error('executor read foreign task history')
const { data: noProfileRows, error: noProfileReadError } = await noProfile.from('objects').select('id')
if (noProfileReadError) throw noProfileReadError
if (noProfileRows?.length) throw new Error('user without profile read application data')
await expectDenied('no-profile RPC', async () => await noProfile.rpc('create_object', { p_name: 'no profile', p_address: 'no profile' }))
const metadataUpdate = await executor1.client.auth.updateUser({ data: { role: 'manager' } })
if (metadataUpdate.error) throw metadataUpdate.error
await expectDenied('user_metadata spoofing', async () => await executor1.client.rpc('create_object', { p_name: 'spoofed', p_address: 'spoofed' }))
const signup = await noProfile.auth.signUp({ email: `registration-${Date.now()}@example.test`, password: requiredPassword })
if (!signup.error) throw new Error('open registration is enabled')

const firstTransition = await executor1.client.rpc('change_task_status', { p_task_id: taskId, p_expected_status: 'new', p_new_status: 'in_progress', p_comment: null })
if (firstTransition.error) throw firstTransition.error
const secondTransition = await executor1.client.rpc('change_task_status', { p_task_id: taskId, p_expected_status: 'in_progress', p_new_status: 'review', p_comment: null })
if (secondTransition.error) throw secondTransition.error
const completedTransition = await manager.client.rpc('change_task_status', { p_task_id: taskId, p_expected_status: 'review', p_new_status: 'accepted', p_comment: null })
if (completedTransition.error) throw completedTransition.error
const { data: completedTask, error: completedTaskError } = await manager.client.from('tasks').select('status').eq('id', taskId).single()
if (completedTaskError) throw completedTaskError
if (completedTask.status !== 'accepted') throw new Error('full task cycle did not reach accepted')
const { data: completedHistory, error: completedHistoryError } = await manager.client.from('task_status_history').select('actor_id,from_status,to_status').eq('task_id', taskId).order('created_at', { ascending: true })
if (completedHistoryError) throw completedHistoryError
const completedTransitions = completedHistory?.map(row => `${row.actor_id}:${row.from_status ?? 'none'}:${row.to_status}`) ?? []
if (completedTransitions.length !== 4 || completedTransitions[1] !== `${executor1.id}:new:in_progress` || completedTransitions[2] !== `${executor1.id}:in_progress:review` || completedTransitions[3] !== `${manager.id}:review:accepted`) throw new Error('full task cycle history is incomplete')

const reassigned = await manager.client.rpc('create_task', { p_title: `reassigned ${Date.now()}`, p_description: '', p_object_id: objectId, p_assignee_id: executor1.id })
if (reassigned.error || !reassigned.data) throw reassigned.error ?? new Error('reassignment task could not be created')
const reassignedId = (reassigned.data as { id: string }).id
const reassignment = await manager.client.rpc('update_task', { p_id: reassignedId, p_title: 'reassigned', p_description: '', p_object_id: objectId, p_assignee_id: executor2.id })
if (reassignment.error) throw reassignment.error
const { data: oldAssigneeRows, error: oldAssigneeError } = await executor1.client.from('tasks').select('id').eq('id', reassignedId)
if (oldAssigneeError) throw oldAssigneeError
if (oldAssigneeRows?.length) throw new Error('old assignee kept access after reassignment')
const { data: newAssigneeRows, error: newAssigneeError } = await executor2.client.from('tasks').select('id').eq('id', reassignedId)
if (newAssigneeError) throw newAssigneeError
if (newAssigneeRows?.length !== 1) throw new Error('new assignee did not receive access')

const deletedObjectResult = await manager.client.rpc('create_object', { p_name: `deleted object ${Date.now()}`, p_address: 'deleted address' })
if (deletedObjectResult.error || !deletedObjectResult.data) throw deletedObjectResult.error ?? new Error('deletion object could not be created')
const deletedObjectId = (deletedObjectResult.data as { id: string }).id
const deletedObjectTask = await manager.client.rpc('create_task', { p_title: 'deleted object task', p_description: '', p_object_id: deletedObjectId, p_assignee_id: executor1.id })
if (deletedObjectTask.error || !deletedObjectTask.data) throw deletedObjectTask.error ?? new Error('deleted object task could not be created')
const deletedObjectAction = await manager.client.rpc('delete_object', { p_id: deletedObjectId })
if (deletedObjectAction.error) throw deletedObjectAction.error
const { data: managerDeletedObject, error: managerDeletedObjectError } = await manager.client.from('objects').select('id,deleted_at').eq('id', deletedObjectId).single()
if (managerDeletedObjectError) throw managerDeletedObjectError
if (!managerDeletedObject.deleted_at) throw new Error('manager lost access to deleted object audit data')
const deletedObjectTaskId = (deletedObjectTask.data as { id: string }).id
const { data: managerDeletedObjectTask, error: managerDeletedObjectTaskError } = await manager.client.from('tasks').select('id,deleted_at').eq('id', deletedObjectTaskId).single()
if (managerDeletedObjectTaskError) throw managerDeletedObjectTaskError
if (!managerDeletedObjectTask.deleted_at) throw new Error('object deletion did not soft-delete its task')
const { data: managerDeletedObjectHistory, error: managerDeletedObjectHistoryError } = await manager.client.from('task_status_history').select('id').eq('task_id', deletedObjectTaskId)
if (managerDeletedObjectHistoryError) throw managerDeletedObjectHistoryError
if (!managerDeletedObjectHistory?.length) throw new Error('object deletion removed task history')
const { data: deletedObjectRows, error: deletedObjectReadError } = await executor1.client.from('tasks').select('id').eq('object_id', deletedObjectId)
if (deletedObjectReadError) throw deletedObjectReadError
if (deletedObjectRows?.length) throw new Error('executor kept access to a deleted object task')

const allowed = new Set(['manager:review:accepted', 'manager:review:rework', 'executor:new:in_progress', 'executor:in_progress:review', 'executor:rework:in_progress'])
const statuses: TaskStatus[] = ['new', 'in_progress', 'review', 'accepted', 'rework']
async function taskAtStatus(from: TaskStatus): Promise<string> {
  const { data: created, error: createError } = await manager.client.rpc('create_task', { p_title: `matrix ${from} ${Date.now()}`, p_description: '', p_object_id: objectId, p_assignee_id: executor1.id })
  if (createError || !created) throw createError ?? new Error('matrix task could not be created')
  const id = (created as { id: string }).id
  if (from === 'new') return id
  const first = await executor1.client.rpc('change_task_status', { p_task_id: id, p_expected_status: 'new', p_new_status: 'in_progress', p_comment: null })
  if (first.error) throw first.error
  if (from === 'in_progress') return id
  const second = await executor1.client.rpc('change_task_status', { p_task_id: id, p_expected_status: 'in_progress', p_new_status: 'review', p_comment: null })
  if (second.error) throw second.error
  if (from === 'review') return id
  const final = await manager.client.rpc('change_task_status', { p_task_id: id, p_expected_status: 'review', p_new_status: from, p_comment: from === 'rework' ? 'Проверить и исправить' : null })
  if (final.error) throw final.error
  return id
}

for (const role of ['manager', 'executor'] as const) {
  for (const from of statuses) {
    for (const to of statuses) {
      const key = `${role}:${from}:${to}`
      const id = await taskAtStatus(from)
      const client = role === 'manager' ? manager2.client : executor1.client
      const result = await client.rpc('change_task_status', { p_task_id: id, p_expected_status: from, p_new_status: to, p_comment: to === 'rework' ? 'Исправить' : null })
      if (allowed.has(key)) {
        if (result.error) throw result.error
      } else if (!result.error) {
        throw new Error(`forbidden transition passed: ${key}`)
      }
      const { data: current, error: currentError } = await manager.client.from('tasks').select('status').eq('id', id).single()
      if (currentError) throw currentError
      if (allowed.has(key) && current.status !== to) throw new Error(`allowed transition did not persist: ${key}`)
      if (!allowed.has(key) && current.status !== from) throw new Error(`forbidden transition changed status: ${key}`)
    }
  }
}

const { data: history, error: historyError } = await manager.client.from('task_status_history').select('actor_id,from_status,to_status').eq('task_id', taskId)
if (historyError) throw historyError
if (!history?.some(row => row.actor_id === executor1.id)) throw new Error('history actor was not the real executor')

const { data: concurrentTask, error: concurrentCreateError } = await manager.client.rpc('create_task', { p_title: `concurrent ${Date.now()}`, p_description: '', p_object_id: objectId, p_assignee_id: executor1.id })
if (concurrentCreateError || !concurrentTask) throw concurrentCreateError ?? new Error('concurrent task could not be created')
const concurrentId = (concurrentTask as { id: string }).id
const concurrentResults = await Promise.all([
  executor1.client.rpc('change_task_status', { p_task_id: concurrentId, p_expected_status: 'new', p_new_status: 'in_progress', p_comment: null }),
  executor1.client.rpc('change_task_status', { p_task_id: concurrentId, p_expected_status: 'new', p_new_status: 'in_progress', p_comment: null })
])
if (concurrentResults.filter(result => !result.error).length !== 1) throw new Error('concurrent transition did not serialize')
const { data: concurrentHistory, error: concurrentHistoryError } = await manager.client.from('task_status_history').select('id').eq('task_id', concurrentId)
if (concurrentHistoryError) throw concurrentHistoryError
if (concurrentHistory?.length !== 2) throw new Error('concurrent transition created an extra history row')

const reviewId = await taskAtStatus('review')
const beforeInvalid = await manager.client.from('task_status_history').select('id').eq('task_id', reviewId)
const invalidComment = await manager2.client.rpc('change_task_status', { p_task_id: reviewId, p_expected_status: 'review', p_new_status: 'rework', p_comment: '   ' })
if (!invalidComment.error) throw new Error('blank rework comment was accepted')
const afterInvalid = await manager.client.from('task_status_history').select('id').eq('task_id', reviewId)
if (beforeInvalid.error || afterInvalid.error || beforeInvalid.data?.length !== afterInvalid.data?.length) throw new Error('rejected transition changed history')

const { data: deletedTask, error: deletedCreateError } = await manager.client.rpc('create_task', { p_title: `deleted ${Date.now()}`, p_description: '', p_object_id: objectId, p_assignee_id: executor1.id })
if (deletedCreateError || !deletedTask) throw deletedCreateError ?? new Error('deleted task could not be created')
const deletedId = (deletedTask as { id: string }).id
const deleted = await manager.client.rpc('delete_task', { p_id: deletedId })
if (deleted.error) throw deleted.error
const { data: managerDeletedTask, error: managerDeletedTaskError } = await manager.client.from('tasks').select('id,deleted_at').eq('id', deletedId).single()
if (managerDeletedTaskError) throw managerDeletedTaskError
if (!managerDeletedTask.deleted_at) throw new Error('manager lost access to deleted task audit data')
const { data: managerDeletedHistory, error: managerDeletedHistoryError } = await manager.client.from('task_status_history').select('id').eq('task_id', deletedId)
if (managerDeletedHistoryError) throw managerDeletedHistoryError
if (!managerDeletedHistory?.length) throw new Error('task deletion removed task history')
const { data: executorDeletedHistory, error: executorDeletedHistoryError } = await executor1.client.from('task_status_history').select('id').eq('task_id', deletedId)
if (executorDeletedHistoryError) throw executorDeletedHistoryError
if (executorDeletedHistory?.length) throw new Error('executor read deleted task history')
const afterDeleteTransition = await executor1.client.rpc('change_task_status', { p_task_id: deletedId, p_expected_status: 'new', p_new_status: 'in_progress', p_comment: null })
if (!afterDeleteTransition.error) throw new Error('deleted task accepted a status transition')

console.log(JSON.stringify({ status: 'security checks passed', transitions: 25, historyRows: history.length }))
