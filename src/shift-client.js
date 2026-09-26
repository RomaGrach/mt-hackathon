import { api, requestId, ApiError } from './api.js';
import { readPending, savePending, clearPending, isUncertain } from './recovery.js';
import { commandFor } from './shift-view.js';
export const SHIFT_PENDING_KEY = 'reis400.pending-command.v2';
/** Transport prepared for #26. No automatic fallback to the local prototype or v1. */
export class ShiftClient {
  constructor({ transport = api, storage = globalThis.sessionStorage, makeId = requestId } = {}) {
    this.transport = transport;
    this.storage = storage;
    this.makeId = makeId;
    this.busy = false;
    this.run = null;
  }
  async load(id) {
    if (!/^[a-zA-Z0-9-]+$/.test(id))
      throw new ApiError('Некорректный идентификатор смены.', 'INVALID_ID', 400);
    this.run = await this.transport('/v2/runs/' + id);
    return this.run;
  }
  start({ scenarioId, mode, timingPolicyId }) {
    return this.mutate('/v2/runs', { scenarioId, mode, timingPolicyId, requestId: this.makeId() });
  }
  send(action) {
    if (!this.run) throw new ApiError('Сначала загрузите смену.', 'NO_RUN', 400);
    return this.mutate('/v2/runs/' + this.run.id + '/commands', {
      requestId: this.makeId(),
      revision: this.run.revision,
      command: commandFor(action),
    });
  }
  async mutate(path, body) {
    if (this.busy || readPending(this.storage, SHIFT_PENDING_KEY))
      throw new ApiError(
        'Сначала восстановите ответ предыдущего действия.',
        'PENDING_COMMAND',
        409
      );
    this.busy = true;
    try {
      savePending({ path, body }, this.storage, SHIFT_PENDING_KEY);
      return await this.transmit({ path, body });
    } finally {
      this.busy = false;
    }
  }
  async transmit(pending) {
    let result;
    try {
      result = await this.transport(pending.path, { method: 'POST', body: pending.body });
    } catch (error) {
      if (!isUncertain(error)) clearPending(this.storage, SHIFT_PENDING_KEY);
      if (error.status === 401) this.run = null;
      // Reconcile, but NEVER replay a stale choice with a new revision/key.
      if (['STALE_REVISION', 'WRONG_PHASE', 'DEADLINE_EXPIRED'].includes(error.code)) {
        const id = pending.path.match(/^\/v2\/runs\/([^/]+)/)?.[1];
        if (id)
          try {
            await this.load(id);
          } catch {
            /* Keep the original reason. */
          }
      }
      throw error;
    }
    const accepted = result.run || result;
    if (!accepted?.id || accepted.schemaVersion !== 2)
      throw new ApiError(
        'Некорректный ответ смены. Восстановите квитанцию.',
        'INVALID_RESPONSE',
        200
      );
    clearPending(this.storage, SHIFT_PENDING_KEY);
    this.run = accepted;
    // A replayed receipt can predate a timeout or a second tab; always GET the latest run.
    return this.load(accepted.id);
  }
  async recover() {
    if (this.busy) throw new ApiError('Запрос уже выполняется.', 'BUSY', 409);
    const pending = readPending(this.storage, SHIFT_PENDING_KEY);
    if (!pending) return this.run ? this.load(this.run.id) : null;
    this.busy = true;
    try {
      return await this.transmit(pending);
    } finally {
      this.busy = false;
    }
  }
}
