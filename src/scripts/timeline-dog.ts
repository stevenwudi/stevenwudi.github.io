// The dog that keeps you company down the Bio timeline (TimelineDog.astro). It stands on the logo
// tile of the entry being read (the last one whose logo has passed the middle of the viewport) and,
// when that changes, hops there one entry at a time: a crouch, a ballistic arc with the airborne
// frame held and the body pitched along the path, and a squash on landing. Between hops it trots
// in place while the page scrolls and stands wagging once scrolling stops. Everything moves by
// transforms (Web Animations) and stepped sprite strips (CSS), which the compositor plays off the
// main thread. With prefers-reduced-motion it simply stands on the right entry.

type State = 'run' | 'idle' | 'air' | 'still';
interface Spot {
  x: number;
  y: number;
}

const ACTIVE_LINE = 0.5; // an entry is "being read" once its logo is above this fraction of the viewport
const ARRIVE_LINE = 0.85; // the dog jumps in when the first logo passes this line
const HOP_MS = 560;
const QUICK_HOP_MS = 380; // when two or more entries behind
const SKIP_AFTER = 4; // this many entries behind: reappear next to the target, then hop the last one
const CROUCH_MS = 90;
const LAND_MS = 180;
const ARRIVE_MS = 420;
const SETTLE_MS = 600; // no scrolling for this long: stop trotting, stand and wag
const SINK = 1; // px the paws sink into the tile's top border

const pose = (spot: Spot, lift = 0, angle = 0) =>
  `translate(${spot.x.toFixed(1)}px, ${(spot.y - lift).toFixed(1)}px) rotate(${angle.toFixed(1)}deg)`;

/** Keyframes of a ballistic hop from `a` to `b`: up a little first, then down (or up) onto the tile. */
function arc(a: Spot, b: Spot): Keyframe[] {
  const drop = b.y - a.y; // > 0 going down the page
  const rise = drop >= 0 ? 18 : -drop + 16; // apex height above the start, px
  const s = Math.sqrt(rise) + Math.sqrt(rise + drop);
  const g = s * s; // y(t) = y0 + v t + g t², t in [0, 1]
  const v = -2 * Math.sqrt(rise) * s;
  const frames: Keyframe[] = [];
  for (let k = 0; k <= 12; k++) {
    const t = k / 12;
    const x = a.x + (b.x - a.x) * t + Math.sin(Math.PI * t) * 12; // a little forward, the way it faces
    const y = a.y + v * t + g * t * t;
    // Pitch along the path (nose up rising, down falling), level at take-off and landing.
    const pitch = (Math.atan((v + 2 * g * t) / 320) * 180) / Math.PI;
    const envelope = Math.min(1, t / 0.15) * Math.min(1, (1 - t) / 0.2);
    const angle = Math.max(-24, Math.min(30, pitch)) * envelope;
    frames.push({ transform: pose({ x, y }, 0, angle), offset: t });
  }
  return frames;
}

