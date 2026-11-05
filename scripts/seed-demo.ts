import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const password = process.env.DEMO_PASSWORD ?? process.env.TEST_PASSWORD
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!url || !serviceKey || !password || !anonKey) throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY and DEMO_PASSWORD are required')

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
const users = [
  { email: 'demo.manager@example.test', name: 'Анна Петрова', role: 'manager' as const },
  { email: 'demo.manager2@example.test', name: 'Илья Смирнов', role: 'manager' as const },
  { email: 'demo.executor1@example.test', name: 'Дмитрий Волков', role: 'executor' as const },
  { email: 'demo.executor2@example.test', name: 'Ольга Кузнецова', role: 'executor' as const }
]

async function findOrCreate(email: string) {
  const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (listError) throw listError
  const existing = listed.users.find(user => user.email === email)
  if (existing) return existing.id
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw error ?? new Error(`Could not create ${email}`)
  return data.user.id
}

const ids = new Map<string, string>()
for (const user of users) ids.set(user.email, await findOrCreate(user.email))
for (const user of users) {
  const { error } = await admin.from('profiles').upsert({ id: ids.get(user.email), display_name: user.name, role: user.role })
  if (error) throw error
}

const manager = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
const { error: loginError } = await manager.auth.signInWithPassword({ email: users[0].email, password })
if (loginError) throw loginError

const { data: existingObjects, error: objectError } = await manager.from('objects').select('id').eq('name', 'ЖК Северный парк').is('deleted_at', null)
if (objectError) throw objectError
if (!existingObjects?.length) {
  const { data: object, error: createObjectError } = await manager.rpc('create_object', { p_name: 'ЖК Северный парк', p_address: 'г. Алматы, ул. Абая, 25' })
  if (createObjectError || !object) throw createObjectError ?? new Error('Object was not created')
  const objectId = (object as { id: string }).id
  const executor1 = ids.get(users[2].email)!
  const executor2 = ids.get(users[3].email)!
  const tasks = [
    ['Проверить смету кровельных работ', 'Сверить позиции с последней ведомостью.', executor1, 'in_progress'],
    ['Подготовить площадку для техники', 'Проверить доступ и временные ограждения.', executor2, 'review'],
    ['Согласовать поставку окон', 'Подтвердить сроки поставки с подрядчиком.', executor1, 'rework'],
    ['Принять исполнительную документацию', 'Проверить комплект документов.', executor2, 'accepted']
  ] as const
  const executorClients = new Map<string, SupabaseClient>()
  for (const [email, id] of [[users[2].email, executor1], [users[3].email, executor2]] as const) {
    const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const { error } = await client.auth.signInWithPassword({ email, password })
    if (error) throw error
    executorClients.set(id, client)
  }
  for (const [title, description, assignee, desiredStatus] of tasks) {
    const { data: task, error: taskError } = await manager.rpc('create_task', { p_title: title, p_description: description, p_object_id: objectId, p_assignee_id: assignee })
    if (taskError || !task) throw taskError ?? new Error('Task was not created')
    const taskId = (task as { id: string }).id
    const executorClient = executorClients.get(assignee)!
    const first = await executorClient.rpc('change_task_status', { p_task_id: taskId, p_expected_status: 'new', p_new_status: 'in_progress', p_comment: null })
    if (first.error) throw first.error
    if (desiredStatus === 'review' || desiredStatus === 'rework' || desiredStatus === 'accepted') {
      const second = await executorClient.rpc('change_task_status', { p_task_id: taskId, p_expected_status: 'in_progress', p_new_status: 'review', p_comment: null })
      if (second.error) throw second.error
    }
    if (desiredStatus === 'rework' || desiredStatus === 'accepted') {
      const next = await manager.rpc('change_task_status', { p_task_id: taskId, p_expected_status: 'review', p_new_status: desiredStatus, p_comment: desiredStatus === 'rework' ? 'Уточнить комплект документов.' : null })
      if (next.error) throw next.error
    }
  }
}
console.log(JSON.stringify({ status: 'seeded', users: users.map(user => ({ email: user.email, role: user.role })) }))
