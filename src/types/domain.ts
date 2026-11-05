export type AppRole = 'manager' | 'executor'
export type TaskStatus = 'new' | 'in_progress' | 'review' | 'accepted' | 'rework'

export interface Profile {
  id: string
  display_name: string
  role: AppRole
  created_at: string
}

export interface CrmObject {
  id: string
  name: string
  address: string
  created_at: string
  deleted_at: string | null
}

export interface Task {
  id: string
  title: string
  description: string
  object_id: string
  assignee_id: string
  status: TaskStatus
  author_id: string
  created_at: string
  deleted_at: string | null
  assignee?: Pick<Profile, 'id' | 'display_name' | 'role'>
  author?: Pick<Profile, 'id' | 'display_name' | 'role'>
  object?: Pick<CrmObject, 'id' | 'name' | 'address'>
}

export interface StatusHistory {
  id: string
  task_id: string
  actor_id: string
  created_at: string
  activity_order?: number | null
  from_status: TaskStatus | null
  to_status: TaskStatus
  comment: string | null
  actor?: Pick<Profile, 'id' | 'display_name' | 'role'>
}

export interface TaskComment {
  id: string
  task_id: string
  author_id: string
  created_at: string
  activity_order?: number | null
  body: string
  author?: Pick<Profile, 'id' | 'display_name' | 'role'>
}

export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Omit<Profile, 'created_at'> & { created_at?: string }; Update: Partial<Profile> }
      objects: { Row: CrmObject; Insert: Partial<CrmObject> & Pick<CrmObject, 'name' | 'address'>; Update: Partial<CrmObject> }
      tasks: { Row: Task; Insert: Partial<Task>; Update: Partial<Task> }
      task_status_history: { Row: StatusHistory; Insert: Partial<StatusHistory>; Update: Partial<StatusHistory> }
      task_comments: { Row: TaskComment; Insert: Partial<TaskComment>; Update: never }
    }
    Functions: {
      create_object: { Args: { p_name: string; p_address: string }; Returns: CrmObject }
      update_object: { Args: { p_id: string; p_name: string; p_address: string }; Returns: CrmObject }
      delete_object: { Args: { p_id: string }; Returns: CrmObject }
      create_task: { Args: { p_title: string; p_description: string; p_object_id: string; p_assignee_id: string }; Returns: Task }
      update_task: { Args: { p_id: string; p_title: string; p_description: string; p_object_id: string; p_assignee_id: string }; Returns: Task }
      delete_task: { Args: { p_id: string }; Returns: Task }
      change_task_status: { Args: { p_task_id: string; p_expected_status: TaskStatus; p_new_status: TaskStatus; p_comment?: string | null }; Returns: Task }
      add_task_comment: { Args: { p_task_id: string; p_body: string }; Returns: TaskComment }
    }
  }
}

export const STATUS_LABELS: Record<TaskStatus, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  review: 'На проверке',
  accepted: 'Принята',
  rework: 'На доработке'
}

export const STATUS_TONES: Record<TaskStatus, string> = {
  new: 'status-new',
  in_progress: 'status-progress',
  review: 'status-review',
  accepted: 'status-accepted',
  rework: 'status-rework'
}
