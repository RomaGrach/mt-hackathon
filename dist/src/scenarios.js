export const scenarios = [
  {
    id: 'conflict', number: '01', category: 'Коммуникация', title: 'Спор в вагоне',
    summary: 'Два пассажира спорят из-за места. Голоса становятся громче, соседи снимают происходящее.',
    duration: '3 мин', difficulty: 'Базовый', accent: 'violet', icon: '◇',
    skills: ['Эмпатия', 'Деэскалация'], version: 'demo-1', start: 'start',
    nodes: {
      start: {
        kind: 'decision', speaker: 'Пассажир', label: 'Вагон 04 · место 18',
        text: '«Это моё место! Почему я должен куда-то пересаживаться?» Второй пассажир перебивает его. Остальные ждут вашей реакции.',
        prompt: 'Как вы начнёте разговор?',
        options: [
          { id: 'listen', recommended: true, title: 'Выслушать обоих по очереди', description: 'Представиться, снизить тон разговора и уточнить билеты.', next: 'calm', impact: { loyalty: 12, safety: 5, points: 120 }, competencies: { empathy: 1, protocol: 1 }, feedback: 'Вы взяли разговор под контроль, не обесценив ни одного пассажира.' },
          { id: 'order', title: 'Сразу проверить билеты', description: 'Попросить документы без обсуждения претензий.', next: 'formal', impact: { loyalty: -6, safety: 4, points: 60 }, competencies: { protocol: 1 }, feedback: 'Проверка помогает установить факты, но напряжение в вагоне сохраняется.' },
          { id: 'dismiss', title: 'Попросить спорить тише и уйти', description: 'Дать пассажирам разобраться самостоятельно.', next: 'escalated', impact: { loyalty: -18, safety: -12, points: 0 }, competencies: {}, feedback: 'Без посредника спор усиливается, соседи чувствуют себя небезопасно.' }
        ]
      },
      calm: {
        kind: 'decision', speaker: 'Ситуация', label: 'Две минуты спустя',
        text: 'В билетах указаны одинаковые места: один билет оформлен на другой рейс. Пассажир с ошибкой выглядит растерянным.',
        prompt: 'Что сделаете дальше?', timer: 20,
        options: [
          { id: 'resolve', recommended: true, title: 'Предложить проверенный вариант', description: 'Уточнить доступные места через экипаж и объяснить следующий шаг.', next: 'great', impact: { loyalty: 10, safety: 7, points: 140 }, competencies: { empathy: 1, protocol: 1, speed: 1 }, feedback: 'Оба пассажира понимают план; конфликт завершается спокойно.' },
          { id: 'move', title: 'Самостоятельно назначить новое место', description: 'Обещать пересадку без проверки возможности.', next: 'mixed', impact: { loyalty: 0, safety: -8, points: 35 }, competencies: {}, feedback: 'Быстрое обещание может затронуть место другого пассажира.' }
        ],
        timeout: { id: 'timeout', title: 'Время вышло', next: 'mixed', impact: { loyalty: -10, safety: -5, points: 0 }, competencies: {}, feedback: 'Пауза без объяснения возвращает напряжение.' }
      },
      formal: {
        kind: 'decision', speaker: 'Пассажир', label: 'Вагон 04',
        text: '«Вы даже не слушаете нас!» — говорит пассажир. Проверка выявила ошибку в рейсе, но доверие уже снизилось.',
        prompt: 'Как восстановите контакт?',
        options: [
          { id: 'apologize', recommended: true, title: 'Признать неудобство и объяснить план', description: 'Спокойно показать факты и согласовать решение с экипажем.', next: 'good', impact: { loyalty: 12, safety: 6, points: 110 }, competencies: { empathy: 1, protocol: 1 }, feedback: 'Чёткое объяснение помогает вернуть доверие.' },
          { id: 'insist', title: 'Повторить требование пересесть', description: 'Сослаться только на билет и закончить разговор.', next: 'mixed', impact: { loyalty: -13, safety: -3, points: 10 }, competencies: {}, feedback: 'Формально верное требование оставляет конфликт нерешённым.' }
        ]
      },
      escalated: {
        kind: 'decision', speaker: 'Ситуация', label: 'Напряжение растёт',
        text: 'Один пассажир встаёт и перекрывает проход. Другие просят вмешаться.',
        prompt: 'Ваше решение сейчас?', timer: 15,
        options: [
          { id: 'support', recommended: true, title: 'Позвать старшего и развести разговор', description: 'Обеспечить свободный проход, продолжить диалог с поддержкой.', next: 'mixed', impact: { loyalty: 2, safety: 14, points: 85 }, competencies: { protocol: 1, speed: 1 }, feedback: 'Вы остановили развитие конфликта и восстановили проход.' },
          { id: 'threaten', critical: true, title: 'Пригрозить обоим санкциями', description: 'Попытаться остановить спор давлением.', next: 'bad', impact: { loyalty: -25, safety: -20, points: 0 }, competencies: {}, feedback: 'Давление усиливает агрессию и ухудшает обстановку.' }
        ],
        timeout: { id: 'timeout', title: 'Время вышло', next: 'bad', impact: { loyalty: -16, safety: -15, points: 0 }, competencies: {}, feedback: 'Проход остаётся заблокированным, обстановка ухудшается.' }
      },
      great: { kind: 'ending', title: 'Конфликт разрешён', text: 'Пассажиры получили понятное решение, поездка продолжается спокойно.' },
      good: { kind: 'ending', title: 'Доверие восстановлено', text: 'Вы нашли решение и вернули разговор в конструктивное русло.' },
      mixed: { kind: 'ending', title: 'Ситуация стабилизирована', text: 'Остроту удалось снять, но пассажирам потребовалось больше внимания.' },
      bad: { kind: 'ending', title: 'Конфликт усилился', text: 'Ситуация требует вмешательства старшего сотрудника и разбора действий.' }
    }
  },
  {
    id: 'medical', number: '02', category: 'Безопасность', title: 'Пассажиру стало плохо',
    summary: 'На ходу пассажир жалуется на резкую слабость. Рядом обеспокоены попутчики.',
    duration: '3 мин', difficulty: 'Срочный', accent: 'coral', icon: '+',
    skills: ['Бдительность', 'Протокол'], version: 'demo-1', start: 'start',
    nodes: {
      start: {
        kind: 'decision', speaker: 'Пассажир', label: 'Вагон 07 · место 12',
        text: '«Мне очень плохо…» Пассажир бледен и с трудом отвечает. Люди рядом смотрят на вас.',
        prompt: 'Что сделаете в первую очередь?', timer: 20,
        options: [
          { id: 'call', recommended: true, title: 'Немедленно вызвать помощь по регламенту', description: 'Сообщить экипажу и организовать обращение за медицинской помощью.', next: 'support', impact: { loyalty: 8, safety: 15, points: 140 }, competencies: { protocol: 1, speed: 1 }, feedback: 'Вы быстро подключили нужных людей и не оставили пассажира без внимания.' },
          { id: 'ask', title: 'Уточнить самочувствие и вызвать помощь', description: 'Кратко оценить ситуацию и сразу сообщить экипажу.', next: 'support', impact: { loyalty: 10, safety: 9, points: 110 }, competencies: { empathy: 1, protocol: 1 }, feedback: 'Вы проявили участие и организовали помощь.' },
          { id: 'wait', critical: true, title: 'Подождать: возможно, пройдёт само', description: 'Вернуться к пассажиру позже.', next: 'delay', impact: { loyalty: -18, safety: -25, points: 0 }, competencies: {}, feedback: 'Промедление в такой ситуации повышает риск.' }
        ],
        timeout: { id: 'timeout', critical: true, title: 'Время вышло', next: 'delay', impact: { loyalty: -15, safety: -25, points: 0 }, competencies: {}, feedback: 'Помощь не вызвана вовремя.' }
      },
      support: {
        kind: 'decision', speaker: 'Ситуация', label: 'Помощь организована',
        text: 'Экипаж уведомлён. Попутчики задают вопросы и собираются вокруг пассажира.',
        prompt: 'Как действовать до прибытия помощи?', timer: 20,
        options: [
          { id: 'space', recommended: true, title: 'Освободить пространство и наблюдать', description: 'Сохранять контакт с пассажиром и следовать указаниям специалистов.', next: 'great', impact: { loyalty: 8, safety: 10, points: 130 }, competencies: { empathy: 1, protocol: 1 }, feedback: 'Вы обеспечили доступ к пассажиру и передали ситуацию специалистам.' },
          { id: 'crowd', title: 'Попросить соседей решить, что делать', description: 'Отойти, чтобы не мешать.', next: 'mixed', impact: { loyalty: -8, safety: -12, points: 15 }, competencies: {}, feedback: 'Ответственность за организацию помощи нельзя перекладывать на окружающих.' }
        ],
        timeout: { id: 'timeout', title: 'Время вышло', next: 'mixed', impact: { loyalty: -8, safety: -10, points: 0 }, competencies: {}, feedback: 'Скопление людей затрудняет работу.' }
      },
      delay: {
        kind: 'decision', speaker: 'Ситуация', label: 'Состояние ухудшается',
        text: 'Попутчики снова зовут вас: пассажир отвечает всё слабее.',
        prompt: 'Как исправите ситуацию?', timer: 15,
        options: [
          { id: 'urgent', recommended: true, title: 'Срочно вызвать помощь и сообщить экипажу', description: 'Оставаться рядом и выполнять указания специалистов.', next: 'mixed', impact: { loyalty: 2, safety: 15, points: 70 }, competencies: { protocol: 1, speed: 1 }, feedback: 'Позднее решение всё же запускает правильную цепочку помощи.' },
          { id: 'guess', critical: true, title: 'Предложить лекарство наугад', description: 'Действовать без консультации и подтверждённого протокола.', next: 'bad', impact: { loyalty: -20, safety: -35, points: 0 }, competencies: {}, feedback: 'Самовольные действия могут навредить; нужен вызов помощи по регламенту.' }
        ],
        timeout: { id: 'timeout', critical: true, title: 'Время вышло', next: 'bad', impact: { loyalty: -15, safety: -25, points: 0 }, competencies: {}, feedback: 'Помощь вновь задержана.' }
      },
      great: { kind: 'ending', title: 'Помощь организована вовремя', text: 'Вы быстро привлекли помощь и сохранили порядок в вагоне.' },
      mixed: { kind: 'ending', title: 'Помощь оказалась рядом', text: 'Ситуация стабилизирована, но последовательность действий требует отработки.' },
      bad: { kind: 'ending', title: 'Риск вырос', text: 'Необходим разбор сценария и повторная тренировка действий по регламенту.' }
    }
  },
  {
    id: 'delay', number: '03', category: 'Сервис', title: 'Незапланированная остановка',
    summary: 'Поезд остановился вне станции. Пассажиры тревожатся, информации пока мало.',
    duration: '3 мин', difficulty: 'Средний', accent: 'mint', icon: '↗',
    skills: ['Коммуникация', 'Скорость'], version: 'demo-1', start: 'start',
    nodes: {
      start: {
        kind: 'decision', speaker: 'Ситуация', label: 'Внеплановая остановка',
        text: 'На табло нет времени прибытия. Пассажиры задают вопросы, один собирается открыть дверь.',
        prompt: 'Что сделаете?', timer: 18,
        options: [
          { id: 'coordinate', recommended: true, title: 'Сообщить проверенные факты', description: 'Связаться с экипажем, попросить оставаться на местах и обещать обновление.', next: 'controlled', impact: { loyalty: 8, safety: 12, points: 130 }, competencies: { protocol: 1, speed: 1 }, feedback: 'Пассажиры получили ясные инструкции без выдуманных сроков.' },
          { id: 'promise', title: 'Пообещать отправление через 5 минут', description: 'Успокоить людей неподтверждённым прогнозом.', next: 'uncertain', impact: { loyalty: 3, safety: -8, points: 25 }, competencies: {}, feedback: 'Краткое облегчение сменится недоверием, если срок не подтвердится.' },
          { id: 'ignore', title: 'Ждать информации молча', description: 'Не отвечать, пока нет полной картины.', next: 'uncertain', impact: { loyalty: -15, safety: -12, points: 0 }, competencies: {}, feedback: 'Информационный вакуум усиливает тревогу.' }
        ],
        timeout: { id: 'timeout', title: 'Время вышло', next: 'uncertain', impact: { loyalty: -15, safety: -12, points: 0 }, competencies: {}, feedback: 'Пассажиры остаются без информации.' }
      },
      controlled: {
        kind: 'decision', speaker: 'Пассажир', label: 'Несколько минут спустя',
        text: '«Есть новости?» Экипаж сообщает, что проверка продолжается, точного срока нет.',
        prompt: 'Как обновите сообщение?',
        options: [
          { id: 'update', recommended: true, title: 'Честно сообщить статус и время следующего обновления', description: 'Повторить правила безопасности и оставаться доступным.', next: 'great', impact: { loyalty: 12, safety: 8, points: 120 }, competencies: { empathy: 1, protocol: 1 }, feedback: 'Регулярное сообщение удерживает доверие даже без точного срока.' },
          { id: 'quiet', title: 'Сказать только «ждите»', description: 'Не объяснять, когда появятся новости.', next: 'mixed', impact: { loyalty: -10, safety: 0, points: 20 }, competencies: {}, feedback: 'Пассажиры соблюдают порядок, но чувствуют неопределённость.' }
        ]
      },
      uncertain: {
        kind: 'decision', speaker: 'Ситуация', label: 'Тревога в вагоне',
        text: 'Обещанное время прошло. У дверей собралась группа пассажиров.',
        prompt: 'Как восстановите порядок?', timer: 15,
        options: [
          { id: 'correct', recommended: true, title: 'Уточнить информацию и исправить сообщение', description: 'Признать неточный прогноз, напомнить правила и дать время обновления.', next: 'mixed', impact: { loyalty: 5, safety: 15, points: 85 }, competencies: { empathy: 1, protocol: 1 }, feedback: 'Вы вернули контроль благодаря честному обновлению.' },
          { id: 'leave', critical: true, title: 'Уйти от вопросов', description: 'Продолжить обход других вагонов.', next: 'bad', impact: { loyalty: -20, safety: -20, points: 0 }, competencies: {}, feedback: 'Тревога усиливается, риск у дверей растёт.' }
        ],
        timeout: { id: 'timeout', title: 'Время вышло', next: 'bad', impact: { loyalty: -15, safety: -20, points: 0 }, competencies: {}, feedback: 'Ситуация у дверей остаётся без внимания.' }
      },
      great: { kind: 'ending', title: 'Доверие сохранено', text: 'Пассажиры получают регулярные обновления и соблюдают инструкции.' },
      mixed: { kind: 'ending', title: 'Порядок восстановлен', text: 'Вы стабилизировали обстановку, но доверие пришлось возвращать.' },
      bad: { kind: 'ending', title: 'Тревога усилилась', text: 'Потребовалось дополнительное вмешательство экипажа.' }
    }
  }
];

export function getScenario(id) {
  return scenarios.find((scenario) => scenario.id === id) ?? null;
}
