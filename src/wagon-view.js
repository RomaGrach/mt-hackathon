import { esc } from './ui.js';
import { CARRIAGE_LAYOUTS, layoutSeats } from './carriage-layouts.js';

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
  const modern = run.engineVersion === 'shift-4';
  const layout =
    run.context?.layout || CARRIAGE_LAYOUTS[run.context?.serviceClass] || CARRIAGE_LAYOUTS.standard;
  const incidents = (run.incidents || []).filter((i) => !modern || i.status === 'open');
  const address = (i) => Number(i.seat) || (i.id === 'a-seat' ? 18 : null);
  const atSeat = (n) =>
    incidents.filter((i) => address(i) === n && i.zone !== 'aisle' && i.zone !== 'vestibule');
  const navigation = (i) => incidentNavigation(run, i.id);
  const marker = (i, extra = '') => {
    const nav = navigation(i),
      tone = modern ? 'known' : incidentTone(i, run);
    const text = `${i.label}${address(i) ? ' · место ' + address(i) : ''}`;
    return `<${nav ? 'button' : 'span'} class="wagon-pin ${tone} ${extra}" ${nav} aria-label="${esc(text)}">●</${nav ? 'button' : 'span'}>`;
  };
  const seat = (n) => {
    const cases = atSeat(n),
      nav = cases[0] ? navigation(cases[0]) : '';
    const occupied = !modern || run.passengers?.some((p) => p.seat === n);
    const tag = nav ? 'button' : 'span';
    return `<${tag} class="wagon-seat ${occupied ? '' : 'empty'} ${cases.length ? 'marked' : ''}" data-seat-number="${n}" ${nav} aria-label="Место ${n}${cases.length ? ': ' + esc(cases.map((i) => i.label).join(', ')) : ''}"><span class="wagon-seat-number">${n}</span>${cases.length ? '<i class="wagon-seat-dot" aria-hidden="true"></i>' : ''}</${tag}>`;
  };
  const row = (r, index) => {
    const pins = incidents.filter(
      (i) => i.zone === 'aisle' && [...r.left, ...r.right].includes(address(i))
    );
    return `${index === layout.partitionAfter ? '<div class="wagon-partition">Перегородка · продолжение салона</div>' : ''}<div class="wagon-row" style="--left:${layout.sides[0]};--right:${layout.sides[1]}" aria-label="Ряд ${index + 1}">${r.play ? `<div class="wagon-play">${layout.rows[index - 1]?.play ? 'комната' : 'Игровая'}</div>` : r.left.map(seat).join('')}<div class="wagon-aisle">${pins.map((i) => marker(i)).join('')}</div>${r.right.map(seat).join('')}</div>`;
  };
  const actual = new Set(layoutSeats(layout));
  // Keep every address in a saved, older shift reachable without renumbering it.
  const oldSeats = Array.from({ length: run.context?.seats || 0 }, (_, n) => n + 1);
  const extras = [
    ...new Set([...oldSeats, ...incidents.map(address)].filter((n) => n && !actual.has(n))),
  ].sort((a, b) => a - b);
  const unplaced = incidents.filter((i) => i.zone === 'vestibule' || !address(i));
  const extrasHtml = extras.length
    ? `<div class="wagon-legacy"><p>Места сохранённой смены</p><div class="wagon-old-seats">${extras.map(seat).join('')}</div></div>`
    : '';
  const cases = incidents
    .map((i) => {
      const nav = navigation(i);
      const where =
        i.zone === 'aisle'
          ? 'Проход'
          : i.zone === 'vestibule'
            ? 'Тамбур'
            : address(i)
              ? 'Место ' + address(i)
              : 'Салон';
      const status = modern
        ? ''
        : i.status === 'waiting' && ['accepted', 'completed'].includes(i.handoffStatus)
          ? 'Проверьте исполнение'
          : labels[i.status] || '';
      return `<${nav ? 'button' : 'div'} class="wagon-case" ${nav}><span aria-hidden="true">●</span><span><small>${esc(where)}</small><strong>${esc(i.label)}</strong>${status ? `<small>${esc(status)}</small>` : ''}</span>${nav ? '<span aria-hidden="true">→</span>' : ''}</${nav ? 'button' : 'div'}>`;
    })
    .join('');
  return `<div class="wagon-map"><p class="wagon-summary"><strong>${esc(run.context?.serviceClassLabel || layout.label)}</strong><span>${layout.sides.join(' + ')} · ${layout.seats} мест в салоне</span></p><div class="wagon-body ${layout.rooms ? 'wagon-first' : ''}" aria-label="Полная схема вагона: ${esc(layout.label)}, ${layout.sides.join(' плюс ')}"><div class="wagon-service">${layout.entry.map((x) => `<span>${esc(x)}</span>`).join('')}</div>${unplaced.length ? `<div class="wagon-zone-pins">${unplaced.map((i) => marker(i)).join('')}</div>` : ''}${layout.rooms ? `<div class="wagon-rooms">${layout.rooms.map((x) => `<div>${esc(x)}</div>`).join('')}</div>` : ''}<div class="wagon-saloon"><p class="wagon-zone-title">Салон · проход по центру</p>${layout.rows.map(row).join('')}</div><div class="wagon-service">${layout.end.map((x) => `<span>${esc(x)}</span>`).join('')}</div></div>${extrasHtml}<p class="wagon-key">● Обращение · нажмите отмеченное место</p><div class="wagon-cases">${cases}</div><p class="wagon-source">${esc(layout.note)}. Компоновка по референсу ВСМ; номера — постоянные игровые, не официальная билетная нумерация.</p></div>`;
}
