// Dispatch by the immutable content/engine pinned to each run; legacy saves keep their rules.
import * as legacy from './shift-engine.js';
import * as design from './design002-engine.js';
export const createShift = (c, o, n) =>
  c.engineVersion === 'shift-4' ? design.createDesignShift(c, o, n) : legacy.createShift(c, o, n);
export const reduceShift = (s, a, c, n, k) =>
  s.engineVersion === 'shift-4'
    ? design.reduceDesignShift(s, a, c, n, k)
    : legacy.reduceShift(s, a, c, n, k);
export const expireShift = (s, c, n) =>
  s.engineVersion === 'shift-4' ? design.expireDesignShift(s, c, n) : legacy.expireShift(s, c, n);
export const publicShiftState = (s, c, n) =>
  s.engineVersion === 'shift-4'
    ? design.publicDesignShift(s, c, n)
    : legacy.publicShiftState(s, c, n);
