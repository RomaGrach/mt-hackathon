// Visual exploration only. Seats and places below are illustrative, not a carrier seat plan.
const classes = {
  standard: { name: 'Стандарт', left: 3, right: 2, rows: 12, service: 'Схема 3 + 2' },
  comfort: { name: 'Комфорт', left: 2, right: 2, rows: 12, service: 'Схема 2 + 2' },
  business: { name: 'Бизнес', left: 2, right: 2, rows: 12, service: 'Схема 2 + 2' },
  first: { name: 'Первый', left: 2, right: 1, rows: 12, service: 'Схема 2 + 1' },
};
const concepts = {
  plan: {
    title: 'План мест',
    description: 'Салон целиком: номер места, проход и расположение событий.',
  },
  spatial: {
    title: 'Вид сверху',
    description: 'Кресла, проход и служебные зоны читаются как пространство вагона.',
  },
  zones: {
    title: 'Карта зон',
    description: 'Весь вагон виден сразу; выбранный участок открывается подробнее.',
  },
};
const events = [
  {
    id: 'seat', number: '1', tone: 'attention', row: 3, side: 'left',
    title: 'Обращение о месте',
    detail: 'Пассажир запутался в обозначениях кресел. Откройте его обращение и проверьте билет с маркировкой в этой части салона.',
  },
  {
    id: 'service', number: '2', tone: 'waiting', row: 10, side: 'right',
    title: 'Проверить памятку',
    detail: 'В дальней части вагона пассажир задаёт вопрос о сервисе. Сведения в памятке требуют проверки по данным класса.',
  },
  {
    id: 'aisle', number: '!', tone: 'urgent', row: 7, side: 'aisle',
    title: 'Багаж в проходе',
    detail: 'После осмотра замечен багаж, мешающий проходу. Это дело стало видимым на карте только после обнаружения.',
  },
];
const zones = [
  { name: 'Передняя часть', start: 0, end: 3, note: 'Начало салона' },
  { name: 'Середина вагона', start: 4, end: 7, note: 'Проход и кресла' },
  { name: 'Дальняя часть', start: 8, end: 11, note: 'Конец салона' },
];
const state = { concept: 'plan', serviceClass: 'standard', discovered: false, selected: 'seat', zone: 0 };
const $ = (id) => document.getElementById(id);
const classInfo = () => classes[state.serviceClass];
const visibleEvents = () => events.filter((e) => e.id !== 'aisle' || state.discovered);
const seatNumber = (row, side) => {
  const { left, right } = classInfo();
  return row * (left + right) + (side === 'left' ? left : left + 1);
};
const place = (event) => event.side === 'aisle'
  ? 'проход, середина вагона'
  : `место ${seatNumber(event.row, event.side)}, ряд ${event.row + 1}`;
