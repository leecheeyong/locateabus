const saved = new Map();
const busy = new Map();

export async function cached(key, ttl, fn) {
  const hit = saved.get(key);
  if (hit && hit.until > Date.now()) return hit.data;
  if (busy.has(key)) return busy.get(key);

  const p = fn().then((data) => {
    saved.set(key, { data, until: Date.now() + ttl });
    if (saved.size > 80) saved.delete(saved.keys().next().value);
    return data;
  });

  busy.set(key, p);
  try {
    return await p;
  } finally {
    busy.delete(key);
  }
}
