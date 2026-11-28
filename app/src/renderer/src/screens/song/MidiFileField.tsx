import { SettingsCard } from "@/components/ui/settings-card";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { decodeMidiFile, encodeMidiFile, parseSmf, type MidiFileOption } from "@/song/performance/smf";
import { HelpNote } from "@/components/ui/help-note";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

/** Attaches a song's standard MIDI file. The file is read first, so one that cannot play is refused and never saved. */
type Summary = { count: number; seconds: number } | { error: string };

/** The bytes of a picked file. FileReader works in every place the app runs, including the test DOM. */
function readFile(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (reader.result instanceof ArrayBuffer ? resolve(new Uint8Array(reader.result)) : reject(new Error(t`The file could not be read.`)));
    reader.onerror = () => reject(new Error(t`The file could not be read.`));
    reader.readAsArrayBuffer(file);
  });
}

export function MidiFileField({ file, onChange }: { file: MidiFileOption | null; onChange: (file: MidiFileOption | null) => void }) {
  const [error, setError] = useState("");
  const summary = useMemo<Summary | null>(() => {
    if (!file) return null;
    try {
      const messages = parseSmf(decodeMidiFile(file));
      return { count: messages.length, seconds: messages.at(-1)?.time ?? 0 };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [file]);
  const attach = async (picked: File) => {
    try {
      const bytes = await readFile(picked);
      parseSmf(bytes);
      onChange(encodeMidiFile(picked.name, bytes));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <SettingsCard title={t`Song MIDI file`} summary={file ? file.name : t`No file attached`} storageKey="midi-file">
      <HelpNote>
        <p><Trans>A standard MIDI file (format 0 or 1) plays alongside the chart’s cues, at the song’s speed, when Send cues is on. It is saved with the song.</Trans></p>
      </HelpNote>
      {file && (
        <p role="status">
          {file.name}
          {summary && "count" in summary ? t` · ${summary.count} messages · ${summary.seconds.toFixed(1)} s` : ""}
          {summary && "error" in summary ? t` · cannot play: ${summary.error}` : ""}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <label>
          <Trans>Attach .mid file{" "}</Trans>
          <input
            aria-label={t`Song MIDI file input`}
            type="file"
            accept=".mid,.midi,audio/midi"
            onChange={(e) => {
              const picked = e.target.files?.[0];
              e.target.value = "";
              if (picked) void attach(picked);
            }}
          />
        </label>
        {file && (
          <Button variant="outline" onClick={() => onChange(null)}>
            <Trans>Remove MIDI file</Trans>
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-red-400">
          {error}
        </p>
      )}
    </SettingsCard>
  );
}
