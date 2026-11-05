import type { Profile, Task, TaskStatus } from '../types/domain'

export interface TaskStatusAction {
  label: string
  next: TaskStatus
  requiresComment?: boolean
}

export function getTaskStatusActions(task: Task, profile: Profile): TaskStatusAction[] {
  if (profile.role === 'executor' && task.assignee_id === profile.id) {
    if (task.status === 'new' || task.status === 'rework') return [{ label: 'Взять в работу', next: 'in_progress' }]
    if (task.status === 'in_progress') return [{ label: 'Отправить на проверку', next: 'review' }]
  }
  if (profile.role === 'manager' && task.status === 'review') {
    return [
      { label: 'Принять', next: 'accepted' },
      { label: 'Вернуть на доработку', next: 'rework', requiresComment: true }
    ]
  }
  return []
}
