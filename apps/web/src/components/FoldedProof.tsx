import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { Building2, Check, Clock3, Lock, ScrollText, Timer } from 'lucide-react';
import { cn } from './ui';

/* -------------------------------------------------------------------------- */
/* Card content                                                               */
/* -------------------------------------------------------------------------- */

function RoutingProof() {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Auto-routed to Academic Affairs
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/15 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-400/20">
          <Check className="h-3 w-3" aria-hidden />
          Matched
        </span>
      </div>
      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2.5 ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-slate-800">
          <span className="text-slate-500 dark:text-slate-400">Category</span>
          <span className="font-medium text-slate-800 dark:text-slate-200">Missing results</span>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2.5 ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-slate-800">
          <span className="text-slate-500 dark:text-slate-400">First response due</span>
          <span className="font-medium tabular-nums text-slate-800 dark:text-slate-200">
            Today, 17:12
          </span>
        </div>
      </div>
    </div>
  );
}

function ClockProof() {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Resolution target
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-slate-900 dark:text-white">
            21h remaining
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/15 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-400/20">
          <Timer className="h-3 w-3" aria-hidden />
          On track
        </span>
      </div>
      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
        role="img"
        aria-label="Resolution target 68 percent elapsed, 21 hours remaining"
      >
        <div className="h-full w-[68%] rounded-full bg-gradient-to-r from-brand-500 via-brand-400 to-teal-400" />
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>First response sent</span>
        <span className="tabular-nums">4h 12m</span>
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>Reminder before breach</span>
        <span className="tabular-nums">6h before</span>
      </div>
    </div>
  );
}

const AUDIT_ENTRIES = [
  { label: 'Status changed to In progress', time: '11:26', tone: 'bg-brand-500' },
  { label: 'Assigned to Academic Affairs', time: '11:24', tone: 'bg-teal-500' },
  { label: 'First response sent', time: '09:12', tone: 'bg-emerald-500' },
];

function AuditProof() {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
      <ol className="relative space-y-3">
        <span
          className="pointer-events-none absolute bottom-2 left-[5px] top-2 w-px bg-slate-200 dark:bg-slate-800"
          aria-hidden
        />
        {AUDIT_ENTRIES.map((entry) => (
          <li key={entry.label} className="relative flex items-center justify-between gap-3 pl-5">
            <span
              className={cn(
                'absolute left-0 h-2.5 w-2.5 rounded-full ring-2 ring-slate-50 dark:ring-slate-950',
                entry.tone,
              )}
              aria-hidden
            />
            <span className="text-sm text-slate-700 dark:text-slate-200">{entry.label}</span>
            <span className="shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400">
              {entry.time}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        <Lock className="h-3.5 w-3.5" aria-hidden />
        Entries are append-only and attributed to the person who acted.
      </p>
    </div>
  );
}

interface ProofCard {
  step: string;
  title: string;
  description: string;
  icon: typeof Building2;
  accent: string;
  iconClass: string;
  proof: () => ReactElement;
}

const PROOF_CARDS: ProofCard[] = [
  {
    step: '01',
    title: 'Routed to the right desk',
    description:
      'The category and department are attached at submission, so a report never depends on someone guessing who to forward it to.',
    icon: Building2,
    accent: 'from-brand-500/12 via-brand-500/0 to-transparent',
    iconClass:
      'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300',
    proof: RoutingProof,
  },
  {
    step: '02',
    title: 'Every case on a clock',
    description:
      'First response and resolution targets are visible from the first minute, with reminders before a breach instead of an apology after one.',
    icon: Clock3,
    accent: 'from-amber-500/12 via-amber-500/0 to-transparent',
    iconClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    proof: ClockProof,
  },
  {
    step: '03',
    title: 'A record that cannot be rewritten',
    description:
      'Public replies, internal notes, assignments and closures are written to an audit trail that keeps every action accountable.',
    icon: ScrollText,
    accent: 'from-teal-500/12 via-teal-500/0 to-transparent',
    iconClass: 'bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300',
    proof: AuditProof,
  },
];

function ProofCardBody({ card }: { card: ProofCard }) {
  const Proof = card.proof;
  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-900/10 bg-white p-6 shadow-[0_30px_80px_-50px_rgba(15,23,42,0.55)] sm:p-8 dark:border-white/10 dark:bg-slate-900">
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b',
          card.accent,
        )}
        aria-hidden
      />
      <div className="relative flex items-center justify-between gap-3">
        <span
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-xl',
            card.iconClass,
          )}
        >
          <card.icon className="h-5 w-5" aria-hidden />
        </span>
        <span className="font-mono text-xs font-medium tabular-nums text-slate-400 dark:text-slate-500">
          {card.step}
        </span>
      </div>
      <h3 className="relative mt-6 text-xl font-semibold tracking-[-0.02em] text-slate-950 dark:text-white">
        {card.title}
      </h3>
      <p className="relative mt-3 max-w-xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        {card.description}
      </p>
      <div className="relative mt-auto pt-7">
        <Proof />
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* Scroll-driven fold                                                         */
/* -------------------------------------------------------------------------- */

