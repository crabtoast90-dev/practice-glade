// Quality tiers. Pick one with ?quality=low|mid|high; otherwise phones and tablets get 'mid', everything else 'high'.
// pixelRatio is a cap on the screen's own ratio; density scales how many trees, plants and flowers are scattered.
export const TIERS = {
  low: { pixelRatio: 1, shadowMap: 1024, post: 'off', density: 0.5 },
  mid: { pixelRatio: 1.5, shadowMap: 2048, post: 'cheap', density: 0.75 },
  high: { pixelRatio: 2, shadowMap: 2048, post: 'full', density: 1 },
};

export function pickQuality(params) {
  const asked = params.get('quality');
  const name = asked in TIERS ? asked : matchMedia('(pointer: coarse)').matches ? 'mid' : 'high';
  return { name, ...TIERS[name] };
}
