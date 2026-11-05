import { STATUS_LABELS, STATUS_TONES, type TaskStatus } from '../types/domain'

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <span className={`status-badge ${STATUS_TONES[status]}`}><span className="status-dot" aria-hidden="true" />{STATUS_LABELS[status]}</span>
}
