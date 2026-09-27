// Full layouts used by the supplied wagon-vsm reference. Numbers are stable game
// addresses; the source presentation does not provide official ticket numbering.
const definitions = {
  standard: {
    label: 'Стандарт',
    sides: [3, 2],
    rowCount: 17,
    partitionAfter: 8,
    entry: ['Тамбур', 'WC', 'Багаж'],
    end: ['Багаж', 'Выход'],
    note: 'Вагон без бистро',
  },
  comfort: {
    label: 'Комфорт',
    sides: [2, 2],
    rowCount: 18,
    partitionAfter: 8,
    playRows: [4, 5],
    entry: ['Тамбур', 'WC', 'Багаж'],
    end: ['Багаж', 'Выход'],
    note: 'Вагон с игровой комнатой',
  },
  business: {
    label: 'Бизнес',
    sides: [2, 2],
    rowCount: 17,
    entry: ['Тамбур', 'Багаж'],
    end: ['WC', 'Багаж', 'Выход'],
    note: 'Единый салон',
  },
  first: {
    label: 'Первый',
    sides: [2, 1],
    rowCount: 5,
    entry: ['Кабина машиниста'],
    rooms: ['Купе', 'Переговорная'],
    end: ['Тамбур', 'WC'],
    note: 'Кресельный салон и отдельные помещения',
  },
};
function layout(id, d) {
  let n = 0;
  const rows = Array.from({ length: d.rowCount }, (_, i) => ({
    left: d.playRows?.includes(i) ? [] : Array.from({ length: d.sides[0] }, () => ++n),
    right: Array.from({ length: d.sides[1] }, () => ++n),
    play: d.playRows?.includes(i) || false,
  }));
  return { id: 'vsm-reference-1-' + id, ...d, rows, seats: n };
}
export const CARRIAGE_LAYOUTS = Object.fromEntries(
  Object.entries(definitions).map(([id, d]) => [id, layout(id, d)])
);
export function layoutSeats(layout) {
  return layout.rows.flatMap((row) => [...row.left, ...row.right]);
}
