const store = new Map();
const inflight = new Map();

export async function cached(key, ttlMs, fetcher) {
    const now = Date.now()
    const hit = store.get(key)
    if(hit && hit.expires > now) return hit.data;
    if (inflight.has(key)) return inflight.get(key)
    const p = fetcher().then((data) => {
        store.set(key, { data, expires: Date.now() + ttlMs })
        if(store.size > 80) store.selete(store.keys().next().value)
        return data
    })
    inflight.set(key, p)
    try {
        return await p
    } finally {
        inflight.delete(key)
    }
}