export function mountTimelineDog(dog: HTMLElement): () => void {
  const wrap = dog.parentElement;
  const body = dog.querySelector<HTMLElement>('.timeline-dog__body');
  const items = wrap ? Array.from(wrap.querySelectorAll<HTMLElement>('.timeline__item')) : [];
  const logos = items.map((item) => item.querySelector<HTMLElement>('.timeline__logo'));
  if (!wrap || !body || !items.length || logos.some((logo) => !logo)) return () => undefined;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const style = getComputedStyle(dog);
  const ground = parseFloat(style.getPropertyValue('--dog-ground')) || 0.93;
  const paw = parseFloat(style.getPropertyValue('--dog-paw')) || 0.5;
  dog.hidden = false; // laid out (and measurable) from now on; invisible until it arrives

  let spots: Spot[] = [];
  let at = -1; // the entry the dog stands on (-1: not arrived yet)
  let target = -1;
  let travelling = false;
  let near = false; // the timeline is on screen
  let lastScroll = -Infinity;
  let settleTimer = 0;
  let frame = 0;

  const setState = (state: State) => {
    dog.dataset.state = state;
  };
  const stopAnimations = () => {
    for (const animation of [...dog.getAnimations(), ...body.getAnimations()]) animation.cancel();
  };
  const place = (index: number) => {
    dog.style.transform = pose(spots[index]);
    dog.dataset.at = String(index);
  };

  /** Layout position of `element` inside the wrap (offsets ignore the items' reveal transforms). */
  const offsetInWrap = (element: HTMLElement) => {
    let x = 0;
    let y = 0;
    for (let node: HTMLElement | null = element; node && node !== wrap; node = node.offsetParent as HTMLElement | null) {
      x += node.offsetLeft;
      y += node.offsetTop;
    }
    return { x, y };
  };

  /** Where the dog stands on each entry: paws on the top edge of the logo tile, centred on it. */
  const measure = () => {
    const width = dog.offsetWidth;
    const height = dog.offsetHeight;
    spots = logos.map((logo) => {
      const { x, y } = offsetInWrap(logo!);
      return { x: x + logo!.offsetWidth / 2 - paw * width, y: y - ground * height + SINK };
    });
  };

  /** The entry being read, or -1 while the timeline is still below. */
  const activeIndex = () => {
    const line = innerHeight * ACTIVE_LINE;
    let index = -1;
    for (let i = 0; i < logos.length; i++) {
      if (logos[i]!.getBoundingClientRect().top <= line) index = i;
      else break;
    }
    if (index >= 0) return index;
    if (at >= 0) return 0; // once here, it stays on the timeline
    return logos[0]!.getBoundingClientRect().top <= innerHeight * ARRIVE_LINE ? 0 : -1;
  };

  /** Trot while the page is scrolling, stand and wag once it stops. */
  const rest = () => {
    window.clearTimeout(settleTimer);
    if (travelling || at < 0) return;
    if (reduceMotion) {
      setState('still');
      return;
    }
    const quiet = performance.now() - lastScroll >= SETTLE_MS;
    setState(quiet ? 'idle' : 'run');
    if (!quiet) settleTimer = window.setTimeout(rest, SETTLE_MS);
  };

  const land = () =>
    body.animate([{ transform: 'scale(1.14, 0.8)' }, { transform: 'scale(1, 1)' }], {
      duration: LAND_MS,
      easing: 'cubic-bezier(0.3, 1.6, 0.5, 1)',
    }).finished;

  /** Drop onto entry `index` from just above it (first appearance, or catching up after a long scroll). */
  const arrive = async (index: number) => {
    const spot = spots[index];
    dog.dataset.arrived = '';
    setState('air');
    await dog.animate(
      [
        { transform: pose(spot, 64), opacity: 0 },
        { transform: pose(spot, 40), opacity: 1, offset: 0.3 },
        { transform: pose(spot), opacity: 1 },
      ],
      { duration: ARRIVE_MS, easing: 'cubic-bezier(0.55, 0, 0.9, 0.55)' },
    ).finished;
    place(index);
    at = index;
    setState('run');
    await land();
  };

  const hop = async (from: number, to: number, duration: number) => {
    const a = spots[from];
    const b = spots[to];
    const crouch = body.animate([{ transform: 'scale(1, 1)' }, { transform: 'scale(1.08, 0.86)' }], {
      duration: CROUCH_MS,
      easing: 'ease-in',
      fill: 'forwards',
    });
    await crouch.finished;
    setState('air');
    const flight = dog.animate(arc(a, b), { duration, easing: 'linear', fill: 'forwards' });
    const stretch = body.animate(
      [{ transform: 'scale(1.08, 0.86)' }, { transform: 'scale(0.94, 1.08)', offset: 0.3 }, { transform: 'scale(1, 1)' }],
      { duration, easing: 'ease-out', fill: 'forwards' },
    );
    await flight.finished;
    place(to);
    for (const animation of [crouch, flight, stretch]) animation.cancel();
    setState('run');
    await land();
  };

  const travel = async () => {
    if (travelling) return;
    travelling = true;
    window.clearTimeout(settleTimer);
    try {
      while (at !== target && target >= 0) {
        if (reduceMotion || !near) {
          // Nobody is watching (or motion is unwelcome): just be there.
          dog.dataset.arrived = '';
          at = target;
          place(at);
          continue;
        }
        if (at < 0) {
          await arrive(target);
          continue;
        }
        const step = Math.sign(target - at);
        if (Math.abs(target - at) >= SKIP_AFTER) {
          await dog.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' }).finished;
          await arrive(target - step);
          stopAnimations();
          continue;
        }
        const next = at + step;
        await hop(at, next, Math.abs(target - at) >= 2 ? QUICK_HOP_MS : HOP_MS);
        at = next;
      }
    } catch {
      // An animation was cancelled (resize): the next update starts again from where the dog stands.
    } finally {
      travelling = false;
      rest();
    }
  };

  const update = () => {
    frame = 0;
    const next = activeIndex();
    if (next < 0) return;
    target = next;
    if (at !== target) void travel();
  };
  const onScroll = () => {
    lastScroll = performance.now();
    if (!near) return;
    if (!travelling && at >= 0 && !reduceMotion && dog.dataset.state !== 'run') rest();
    frame ||= requestAnimationFrame(update);
  };

  // Load the strips only when the timeline comes within a screen of the viewport.
  const approach = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      dog.dataset.ready = '';
      approach.disconnect();
    },
    { rootMargin: '100% 0px' },
  );
  approach.observe(wrap);
  const onScreen = new IntersectionObserver((entries) => {
    near = entries[entries.length - 1].isIntersecting;
    dog.toggleAttribute('data-paused', !near);
    if (near) update();
  });
  onScreen.observe(wrap);
  const resize = new ResizeObserver(() => {
    measure();
    if (at >= 0) {
      stopAnimations();
      place(at);
    }
    update();
  });
  resize.observe(wrap);
  measure();
  addEventListener('scroll', onScroll, { passive: true });

  return () => {
    removeEventListener('scroll', onScroll);
    approach.disconnect();
    onScreen.disconnect();
    resize.disconnect();
    window.clearTimeout(settleTimer);
    cancelAnimationFrame(frame);
    stopAnimations();
  };
}
