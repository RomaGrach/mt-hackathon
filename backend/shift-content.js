import { SEAT_DIALOGUE } from './seat-dialogue.js';
import { createHash } from 'node:crypto';

// These are design facts read from the supplied dataset, not operating regulations.
const source = 'materials/Датасет.zip!/photo_2026-09-20_15-09-56.jpg#slide-10';
export const LEGACY_SHIFT_CONTENT = {
  id: 'text-shift-demo',
  version: 'shift-content-1',
  engineVersion: 'shift-2',
  rulesVersion: 'demo-rubric-1',
  gamificationVersion: 'gamification-1',
  creditFamilyId: 'text-shift-demo',
  title: 'Одна смена — несколько дел',
  reviewStatus: 'synthetic-requires-methodologist',
  maxSteps: 16,
  initialScales: { loyalty: 70, safety: 75 },
  thresholds: { loyalty: 55, safety: 65 },
  timingPolicies: { standard: 20000, extended: 200000, untimed: null },
  rubric: [
    { id: 'predeparture', competency: 'protocol', label: 'Проверка готовности', mandatory: true },
    { id: 'early-discovery', competency: 'protocol', label: 'Самостоятельное раннее обнаружение' },
    {
      id: 'verify-documents',
      competency: 'protocol',
      label: 'Проверка сведений перед передачей',
      mandatory: true,
    },
    { id: 'acknowledge-person', competency: 'empathy', label: 'Признание обращения' },
    { id: 'confirmed-handoff', competency: 'teamwork', label: 'Подтверждённая передача' },
    {
      id: 'return-to-person',
      competency: 'teamwork',
      label: 'Адресный возврат к пассажиру',
      mandatory: true,
    },
    { id: 'timely-safety', competency: 'speed', label: 'Своевременный безопасный исход' },
  ],
  policies: {
    standard: {
      id: 'standard-layout-1',
      label: 'Стандарт',
      source,
      fact: 'Компоновка 3 + 2; бистро предусмотрено в одном из вагонов, не в каждом.',
      check: 'Сверить ряд 3 + 2 и расположение бистро по схеме состава',
      mismatch: 'В памятке указаны два кресла с каждой стороны и бистро в каждом вагоне.',
      correction: 'Исправить схему на 3 + 2 и уточнить вагон бистро',
      ruleId: 'standard-layout-and-bistro',
      actionId: 'correct-standard-card',
    },
    comfort: {
      id: 'comfort-layout-1',
      label: 'Комфорт',
      source,
      fact: 'Компоновка 2 + 2; игровая комната предусмотрена в одном из вагонов, не в каждом.',
      check: 'Сверить ряд 2 + 2 и расположение игровой комнаты по схеме состава',
      mismatch: 'В памятке игровая комната обещана в каждом вагоне комфорт-класса.',
      correction: 'Уточнить расположение игровой комнаты, не обещая её в этом вагоне',
      ruleId: 'comfort-playroom-location',
      actionId: 'correct-comfort-card',
    },
    business: {
      id: 'business-layout-1',
      label: 'Бизнес',
      source,
      fact: 'Компоновка 2 + 2; в проектной схеме шаг между креслами 980 мм.',
      check: 'Сверить схему 2 + 2 и карточку посадочных мест бизнес-класса',
      mismatch: 'К карточке бизнес-класса приложена схема первого класса 2 + 1.',
      correction: 'Заменить приложенную схему на бизнес-класс 2 + 2',
      ruleId: 'business-seat-plan',
      actionId: 'correct-business-card',
    },
    first: {
      id: 'first-layout-1',
      label: 'Первый',
      source,
      fact: 'Компоновка 2 + 1; в проектной схеме ширина прохода 650 мм.',
      check: 'Сверить схему 2 + 1, прежде чем объяснять пассажиру размещение',
      mismatch: 'На карточке первого класса нарисована схема 2 + 2 из бизнес-класса.',
      correction: 'Заменить карточку на схему первого класса 2 + 1',
      ruleId: 'first-seat-plan',
      actionId: 'correct-first-card',
    },
  },
  variants: {
    'blocked-aisle': {
      id: 'blocked-aisle',
      kind: 'safety',
      label: 'Размещение и проход',
      incidentId: 'b-aisle',
      title: 'Проход в салоне',
      observation: 'При осмотре замечен багаж, мешающий пассажирам пройти.',
      scene: 'Багаж занимает часть прохода. Владелец рядом, пассажиры пытаются пройти.',
      safeActions: [
        {
          id: 'clear-aisle',
          label: 'Обсудить с владельцем размещение багажа и обеспечить свободный проход',
        },
        { id: 'assist-aisle', label: 'Предложить владельцу помощь и вместе освободить проход' },
      ],
      delayedStep: 4,
      critical: true,
      source: 'docs/GAMEPLAY.md#8',
    },
    'clear-aisle-service-check': {
      id: 'clear-aisle-service-check',
      kind: 'service',
      label: 'Свободный проход и неверная памятка',
      incidentId: 'b-service',
      title: 'Памятка об обслуживании',
      observation:
        'Проход свободен. При проверке салонной памятки обнаружено расхождение со схемой класса.',
      scene:
        'Пассажир собирается воспользоваться сведениями из памятки. Их нужно сверить с проверенной схемой.',
      safeActions: [],
      delayedStep: 4,
      critical: false,
      source,
    },
  },
  localGraphs: {
    a: {
      'a-listen': ['a-verify'],
      'a-verify': ['a-await'],
      'a-await': ['a-return'],
      'a-return': [],
    },
    b: { 'b-observe': ['b-critical'], 'b-critical': [] },
  },
  effects: {
    acknowledge: 5,
    earlyDiscovery: 5,
    safeResolution: 10,
    escalation: -10,
    unsafeDeferral: -30,
    timeout: -25,
    return: 10,
    promiseBreach: -15,
  },
  debrief: {
    'inspect-predeparture': {
      why: 'Ранняя сверка даёт проверенные сведения о классе для последующего обращения. Это обязательный этап приёмки.',
      alternative:
        'Без приёмки позднее понадобится отдельная проверка; она не отменит пропуск начального этапа.',
    },
    'skip-predeparture': {
      why: 'Приёмка пропущена. Поздняя сверка позволит продолжить работу, но обязательный критерий этой смены останется невыполненным.',
      alternative:
        'Сначала сверить карточку класса с проектной схемой, затем перейти к обращениям.',
    },
    'acknowledge-and-promise': {
      why: 'Признано обращение конкретного человека. Обещание создало адресную задачу с рабочим сроком, а не завершило инцидент.',
      alternative:
        'Уточнить обращение без обещания срока; после проверки всё равно сообщить результат тому же пассажиру.',
    },
    acknowledge: {
      why: 'Обращение принято без неподтверждённого обещания срока. Адресный ответ остаётся обязательным.',
      alternative:
        'Обещать возврат можно, когда вы готовы учитывать его срок вместе с другими делами.',
    },
    'verify-service-info': {
      why: 'Сведения теперь проверены, поэтому стала возможна содержательная передача. Это дополнительное действие после пропущенной приёмки.',
      alternative: 'Проверка при приёмке избавила бы от отдельного действия в этой части смены.',
    },
    'verify-and-request': {
      why: 'Коллеге переданы проверенные сведения. Отправка запроса, подтверждение получения и исполнение — три разных факта.',
      alternative:
        'Пока ожидаете подтверждения, осмотреть салон; не сообщать пассажиру об исполнении до проверки.',
    },
    'resolve-without-verification': {
      why: 'Разговор закончился без подтверждённого размещения. Инцидент не получил безопасного проверенного решения.',
      alternative:
        'Сверить сведения, дождаться подтверждённого исполнения и вернуться к заявителю.',
    },
    'confirm-and-return-p1': {
      why: 'Исполнение проверено, ответ получил именно пассажир у места 18. Если срок ранее пропущен, завершение закрывает задачу, но не стирает задержку.',
      alternative: 'Ответ другому пассажиру не заменяет возврат к адресату обещания.',
    },
    'confirm-and-return-p2': {
      why: 'Сведения сообщены соседу. Адресат у места 18 продолжает ждать, поэтому его задача остаётся открытой.',
      alternative: 'Вернуться к пассажиру у места 18 после проверки исполнения.',
    },
    inspect: {
      why: 'Осмотр открывает наблюдаемый факт. Раннее обнаружение засчитывается один раз; повторение уже известного не создаёт нового учебного свидетельства.',
      alternative:
        'Без осмотра проблема обнаружится позже через внешнее событие; её срочность и последствия могут измениться.',
    },
    wait: {
      why: 'Ожидание расходует рабочий шаг. За этот шаг может прийти ответ коллеги, измениться другой инцидент или наступить срок задачи.',
      alternative:
        'Если есть ещё неизвестные обстоятельства, осмотр вместо ожидания может дать полезную информацию.',
    },
    'clear-aisle': {
      why: 'Состояние прохода исправлено и проверено. Раннее решение предотвращает запланированное ухудшение; позднее безопасное решение не отменяет уже произошедшее ухудшение.',
      alternative:
        'Предложить владельцу помощь и вместе освободить проход — другой допустимый путь.',
    },
    'assist-aisle': {
      why: 'Помощь владельцу привела к тому же проверенному безопасному состоянию прохода. Допустимы разные способы достижения результата.',
      alternative:
        'Обсудить размещение с владельцем и обеспечить свободный проход без отдельного предложения помощи.',
    },
    'defer-secondary': {
      why: 'Дело осталось открытым. Следующее рабочее действие приблизит отложенные события; переключение экрана само по себе время не расходует.',
      alternative: 'Исправить обнаруженное состояние до того, как ситуация станет срочной.',
    },
    'unsafe-deferral': {
      why: 'В критической ситуации проход оставлен без изменения. Эта ошибка запрещает зачёт независимо от успешных разговоров или учебного XP.',
      alternative: 'Обеспечить свободный проход одним из предложенных безопасных действий.',
    },
    _timeout: {
      why: 'Срок истёк до принятия действия сервером. Поздний выбор не выполняется; повторное чтение результата не дублирует штраф.',
      alternative:
        'В новой тренировке раньше осмотреть салон или начать с расширенного времени, чтобы отработать решение.',
    },
    'correct-standard-card': {
      why: 'Исправлены два проверяемых факта: схема стандарт-класса 3 + 2 и бистро только в одном вагоне состава.',
      alternative: 'Не обещать бистро в каждом вагоне на основании неверной памятки.',
    },
    'correct-comfort-card': {
      why: 'Местоположение игровой комнаты уточнено по проектной схеме, а не обещано для каждого вагона комфорт-класса.',
      alternative:
        'Не превращать наличие игровой комнаты в одном вагоне в обещание для всех вагонов.',
    },
    'correct-business-card': {
      why: 'К бизнес-классу применена его схема 2 + 2, а не схема первого класса.',
      alternative:
        'Перед объяснением размещения проверить, к какому классу относится приложенная карточка.',
    },
    'correct-first-card': {
      why: 'Для первого класса выбрана схема 2 + 1 вместо карточки бизнес-класса 2 + 2.',
      alternative:
        'Не переносить схему одного класса на другой только из-за внешнего сходства карточек.',
    },
  },
  provenance: [
    {
      source,
      sha256: 'b8c0cdbac9016cd25ac50251b9693c3c4343f83e579f1909aaa84aa1719a6897',
      scope: 'class layout facts only',
      reviewed: '2026-09-26',
      limitation: 'Проектные слайды из датасета. Не утверждённые нормы оказания услуг.',
    },
    {
      source: 'docs/GAMEPLAY.md#8',
      scope: 'authored dialogue, transitions, rubric and numbers',
      reviewed: '2026-09-26',
      limitation: 'Учебная синтетическая модель, требует проверки перевозчиком.',
    },
  ],
};

