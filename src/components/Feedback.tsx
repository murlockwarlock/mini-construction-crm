export function ErrorMessage({ message }: { message: string }) { return <div className="message error" role="alert">{message}</div> }
export function SuccessMessage({ message }: { message: string }) { return <div className="message success" role="status">{message}</div> }
export function LoadingInline({ label = 'Сохраняем…' }: { label?: string }) { return <span className="inline-loading"><span className="spinner small" />{label}</span> }
