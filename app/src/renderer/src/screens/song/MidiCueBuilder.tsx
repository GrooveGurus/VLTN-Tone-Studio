import { PreparationTimingFields } from "./PreparationTimingFields";
import { PREPARATION_REPEAT_LABELS, type PreparationRepeat } from "@/song/performance/preparation-repeat";
import { preparationLine } from "@/song/performance/start-preparation";
import { SettingsCard } from "@/components/ui/settings-card";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cueCommandText, cueTokenFor } from "@/song/performance/cue-token";
import { CueRowButtons } from "./CueRowButtons";
import { lrcTime, midiCommand, type Cue } from "@/song/performance/chart";
import { describeSectionCue, sectionChoices, sectionLine } from "@/song/performance/section-cues";
import { clockPosition } from "@/song/performance/playback-clock";
import { saveMacro, useMidiConfiguration } from "@/song/performance/midi-configuration";
import { macroCodeFor } from "@/song/performance/midi-macros";
import { MacroPanel } from "./MacroPanel";
import { PedalMidiPicker } from "./PedalMidiPicker";
import { HelpNote } from "@/components/ui/help-note";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

const CHANGED = "The chart text changed since these cues were read, so nothing was changed. Check the cue list and try again.";

export function MidiCueBuilder({
  cues,
  sections = [],
  onAdd,
  onRemove,
  onReplace,
  onPrepare,
  onMovePreparation,
  onPreparationRepeat,
  onPreparationWait,
  locked = false,
  onShowChart,
  onTest,
  canTest,
}: {
  cues: Cue[];
  /** The song's sections, which a cue can be put on. */
  sections?: { name: string; start: number }[];
  onAdd: (line: string) => void;
  /** Takes the cue's token out of the chart. Returns a function that puts it back (false when the chart changed since), or null when the chart changed and nothing was removed. */
  onRemove: (cue: Cue) => (() => boolean) | null;
  /** Replaces the cue's token (and its timestamp, when `time` is given). Returns false when the chart changed and nothing was replaced. */
  onReplace: (cue: Cue, token: string, time?: number) => boolean;
  onPrepare?: (cue: Cue) => boolean;
  onMovePreparation?: (cue: Cue, direction: 1 | -1) => boolean;
  onPreparationRepeat?: (cue: Cue, repeat: PreparationRepeat) => boolean;
  onPreparationWait?: (cue: Cue, milliseconds: number) => boolean;
  /** True while cues are armed and the song plays, when the chart is not changed under the performance. */
  locked?: boolean;
  /** Goes to the view where the chart text is edited directly. */
  onShowChart?: () => void;
  onTest: (bytes: number[]) => void;
  canTest: boolean;
}) {
  const [seconds, setSeconds] = useState(0),
    [channel, setChannel] = useState(1);
  const [type, setType] = useState("pc"),
    [number, setNumber] = useState(0),
    [value, setValue] = useState(127),
    [error, setError] = useState("");
  const [when, setWhen] = useState<"time" | "section" | "prepare">("time"),
    [choiceId, setChoiceId] = useState("");
  const [repeat, setRepeat] = useState<PreparationRepeat>("always");
  const [waitMs, setWaitMs] = useState(0);
  const choices = sectionChoices(sections),
    choice = choices.find((c) => c.id === choiceId) ?? choices[0];
  const [editing, setEditing] = useState<Cue | null>(null),
    [editText, setEditText] = useState(""),
    [removed, setRemoved] = useState<{ label: string; undo: () => boolean } | null>(null);
  const macros = useMidiConfiguration((s) => s.macros);
  const field = "ml-2 rounded border border-seam bg-background p-2";
  // On a section, the pickers' lines are written for the section instead of a time.
  const add = (line: string) => {
    if (locked) {
      setError(t`Stop playback or cancel preparation before changing cues.`);
      return;
    }
    onAdd(when === "prepare" ? preparationLine(line, repeat, waitMs) : when === "section" && choice ? sectionLine(line, choice.target) : line);
  };
  const whenLabel = (cue: Cue) =>
    cue.trigger === "section"
      ? describeSectionCue(cue, sections).text
      : cue.trigger === "prepare"
        ? "Before song"
        : cue.trigger
          ? `On ${cue.trigger}`
          : lrcTime(cue.time);
  const command = () => {
    if (when === "time" && (!Number.isFinite(seconds) || seconds < 0)) throw new Error(t`Cue time must be zero or more seconds.`);
    const text = `${type} ${channel} ${number}${type === "cc" ? ` ${value}` : ""}`;
    return { text, bytes: midiCommand(text) };
  };
  const run = (test: boolean) => {
    if (locked) {
      setError(t`Stop playback or cancel preparation before sending commands.`);
      return;
    }
    try {
      const cue = command();
      setError("");
      if (test) onTest(cue.bytes);
      else add(`${lrcTime(when === "time" ? seconds : 0)} {midi:${cue.text}}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  // The song's file messages are many and are shown in the MIDI file field, not in this table.
  const scheduled = cues
    .filter((cue) => cue.messages.length && !cue.fromFile)
    .sort((a, b) => Number(b.trigger === "prepare") - Number(a.trigger === "prepare"));
  const saveRaw = () => {
    try {
      const cue = command();
      saveMacro({ code: macroCodeFor(cue.text, macros), label: cue.text.slice(0, 60), commands: [cue.text] });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const startEdit = (cue: Cue) => {
    setEditing(cue);
    setRepeat(cue.prepareRepeat ?? "always");
    setWhen(cue.trigger === "prepare" ? "prepare" : cue.trigger === "section" ? "section" : "time");
    setEditText(cueCommandText(cue) ?? "");
    setSeconds(cue.time);
    setRemoved(null);
    setError("");
  };
  const remove = (cue: Cue) => {
    const undo = onRemove(cue);
    if (!undo) return setError(CHANGED);
    setError("");
    if (editing) setEditing(null);
    setRemoved({ label: whenLabel(cue), undo });
  };
  const update = () => {
    if (!editing) return;
    try {
      const token = cueTokenFor(editing, editText, macros);
      // The timestamp is only rewritten when it was changed, so the chart keeps its own spelling of a time that stays.
      const moved = !editing.trigger && lrcTime(seconds) !== lrcTime(editing.time);
      if (moved && (!Number.isFinite(seconds) || seconds < 0)) throw new Error(t`Cue time must be zero or more seconds.`);
      if (!onReplace(editing, token, moved ? seconds : undefined)) throw new Error(CHANGED);
      setEditing(null);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const describe = (bytes: number[]) =>
    (bytes[0] & 0xf0) === 0xc0
      ? `PC ${bytes[1]}`
      : (bytes[0] & 0xf0) === 0xb0
        ? `CC ${bytes[1]} = ${bytes[2]}`
        : bytes.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
  return (
    <SettingsCard title={t`Song MIDI cues`} summary={t`${cues.length} cue${cues.length === 1 ? "" : "s"}`} storageKey="midi-cues">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label>
          <Trans>When</Trans>
          <select
            aria-label={t`Cue when`}
            className={field}
            value={when}
            onChange={(e) => setWhen(e.target.value === "prepare" ? "prepare" : e.target.value === "section" ? "section" : "time")}
          >
            <option value="time"><Trans>At time</Trans></option>
            <option value="prepare"><Trans>Before song</Trans></option>
            <option value="section" disabled={!choices.length}>
              <Trans>On section</Trans>
            </option>
          </select>
        </label>
        {when === "section" && choice ? (
          <label>
            <Trans>Section</Trans>
            <select aria-label={t`Cue section`} className={field} value={choice.id} onChange={(e) => setChoiceId(e.target.value)}>
              {choices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        ) : when === "time" ? (
          <>
            <label>
              <Trans>At seconds</Trans>
              <input
                aria-label={t`Cue time in seconds`}
                className={field + " w-24"}
                type="number"
                min="0"
                step="0.01"
                value={seconds}
                onChange={(e) => setSeconds(e.target.valueAsNumber)}
              />
            </label>
            <Button variant="outline" onClick={() => setSeconds(Math.round(clockPosition() * 100) / 100)}>
              <Trans>Use playback time</Trans>
            </Button>
          </>
        ) : (
          <p><Trans>Runs in chart order during preparation, before the count-in and first note.</Trans></p>
        )}
      </div>
      {when === "prepare" && !editing && <PreparationTimingFields repeat={repeat} waitMs={waitMs} onRepeat={setRepeat} onWait={setWaitMs} disabled={locked} />}
      {when === "prepare" && (
        <p className="text-xs text-silkscreen-3">
          <Trans>Every start includes resumes and Prepare again. Only from beginning uses the trimmed song start. Once per song load runs on the first preparation;
          cancellation and reconnection do not re-enable it.</Trans>
        </p>
      )}
      {editing && (
        <div role="group" aria-label={t`Edit cue`} className="flex flex-wrap items-center gap-3 rounded border border-seam p-3 text-sm">
          <span>
            <Trans>Editing the cue</Trans> {editing.trigger === "section" ? whenLabel(editing) : editing.trigger ? t`on ${editing.trigger}` : t`at ${lrcTime(editing.time)}`}<Trans>.
            Change the time above and the command here.</Trans>
          </span>
          <input aria-label={t`Cue command text`} className={field + " w-64 font-mono"} value={editText} onChange={(e) => setEditText(e.target.value)} />
          <Button onClick={update}><Trans>Update cue</Trans></Button>
          <Button variant="outline" onClick={() => setEditing(null)}>
            <Trans>Cancel</Trans>
          </Button>
        </div>
      )}
      <PedalMidiPicker time={when === "time" ? seconds : 0} onAdd={add} onTest={onTest} canTest={canTest && !locked} />
      <details>
        <summary className="cursor-pointer text-sm"><Trans>Raw MIDI command</Trans></summary>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label>
            <Trans>Channel</Trans>
            <input
              aria-label={t`Cue MIDI channel`}
              className={field + " w-20"}
              type="number"
              min="1"
              max="16"
              value={channel}
              onChange={(e) => setChannel(e.target.valueAsNumber)}
            />
          </label>
          <label>
            <Trans>Command</Trans>
            <select aria-label={t`Cue command`} className={field} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="pc"><Trans>Program Change</Trans></option>
              <option value="cc"><Trans>Control Change</Trans></option>
            </select>
          </label>
          <label>
            {type === "pc" ? t`Program (0–127)` : t`Controller (0–127)`}
            <input
              aria-label={t`Cue command number`}
              className={field + " w-20"}
              type="number"
              min="0"
              max="127"
              value={number}
              onChange={(e) => setNumber(e.target.valueAsNumber)}
            />
          </label>
          {type === "cc" && (
            <label>
              <Trans>Value</Trans>
              <input
                aria-label={t`Cue CC value`}
                className={field + " w-20"}
                type="number"
                min="0"
                max="127"
                value={value}
                onChange={(e) => setValue(e.target.valueAsNumber)}
              />
            </label>
          )}
          <Button onClick={() => run(false)}><Trans>Add MIDI cue</Trans></Button>
          <Button variant="outline" disabled={!canTest} onClick={() => run(true)}>
            <Trans>Send MIDI now</Trans>
          </Button>
          <Button variant="outline" onClick={saveRaw}>
            <Trans>Save as macro</Trans>
          </Button>
        </div>
      </details>
      <details>
        <summary className="cursor-pointer text-sm"><Trans>MIDI macros</Trans></summary>
        <div className="py-2">
          <MacroPanel time={when === "time" ? seconds : 0} onAdd={add} onTest={onTest} canTest={canTest && !locked} />
        </div>
      </details>
      <HelpNote>
        <p>
          <Trans>Set the channel to the target pedal. Added cues are saved in this song’s chart and sent during playback when Send cues is enabled. Program numbers are
          wire values: a pedal labelled 1–128 may display one higher. Send MIDI now transmits immediately to the selected output.</Trans>
        </p>
      </HelpNote>
      {scheduled.length ? (
        <div className="max-h-48 overflow-auto">
          <table aria-label={t`Scheduled MIDI cues`} className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-2"><Trans>Time</Trans></th>
                <th className="p-2"><Trans>Pedal / action</Trans></th>
                <th className="p-2"><Trans>Channel</Trans></th>
                <th className="p-2">MIDI</th>
                <th className="p-2">
                  <Trans><span className="sr-only">Actions</span></Trans>
                </th>
              </tr>
            </thead>
            <tbody>
              {scheduled.map((cue, i) => (
                <tr key={i} className="border-t border-seam">
                  <td className="p-2 font-mono" title={cue.trigger === "section" ? describeSectionCue(cue, sections).times : undefined}>
                    {whenLabel(cue)}
                  </td>
                  <td className="p-2">
                    {cue.label || t`Raw MIDI command`}
                    {cue.trigger === "prepare" && <div className="text-xs text-silkscreen-3">{PREPARATION_REPEAT_LABELS[cue.prepareRepeat ?? "always"]}</div>}
                  </td>
                  <td className="p-2">{[...new Set(cue.messages.map((bytes) => (bytes[0] < 0xf0 ? (bytes[0] & 15) + 1 : "System")))].join(", ")}</td>
                  <td className="p-2 font-mono">{cue.messages.map(describe).join(" → ")}</td>
                  <td className="p-2">
                    {(
                      <div className="flex flex-wrap items-center gap-1">
                        {cue.trigger === "prepare" &&
                          cue.source &&
                          scheduled.findIndex((other) => other.trigger === "prepare" && other.source?.line === cue.source?.line) === i && (
                            <PreparationTimingFields
                              name={cue.label || `command ${i + 1}`}
                              repeat={cue.prepareRepeat ?? "always"}
                              disabled={locked}
                              waitMs={Math.max(
                                0,
                                ...scheduled
                                  .filter((other) => other.trigger === "prepare" && other.source?.line === cue.source?.line)
                                  .map((other) => other.prepareWaitMs ?? 0),
                              )}
                              onRepeat={
                                onPreparationRepeat
                                  ? (value) => {
                                      if (!onPreparationRepeat(cue, value)) setError(CHANGED);
                                    }
                                  : undefined
                              }
                              onWait={
                                onPreparationWait
                                  ? (value) => {
                                      if (!onPreparationWait(cue, value)) setError(CHANGED);
                                    }
                                  : undefined
                              }
                            />
                          )}
                        <CueRowButtons cue={cue} locked={locked} sections={sections} onEdit={() => startEdit(cue)} onRemove={() => remove(cue)} />
                        {cue.trigger !== "prepare" && cue.trigger !== "section" && onPrepare && (cue.source || cue.line) && (
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={locked}
                            onClick={() => {
                              if (!onPrepare(cue)) setError(CHANGED);
                            }}
                          >
                            <Trans>Move before song</Trans>
                          </Button>
                        )}
                        {cue.trigger === "prepare" &&
                          onMovePreparation &&
                          cue.source &&
                          scheduled.findIndex((other) => other.trigger === "prepare" && other.source?.line === cue.source?.line) === i && (
                            <>
                              <Button
                                size="xs"
                                variant="outline"
                                disabled={locked}
                                aria-label={t`Move preparation command ${i + 1} up`}
                                onClick={() => {
                                  if (!onMovePreparation(cue, -1)) setError(t`Already first, or this line needs editing in the chart.`);
                                }}
                              >
                                ↑
                              </Button>
                              <Button
                                size="xs"
                                variant="outline"
                                disabled={locked}
                                aria-label={t`Move preparation command ${i + 1} down`}
                                onClick={() => {
                                  if (!onMovePreparation(cue, 1)) setError(t`Already last, or this line needs editing in the chart.`);
                                }}
                              >
                                ↓
                              </Button>
                            </>
                          )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-silkscreen-3"><Trans>Multi-message actions are sent in the order shown.</Trans></p>
          {scheduled.some((cue) => !cue.source) && (
            <p className="text-xs text-silkscreen-3">
              <Trans>Some cues share a line with other cues or timestamps, so they are changed in the chart text. To change the chart text directly, open Lyrics &
              chords → Edit chords, lyrics & MIDI</Trans>
              {onShowChart && (
                <>
                  {" "}
                  <Button variant="outline" size="xs" onClick={onShowChart}>
                    <Trans>Open Lyrics & chords</Trans>
                  </Button>
                </>
              )}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-silkscreen-3"><Trans>No MIDI cues in this song yet.</Trans></p>
      )}
      {removed && (
        <p role="status" className="flex items-center gap-3 text-sm">
          <Trans>Removed the cue {removed.label}.</Trans>
          <Button
            variant="outline"
            size="xs"
            onClick={() => {
              if (removed.undo()) setError("");
              else setError(CHANGED);
              setRemoved(null);
            }}
          >
            <Trans>Undo</Trans>
          </Button>
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-400">
          {error}
        </p>
      )}
    </SettingsCard>
  );
}
