// Pure presentation helpers. Never derive professional correctness in the client.
export const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
export const button = (text, action, attrs = '', kind = 'primary-button') =>
  `<button type="button" class="${kind}" data-action="${action}" ${attrs}>${esc(text)}</button>`;
export const heading = (eyebrow, text, description = '') =>
  `<header class="page-heading"><p class="eyebrow">${esc(eyebrow)}</p><h1 tabindex="-1">${esc(text)}</h1>${description ? `<p class="lead">${esc(description)}</p>` : ''}</header>`;
export const meter = (value, label, kind = 'loyalty') => {
  const n = Math.max(0, Math.min(100, Number(value) || 0));
  return `<div class="metric"><div class="metric-top"><span>${esc(label)}</span><strong>${n}<small> / 100</small></strong></div><div class="meter" role="meter" aria-label="${esc(label)}" aria-valuenow="${n}" aria-valuemin="0" aria-valuemax="100"><span class="meter-fill ${kind}" style="width:${n}%"></span></div></div>`;
};
export const scales = (loyalty, safety) =>
  `<section class="scales" aria-label="Состояние смены">${meter(loyalty, 'Лояльность')}${meter(safety, 'Безопасность', 'safety')}</section>`;
export const note =
  '<p class="bottom-note">Учебная модель, не официальная аттестация. Диалоги и оценки требуют проверки перевозчиком.</p>';
export const prototypeLink =
  '<a class="outline-button" href="/preview.html">Открыть прототип новой смены <span aria-hidden="true">↗</span></a>';