const CARD_COUNT = PROOF_CARDS.length;
const LAST_INDEX = CARD_COUNT - 1;

/** Share of each scroll segment where a card rests in place. */
const HOLD = 0.18;
/** Share of each scroll segment where the old card folds and the next rises. */
const TRANS = 0.15;
const SEGMENT = HOLD + TRANS;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

/** Progress value at which a card begins folding away. */
function foldStart(index: number) {
  return HOLD + index * SEGMENT;
}

/** Progress value at which a card begins rising from below the stage. */
function enterStart(index: number) {
  return index === 0 ? -1 : HOLD + (index - 1) * SEGMENT;
}

interface CardState {
  entered: number;
  folded: number;
  fade: number;
}

function cardState(index: number, progress: number): CardState {
  const entered = index === 0 ? 1 : smoothstep((progress - enterStart(index)) / TRANS);
  const folded = index === LAST_INDEX ? 0 : smoothstep((progress - foldStart(index)) / TRANS);
  const fade = clamp01((folded - 0.5) / 0.5);
  return { entered, folded, fade };
}

/**
 * The outgoing card hinges back at the top edge, shrinks into the distance and
 * fades, while the next card rises from below the stage. This mirrors a page
 * being folded away rather than a flat crossfade between cards.
 */
function cardCss(index: number, progress: number): CSSProperties {
  const { entered, folded, fade } = cardState(index, progress);
  const tilt = (index % 2 === 0 ? -1 : 1) * 3;

  return {
    transform: `translate3d(0, ${(1 - entered) * 100}%, 0) rotateX(${40 * folded}deg) rotateZ(${tilt * folded}deg) scale(${1 - 0.3 * folded})`,
    opacity: 1 - fade,
    visibility: entered <= 0.001 || fade >= 0.999 ? 'hidden' : 'visible',
    zIndex: index + 1,
    transformOrigin: '50% 10%',
    filter:
      folded > 0
        ? `brightness(${1 - 0.14 * folded}) saturate(${1 - 0.2 * folded})`
        : undefined,
    pointerEvents: entered >= 0.999 && folded === 0 ? 'auto' : 'none',
  };
}

/** Which step should be highlighted in the left rail. */
function activeCardAt(progress: number) {
  let active = 0;
  for (let index = 0; index < LAST_INDEX; index += 1) {
    if (progress >= foldStart(index) + TRANS / 2) active = index + 1;
  }
  return active;
}

/** Scroll progress that parks a given card in the reading position. */
function progressForCard(index: number) {
  if (index === 0) return 0.02;
  return Math.min(0.92, foldStart(index - 1) + TRANS + HOLD / 2);
}

