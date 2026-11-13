export const BANDS = ['held', 'degraded', 'failed'];

export function rearBand({ fulfilled, demand, after24hAdditional }) {
  const cleared = Number(fulfilled) >= Number(demand);
  if (cleared) return 'held';
  return Number(after24hAdditional) > 0 ? 'degraded' : 'failed';
}

export function poleBand({ withdrawBlockedByPause, reachableBySingleKey }) {
  if (reachableBySingleKey) return 'failed';
  return withdrawBlockedByPause ? 'degraded' : 'held';
}

export const REAR_REASON = {
  held: 'every demanded withdrawal cleared',
  degraded: 'part of the demand only cleared after the 24 hour wait',
  failed: 'part of the demand never cleared and no queue exists'
};

export const POLE_REASON = {
  held: 'a single key can neither move nor block funds',
  degraded: 'a single key can pause or freeze funds without loss',
  failed: 'a single key can move funds'
};