// Keep the original publication byte-identical for pinned runs and exact replay.
export const SHIFT_CONTENT = {
  ...structuredClone(LEGACY_SHIFT_CONTENT),
  version: 'shift-content-2',
  engineVersion: 'shift-3',
  rulesVersion: 'demo-rubric-2',
  dialogue: SEAT_DIALOGUE,
  variants: {
    'blocked-aisle': {
      ...structuredClone(LEGACY_SHIFT_CONTENT.variants['blocked-aisle']),
      scene:
        'Владелец багажа: «Я только на минуту поставил сумку. На полку одному тяжело поднять». Другие пассажиры обходят её боком; проход нужно освободить.',
      safeActions: [
        {
          id: 'clear-aisle',
          label: '«Здесь должны свободно проходить люди. Давайте подберём место для сумки»',
        },
        {
          id: 'assist-aisle',
          label: '«Я помогу вам убрать сумку. Давайте освободим проход вместе»',
        },
      ],
    },
    'clear-aisle-service-check': {
      ...structuredClone(LEGACY_SHIFT_CONTENT.variants['clear-aisle-service-check']),
      scene:
        'Пассажир: «Я прочитал эту памятку, но здесь всё выглядит иначе. Ей можно верить?» Вы можете сами сверить сведения и объяснить расхождение.',
    },
  },
  rubric: LEGACY_SHIFT_CONTENT.rubric.map((r) =>
    r.id === 'verify-documents' ? { ...r, label: 'Проверка сведений перед решением' } : r
  ),
  localGraphs: {
    a: {
      'a-listen': ['a-verify'],
      'a-verify': ['a-concern', 'a-options', 'a-await'],
      'a-concern': ['a-options', 'a-await'],
      'a-options': ['a-confirm', 'a-await'],
      'a-confirm': [],
      'a-await': ['a-return'],
      'a-return': [],
    },
    b: structuredClone(LEGACY_SHIFT_CONTENT.localGraphs.b),
  },
  debrief: { ...LEGACY_SHIFT_CONTENT.debrief, ...SEAT_DIALOGUE.debrief },
};