/** True when the visitor has not asked for reduced motion. */
function usePrefersMotion() {
  const [motion, setMotion] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setMotion(!query.matches && window.innerWidth >= 1024);
    update();
    query.addEventListener('change', update);
    window.addEventListener('resize', update);
    return () => {
      query.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  return motion;
}

export function FoldedProofSection() {
  const motion = usePrefersMotion();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const shadeRefs = useRef<Array<HTMLDivElement | null>>([]);
  const barRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!motion) return;

    let frame = 0;

    const paint = (progress: number) => {
      cardRefs.current.forEach((node, index) => {
        if (!node) return;
        const { entered, folded, fade } = cardState(index, progress);
        const tilt = (index % 2 === 0 ? -1 : 1) * 3;

        node.style.transform = `translate3d(0, ${(1 - entered) * 100}%, 0) rotateX(${40 * folded}deg) rotateZ(${tilt * folded}deg) scale(${1 - 0.3 * folded})`;
        node.style.opacity = String(1 - fade);
        node.style.visibility = entered <= 0.001 || fade >= 0.999 ? 'hidden' : 'visible';
        node.style.zIndex = String(index + 1);
        node.style.transformOrigin = '50% 10%';
        node.style.pointerEvents = entered >= 0.999 && folded === 0 ? 'auto' : 'none';
        node.style.filter =
          folded > 0
            ? `brightness(${1 - 0.14 * folded}) saturate(${1 - 0.2 * folded})`
            : '';

        const shade = shadeRefs.current[index];
        if (shade) shade.style.opacity = String(folded * 0.45);
      });

      if (barRef.current) {
        barRef.current.style.width = `${Math.max(6, progress * 100)}%`;
      }

      const next = activeCardAt(progress);
      setActiveIndex((current) => (current === next ? current : next));
    };

    const measure = () => {
      frame = 0;
      const node = wrapperRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      if (travel <= 0) return;
      paint(clamp01(-rect.top / travel));
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [motion]);

  const jumpTo = (index: number) => {
    const node = wrapperRef.current;
    if (!node) return;
    const travel = node.offsetHeight - window.innerHeight;
    const top = node.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({
      top: top + travel * progressForCard(index) + 4,
      behavior: 'smooth',
    });
  };

  return (
    <section id="product" className="relative scroll-mt-24 bg-[#fafafa] dark:bg-slate-950">
      <div ref={wrapperRef} className={motion ? 'relative h-[340vh]' : 'relative'}>
        <div
          className={
            motion ? 'sticky top-0 flex min-h-screen items-center overflow-hidden' : ''
          }
        >
          <div className="mx-auto w-full max-w-[1140px] px-5 py-24 sm:px-8 lg:py-28">
            <div className="grid gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:gap-16">
              <div className="max-w-xl">
                <h2 className="text-[2.1rem] font-semibold leading-[1.08] tracking-[-0.04em] text-slate-950 sm:text-[3rem] dark:text-white">
                  Every issue gets an owner,{' '}
                  <span className="block text-slate-500 dark:text-slate-400">
                    and a paper trail.
                  </span>
                </h2>
                <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-600 dark:text-slate-300">
                  Complaints rarely fail because nobody cares. They fail because ownership, time
                  and context live in different places. Campus Resolve holds all three in one
                  record.
                </p>

                <nav aria-label="Ownership proof steps" className="mt-10 hidden lg:block">
                  <ol className="space-y-2">
                    {PROOF_CARDS.map((card, index) => {
                      const active = index === activeIndex;
                      return (
                        <li key={card.step}>
                          <button
                            type="button"
                            onClick={() => jumpTo(index)}
                            aria-current={active ? 'step' : undefined}
                            className={cn(
                              'group flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
                              active
                                ? 'border-slate-900/10 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900'
                                : 'border-transparent hover:border-slate-900/10 hover:bg-white/60 dark:hover:border-white/10 dark:hover:bg-slate-900/60',
                            )}
                          >
                            <span
                              className={cn(
                                'font-mono text-xs tabular-nums transition-colors',
                                active
                                  ? 'text-brand-700 dark:text-brand-300'
                                  : 'text-slate-400 dark:text-slate-500',
                              )}
                            >
                              {card.step}
                            </span>
                            <span
                              className={cn(
                                'text-sm font-medium transition-colors',
                                active
                                  ? 'text-slate-900 dark:text-white'
                                  : 'text-slate-500 group-hover:text-slate-800 dark:text-slate-400 dark:group-hover:text-slate-200',
                              )}
                            >
                              {card.title}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                  <div
                    className="mt-5 h-0.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
                    aria-hidden
                  >
                    <div
                      ref={barRef}
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: motion ? '6%' : '100%' }}
                    />
                  </div>
                </nav>
              </div>

              {motion ? (
                <div className="relative mx-auto w-full max-w-xl">
                  <div
                    className="relative h-[520px] overflow-hidden"
                    style={{ perspective: '1600px', perspectiveOrigin: '50% 15%' }}
                  >
                    {PROOF_CARDS.map((card, index) => (
                      <div
                        key={card.step}
                        ref={(node) => {
                          cardRefs.current[index] = node;
                        }}
                        className="absolute inset-0 will-change-transform"
                        style={cardCss(index, 0)}
                        aria-hidden={index !== activeIndex || undefined}
                      >
                        <ProofCardBody card={card} />
                        <div
                          ref={(node) => {
                            shadeRefs.current[index] = node;
                          }}
                          className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-slate-950/0 via-slate-950/0 to-slate-950/50"
                          style={{ opacity: 0 }}
                          aria-hidden
                        />
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-center text-xs text-slate-400 dark:text-slate-500">
                    Scroll to fold each record away
                  </p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {PROOF_CARDS.map((card) => (
                    <div key={card.step}>
                      <ProofCardBody card={card} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
