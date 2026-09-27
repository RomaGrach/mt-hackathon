import { esc } from './ui.js';

const labels = {
  open: 'Нужно действие',
  waiting: 'Ожидает коллегу',
  resolved: 'Решено',
  failed: 'Не выполнено',
};
export function incidentTone(incident, run) {
  if (incident.status === 'resolved') return 'resolved';
  if (
    incident.status === 'failed' ||
    (run.criticalWindow?.incidentId === incident.id &&
      ['open', 'pending'].includes(run.criticalWindow.status))
  )
    return 'urgent';
  return incident.status === 'waiting' &&
    !['accepted', 'completed'].includes(incident.handoffStatus)
    ? 'waiting'
    : 'attention';
}
export function incidentNavigation(run, id) {
  if (run.focusIncidentId === id && run.phase === 'scene') return 'data-game-tab="scene"';
  const at = (run.actions || []).findIndex(
    (a) => a.command === 'focus' && a.incidentId === id && a.available !== false
  );
  if (at >= 0) return `data-shift-action="${at}" data-focus-incident="${esc(id)}"`;
  const known = (run.incidents || []).some(
    (i) => i.id === id && !['resolved', 'failed'].includes(i.status)
  );
  if (known && (run.actions || []).some((a) => a.command === 'overview' && a.available !== false))
    return `data-incident-target="${esc(id)}"`;
  return '';
}
export function wagonMap(run) {
  const serviceClass = run.context?.serviceClass || 'standard';
  const sides = serviceClass === 'standard' ? [3, 2] : serviceClass === 'first' ? [2, 1] : [2, 2];
  const incidents = run.incidents || [];
  const seatCase = incidents.find((i) => i.id === 'a-seat');
  const other = incidents.find((i) => i.id !== 'a-seat');
  const marker = (incident, zone) => {
    if (!incident) return `<span class="zone-caption">${zone}</span>`;
    const navigation = incidentNavigation(run, incident.id);
    const tone = incidentTone(incident, run);
    const current = run.focusIncidentId === incident.id;
    const body = `<span class="map-dot" aria-hidden="true">${tone === 'resolved' ? '✓' : tone === 'urgent' ? '!' : '•'}</span><span><strong>${esc(incident.label)}</strong><small>${current ? 'Вы здесь · ' : ''}${esc(incident.status === 'waiting' && ['accepted', 'completed'].includes(incident.handoffStatus) ? 'Проверьте исполнение' : labels[incident.status] || incident.status)}</small></span>`;
    return navigation
      ? `<button class="map-marker ${tone}" ${navigation}>${body}<span aria-hidden="true">→</span></button>`
      : `<div class="map-marker ${tone}">${body}</div>`;
  };
  const row = (r) =>
    `<div class="seat-row" style="--seat-cols:${sides[0] + sides[1] + 1}">${[...Array(sides[0])].map((_, i) => `<span class="map-seat ${r === 1 && i < 2 ? 'seat-known' : ''}">${r === 1 && i < 2 ? 18 + i : ''}</span>`).join('')}<span class="map-aisle" aria-hidden="true"></span>${[...Array(sides[1])].map(() => '<span class="map-seat"></span>').join('')}</div>`;
  return `<div class="carriage-layout"><div class="carriage-diagram" aria-label="Учебная схема вагона: ${sides.join(' плюс ')}"><div class="carriage-vestibule">Тамбур ${run.stage === 'inspection' ? '· Вы здесь' : ''}</div><div class="carriage-seats">${row(0)}${row(1)}${marker(seatCase, 'Места 18–19')}${row(2)}<div class="aisle-caption">Проход</div>${marker(other, 'Салон · ещё не осмотрен')}${row(3)}</div><div class="carriage-vestibule">Тамбур</div></div><div class="map-notes"><p><strong>${esc(run.context?.serviceClassLabel || 'Стандарт')}</strong> · ${sides.join(' + ')}</p><div class="map-legend"><span class="attention">● Нужно действие</span><span class="urgent">● Срочно / ошибка</span><span class="waiting">● Ожидание</span><span class="resolved">● Решено</span></div><p class="muted">Фрагмент учебной схемы ВСМ. Расстановка и номера мест условные; это не план реального состава.</p></div></div>`;
}
