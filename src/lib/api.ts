import { getSupabaseClient } from './supabase'
import type { AppRole, CrmObject, Profile, StatusHistory, Task, TaskComment, TaskStatus } from '../types/domain'

const rpcClient = () => getSupabaseClient() as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }> }

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await getSupabaseClient().from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error) throw error
  return data
}

export async function listObjects(): Promise<CrmObject[]> {
  const { data, error } = await getSupabaseClient().from('objects').select('*').is('deleted_at', null).order('name')
  if (error) throw error
  return data ?? []
}

export async function getObject(id: string): Promise<{ object: CrmObject; tasks: Task[] }> {
  const client = getSupabaseClient()
  const [{ data: object, error: objectError }, { data: tasks, error: taskError }] = await Promise.all([
    client.from('objects').select('*').eq('id', id).maybeSingle(),
    client.from('tasks').select('*, assignee:profiles!tasks_assignee_id_fkey(id,display_name,role), author:profiles!tasks_author_id_fkey(id,display_name,role)').eq('object_id', id).order('created_at', { ascending: false })
  ])
  if (objectError) throw objectError
  if (taskError) throw taskError
  if (!object) throw new Error('Объект недоступен')
  return { object, tasks: (tasks ?? []) as Task[] }
}

export async function listMyTasks(userId: string): Promise<Task[]> {
  const { data, error } = await getSupabaseClient().from('tasks').select('*, object:objects!tasks_object_id_fkey(id,name,address), author:profiles!tasks_author_id_fkey(id,display_name,role)').eq('assignee_id', userId).is('deleted_at', null).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Task[]
}

export async function listAllTasks(): Promise<Task[]> {
  const { data, error } = await getSupabaseClient().from('tasks').select('*, object:objects!tasks_object_id_fkey(id,name,address), assignee:profiles!tasks_assignee_id_fkey(id,display_name,role), author:profiles!tasks_author_id_fkey(id,display_name,role)').is('deleted_at', null).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Task[]
}

export async function getTask(id: string): Promise<{ task: Task; history: StatusHistory[]; comments: TaskComment[]; commentsAvailable: boolean }> {
  const client = getSupabaseClient()
  const [{ data: task, error: taskError }, { data: history, error: historyError }, { data: comments, error: commentsError }] = await Promise.all([
    client.from('tasks').select('*, object:objects!tasks_object_id_fkey(id,name,address), assignee:profiles!tasks_assignee_id_fkey(id,display_name,role), author:profiles!tasks_author_id_fkey(id,display_name,role)').eq('id', id).maybeSingle(),
    client.from('task_status_history').select('*, actor:profiles!task_status_history_actor_id_fkey(id,display_name,role)').eq('task_id', id).order('created_at', { ascending: true }).order('id', { ascending: true }),
    client.from('task_comments').select('*, author:profiles!task_comments_author_id_fkey(id,display_name,role)').eq('task_id', id).order('created_at', { ascending: true }).order('id', { ascending: true })
  ])
  if (taskError) throw taskError
  if (historyError) throw historyError
  const commentsUnavailable = Boolean(commentsError && (commentsError.code === 'PGRST205' || commentsError.message.includes('task_comments')))
  if (commentsError && !commentsUnavailable) throw commentsError
  if (!task) throw new Error('Задача недоступна')
  return { task: task as Task, history: (history ?? []) as StatusHistory[], comments: (comments ?? []) as TaskComment[], commentsAvailable: !commentsUnavailable }
}

export async function addTaskComment(taskId: string, body: string): Promise<TaskComment> {
  const { data, error } = await rpcClient().rpc('add_task_comment', { p_task_id: taskId, p_body: body.trim() })
  if (error) throw error
  return data as TaskComment
}

export async function listExecutors(): Promise<Profile[]> {
  const { data, error } = await getSupabaseClient().from('profiles').select('*').eq('role', 'executor').order('display_name')
  if (error) throw error
  return (data ?? []) as Profile[]
}

export async function createObject(name: string, address: string) {
  const { data, error } = await rpcClient().rpc('create_object', { p_name: name, p_address: address })
  if (error) throw error
  return data as CrmObject
}
export async function updateObject(id: string, name: string, address: string) {
  const { data, error } = await rpcClient().rpc('update_object', { p_id: id, p_name: name, p_address: address })
  if (error) throw error
  return data as CrmObject
}
export async function deleteObject(id: string) {
  const { data, error } = await rpcClient().rpc('delete_object', { p_id: id })
  if (error) throw error
  return data as CrmObject
}
export async function createTask(title: string, description: string, objectId: string, assigneeId: string) {
  const { data, error } = await rpcClient().rpc('create_task', { p_title: title, p_description: description, p_object_id: objectId, p_assignee_id: assigneeId })
  if (error) throw error
  return data as Task
}
export async function updateTask(id: string, title: string, description: string, objectId: string, assigneeId: string) {
  const { data, error } = await rpcClient().rpc('update_task', { p_id: id, p_title: title, p_description: description, p_object_id: objectId, p_assignee_id: assigneeId })
  if (error) throw error
  return data as Task
}
export async function deleteTask(id: string) {
  const { data, error } = await rpcClient().rpc('delete_task', { p_id: id })
  if (error) throw error
  return data as Task
}
export async function changeTaskStatus(id: string, expectedStatus: TaskStatus, newStatus: TaskStatus, comment?: string) {
  const { data, error } = await rpcClient().rpc('change_task_status', { p_task_id: id, p_expected_status: expectedStatus, p_new_status: newStatus, p_comment: comment ?? null })
  if (error) throw error
  return data as Task
}

export function roleLabel(role: AppRole): string { return role === 'manager' ? 'Постановщик' : 'Исполнитель' }
