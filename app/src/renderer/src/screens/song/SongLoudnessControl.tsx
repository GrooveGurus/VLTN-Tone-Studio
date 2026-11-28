import { useState } from "react";
import { measureLoudnessInWorker } from "@/song/audio/loudness-client";
import { loudnessStatus, TARGET_LUFS, withLoudness, type SongLoudness } from "@/song/audio/loudness";
import { getSetting, setSetting } from "@/song/performance/settings";
import type { PcmAudio } from "@/song/types";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

/**
 * Normalises a song's volume to the target loudness. The song is measured once, in a worker, and the level is kept with the song. The
 * gain is applied to every track, so the mix keeps its balance.
 */
export function SongLoudnessControl({
  audio,
  storageKey,
  value,
  onChange,
}: {
  audio: PcmAudio | null;
  storageKey: string;
  value: SongLoudness;
  onChange: (next: SongLoudness) => void;
}) {
  const [measuring, setMeasuring] = useState(false);
  const [error, setError] = useState("");
  const save = (next: SongLoudness) => {
    setSetting(storageKey, ":options", withLoudness(getSetting(storageKey, ":options"), next));
    onChange(next);
  };
  const toggle = async (normalise: boolean) => {
    setError("");
    // A song measured by an earlier version has no peak, so it is measured again the next time normalising is turned on.
    if (!normalise || (value.lufs !== null && value.peakDb !== null)) return save({ ...value, normalise });
    if (!audio) return setError(t`Load the song before normalising it.`);
    setMeasuring(true);
    try {
      const { lufs, peakDb } = await measureLoudnessInWorker(audio);
      if (!Number.isFinite(lufs)) return setError(t`This song is silent, so there is nothing to normalise.`);
      save({ lufs, peakDb, normalise: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setMeasuring(false);
    }
  };
  return (
    <section aria-label={t`Song loudness`} className="flex flex-wrap items-center gap-3 text-sm">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          aria-label={t`Normalise song volume`}
          checked={value.normalise}
          disabled={measuring}
          onChange={(e) => void toggle(e.target.checked)}
        />
        <Trans>Normalise song volume to {TARGET_LUFS} LUFS</Trans>
      </label>
      <span className="opacity-70">
        {measuring ? t`Measuring…` : loudnessStatus(value)}
      </span>
      {error && (
        <span role="alert" className="text-led-fault">
          {error}
        </span>
      )}
    </section>
  );
}
