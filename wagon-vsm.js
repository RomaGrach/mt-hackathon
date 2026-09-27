// Interactive redraw of the supplied VSM carriage plans. Seat numbering and incident positions are illustrative.
const classes = [
  {
    id: 'first', title: 'Первый класс', seating: '2 + 1', left: 2, right: 1, rows: 5,
    aisle: 650, pitch: 1200, width: 525, note: 'Кабина, отдельные помещения и салон',
    entry: 'Кабина машиниста', zone: 'Салон первого класса', end: 'Тамбур · WC',
    points: [
      { row: 1, side: 'left', label: 'Вопрос у кресла', description: 'Пассажир обращается в кресельной части вагона.' },
      { row: 3, side: 'aisle', label: 'Проверить проход', description: 'Проход рядом с креслами требует внимания.', urgent: true },
    ],
  },
  {
    id: 'business', title: 'Бизнес-класс', seating: '2 + 2', left: 2, right: 2, rows: 17,
    aisle: 520, pitch: 980, width: 480, note: 'Кресла и служебные зоны по краям',
    entry: 'Тамбур · багаж', zone: 'Салон бизнес-класса', end: 'WC · багаж · выход',
    points: [
      { row: 5, side: 'right', label: 'Вопрос о месте', description: 'Пассажир обратился в кресельной части салона.' },
      { row: 12, side: 'aisle', label: 'Багаж в проходе', description: 'В проходе замечено препятствие.', urgent: true },
    ],
  },
  {
    id: 'comfort', title: 'Комфорт-класс', seating: '2 + 2', left: 2, right: 2, rows: 18,
    aisle: 520, pitch: 930, width: 480, note: 'Вариант вагона с игровой комнатой',
    entry: 'Тамбур · WC · багаж', zone: 'Салон и игровая зона', end: 'Багаж · выход', breakAfter: 8,
    playRows: [4, 5],
    points: [
      { row: 7, side: 'right', label: 'Вопрос о размещении', description: 'Пассажир просит помочь с размещением.' },
      { row: 14, side: 'aisle', label: 'Осмотреть проход', description: 'В дальней части салона нужен осмотр прохода.', urgent: true },
    ],
  },
  {
    id: 'standard', title: 'Стандарт-класс', seating: '3 + 2', left: 3, right: 2, rows: 17,
    aisle: 520, pitch: 930, width: 480, note: 'Пассажирский вагон без бистро',
    entry: 'Тамбур · WC · багаж', zone: 'Салон класса Стандарт', end: 'Багаж · выход', breakAfter: 8,
    points: [
      { row: 5, side: 'left', label: 'Пассажир у места', description: 'Из первой части салона поступило обращение.' },
      { row: 13, side: 'aisle', label: 'Занят проход', description: 'В дальней части салона нужно освободить проход.', urgent: true },
    ],
  },
];

function marker(point, index) {
  return `<button type="button" class="marker ${point.urgent ? 'urgent' : ''}" data-point="${index}" aria-label="${point.label}" aria-pressed="${index === 0}">${point.urgent ? '!' : '1'}</button>`;
}

function row(item, rowIndex) {
  const pointIndex = item.points.findIndex((point) => point.row === rowIndex);
  const point = item.points[pointIndex];
  const seat = (side, index, count) => {
    const marked = point && point.side === side && index === count - 1;
    return `<span class="seat ${item.id === 'first' ? 'first-seat' : ''}" aria-label="Кресло, ${side === 'left' ? 'левая' : 'правая'} сторона${marked ? ', событие: ' + point.label : ''}">${marked ? marker(point, pointIndex) : ''}</span>`;
  };
  const left = item.playRows?.includes(rowIndex)
    ? `<span class="play-area">${rowIndex === item.playRows[0] ? 'Игровая' : 'комната'}</span>`
    : Array.from({ length: item.left }, (_, i) => seat('left', i, item.left)).join('');
  const right = Array.from({ length: item.right }, (_, i) => seat('right', i, item.right)).join('');
  const aisle = point?.side === 'aisle' ? marker(point, pointIndex) : '·';
  return `<div class="seat-row" style="--left:${item.left};--right:${item.right}" aria-label="Группа кресел ${rowIndex + 1}">${left}<span class="aisle">${aisle}</span>${right}</div>`;
}

function map(item) {
  const first = item.id === 'first';
  const privateAreas = first ? '<div class="private-areas"><span>Купе<small>отдельная зона</small></span><span>Переговорная<small>отдельная зона</small></span></div>' : '';
  const rows = Array.from({ length: item.rows }, (_, index) =>
    `${item.breakAfter === index ? '<div class="zone-label"><span>Перегородка</span><span>Продолжение салона</span></div>' : ''}${row(item, index)}`
  ).join('');
  return `<div class="wagon ${item.id}" aria-label="Схема вагона ${item.title.toLowerCase()}"><div class="wagon-entry ${first ? 'first' : ''}">${item.entry}</div>${privateAreas}<div class="zone-label"><span>${item.zone}</span><span>${item.seating}</span></div>${rows}<div class="wagon-end">${item.end}</div></div>`;
}

function phone(item) {
  const active = item.points[0];
  return `<article class="concept" data-class="${item.id}"><div class="concept-head"><div><h2>${item.title}</h2><small>${item.note}</small></div><span class="class-tag">${item.seating}</span></div><div class="phone"><div class="screen"><div class="notch" aria-hidden="true"></div><div class="status"><span>9:41</span><span aria-hidden="true">◂◂ ▰</span></div><div class="hud"><div class="time"><small>Смена</small><b>08:07</b></div><div class="meters"><div class="meter"><span>Лояльность</span><i class="bar"></i><b>78</b></div><div class="meter safety"><span>Безопасность</span><i class="bar"></i><b>82</b></div></div></div><div class="screen-title"><strong>Вагон · ${item.title}</strong><span>${item.seating}</span></div><div class="map-viewport ${item.id === 'first' ? 'centered' : ''}">${map(item)}</div><div class="details" aria-live="polite"><strong>${active.label}</strong><p>${active.description}</p><p class="spec">Проход ${item.aisle} мм · шаг ${item.pitch} мм · кресло ${item.width} мм</p></div><nav class="dock" aria-label="Разделы игрового экрана"><span><b>◉</b>Ситуация</span><span class="selected"><b>▦</b>Вагон</span><span><b>☑</b>Задачи</span></nav><div class="home" aria-hidden="true"></div></div></div></article>`;
}

const phones = document.getElementById('phones');
phones.innerHTML = classes.map(phone).join('');
phones.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-point]');
  if (!button) return;
  const article = button.closest('[data-class]');
  const item = classes.find((entry) => entry.id === article.dataset.class);
  const point = item?.points[Number(button.dataset.point)];
  if (!point) return;
  for (const pin of article.querySelectorAll('button[data-point]')) pin.setAttribute('aria-pressed', String(pin === button));
  article.querySelector('.details strong').textContent = point.label;
  article.querySelector('.details p').textContent = point.description;
});
