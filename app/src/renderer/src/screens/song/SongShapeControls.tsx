import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { PcmAudio } from "@/song/types";
import { getSetting, readOptions, setSetting } from "@/song/performance/settings";
import { audibleRange, CROSSFADE_MAX_S } from "@/song/performance/transition";
import { END_BEHAVIOUR_LABELS, END_BEHAVIOURS, isEndBehaviour, shapeFromOptions, type StoredShape } from "@/song/performance/song-shape";
import type { SilenceEnds } from "@/song/analysis/silence";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

const field = "rounded border border-seam bg-transparent p-2";

/** A number from a text box; an empty box means the value is not set. */
const parse = (text: string): number | undefined => (text.trim() === "" ? undefined : Number(text));

/**
 * The song's trim, fades and end behaviour. They are saved in the song's options, and the player takes them on the next change of
 * the song's settings. Auto trims to the audible part of the song. A song with no trim start skips the silence at its start.
 */
export function SongShapeControls({
  songKey,
  audio,
  silence,
  onChange,
}: {
  songKey: string;
  audio: PcmAudio | null;
  /** The silence the analysis found at the ends of the song. Start silence is skipped by default; end silence is offered as a trim. */
  silence?: SilenceEnds | null;
  onChange: () => void;
}) {
  const [shape, setShape] = useState<StoredShape>(() => shapeFromOptions(getSetting(songKey, ":options")));
  const [note, setNote] = useState("");
  const save = (patch: Partial<StoredShape>) => {
    const next = { ...shape, ...patch };
    setShape(next);
    try {
      setSetting(songKey, ":options", JSON.stringify({ ...readOptions(songKey, {}), ...next }));
      onChange();
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    }
  };
  const auto = () => {
    const range = audio ? audibleRange(audio.channels, audio.sampleRate) : null;
    if (!range) {
      setNote(t`This song is silent, so there is no audible part to trim to.`);
      return;
    }
    setNote("");
    save({ trimStart: range.start, trimEnd: range.end });
  };
  const duration = audio ? (audio.channels[0]?.length ?? 0) / audio.sampleRate : 0;
  const trailing = silence ? duration - silence.end : 0;
  const offer = silence && trailing > 0 && shape.trimEnd === undefined ? silence : null;
  const fade = (text: string) => Math.max(0, Math.min(CROSSFADE_MAX_S, Number(text) || 0));
  // With no trim start of its own, the song starts after the silence the analysis found (see playerShapeFromOptions). 0 plays from the very start.
  const autoStart = shape.trimStart === undefined && silence && silence.start > 0 ? silence.start : undefined;
  return (
    <div aria-label={t`Song shape`} className="flex flex-wrap items-end gap-3 rounded border border-seam p-3">
      {offer && (
        <Button
          variant="outline"
          onClick={() => save({ trimEnd: offer.end })}
        >
          <Trans>Trim end silence ({trailing.toFixed(1)} s)</Trans>
        </Button>
      )}
      <label className="flex flex-col gap-1">
        <Trans>Trim start (s)</Trans>
        <input
          type="number"
          min={0}
          step={0.1}
          className={field}
          value={shape.trimStart ?? ""}
          placeholder={autoStart === undefined ? undefined : t`${autoStart.toFixed(1)} (silence skipped)`}
          title={t`Empty skips the silence at the start of the song. 0 plays from the very start.`}
          onChange={(e) => save({ trimStart: parse(e.target.value) })}
        />
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={shape.trimStart === 0} onChange={(e) => save({ trimStart: e.target.checked ? 0 : undefined })} />
        <Trans>Play from the very start</Trans>
      </label>
      <p className="w-full text-sm text-silkscreen-3">
        {autoStart !== undefined
          ? t`Automatically skipping ${autoStart.toFixed(1)} s of detected start silence. Quiet intros may be included; select Play from the very start to keep them.`
          : shape.trimStart === 0
            ? t`Playing from the very start, including any silence or quiet intro.`
            : shape.trimStart !== undefined
              ? t`Starting at ${shape.trimStart.toFixed(1)} s (manual trim).`
              : t`Playing from the very start; no start silence detected.`}
      </p>
      <label className="flex flex-col gap-1">
        <Trans>Trim end (s)</Trans>
        <input type="number" min={0} step={0.1} className={field} value={shape.trimEnd ?? ""} onChange={(e) => save({ trimEnd: parse(e.target.value) })} />
      </label>
      <Button variant="outline" disabled={!audio} title={t`Trim to the audible part of the song.`} onClick={auto}>
        <Trans>Auto</Trans>
      </Button>
      <Button
        variant="outline"
        disabled={shape.trimStart === undefined && shape.trimEnd === undefined}
        onClick={() => save({ trimStart: undefined, trimEnd: undefined })}
      >
        <Trans>Clear trim</Trans>
      </Button>
      <label className="flex flex-col gap-1">
        <Trans>Fade in (s)</Trans>
        <input type="number" min={0} max={CROSSFADE_MAX_S} step={0.5} className={field} value={shape.fadeIn} onChange={(e) => save({ fadeIn: fade(e.target.value) })} />
      </label>
      <label className="flex flex-col gap-1">
        <Trans>Fade out (s)</Trans>
        <input type="number" min={0} max={CROSSFADE_MAX_S} step={0.5} className={field} value={shape.fadeOut} onChange={(e) => save({ fadeOut: fade(e.target.value) })} />
      </label>
      <label className="flex flex-col gap-1">
        <Trans>At the end</Trans>
        <select
          className={field}
          value={shape.endBehaviour}
          onChange={(e) => {
            if (isEndBehaviour(e.target.value)) save({ endBehaviour: e.target.value });
          }}
        >
          {END_BEHAVIOURS.map((behaviour) => (
            <option key={behaviour} value={behaviour}>
              {END_BEHAVIOUR_LABELS[behaviour]}
            </option>
          ))}
        </select>
      </label>
      {note && (
        <p role="status" className="w-full text-sm text-silkscreen-3">
          {note}
        </p>
      )}
    </div>
  );
}
