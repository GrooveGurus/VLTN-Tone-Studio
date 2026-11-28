import { useMidiConfiguration } from "@/song/performance/midi-configuration";
import type { PerformanceSession } from "@/song/performance/session";
import { parseOffset, TIMECODE_RATES, type TimecodeRate } from "@/song/performance/timecode";
import { HelpNote } from "@/components/ui/help-note";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

const field = "rounded border border-seam bg-transparent p-2";

/**
 * MIDI timecode: on or off, the frame rate (saved with the MIDI setup), and the song's own offset (saved with the song). Timecode and
 * app MIDI clock are exclusive, so turning timecode on turns the clock off.
 */
export function TimecodeSettings({
  session,
  offset,
  onOffset,
  bluetooth,
}: {
  session: PerformanceSession;
  offset: string;
  onOffset: (value: string) => void;
  bluetooth: boolean;
}) {
  const timecode = useMidiConfiguration((s) => s.timecode);
  const update = useMidiConfiguration((s) => s.update);
  const parsed = parseOffset(offset || "00:00:00:00", timecode.fps);
  return (
    <div className="w-full space-y-2 rounded border border-seam p-3 text-sm" aria-label={t`MIDI timecode`}>
      <label>
        <input
          type="checkbox"
          aria-label={t`Send MIDI timecode`}
          checked={timecode.enabled}
          onChange={(e) => {
            session.pause();
            if (e.target.checked) session.setClock(false);
            update({ timecode: { ...timecode, enabled: e.target.checked } });
          }}
        /><Trans>{" "}
        Send MIDI timecode (quarter frames)</Trans>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <label>
          <Trans>Frame rate{" "}</Trans>
          <select
            aria-label={t`Timecode frame rate`}
            className={field}
            value={timecode.fps}
            onChange={(e) => {
              session.pause();
              update({ timecode: { ...timecode, fps: Number(e.target.value) as TimecodeRate } });
            }}
          >
            {TIMECODE_RATES.map((fps) => (
              <option key={fps} value={fps}>
                <Trans>{fps} fps</Trans>
              </option>
            ))}
          </select>
        </label>
        <label>
          <Trans>This song’s offset (HH:MM:SS:FF){" "}</Trans>
          <input
            aria-label={t`Song timecode offset`}
            className={field + " w-36 font-mono"}
            value={offset}
            placeholder="00:00:00:00"
            onChange={(e) => onOffset(e.target.value)}
          />
        </label>
      </div>
      {"error" in parsed && offset.trim() && (
        <p role="alert" className="text-silkscreen-3">
          {parsed.error}
        </p>
      )}
      <HelpNote>
        <p>
          <Trans>Timecode follows song time. A full frame goes out at start, seek, jumps, loops and speed changes, then quarter frames. Nothing is sent during the
          count-in. Timecode replaces app MIDI clock. 29.97 drop-frame is not offered.</Trans>
          {bluetooth ? t` Bluetooth is not recommended for timecode: use USB.` : ""}
        </p>
      </HelpNote>
    </div>
  );
}