export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical(value[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export const contentHash = (document) =>
  createHash('sha256').update(canonical(document)).digest('hex');
export function validateShiftContent(c) {
  const errors = [];
  const check = (ok, text) => {
    if (!ok) errors.push(text);
  };
  const template = c?.engineVersion === 'shift-3' ? SHIFT_CONTENT : LEGACY_SHIFT_CONTENT;
  check(['shift-2', 'shift-3'].includes(c?.engineVersion), 'Unsupported engine');
  check(
    c?.engineVersion === 'shift-3'
      ? canonical(c.dialogue) === canonical(SEAT_DIALOGUE)
      : !c?.dialogue,
    'Unsupported dialogue controller'
  );
  for (const key of ['id', 'version', 'rulesVersion', 'creditFamilyId', 'gamificationVersion'])
    check(typeof c?.[key] === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(c[key]), 'Invalid ' + key);
  check(c?.maxSteps === 16, 'The published shift-2 controller supports 16 work steps');
  check(
    c?.reviewStatus === 'synthetic-requires-methodologist',
    'Only explicitly synthetic publication is supported'
  );
  check(
    Array.isArray(c?.provenance) &&
      c.provenance.length >= 2 &&
      c.provenance.every((p) => p.source && p.limitation),
    'Missing provenance'
  );
  check(
    c?.timingPolicies?.standard === 20000 &&
      c?.timingPolicies?.extended === 200000 &&
      c?.timingPolicies?.untimed === null,
    'Invalid timing policy'
  );
  check(
    c?.debrief &&
      Object.keys(template.debrief).every((id) => c.debrief[id]?.why && c.debrief[id]?.alternative),
    'Incomplete causal debrief'
  );
  check(
    c?.localGraphs && canonical(c.localGraphs) === canonical(template.localGraphs),
    'Unsupported scene graph: publish a new engine for different transitions'
  );
  const ids = (c?.rubric || []).map((r) => r.id);
  check(
    ids.length === 7 &&
      new Set(ids).size === 7 &&
      SHIFT_CONTENT.rubric.every((r) => ids.includes(r.id)),
    'Invalid rubric'
  );
  check(
    (c?.rubric || []).every(
      (r) => ['protocol', 'empathy', 'teamwork', 'speed'].includes(r.competency) && r.label
    ),
    'Invalid criterion'
  );
  for (const k of ['standard', 'comfort', 'business', 'first']) {
    const p = c?.policies?.[k];
    check(
      p?.source &&
        p.fact &&
        p.check &&
        p.mismatch &&
        p.correction &&
        p.ruleId &&
        p.actionId === 'correct-' + k + '-card',
      'Missing substantive policy: ' + k
    );
  }
  check(
    new Set(Object.values(c?.policies || {}).map((p) => p.ruleId)).size === 4,
    'Class policies must differ'
  );
  const variants = Object.values(c?.variants || {});
  check(variants.length === 2, 'Exactly two authored variants required');
  for (const v of variants) {
    check(v.delayedStep === 4 && v.delayedStep < c.maxSteps && v.source, 'Invalid scheduled event');
    check(
      ['safety', 'service'].includes(v.kind) && v.critical === (v.kind === 'safety'),
      'Unsupported incident controller'
    );
    if (v.critical)
      check(
        v.safeActions?.length >= 1 &&
          v.safeActions.every((a) => ['clear-aisle', 'assist-aisle'].includes(a.id)),
        'No supported safe alternative'
      );
  }
  check(
    variants.some((v) => v.id === 'blocked-aisle' && v.kind === 'safety') &&
      variants.some((v) => v.id === 'clear-aisle-service-check' && v.kind === 'service'),
    'Invalid variant set'
  );
  for (const graph of Object.values(c?.localGraphs || {})) {
    const visit = (id, stack = new Set()) => {
      if (stack.has(id)) {
        errors.push('Local scene cycle: ' + id);
        return;
      }
      if (!Object.hasOwn(graph, id)) {
        errors.push('Missing scene: ' + id);
        return;
      }
      for (const next of graph[id]) visit(next, new Set([...stack, id]));
    };
    for (const id of Object.keys(graph)) visit(id);
  }
  for (const [key, value] of Object.entries(c?.effects || {}))
    check(
      Number.isInteger(value) &&
        Math.abs(value) <= 100 &&
        Object.hasOwn(SHIFT_CONTENT.effects, key),
      'Invalid effect'
    );
  check(
    Object.keys(c?.effects || {}).length === Object.keys(SHIFT_CONTENT.effects).length,
    'Missing effects'
  );
  for (const values of [c?.initialScales, c?.thresholds])
    check(
      values &&
        ['loyalty', 'safety'].every(
          (k) => Number.isInteger(values[k]) && values[k] >= 0 && values[k] <= 100
        ),
      'Invalid scales'
    );
  return errors;
}
export function comparisonManifest(
  c,
  serviceClass = 'standard',
  variantId = 'blocked-aisle',
  timingPolicyId = 'standard'
) {
  return {
    scenarioId: c.id,
    contentVersion: c.version,
    rulesVersion: c.rulesVersion,
    engineVersion: c.engineVersion,
    gamificationVersion: c.gamificationVersion,
    variantId,
    servicePolicyId: c.policies[serviceClass].id,
    timingPolicy: { id: timingPolicyId, durationMs: c.timingPolicies[timingPolicyId] },
    contentHash: contentHash(c),
  };
}
