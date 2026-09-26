# API 2.1 — общая инфраструктура и модули v1

Полноценная смена v2 реализована: [новые методы, ответы и семантика](API-V2.md). Ниже сохранён контракт прежних модулей и общей сессии; points v1 не следует складывать с XP/СП v2.

Базовый путь — `/api` на origin приложения. Полный список методов и входных схем — [OpenAPI](openapi.json), также доступный по `GET /api/openapi.json`. Этот Markdown описывает ответы и смысл операций. JSON пересоздаётся командой `node scripts/generate-openapi.mjs`.

## Доступ и транспорт

Браузерная сессия создаётся `POST /api/session`. Сервер устанавливает HttpOnly-cookie `reis_session` с SameSite=Strict и сроком 7 дней; токен не возвращается в JSON и в БД хранится только его хеш. Демо не принимает ФИО, телефон, почту или пароль. После выхода/истечения сессии нет восстановления старого профиля; это не SSO.

Для POST/PATCH/DELETE требуются `Content-Type: application/json` и `X-Reis-Client: web`. Межсайтовые запросы запрещены. Origin сверяется с PUBLIC_ORIGIN либо локальным HTTP host. Размер тела — до 16 КиБ; неизвестные поля отклоняются. Общий лимит — 240 API-запросов в минуту на IP, регистрация — 15 профилей в час на IP; на общий прокси распространяются [ограничения](LIMITATIONS.md).

Интеграционные GET используют `Authorization: Bearer <HR_API_KEY>` вместо cookie. Ключ не короче 32 символов задаётся только на сервере. Без ключа эти маршруты отвечают 503. Доступ только для чтения. Это рабочий контракт экспорта, **не установленная связь с реальными HR, LMS или биллингом**.

## Методы

| Метод и путь | Запрос | Ответ |
|---|---|---|
| GET /health | — | status, version, storage |
| POST /session | {crew?} | 201 новый или 200 существующий bootstrap; Set-Cookie |
| GET /bootstrap | — | profile, catalog, crews, achievements, challenge, activeRun, notices, serverNow, mode |
| PATCH /profile | {crew} | Обновлённый профиль; депо определяется бригадой |
| DELETE /profile | {confirm:true} | {deleted:true}; каскадное удаление своих данных |
| GET /profile/export | — | exportedAt, profile, results, events; без сессий/ключей |
| POST /logout | {} | {loggedOut:true}; удаление текущей сессии |
| GET /leaderboard?scope=crew | scope: crew/depot/company | scope, group, total, scenarioCount, myRank, rows |
| POST /notices/read | {ids:[...]} | До 100 собственных уведомлений с отметками readAt |
| POST /runs | {scenarioId, practice?, requestId} | 201 Run; только одна активная попытка на профиль |
| GET /runs/{id} | — | Run после проверки дедлайна |
| POST /runs/{id}/decision | {optionId, revision, requestId} | Run после единственного решения |
| POST /runs/{id}/continue | {revision, requestId} | Следующая сцена или финал |
| POST /runs/{id}/abort | {revision, requestId} | Незачётный финал с сохранением журнала |
| POST /runs/{id}/replay | {index, requestId} | 201 новая практика с восстановленным префиксом решений |
| GET /integrations/v1/results | cursor?, limit? | items, nextCursor, hasMore |
| GET /integrations/v1/profiles | cursor?, limit? | items, nextCursor, hasMore |

Учебные бригады: `msk-1`, `msk-2`, `spb-1`, `spb-2`. ID сценариев: `conflict`, `medical`, `delay`, `service`, `baggage`. index при переигрывании начинается с нуля. practice по умолчанию false.

## Run и результат

Run содержит `id, scenarioId, scenarioVersion, nodeId, phase, revision, finished, practice, startedAt, enteredAt, deadline, serverNow`; текущие `loyalty, safety, points, competencies, resources, criticalError, history`; видимую `node`, метаданные `scenario` и `result` (null до завершения).

node содержит kind, speaker, label, text, prompt, timer и options. У варианта есть id, title, description, available и requirement. Не отправляются условия скрытых переходов, recommended и таблица начисления баллов будущих действий. Недоступный вариант нельзя выбрать простым ручным HTTP-запросом.

Фазы: decision — выбор; feedback — чтение последствия без следующего активного таймера; result — итог. deadline/serverNow/at/startedAt — Unix-миллисекунды. completedAt в результате — ISO 8601. Если время истекло, сервер выбирает timeout независимо от присланного обычного optionId. Ранний optionId:null отклоняется.

result содержит scenarioId, scenarioVersion, title, points, loyalty, safety, criticalError, passed, grade, practice, competencies, history, ending и completedAt. В history для каждого решения записаны nodeId, scene, choiceId, title, feedback, timedOut, critical, responseMs, timed, at, before, after, impact, earned, possible и alternative. impact показывает фактическое изменение ограниченных шкал; alternative объясняет более удачный доступный выбор, когда он отличается от сделанного.

