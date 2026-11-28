import { Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { lrcTime, type Cue } from "@/song/performance/chart";
import { describeSectionCue } from "@/song/performance/section-cues";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

/**
 * The Edit and Remove buttons of one row in the cue table. A cue that is all the tokens on its line can be removed but is edited in the chart
 * text. A cue the parser can't place at all has neither button.
 */
export function CueRowButtons({
  cue,
  locked,
  sections = [],
  onEdit,
  onRemove,
}: {
  cue: Cue;
  locked: boolean;
  sections?: { name: string; start: number }[];
  onEdit: () => void;
  onRemove: () => void;
}) {
  if (!cue.source && !cue.line) return null;
  const when =
    cue.trigger === "section"
      ? describeSectionCue(cue, sections).text
      : cue.trigger === "prepare"
        ? "Before song"
        : cue.trigger
          ? `On ${cue.trigger}`
          : lrcTime(cue.time);
  const name = `${when}: ${cue.label || t`Raw MIDI command`}`;
  const title = locked ? t`Stop playback to change cues` : undefined;
  return (
    <div className="flex gap-1" title={title}>
      {cue.source && (
        <Button variant="outline" size="xs" disabled={locked} aria-label={t`Edit cue at ${name}`} onClick={onEdit}>
          <Pencil aria-hidden /> <Trans>Edit</Trans>
        </Button>
      )}
      <Button variant="outline" size="xs" disabled={locked} aria-label={t`Remove cue at ${name}`} onClick={onRemove}>
        <X aria-hidden />
      </Button>
    </div>
  );
}
