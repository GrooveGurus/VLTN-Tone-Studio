import type { ReactNode } from "react";
import type { NoticeArt } from "@/state/pedal-notices";
import { SCENE_COLORS } from "@/state/scenes-model";

/*
 * Small line drawings for PedalNotice: a pedal reduced to its body, screen and footswitches, plus what happens to it.
 * Lines use currentColor (silkscreen-3 from the notice); the accent is var(--tone), the notice's colour. 72 x 56.
 */

const Body = ({ children }: { children?: ReactNode }) => (
  <>
    <rect x="4" y="10" width="64" height="38" rx="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <rect x="22" y="15" width="28" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
    {children}
  </>
);

/** The four footswitches along the front; `fill(i)` colours one, `ring(i)` outlines it. */
const Switches = ({ fill, ring, dash }: { fill?: (i: number) => string | null; ring?: (i: number) => string | null; dash?: number }) => (
  <>
    {[14, 28, 44, 58].map((x, i) => {
      const f = fill?.(i) ?? null;
      const r = ring?.(i) ?? null;
      return (
        <circle
          key={x}
          cx={x}
          cy="40"
          r="3.5"
          fill={f ?? "none"}
          stroke={r ?? f ?? "currentColor"}
          strokeWidth="1.5"
          strokeDasharray={dash === i ? "2 1.6" : undefined}
        />
      );
    })}
  </>
);

const ART: Record<NoticeArt, ReactNode> = {
  "pedal-busy": (
    <Body>
      <Switches />
      <rect x="25" y="18" width="22" height="8" rx="1.5" fill="var(--tone)" opacity="0.22" />
      {[30, 36, 42].map((x, i) => (
        <circle key={x} cx={x} cy="22" r="1.4" fill="var(--tone)" className="animate-pulse motion-reduce:animate-none" style={{ animationDelay: `${i * 180}ms` }} />
      ))}
    </Body>
  ),
  "records-full": (
    <>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={14 + i * 4} y={8 + i * 5} width="40" height="28" rx="3" fill="var(--panel, transparent)" stroke="currentColor" strokeWidth="1.5" opacity={0.5 + i * 0.25} />
      ))}
      <rect x="27" y="40" width="30" height="4" rx="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="27" y="40" width="30" height="4" rx="2" fill="var(--tone)" />
      <text x="42" y="31" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--tone)">42</text>
    </>
  ),
  "mod-update": (
    <>
      <rect x="18" y="12" width="32" height="32" rx="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {[20, 28, 36].map((v) => (
        <g key={v} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <line x1={v + 2} y1="8" x2={v + 2} y2="12" />
          <line x1={v + 2} y1="44" x2={v + 2} y2="48" />
          <line x1="14" y1={v + 2} x2="18" y2={v + 2} />
        </g>
      ))}
      <circle cx="54" cy="40" r="10" fill="var(--tone)" />
      <path d="M54 45v-9m-4 4 4-4 4 4" fill="none" stroke="var(--lamp-ink, #000)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  "no-reply": (
    <>
      <rect x="4" y="16" width="34" height="24" rx="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="20" width="20" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M38 28h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M48 23l3 5-3 5" fill="none" stroke="var(--tone)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M58 28h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2.5" />
      <rect x="62" y="22" width="6" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  refused: (
    <>
      <path d="M20 8h22l10 10v30a2 2 0 0 1-2 2H20a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M42 8v10h10" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {[24, 30, 36].map((y) => (
        <line key={y} x1="24" y1={y} x2="40" y2={y} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      ))}
      <circle cx="52" cy="42" r="10" fill="var(--tone)" />
      <path d="M48.5 38.5l7 7m0-7-7 7" stroke="var(--lamp-ink, #000)" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  "scene-saved": (
    <Body>
      <Switches ring={(i) => SCENE_COLORS[i]} fill={(i) => (i === 1 ? SCENE_COLORS[1] : null)} />
      <path d="M30 22l4 4 8-8" fill="none" stroke="var(--tone)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Body>
  ),
  "scene-deleted": (
    <Body>
      <Switches ring={(i) => (i === 1 ? null : SCENE_COLORS[i])} dash={1} />
      <path d="M31 19l10 6m0-6-10 6" stroke="var(--tone)" strokeWidth="2" strokeLinecap="round" />
    </Body>
  ),
  "scene-mode": (
    <Body>
      <Switches ring={(i) => SCENE_COLORS[i]} />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={25 + i * 6} y="19" width="4" height="6" rx="1" fill={SCENE_COLORS[i]} />
      ))}
    </Body>
  ),
  settings: (
    <Body>
      <Switches />
      {[0, 1].map((i) => (
        <g key={i}>
          <line x1="26" y1={19 + i * 6} x2="46" y2={19 + i * 6} stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx={i ? 40 : 31} cy={19 + i * 6} r="2" fill="var(--tone)" />
        </g>
      ))}
    </Body>
  ),
};

export function NoticeIllustration({ art, className }: { art: NoticeArt; className?: string }) {
  return (
    <svg viewBox="0 0 72 56" aria-hidden className={className}>
      {ART[art]}
    </svg>
  );
}
