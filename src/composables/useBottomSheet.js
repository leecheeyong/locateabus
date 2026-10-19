import { reactive, computed, onMounted, onBeforeUnmount, nextTick } from "vue";

const MQ = "(max-width: 767.98px)";
const ORDER = ["peek", "half", "full"];
const FLICK = 0.45;
const SLOP = 6;
const TAP_MS = 400;

const now = () => performance.now();

export function useBottomSheet(elRef, gripRef) {
  const ui = reactive({
    snap: "peek",
    dragging: false,
    narrow: false,
    opened: computed(() => ui.snap !== "peek"),
  });

  const reduced =
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  let mq = null;
  let onMqChange = null;
  let onWinResize = null;
  let y = 0;
  let frame = 0;
  let settleT = 0;
  let resizeT = 0;
  let guardT = 0;
  let ptr = null;
  let ignoreClick = false;

  function metrics() {
    const node = elRef.value;
    if (!node) return null;
    const h = node.offsetHeight;
    if (!h) return null;
    const vh = window.innerHeight;
    const gripH = gripRef.value ? gripRef.value.offsetHeight : 0;
    const border = parseFloat(getComputedStyle(node).borderTopWidth) || 0;
    const peek = Math.min(
      gripH + border || Math.round(vh * 0.09),
      Math.round(vh * 0.6),
    );
    return { h, vh, peek, half: Math.round(vh * 0.5) };
  }

  function showFor(name, m) {
    if (name === "full") return Math.max(m.half, Math.min(m.h, m.vh - 66));
    if (name === "half") return Math.min(m.half, m.h);
    return Math.min(m.peek, m.h);
  }

  function hard(v, m) {
    const max = Math.max(0, m.h - m.peek);
    return v < 0 ? 0 : v > max ? max : v;
  }

  function soft(v, m) {
    const max = Math.max(0, m.h - m.peek);
    if (v < 0) return v * 0.3;
    if (v > max) return max + (v - max) * 0.3;
    return v;
  }

  function writeNow(node, v) {
    y = v;
    node.style.transform = "translate3d(0," + v + "px,0)";
  }

  function writeSoon(v) {
    y = v;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const node = elRef.value;
      if (node) node.style.transform = "translate3d(0," + y + "px,0)";
    });
  }

  function visualY() {
    const node = elRef.value;
    if (!node) return y;
    const rect = node.getBoundingClientRect();
    return rect.top - (window.innerHeight - node.offsetHeight);
  }

  function apply(name, animate) {
    const node = elRef.value;
    ui.snap = name;
    if (!node) return;
    if (!ui.narrow) {
      node.style.transform = "";
      node.style.transition = "";
      node.style.willChange = "";
      y = 0;
      return;
    }
    const m = metrics();
    if (!m) return;
    const to = hard(m.h - showFor(name, m), m);
    clearTimeout(settleT);
    node.style.willChange = "transform";
    if (animate && !reduced) {
      void node.offsetWidth;
      node.style.transition = "transform 300ms cubic-bezier(.22,.61,.36,1)";
      writeNow(node, to);
      settleT = setTimeout(() => {
        if (elRef.value && !ui.dragging) elRef.value.style.willChange = "";
      }, 340);
    } else {
      node.style.transition = "none";
      writeNow(node, to);
    }
  }

  function settle(vel) {
    const m = metrics();
    if (!m) return;
    const visible = m.h - y;
    let near = "peek";
    let best = Infinity;
    for (const name of ORDER) {
      const d = Math.abs(showFor(name, m) - visible);
      if (d < best) {
        best = d;
        near = name;
      }
    }
    let name = near;
    if (Math.abs(vel) >= FLICK) {
      const dir = vel > 0 ? -1 : 1;
      const i = ORDER.indexOf(near);
      name = ORDER[Math.min(ORDER.length - 1, Math.max(0, i + dir))];
    }
    apply(name, true);
  }

  function onPointerDown(e) {
    if (!ui.narrow || (e.pointerType === "mouse" && e.button !== 0)) return;
    const node = elRef.value;
    const m = metrics();
    if (!node || !m) return;
    clearTimeout(settleT);
    node.style.transition = "none";
    node.style.willChange = "transform";
    writeNow(node, hard(visualY(), m));
    ui.dragging = true;
    ptr = {
      id: e.pointerId,
      y0: e.clientY,
      t0: y,
      m,
      moved: false,
      s: [{ t: now(), y }],
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }

  function onPointerMove(e) {
    if (!ptr || e.pointerId !== ptr.id) return;
    const dy = e.clientY - ptr.y0;
    if (Math.abs(dy) > SLOP) ptr.moved = true;
    writeSoon(soft(ptr.t0 + dy, ptr.m));
    ptr.s.push({ t: now(), y });
    if (ptr.s.length > 8) ptr.s.shift();
  }

  function onPointerUp(e) {
    if (!ptr || (e && e.pointerId !== ptr.id)) return;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
    const p = ptr;
    ptr = null;
    ui.dragging = false;
    if (p.moved) {
      ignoreClick = true;
      clearTimeout(guardT);
      guardT = setTimeout(() => {
        ignoreClick = false;
      }, 350);
    }
    const a = p.s[0];
    const b = p.s[p.s.length - 1];
    const dt = b.t - a.t;
    settle(dt > 0 ? (b.y - a.y) / dt : 0);
  }

  function onTap() {
    if (ignoreClick) {
      ignoreClick = false;
      return;
    }
    if (!ui.narrow) return;
    apply(ui.snap === "peek" ? "half" : "peek", true);
  }

  function open() {
    if (ui.narrow) apply("half", true);
  }

  function close() {
    apply("peek", true);
  }

  function toggle() {
    if (!ui.narrow) return;
    apply(ui.snap === "peek" ? "half" : "peek", true);
  }

  function sync(animate) {
    if (ui.dragging) return;
    clearTimeout(resizeT);
    const run = () => apply(ui.snap, animate);
    if (animate) resizeT = setTimeout(run, 120);
    else nextTick(run);
  }

  onMounted(() => {
    ui.narrow = window.matchMedia ? window.matchMedia(MQ).matches : false;
    if (window.matchMedia) {
      mq = window.matchMedia(MQ);
      onMqChange = () => {
        ui.narrow = mq.matches;
        sync(false);
      };
      if (mq.addEventListener) mq.addEventListener("change", onMqChange);
      else if (mq.addListener) mq.addListener(onMqChange);
    }
    onWinResize = () => sync(true);
    window.addEventListener("resize", onWinResize);
    sync(false);
  });

  onBeforeUnmount(() => {
    clearTimeout(settleT);
    clearTimeout(resizeT);
    clearTimeout(guardT);
    if (frame) cancelAnimationFrame(frame);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
    if (onWinResize) window.removeEventListener("resize", onWinResize);
    if (mq && onMqChange) {
      if (mq.removeEventListener) mq.removeEventListener("change", onMqChange);
      else if (mq.removeListener) mq.removeListener(onMqChange);
    }
  });

  return reactive({
    snap: computed(() => ui.snap),
    opened: computed(() => ui.opened),
    dragging: computed(() => ui.dragging),
    narrow: computed(() => ui.narrow),
    onPointerDown,
    onTap,
    open,
    close,
    toggle,
  });
}
