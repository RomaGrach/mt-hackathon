# РЕЙС 400 — канонический backlog проекта

[← Главная](../README.md) · [Открытые задачи](https://github.com/RomaGrach/mt-hackathon/issues?q=is%3Aissue%20is%3Aopen) · [Исторический backlog](backlog.md)

**Статус:** прежние issues #1–#18 переведены в архив/закрыты. Действующий backlog пересобран с нуля в **10 мега-задач**. GitHub не позволяет перенумеровать уже существующие issue ID, поэтому технические номера новых задач — #19–#28, а рабочая последовательность задаётся префиксами **[01]–[10]** в заголовках.

## Каноническая последовательность

| ID | GitHub | Направление | Главный результат |
|---|---|---|---|
| 01 | [#19](https://github.com/RomaGrach/mt-hackathon/issues/19) | Полная спецификация | Единые требования, источники, критерии, REQ-ID и разрывы |
| 02 | [#20](https://github.com/RomaGrach/mt-hackathon/issues/20) | Deep Research геймплея | Сравнение 8+ моделей, domain model, shortlist |
| 03 | [#21](https://github.com/RomaGrach/mt-hackathon/issues/21) | Выбор геймплея и модели | Принятый core loop, сущности, состояние, время, ADR |
| 04 | [#22](https://github.com/RomaGrach/mt-hackathon/issues/22) | Deep Research Duolingo | Фактические правила лиг, групп, XP, streak, quests, newcomer flow |
| 05 | [#23](https://github.com/RomaGrach/mt-hackathon/issues/23) | Геймификация РЕЙС 400 | Правила мотивации, рейтингов, anti-farm и новичков |
| 06 | [#24](https://github.com/RomaGrach/mt-hackathon/issues/24) | Design/UX | Требования → дизайн → frontend → пользовательская проверка |
| 07 | [#25](https://github.com/RomaGrach/mt-hackathon/issues/25) | Planning | Обратный таймлайн, владельцы, critical path, feature freeze |
| 08 | [#26](https://github.com/RomaGrach/mt-hackathon/issues/26) | Implementation | Интеграция выбранного gameplay/domain/gamification в движок и backend |
| 09 | [#27](https://github.com/RomaGrach/mt-hackathon/issues/27) | QA / Release | Тесты, CI, deployment, производительность, release candidate |
| 10 | [#28](https://github.com/RomaGrach/mt-hackathon/issues/28) | Submission | Документы, доступ жюри, манифест, репетиция, отправка и freeze |

## Как читать порядок

**01 → 02 → 03** формируют продуктовый фундамент: что требуется и во что именно играет проводник.

**04 → 05** формируют мотивационный слой: сначала факты о Duolingo, затем решение для РЕЙС 400.

**06** объединяет все прежние UX-задачи в одну: отдельные «главный экран», «игровой экран» и «UX-тест» больше не являются самостоятельным backlog.

**07** начинается сразу после 01 и дальше ведётся параллельно: это управление сроками, а не очередная продуктовая функция.

**08** реализует решения 03 и 05; frontend-часть нового дизайна реализуется внутри 06.

**09** проверяет конкретный SHA и формирует release candidate.

**10** собирает именно этот release candidate в конкурсный комплект и подтверждает отправку.

## Исследовательские задачи

Задачи **02** и **04** содержат готовые copy-paste промпты для Deep Research.

Задача **06** также содержит опциональный Deep Research prompt по mobile UX/accessibility, если команде потребуется дополнительное исследование перед финальным дизайном.

## Правило scope

Новые точечные issues создаются только если:
1. задача 01 подтверждает обязательный разрыв;
2. задача 03/05 принимает конкретное решение к реализации;
3. задача 06 или 09 обнаруживает конкретный дефект, который невозможно удобно вести внутри мега-задачи.

Не создавать отдельные issues для каждой идеи, экрана или понравившейся механики.

## Основные источники

- [Кейс «Геймификация для ВСМ»](../materials/Геймификация%20для%20ВСМ.md)
- [Q&A: транскрипция](../research/qa/2026-09-25-qa-transcript.md)
- [Q&A: конспект](../research/qa/2026-09-25-qa-summary.md)
- [Telegram-дайджест](../docs/03-telegram-digest.md)
- [Позднее уточнение капитанам](../research/telegram/captains-2026-09-25-late.md)
- [Текущая реализация](../README.md)

Исторические issues #1–#18 сохранены только для истории решений. Их тексты не являются действующим backlog.
