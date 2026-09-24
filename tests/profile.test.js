import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfile, recordResult, makeLeaderboard, parseProfile } from '../src/profile.js';

test('итог добавляет опыт и открывает достижения', () => {
  const profile = createProfile('Анна');
  const result = { scenarioId: 'conflict', points: 280, loyalty: 88, safety: 90, grade: 'Отлично', competencies: { empathy: 2, protocol: 1, speed: 1 } };
  const updated = recordResult(profile, result);
  assert.equal(updated.totalPoints, 280);
  assert.equal(updated.completed.length, 1);
  assert.ok(updated.achievements.includes('first-step'));
  assert.ok(updated.achievements.includes('safe-hands'));
  assert.equal(profile.totalPoints, 0);
});

test('повторный сценарий сохраняет лучший результат для рейтинга', () => {
  const profile = recordResult(recordResult(createProfile('Анна'), { scenarioId: 'conflict', points: 250, safety: 70, loyalty: 70, competencies: {} }), { scenarioId: 'conflict', points: 120, safety: 70, loyalty: 70, competencies: {} });
  assert.equal(profile.totalPoints, 250);
  assert.equal(profile.runs.length, 2);
  assert.equal(makeLeaderboard([profile])[0].score, 250);
});

test('повреждённые сохранения не ломают загрузку профиля', () => {
  assert.equal(parseProfile('{bad', 'Гость').name, 'Гость');
  assert.equal(parseProfile('{"name":"","runs":"oops"}', 'Гость').runs.length, 0);
});

test('дата прохождения сохраняется после загрузки профиля', () => {
  const original = recordResult(createProfile('Анна'), { scenarioId: 'conflict', points: 210, safety: 80, loyalty: 80, competencies: {} });
  original.runs[0].completedAt = '2025-01-02T10:00:00.000Z';
  const restored = parseProfile(JSON.stringify(original));
  assert.equal(restored.runs[0].completedAt, original.runs[0].completedAt);
});

test('незачёт остаётся в истории, но не повышает рейтинг и прогресс', () => {
  const failed = recordResult(createProfile('Анна'), { scenarioId: 'medical', points: 900, safety: 99, loyalty: 99, passed: false, competencies: {} });
  assert.equal(failed.runs.length, 1);
  assert.equal(failed.completed.length, 0);
  assert.equal(failed.totalPoints, 0);
  assert.equal(failed.achievements.length, 0);
});