Завершённый результат записывается при входе в концовку, а не при открытии страницы разбора. Поэтому закрытие вкладки на финальном экране не теряет награду. Непросмотренный финальный feedback всё ещё нужно закрыть continue перед новой попыткой.

## Профиль, рейтинг, аналитика

Профиль: id, name (синтетический псевдоним), crew, depot, company, createdAt, totalPoints, completed, best, level, levelProgress, nextLevelAt, achievements, bonuses, seasonPoints, competencies, analytics, history. История интерфейса ограничена последними 20 результатами; собственный экспорт содержит все сохранённые итоги.

Постоянные points — сумма лучших успешных непрactice-прохождений по scenarioId, в том числе из предыдущих версий. Уровень: `1 + floor(totalPoints / 300)`. Практика и незачёт остаются в истории, но не повышают рейтинг. ties сортируются по числу освоенных модулей, затем времени создания профиля и id; равные очки не изображаются как различие компетентности.

Рейтинг содержит до 50 строк: name, crew, depot, score, completed, rank, me. myRank вычисляется по всей выбранной группе. Сезонные бонусы в этот рейтинг не входят.

analytics показывает skills: key/earned/possible/decisions/percent/advice; attempts, practiceAttempts, sampleSize, timeouts, timedDecisions, averageReactionSeconds, criticalAttempts, recommended и trend. Выборка — последние 10 обычных попыток, включая незачёты; свободная практика отдельно. Нет наблюдений — percent:null, а не выдуманная оценка 0. Это учебная рубрика, не валидированный психометрический тест.

Недельное окно начинается в понедельник 00:00 UTC. Два разных зачтённых сценария дают 100 сезонных бонусов один раз за неделю. Приветственные 25 бонусов действуют сутки. Истёкшие бонусы перестают входить в seasonPoints; постоянные очки не сгорают. Уведомления — внутриигровые, не push/email.

## Надёжность команд

requestId: 8–64 символа из букв, цифр и дефиса; удобно UUID. При сетевой ошибке повторяйте **тот же body и requestId**, а не создавайте новую команду. Ответ сохраняется атомарно вместе с переходом. Другой body с тем же ключом — KEY_REUSED. Устаревшая revision — STALE_REVISION; получите свежий Run.

Receipt хранится 7 дней. Не используйте старые ключи после этого окна. Последовательность действий и единственный результат защищаются также revision/phase/уникальным run_id. В браузерном клиенте автоматический сетевой повтор использует исходное тело.

## Минимальный пример

Команды ниже — для bash. На Windows используйте curl.exe с соответствующим экранированием либо PowerShell Invoke-RestMethod.

```sh
curl -c cookies.txt -H 'Content-Type: application/json' -H 'X-Reis-Client: web' \
  -d '{"crew":"msk-1"}' http://127.0.0.1:3000/api/session
curl -b cookies.txt -H 'Content-Type: application/json' -H 'X-Reis-Client: web' \
  -d '{"scenarioId":"conflict","practice":false,"requestId":"demo-start-0001"}' \
  http://127.0.0.1:3000/api/runs
```

Возьмите id попытки, revision и id доступного варианта из ответа; передайте их в /runs/{id}/decision. Затем /continue. Не отправляйте points, safety или loyalty — сервер их отклонит как лишние поля. Файл cookies.txt содержит токен: не добавляйте его в Git.

## Интеграционные выгрузки

```sh
curl -H "Authorization: Bearer $HR_API_KEY" \
  'http://127.0.0.1:3000/api/integrations/v1/results?cursor=0&limit=100'
```

results.items: eventId (монотонный идентификатор результата), employeeId (ID синтетического профиля), alias и поля result. Повторяемая доставка обрабатывается внешним потребителем по eventId. Передавайте возвращённый nextCursor, пока hasMore:true. Обязательно учитывайте passed и practice; не начисляйте деньги за сырые points. Удалённые профили не возвращаются; API пока не содержит tombstone-событий удаления.

profiles.items: employeeId, alias, crew, depot, totalPoints, seasonPoints, level, competencies, achievements. Курсор — строковый ID последнего профиля, limit 1–200 (по умолчанию 100). Это постраничный снимок, не поток изменений: новые UUID могут сортироваться перед старым курсором, поэтому следующую полную синхронизацию начинайте с пустого cursor. Реальные идентификаторы сотрудников, xAPI/SCORM-сертификация, платёжные операции и двусторонняя синхронизация не реализованы.

## Ошибки

Формат: `{"error":{"code":"STALE_REVISION","message":"..."}}`. 400 — некорректное поле/JSON; 401 — сессия или ключ; 403 — межсайтовый запрос; 404 — отсутствующий или чужой ресурс; 409 — активная попытка, закрытая фаза, заблокированное действие или конфликт ревизии; 413 — размер; 415 — Content-Type; 429 — лимит с Retry-After; 503 — выключенная интеграция/ёмкость. Необработанная ошибка возвращает 500 без стека и тела пользовательского запроса.
