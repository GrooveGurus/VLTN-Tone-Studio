// The lyrics part of the Analyse songs dialog: the model and quality (the same pickers as the lyrics panel), which songs' lyrics to replace,
// whether the performer's own lines are timed again, and what the run will roughly take and download.

import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { saveLyricsChoice, type LyricsChoice } from "@/song/performance/lyrics-options";
import { downloadMegabytes, findLyricsModel, lyricsMinutes } from "@/song/performance/lyrics-models";
import type { LyricsWhich } from "@/song/analysis/batch";
import { LyricsModelPicker, useWebGpu } from "./LyricsModelPicker";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

/** The song length the estimate assumes. The dialog does not read each song's length. */
const ASSUMED_SONG_MINUTES = 4;

const WHICH_LABELS: { id: LyricsWhich; label: string }[] = [
  { id: "empty", get label() { return t`Songs with no lyrics`; } },
  { id: "transcribed", get label() { return t`Songs whose lyrics Tone Studio made`; } },
  { id: "older", get label() { return t`Lyrics made with a different model than this one`; } },
];

export function LyricsBatchSettings({
  choice,
  onChoice,
  which,
  onWhich,
  retime,
  onRetime,
  unknown,
  onUnknown,
  plan,
  disabled,
  songs,
}: {
  choice: LyricsChoice;
  onChoice(next: LyricsChoice): void;
  which: LyricsWhich;
  onWhich(next: LyricsWhich): void;
  retime: boolean;
  onRetime(next: boolean): void;
  unknown: boolean;
  onUnknown(next: boolean): void;
  /** What the run will do with the lyrics, read before it starts. */
  plan: string;
  disabled: boolean;
  /** How many songs the lyrics step will run for. */
  songs: number;
}) {
  const webgpu = useWebGpu();
  const model = findLyricsModel(choice.model);
  const minutes = Math.round(lyricsMinutes(choice.model, choice.quality, ASSUMED_SONG_MINUTES) * songs);
  return (
    <div className="space-y-3 rounded-lg border border-seam p-3 text-sm">
      <LyricsModelPicker
        choice={choice}
        disabled={disabled}
        onChange={(next) => {
          onChoice(next);
          saveLyricsChoice(next);
        }}
      />
      <RadioGroup aria-label={t`Which lyrics to replace`} value={which} onValueChange={(v) => onWhich(v as LyricsWhich)} disabled={disabled} className="gap-1">
        {WHICH_LABELS.map((item) => (
          <label key={item.id} className="flex items-center gap-2">
            <RadioGroupItem value={item.id} />
            <span>{item.label}</span>
          </label>
        ))}
      </RadioGroup>
      <label className="flex items-center gap-2">
        <Checkbox checked={retime} disabled={disabled} onCheckedChange={(value) => onRetime(value === true)} />
        <Trans><span>Time my pasted lyrics again (their text is kept)</span></Trans>
      </label>
      <div className="space-y-1">
        <label className="flex items-center gap-2">
          <Checkbox checked={unknown} disabled={disabled} onCheckedChange={(value) => onUnknown(value === true)} />
          <Trans><span>Include lyrics from before version 0.9.2</span></Trans>
        </label>
        <p className="text-[12px] text-silkscreen-3">
          <Trans>Tone Studio can&apos;t tell whether you typed these. The old lyrics are kept and can be restored on each song.</Trans>
        </p>
      </div>
      <p role="status" className="font-medium text-silkscreen-2">
        {plan}
      </p>
      <p className="text-[12px] text-silkscreen-3">
        <Trans>Your own charts are never replaced. About</Trans> {minutes > 0 ? t`${minutes} min` : t`under a minute`} <Trans>for {songs} song</Trans>{songs === 1 ? "" : "s"} <Trans>of about{" "}
        {ASSUMED_SONG_MINUTES} minutes each. A rough guess until measured on this computer.</Trans>
      </p>
      {model && (
        <p className="text-[12px] text-silkscreen-3">
          <Trans>Downloads about {downloadMegabytes(model, webgpu)} MB once, the first time this model is used on this computer.</Trans>
        </p>
      )}
    </div>
  );
}
