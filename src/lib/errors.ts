export function userMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/недостаточно прав|permission|42501/i.test(message)) return 'У вас нет прав для этого действия.'
  if (/недоступен|не найден|P0002/i.test(message)) return 'Запись недоступна или уже удалена.'
  if (/уже изменилась|40001/i.test(message)) return 'Данные уже изменились. Обновите страницу и попробуйте ещё раз.'
  if (/комментарий обязателен/i.test(message)) return 'Добавьте комментарий перед возвратом на доработку.'
  if (/исполнитель недоступен/i.test(message)) return 'Выберите действующего исполнителя.'
  if (/Failed to fetch|fetch failed|network/i.test(message)) return 'Не удалось связаться с сервером. Проверьте соединение.'
  return 'Не удалось выполнить действие. Попробуйте ещё раз.'
}
