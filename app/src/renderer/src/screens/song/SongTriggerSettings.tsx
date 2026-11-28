import { SettingsCard } from "@/components/ui/settings-card";
import { Checkbox } from "@/components/ui/checkbox";
import type { LibrarySong } from "@shared/song-library";
import { describeBinding } from "@/song/performance/bindings";
import { useMidiConfiguration } from "@/song/performance/midi-configuration";
import {
  WHILE_PLAYING_OPTIONS,
  bindingClaiming,
  songEntries,
  triggerClashes,
  type SongScope,
  type SongTriggerSettings as Options,
  type WhilePlaying,
} from "@/song/performance/song-triggers";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

const field = "rounded border border-seam bg-transparent p-2 text-[13px]";

/**
 * Whether songs load from MIDI, and how. Each song's own trigger is set in its song options. Below the options, every song whose trigger
 * another song shares, or a remote binding answers, is named, so the library can be fixed before a set.
 */
export function SongTriggerSettings({ songs: library, inputReady }: { songs: readonly LibrarySong[]; inputReady: boolean }) {
  const options = useMidiConfiguration((s) => s.songTriggers);
  const bindings = useMidiConfiguration((s) => s.bindings);
  const songs = songEntries(library);
  const save = (patch: Partial<Options>) => useMidiConfiguration.getState().update({ songTriggers: { ...options, ...patch } });
  const withTrigger = songs.flatMap((song) => (song.trigger ? [{ title: song.title, trigger: song.trigger }] : []));
  // A clash is named once, on the later song of the pair, so the list does not say the same thing twice.
  const clashLines = songs.flatMap((song) => {
    const earlier = triggerClashes(songs, song.id).filter((other) => songs.indexOf(other) < songs.indexOf(song));
    return earlier.length ? [t`${song.title}: same trigger as ${earlier.map((other) => other.title).join(", ")}. The first song in the library loads.`] : [];
  });
  const boundLines = withTrigger.flatMap((song) => {
    const binding = bindingClaiming(song.trigger, bindings);
    return binding ? [`${song.title}: ${describeBinding(binding)} runs a remote action on its message, so the song does not load.`] : [];
  });
  const hint = WHILE_PLAYING_OPTIONS.find((option) => option.id === options.whilePlaying)?.hint;
  return (
    <SettingsCard
      title={t`Load songs from MIDI`}
      summary={t`${withTrigger.length} song${withTrigger.length === 1 ? "" : "s"} with a trigger`}
      storageKey="song-triggers"
      defaultOpen={false}
    >
      <p className="text-[12px] text-silkscreen-3">
        <Trans>{withTrigger.length} song</Trans>{withTrigger.length === 1 ? "" : "s"} <Trans>with a trigger. Triggers listen on the selected MIDI input, and our own output is
        ignored.</Trans>
      </p>
      <label className="flex items-center gap-2 text-[13px]">
        <Checkbox aria-label={t`Load songs from MIDI`} checked={options.listen} onCheckedChange={(checked) => save({ listen: checked === true })} />
        <Trans>Load songs from MIDI on the selected input</Trans>
      </label>
      {!inputReady && <p className="text-[12px] text-silkscreen-3"><Trans>Choose a MIDI input in MIDI setup. Triggers do nothing without one.</Trans></p>}
      <div className="flex flex-wrap items-start gap-4">
        <label className="flex flex-col gap-1 text-[13px]">
          <Trans>Songs that can load</Trans>
          <select aria-label={t`Song trigger scope`} className={field} value={options.scope} onChange={(e) => save({ scope: e.target.value as SongScope })}>
            <option value="library"><Trans>Whole library</Trans></option>
            <option value="playlist"><Trans>Current playlist only</Trans></option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <Trans>While a song plays</Trans>
          <select
            aria-label={t`While a song plays`}
            className={field}
            value={options.whilePlaying}
            onChange={(e) => save({ whilePlaying: e.target.value as WhilePlaying })}
          >
            {WHILE_PLAYING_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {hint && <span className="max-w-72 text-[12px] text-silkscreen-3">{hint}</span>}
        </label>
      </div>
      <label className="flex items-center gap-2 text-[13px]">
        <Checkbox aria-label={t`Start a song loaded from MIDI`} checked={options.autoplay} onCheckedChange={(checked) => save({ autoplay: checked === true })} />
        <Trans>Start a song as soon as a trigger loads it</Trans>
      </label>
      {(clashLines.length > 0 || boundLines.length > 0) && (
        <ul aria-label={t`Trigger conflicts`} className="flex flex-col gap-1 text-[12px] text-silkscreen-2">
          {[...clashLines, ...boundLines].map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </SettingsCard>
  );
}
