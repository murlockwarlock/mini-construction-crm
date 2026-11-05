export function required(value: string, label: string): string | undefined {
  if (!value.trim()) return `Введите ${label.toLowerCase()}.`
  return undefined
}

export function maxLength(value: string, limit: number, label: string): string | undefined {
  if (value.length > limit) return `${label} не длиннее ${limit} символов.`
  return undefined
}

export function validateObject(name: string, address: string): Record<string, string> {
  return {
    ...(required(name, 'название объекта') ? { name: required(name, 'название объекта')! } : {}),
    ...(required(address, 'адрес') ? { address: required(address, 'адрес')! } : {}),
    ...(maxLength(name, 200, 'Название') ? { name: maxLength(name, 200, 'Название')! } : {}),
    ...(maxLength(address, 500, 'Адрес') ? { address: maxLength(address, 500, 'Адрес')! } : {})
  }
}

export function validateTask(title: string, description: string, objectId: string, assigneeId: string): Record<string, string> {
  return {
    ...(required(title, 'название задачи') ? { title: required(title, 'название задачи')! } : {}),
    ...(maxLength(title, 200, 'Название') ? { title: maxLength(title, 200, 'Название')! } : {}),
    ...(maxLength(description, 5000, 'Описание') ? { description: maxLength(description, 5000, 'Описание')! } : {}),
    ...(!objectId ? { objectId: 'Выберите объект.' } : {}),
    ...(!assigneeId ? { assigneeId: 'Выберите исполнителя.' } : {})
  }
}

export function validateComment(comment: string): string | undefined {
  if (!comment.trim()) return 'Добавьте комментарий.'
  if (comment.length > 2000) return 'Комментарий не длиннее 2000 символов.'
  return undefined
}
