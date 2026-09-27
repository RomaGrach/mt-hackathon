import { esc } from './ui.js';

export function adminView(data) {
  const statuses = {
    new: 'Не начал',
    in_progress: 'В смене',
    completed: 'Завершил',
    aborted: 'Прервал',
  };
  const crews = {
    'msk-1': 'Бригада М-01',
    'msk-2': 'Бригада М-02',
    'spb-1': 'Бригада П-01',
    'spb-2': 'Бригада П-02',
  };
  const date = (v) =>
    v
      ? new Date(v).toLocaleString('ru-RU', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '—';
  return `<section class="admin-page">
    <header class="admin-header"><a href="/" class="admin-back" aria-label="Вернуться к игре">← РЕЙС 400</a><span>Администратор</span></header>
    <div class="admin-title"><div><h1 tabindex="-1">Игроки</h1><p>${data ? `${data.total} всего · обновлено ${esc(date(data.checkedAt))}` : 'Открываем сводку…'}</p></div><button class="admin-refresh" data-action="refresh" aria-label="Обновить сводку">↻</button></div>
    <p class="admin-caption">Статус последнего прохождения. Нажмите на игрока, чтобы посмотреть показатели.</p>
    <div class="admin-users">${
      data
        ? data.items
            .map(
              (
                u,
                i
              ) => `<details class="admin-user" data-disclosure="admin-user-${data.offset + i}">
      <summary><span class="admin-identity"><strong>${esc(u.alias)}</strong><span>${esc(crews[u.crew] || u.crew)}</span></span><span class="admin-state ${esc(u.status)}">${esc(statuses[u.status] || u.status)}</span><span class="admin-chevron" aria-hidden="true">⌄</span></summary>
      <div class="admin-user-info"><dl><div><dt>Завершено смен</dt><dd>${u.completed} из ${u.attempts}</dd></div><div><dt>Компетенции</dt><dd>${u.competencyPoints ?? 0}</dd></div>${u.turn !== null && u.turn !== undefined ? `<div><dt>Ходы смены</dt><dd>${u.turn} / ${u.totalTurns}</dd></div>` : ''}<div><dt>Лояльность</dt><dd>${u.loyalty ?? '—'}</dd></div><div><dt>Безопасность</dt><dd>${u.safety ?? '—'}</dd></div><div class="admin-activity"><dt>Последняя активность</dt><dd>${esc(date(u.lastActivityAt))}</dd></div></dl>${u.overduePromises ? '<p class="admin-overdue">Есть просроченная задача</p>' : ''}</div>
    </details>`
            )
            .join('') ||
          '<p class="admin-empty">Игроков пока нет. Они появятся здесь после входа в игру.</p>'
        : ''
    }</div>
    ${data && (data.offset || data.nextOffset !== null) ? `<nav class="admin-pagination" aria-label="Страницы игроков">${data.offset ? `<button class="outline-button" data-action="admin-page" data-offset="${Math.max(0, data.offset - 50)}">← Назад</button>` : ''}<span>${data.offset + 1}–${data.offset + data.items.length} из ${data.total}</span>${data.nextOffset !== null ? `<button class="outline-button" data-action="admin-page" data-offset="${data.nextOffset}">Далее →</button>` : ''}</nav>` : ''}
    <footer class="admin-footnote">Открытый тестовый режим · доступен всем.<br>Последняя активность — время запроса или действия, а не присутствие онлайн.</footer>
  </section>`;
}