const zoneOf = (event) => zones.findIndex((z) => event.row >= z.start && event.row <= z.end);
function pin(event) {
  return `<button type="button" class="pin ${event.tone === 'attention' ? '' : event.tone}" data-event-id="${event.id}" aria-label="${event.title}, ${place(event)}" title="${event.title}">${event.number}</button>`;
}
function rowMarkup(row, { compact = false } = {}) {
  const { left, right } = classInfo();
  const at = visibleEvents();
  const cell = (side, index) => {
    const number = row * (left + right) + (side === 'left' ? index + 1 : left + index + 1);
    const event = at.find((e) => e.row === row && e.side === side && (side === 'left' ? index === left - 1 : index === 0));
    return `<span class="seat ${event ? 'has-event' : ''}" aria-label="Место ${number}">${number}${event ? pin(event) : ''}</span>`;
  };
  const aisle = at.find((e) => e.row === row && e.side === 'aisle');
  const line = compact ? '' : row > 0 && row % 4 === 0
    ? `<div class="zone-line"><span>${zones[row / 4].name}</span></div>`
    : '';
  return line + `<div class="coach-row ${!compact && row > 0 && row % 4 === 0 ? 'zone-start' : ''}" style="--left:${left};--right:${right}" aria-label="Ряд ${row + 1}">${Array.from({ length:left }, (_, i) => cell('left', i)).join('')}<span class="walkway">${aisle ? pin(aisle) : '·'}</span>${Array.from({ length:right }, (_, i) => cell('right', i)).join('')}</div>`;
}
function fullCoach() {
  const c = classInfo();
  return `<div class="coach" aria-label="Условная схема всего вагона класса ${c.name}"><div class="coach-vestibule">Вход · тамбур</div><div class="coach-service"><span>Служебная зона</span><span>${c.service}</span></div><div class="zone-line"><span>${zones[0].name}</span></div>${Array.from({length:c.rows},(_,r)=>rowMarkup(r)).join('')}<div class="coach-vestibule last">Тамбур · выход</div></div><p class="coach-key">${c.rows} рядов · ${c.rows * (c.left + c.right)} условных мест · проход по центру</p>`;
}
function zoneCoach() {
  const selected = zones[state.zone];
  return `<div class="zone-coach"><div class="zone-head">Вход · тамбур</div><div class="zone-stack">${zones.map((z,i)=>{
    const markers=visibleEvents().filter(e=>zoneOf(e)===i);
    return `<button type="button" class="zone-card" data-zone="${i}" aria-current="${state.zone===i}"><span><strong>${z.name}</strong><small>Ряды ${z.start+1}–${z.end+1} · ${markers.length ? markers.length+' '+(markers.length===1?'известное дело':'известных дела') : 'без известных дел'}</small></span><span class="zone-dots" aria-hidden="true">${markers.map(e=>`<i class="pin ${e.tone==='attention'?'':e.tone}">${e.number}</i>`).join('')}</span></button>`;
  }).join('')}</div><div class="zone-foot">Тамбур · выход</div></div><div class="zone-detail"><h3>${selected.name} · ряды ${selected.start+1}–${selected.end+1}</h3><p>Выберите отметку, чтобы увидеть дело. Схема мест ниже показана только для этой зоны.</p>${Array.from({length:selected.end-selected.start+1},(_,i)=>rowMarkup(selected.start+i,{compact:true})).join('')}</div>`;
}
function render() {
  const c = classInfo();
  const active = events.find((e) => e.id === state.selected);
  const concept = concepts[state.concept];
  $('concept-name').textContent = concept.title;
  $('concept-description').textContent = concept.description;
  $('layout-flag').textContent = `${c.rows} рядов · ${c.service}`;
  $('concept').setAttribute('aria-labelledby', `tab-${state.concept}`);
  $('map-canvas').className = `canvas ${state.concept === 'spatial' ? 'spatial' : ''}`;
  $('map-canvas').innerHTML = state.concept === 'zones' ? zoneCoach() : fullCoach();
  $('event-list').innerHTML = visibleEvents().map((e) => `<button type="button" class="event" data-event-id="${e.id}" aria-current="${state.selected === e.id}"><span class="pin ${e.tone==='attention'?'':e.tone}" aria-hidden="true">${e.number}</span><span><strong>${e.title}</strong><small>${place(e)}</small></span></button>`).join('');
  $('event-detail').innerHTML = `<span class="detail-label">Выбрано на карте</span><h3>${active.title}</h3><p><strong>${place(active)}.</strong> ${active.detail}</p>`;
  $('reveal').disabled = state.discovered;
  $('reveal').textContent = state.discovered ? 'Проход осмотрен · проблема обнаружена' : 'Осмотреть проход · открыть событие';
  for (const button of document.querySelectorAll('[data-concept]'))
    button.setAttribute('aria-selected', String(button.dataset.concept === state.concept));
}
document.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-concept]');
  if (tab) { state.concept = tab.dataset.concept; render(); return; }
  const marker = event.target.closest('[data-event-id]');
  if (marker) { state.selected = marker.dataset.eventId; state.zone = zoneOf(events.find((e)=>e.id===state.selected)); render(); return; }
  const zone = event.target.closest('[data-zone]');
  if (zone) { state.zone = Number(zone.dataset.zone); render(); }
});
$('class-select').addEventListener('change', (event) => {
  if (!Object.hasOwn(classes, event.target.value)) return;
  state.serviceClass = event.target.value;
  render();
});
$('reveal').addEventListener('click', () => {
  state.discovered = true;
  state.selected = 'aisle';
  state.zone = zoneOf(events[2]);
  render();
});
document.querySelector('[role="tablist"]').addEventListener('keydown', (event) => {
  if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
  const order = Object.keys(concepts);
  const at = order.indexOf(state.concept);
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? order.length - 1
    : (at + (event.key === 'ArrowRight' ? 1 : -1) + order.length) % order.length;
  event.preventDefault();
  state.concept = order[index];
  render();
  $(`tab-${state.concept}`).focus();
});
render();
