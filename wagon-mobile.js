// Separate visual reference. The seat plan and event positions are illustrative.
const layouts = {
  standard: { name: 'Стандарт', left: 3, right: 2 },
  comfort: { name: 'Комфорт', left: 2, right: 2 },
  business: { name: 'Бизнес', left: 2, right: 2 },
  first: { name: 'Первый', left: 2, right: 1 },
};
const variants = [
  { id: 'plan', number: '01', name: 'План мест', caption: 'Все кресла и номера' },
  { id: 'spatial', number: '02', name: 'Вид сверху', caption: 'Пространство салона' },
  { id: 'zones', number: '03', name: 'Карта зон', caption: 'Салон без мелких деталей' },
];
const eventData = [
  { id: 'seat', row: 3, side: 'left', label: 'Обращение о месте', code: '1', tone: '', text: 'Пассажир показывает билет и просит помочь найти своё кресло.' },
  { id: 'service', row: 10, side: 'right', label: 'Вопрос об обслуживании', code: '2', tone: 'waiting', text: 'Пассажир просит проверить сведения о сервисе этого класса.' },
  { id: 'bag', row: 7, side: 'aisle', label: 'Багаж в проходе', code: '!', tone: 'urgent', text: 'При осмотре замечен багаж, мешающий проходу.' },
];
const zones = [
  { name: 'Начало салона', from: 0, to: 3 },
  { name: 'Середина вагона', from: 4, to: 7 },
  { name: 'Дальняя часть', from: 8, to: 11 },
];
const state = {
  serviceClass: 'standard', discovered: false,
  phones: Object.fromEntries(variants.map((v) => [v.id, { tab: 'map', selected: 'seat', zone: 0 }])),
};
const visible = () => eventData.filter((e) => state.discovered || e.id !== 'bag');
const layout = () => layouts[state.serviceClass];
const zoneFor = (row) => zones.findIndex((z) => row >= z.from && row <= z.to);
function eventPlace(e) {
  if (e.side === 'aisle') return `проход · ряд ${e.row + 1}`;
  const l = layout();
  return `место ${e.row * (l.left + l.right) + (e.side === 'left' ? l.left : l.left + 1)} · ряд ${e.row + 1}`;
}
function pin(e, phoneId) {
  const active = state.phones[phoneId].selected === e.id;
  return `<button type="button" class="pin ${e.tone} ${active ? 'is-active' : ''}" data-event="${e.id}" data-phone="${phoneId}" aria-label="${e.label}, ${eventPlace(e)}" aria-pressed="${active}">${e.code}</button>`;
}
function row(rowIndex, phoneId) {
  const l = layout();
  const markers = visible();
  const seat = (side, index) => {
    const number = rowIndex * (l.left + l.right) + (side === 'left' ? index + 1 : l.left + index + 1);
    const e = markers.find((item) => item.row === rowIndex && item.side === side && (side === 'left' ? index === l.left - 1 : index === 0));
    return `<span class="seat ${e ? 'marked' : ''}" aria-label="Место ${number}">${number}${e ? pin(e, phoneId) : ''}</span>`;
  };
  const inAisle = markers.find((item) => item.row === rowIndex && item.side === 'aisle');
  return `<div class="seat-row" style="--left:${l.left};--right:${l.right}" aria-label="Ряд ${rowIndex+1}">${Array.from({length:l.left},(_,i)=>seat('left',i)).join('')}<span class="aisle">${inAisle ? pin(inAisle,phoneId) : '·'}</span>${Array.from({length:l.right},(_,i)=>seat('right',i)).join('')}</div>`;
}
function fullMap(id) {
  const l = layout();
  return `<div class="wagon"><div class="vestibule">Вход · тамбур</div><div class="service"><span>Служебная зона</span><span>${l.left} + ${l.right}</span></div>${Array.from({length:12},(_,r)=>`${r%4===0 ? `<div class="zone-label">${zones[r/4].name} · ряды ${r+1}–${r+4}</div>` : ''}${row(r,id)}`).join('')}<div class="vestibule end">Тамбур · выход</div></div><p class="map-caption">Условная схема вагона · ${12*(l.left+l.right)} мест</p>`;
}
function zoneMap(id) {
  const current = state.phones[id].zone;
  const z = zones[current];
  return `<div class="zones-map"><div class="vestibule">Вход · тамбур</div>${zones.map((item,i)=>{
    const known = visible().filter((e)=>zoneFor(e.row)===i);
    return `<button type="button" class="zone-button" data-zone="${i}" data-phone="${id}" aria-current="${i===current}"><span><strong>${item.name}</strong><small>Ряды ${item.from+1}–${item.to+1} · ${known.length ? known.length+' '+(known.length===1?'дело':'дела') : 'нет известных дел'}</small></span><span class="zone-pins" aria-hidden="true">${known.map((e)=>`<i class="pin ${e.tone}">${e.code}</i>`).join('')}</span></button>`;
  }).join('')}<div class="vestibule end">Тамбур · выход</div></div><div class="zone-detail"><h4>${z.name} · места и проход</h4>${Array.from({length:z.to-z.from+1},(_,i)=>row(z.from+i,id)).join('')}</div>`;
}
function screenContent(id) {
  const current = state.phones[id];
  const e = eventData.find((item) => item.id === current.selected);
  if (current.tab === 'map') {
    return `<div class="screen-body"><div class="screen-title"><h3>Вагон 3</h3><p>${layout().name} · ${layout().left}+${layout().right} · ${visible().length} известных дела</p></div><div class="screen-scroll">${id === 'zones' ? zoneMap(id) : fullMap(id)}</div><div class="focus-card"><span><strong>${e.label}</strong><small>${eventPlace(e)}</small></span><button type="button" data-screen="scene" data-phone="${id}">Открыть →</button></div></div>`;
  }
  if (current.tab === 'scene')
    return `<div class="screen-body"><div class="screen-title"><h3>Ситуация</h3><p>Вагон 3 · ${eventPlace(e)}</p></div><div class="screen-scroll"><div class="scene-dialogue"><span class="speaker">${e.id==='seat'?'Пассажир':e.id==='bag'?'Осмотр прохода':'Пассажир у памятки'}</span><p>${e.text}</p></div><div class="fake-choice">${e.id==='seat'?'Сверить билет и маркировку места':e.id==='bag'?'Помочь освободить проход':'Сверить сведения по схеме класса'}</div><div class="fake-choice">Вернуться к другим известным делам</div></div><div class="focus-card"><span><strong>Схема остаётся доступна</strong><small>Это макет экрана, решения не отправляются</small></span><button type="button" data-screen="map" data-phone="${id}">Вагон →</button></div></div>`;
  if (current.tab === 'tasks')
    return `<div class="screen-body"><div class="screen-title"><h3>Задачи</h3><p>Вагон 3 · известные дела</p></div><div class="screen-scroll">${visible().map((item)=>`<div class="task-line"><b>○</b><span>${item.label}<br><small>${eventPlace(item)}</small></span></div>`).join('')}</div></div>`;
  return `<div class="screen-body"><div class="screen-title"><h3>Управление</h3><p>Действия во время смены</p></div><div class="single-note">В игре здесь находятся подсказка, учебная пауза и выход на главную. Карта доступна через нижнюю кнопку «Вагон».</div></div>`;
}
function phoneMarkup(v) {
  const id = v.id;
  const current = state.phones[id];
  const buttons = [
    ['scene','◉','Ситуация'],['map','▦','Вагон'],['tasks','☑','Задачи'],['more','•••','Ещё'],
  ];
  return `<article class="concept" data-device="${id}"><div class="concept-heading"><span class="num">${v.number}</span><h2>${v.name}</h2><small>${v.caption}</small></div><div class="phone"><div class="screen"><div class="phone-notch" aria-hidden="true"></div><div class="phone-status"><span>9:41</span><span aria-hidden="true">◂◂ ▰</span></div><div class="game-hud"><div class="game-time"><small>Время смены</small><strong>08:07</strong></div><div class="meters"><div class="meter loyalty"><span>Лояльность</span><progress value="78" max="100"></progress><b>78</b></div><div class="meter safety"><span>Безопасность</span><progress value="82" max="100"></progress><b>82</b></div></div></div>${screenContent(id)}<nav class="dock" aria-label="Разделы смены">${buttons.map(([tab,icon,label])=>`<button type="button" data-screen="${tab}" data-phone="${id}" ${current.tab===tab?'aria-current="page"':''}><i aria-hidden="true">${icon}</i>${label}</button>`).join('')}</nav><div class="home-bar" aria-hidden="true"></div></div></div></article>`;
}
const phoneList = document.getElementById('phones');
function render(id = null) {
  if (id) {
    const previous = phoneList.querySelector(`[data-device="${id}"]`);
    const priorScreen = previous?.querySelector('.dock button[aria-current="page"]')?.dataset.screen;
    const position = priorScreen === state.phones[id].tab ? previous?.querySelector('.screen-scroll')?.scrollTop || 0 : 0;
    if (previous) previous.outerHTML = phoneMarkup(variants.find((v)=>v.id===id));
    const scroller = phoneList.querySelector(`[data-device="${id}"] .screen-scroll`);
    if (scroller) scroller.scrollTop = position;
  } else {
    const horizontal = phoneList.scrollLeft;
    phoneList.innerHTML = variants.map(phoneMarkup).join('');
    phoneList.scrollLeft = horizontal;
  }
  const reveal = document.getElementById('reveal-event');
  reveal.disabled = state.discovered;
  reveal.textContent = state.discovered ? 'Проход осмотрен' : 'Осмотреть проход';
}
phoneList.addEventListener('click',(event)=>{
  const button = event.target.closest('[data-phone]');
  if (!button) return;
  const id = button.dataset.phone;
  if (button.dataset.event) {
    state.phones[id].selected = button.dataset.event;
    state.phones[id].zone = zoneFor(eventData.find((e)=>e.id===button.dataset.event).row);
  } else if (button.dataset.zone !== undefined) state.phones[id].zone = Number(button.dataset.zone);
  else if (button.dataset.screen) state.phones[id].tab = button.dataset.screen;
  render(id);
});
document.getElementById('service-class').addEventListener('change',(event)=>{
  if (!Object.hasOwn(layouts,event.target.value)) return;
  state.serviceClass = event.target.value;
  render();
});
document.getElementById('reveal-event').addEventListener('click',()=>{
  state.discovered = true;
  for (const p of Object.values(state.phones)) if (p.tab==='map') {
    p.selected='bag';
    p.zone=zoneFor(eventData[2].row);
  }
  render();
});
render();
