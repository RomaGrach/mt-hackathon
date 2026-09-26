import { esc } from './ui.js';
export function adminView(data) {
  if (!data)
    return '<section class="panel"><h1 tabindex="-1">Администратор</h1><p>Открываем сводку…</p></section>';
  const statuses = {
    new: 'Не начал',
    in_progress: 'В смене',
    completed: 'Завершил',
    aborted: 'Прервал',
  };
  const date = (v) => new Date(v).toLocaleString('ru-RU');
  return `<section class="admin-page"><header class="page-heading"><p class="eyebrow">Администратор</p><h1 tabindex="-1">Игроки и прохождения</h1><p>${data.total} игроков · обновлено ${esc(date(data.checkedAt))}</p></header><div class="admin-toolbar"><button class="outline-button" data-action="refresh">↻ Обновить</button><a href="/" class="text-back">← К игре</a></div><p class="muted">Открытый тестовый режим: сводку может смотреть любой посетитель. Статус последнего прохождения. Последняя активность — запрос или действие игрока; это не индикатор присутствия онлайн.</p><div class="table-scroll"><table><thead><tr><th>Игрок / бригада</th><th>Статус</th><th>Прохождения</th><th>XP</th><th>Лояльность / безопасность</th><th>Последняя активность</th></tr></thead><tbody>${data.items.map((u) => `<tr><td><strong>${esc(u.alias)}</strong><small>${esc(u.crew)}</small></td><td><span class="status-pill ${esc(u.status)}">${esc(statuses[u.status])}</span>${u.overduePromises ? '<small>Есть просроченное обещание</small>' : ''}</td><td>${u.completed} / ${u.attempts}</td><td>${u.xp}</td><td>${u.loyalty ?? '—'} / ${u.safety ?? '—'}</td><td>${esc(date(u.lastActivityAt))}</td></tr>`).join('') || '<tr><td colspan="6">Игроков пока нет</td></tr>'}</tbody></table></div><div class="admin-toolbar">${data.offset ? `<button data-action="admin-page" data-offset="${Math.max(0, data.offset - 50)}">← Назад</button>` : ''}${data.nextOffset !== null ? `<button data-action="admin-page" data-offset="${data.nextOffset}">Далее →</button>` : ''}</div></section>`;
}
