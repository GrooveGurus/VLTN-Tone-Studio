import { useSession, type PerformanceSession } from "@/song/performance/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { preparationSettings, usePreparationDefaults } from "@/song/performance/start-preparation";
import { readOptions, setSetting } from "@/song/performance/settings";
import { useSongSettingsRevision } from "@/song/performance/use-song-settings";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

/** Song overrides keep the wait and automatic opening presets separate from the musical timeline. */
export function SongPreparationSettings({ songKey, locked, session }: { songKey: string; locked: boolean; session: PerformanceSession }) {
  const used = useSession(session, (state) => state.preparationOnceUsed);
  useSongSettingsRevision(songKey);
  const defaults = usePreparationDefaults((state) => state.settings);
  const options = readOptions<Record<string, unknown>>(songKey, {});
  const settings = preparationSettings(options.preparation, defaults);
  const save = (patch: Partial<typeof settings>) =>
    setSetting(songKey, ":options", JSON.stringify({ ...readOptions(songKey, {}), preparation: { ...settings, ...patch } }));
  return (
    <section aria-label={t`Before song preparation`} className="space-y-2 rounded border border-seam p-3 text-sm">
      <h3 className="font-medium"><Trans>Before song</Trans></h3>
      <p>
        <Trans>Prepare pedals → presets and your commands → loading wait → song BPM → Ready. Play then starts the count-in and song. Play on its own prepares
        automatically when enabled. Preparation is off by default; disabled Before song commands are skipped with a warning.</Trans>
      </p>
      <fieldset disabled={locked} className="flex flex-wrap items-center gap-3">
        <label>
          <input type="checkbox" checked={settings.enabled} onChange={(event) => save({ enabled: event.target.checked })} /> <Trans>Prepare pedals before playback</Trans>
        </label>
        <label>
          <Trans>Preset loading wait (seconds)</Trans>
          <Input
            aria-label={t`Pedal preparation wait`}
            className="w-24"
            type="number"
            min={0}
            max={10}
            step={0.1}
            value={settings.settleMs / 1000}
            onChange={(event) => {
              if (Number.isFinite(event.target.valueAsNumber)) save({ settleMs: event.target.valueAsNumber * 1000 });
            }}
          />
        </label>
        <label>
          <Trans>Gap between setup commands (seconds)</Trans>
          <Input
            aria-label={t`Preparation command gap`}
            className="w-24"
            type="number"
            min={0}
            max={10}
            step={0.1}
            value={(settings.commandGapMs ?? 0) / 1000}
            onChange={(event) => {
              if (Number.isFinite(event.target.valueAsNumber)) save({ commandGapMs: event.target.valueAsNumber * 1000 });
            }}
          />
        </label>
        <label>
          <input type="checkbox" checked={settings.openingPresets} onChange={(event) => save({ openingPresets: event.target.checked })} /> <Trans>Prepare opening
          preset changes automatically</Trans>
        </label>
        <Button size="sm" variant="outline" onClick={() => usePreparationDefaults.getState().set(settings)}>
          <Trans>Use these as defaults</Trans>
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setSetting(songKey, ":options", JSON.stringify({ ...readOptions(songKey, {}), preparation: undefined }))}
        >
          <Trans>Use default settings</Trans>
        </Button>
      </fieldset>
      <p>
        <Trans>In Song MIDI cues choose When → Before song. Add named pedal commands, raw MIDI or macros; use ↑/↓ to order command lines. Opening Program Change and
        bank-select messages can run early automatically; drum/looper starts and notes keep their song times.</Trans>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span>
          <Trans>{used} once command line</Trans>{used === 1 ? "" : "s"} <Trans>used for this song load.</Trans>
        </span>
        <Button size="sm" variant="outline" disabled={locked || used === 0} onClick={session.resetPreparationCommands}>
          <Trans>Reset once commands</Trans>
        </Button>
      </div>
      <p>
        <Trans>Prepare again respects each command’s Repeat rule. Once commands stay used after sending begins, including cancellation or a lost connection. Reset once
        commands allows them on the next preparation; it sends nothing by itself.</Trans>
      </p>
      <p>
        <Trans>Wait after on a command line applies once after its entire bank/preset pair or macro. These waits add to the gap between commands and the final loading
        wait. Use zero for the global gap or loading wait when you want only individual command waits.</Trans>
      </p>
      <p>
        <Trans>Automatic GP tempo follows your preparation commands. If your commands set a different tempo, turn off automatic song BPM. Cancel start clears queued
        commands and prevents the song from starting; commands already received by a pedal cannot be undone.</Trans>
      </p>
    </section>
  );
}
