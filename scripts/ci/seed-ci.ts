import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const password = process.env.TEST_PASSWORD
if (!url || !serviceKey || !password) throw new Error('CI seed requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and TEST_PASSWORD')
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw new Error('CI seed refuses a non-local Supabase URL')

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
const users = [
  { email: 'ci.manager1@example.test', name: 'CI Постановщик 1', role: 'manager' as const },
  { email: 'ci.manager2@example.test', name: 'CI Постановщик 2', role: 'manager' as const },
  { email: 'ci.executor1@example.test', name: 'CI Исполнитель 1', role: 'executor' as const },
  { email: 'ci.executor2@example.test', name: 'CI Исполнитель 2', role: 'executor' as const }
]
const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
if (listError) throw listError
for (const item of users) {
  let user = listed.users.find(candidate => candidate.email === item.email)
  if (!user) {
    const created = await admin.auth.admin.createUser({ email: item.email, password, email_confirm: true })
    if (created.error || !created.data.user) throw created.error ?? new Error(`Could not create ${item.email}`)
    user = created.data.user
  }
  const { error } = await admin.from('profiles').upsert({ id: user.id, display_name: item.name, role: item.role })
  if (error) throw error
}
const noProfileEmail = 'ci.noprofile@example.test'
if (!listed.users.some(candidate => candidate.email === noProfileEmail)) {
  const created = await admin.auth.admin.createUser({ email: noProfileEmail, password, email_confirm: true })
  if (created.error || !created.data.user) throw created.error ?? new Error('Could not create no-profile user')
}
console.log(JSON.stringify({ seeded: users.length + 1, database: 'local-postgresql' }))
