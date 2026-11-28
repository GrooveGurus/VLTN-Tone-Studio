import type { CSSProperties, ReactNode } from "react";
import { CircleCheck, CircleX, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NoticeTone, PedalNoticeSpec } from "@/state/pedal-notices";
import { NoticeIllustration } from "./illustrations";
import { Trans } from "@lingui/react/macro";

/** The tone's colour (tokens.css) and icon; info stays neutral, like the toasts. */
const TONE: Record<NoticeTone, { color: string; Icon: typeof Info }> = {
  ok: { color: "var(--led-on)", Icon: CircleCheck },
  info: { color: "var(--silkscreen-2)", Icon: Info },
  warn: { color: "var(--led-warn)", Icon: TriangleAlert },
  fault: { color: "var(--led-fault)", Icon: CircleX },
};

interface PedalNoticeProps {
  notice: PedalNoticeSpec;
  /** inline: inside a dialog or panel (well background, full drawing); toast: compact, for the toaster's card */
  variant?: "inline" | "toast";
  /** Buttons under the text (Retry, a link to Diagnostics…) */
  actions?: ReactNode;
  className?: string;
}

/**
 * What the pedal said, in the editor's look: a drawing of the situation, the tone's icon and title, a plain sentence,
 * the steps to take on the pedal and, folded, the raw reason for bug reports.
 */
export function PedalNotice({ notice, variant = "inline", actions, className }: PedalNoticeProps) {
  const { color, Icon } = TONE[notice.tone];
  const inline = variant === "inline";
  return (
    <div
      role={notice.tone === "fault" || notice.tone === "warn" ? "alert" : "status"}
      style={{ "--tone": color } as CSSProperties}
      className={cn(
        "flex items-start gap-3.5 text-[13px] text-silkscreen",
        inline && "rounded-lg bg-well px-3.5 py-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--tone)_35%,transparent)]",
        className,
      )}
    >
      {notice.art ? (
        <NoticeIllustration art={notice.art} className={cn("shrink-0 text-silkscreen-3", inline ? "mt-0.5 w-[72px]" : "w-[52px]")} />
      ) : (
        <Icon className="mt-px size-[18px] shrink-0 text-[var(--tone)]" aria-hidden />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <b className="flex items-center gap-1.5 font-semibold text-balance">
          {notice.art && <Icon className="size-4 shrink-0 text-[var(--tone)]" aria-hidden />}
          {notice.title}
        </b>
        <span className="text-xs text-pretty text-silkscreen-2">{notice.body}</span>
        {notice.steps && notice.steps.length > 0 && (
          <ol className="mt-1 flex flex-col gap-1 text-xs text-silkscreen-2">
            {notice.steps.map((s, i) => (
              <li key={i} className="grid grid-cols-[16px_minmax(0,1fr)] items-start gap-x-2">
                <span aria-hidden className="mt-px grid size-4 place-items-center rounded-full text-[10px] font-semibold text-silkscreen shadow-[inset_0_0_0_1.2px_var(--seam-strong)]">
                  {i + 1}
                </span>
                <span className="text-pretty">{s}</span>
              </li>
            ))}
          </ol>
        )}
        {inline && notice.detail && (
          <details className="mt-1 text-[11px] text-silkscreen-4">
            <summary className="cursor-pointer list-none select-none hover:text-silkscreen-3 [&::-webkit-details-marker]:hidden"><Trans>Technical detail</Trans></summary>
            <code className="mt-1 block break-words">{notice.detail}</code>
          </details>
        )}
        {actions && <div className="mt-2 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
