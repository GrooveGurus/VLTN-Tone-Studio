import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { doubleTempo, halveTempo, nudgeGrid, shiftDownbeat, type BeatGrid } from "@/song/band/beat-grid";
import type { ChordAtBeat } from "@/song/band/harmony";
import { BandGrid } from "./BandGrid";
import { BassNoteEditor, BassNoteList, type BassNotesContext } from "./BassNotes";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

export interface BandGridSectionProps {
  grid: BeatGrid | null;
  harmony: readonly ChordAtBeat[];
  /** True while the panel is busy or the song plays: the grid's actions are then disabled. */
  blocked: boolean;
  busy: boolean;
  /** What the panel is doing now, shown with a spinner, or null. */
  work: string | null;
  /** Replaces the grid, from a correction or a found beat. */
  onGrid(grid: BeatGrid | null): void;
  onFind(): void;
  onCancel(): void;
  /** Builds the grid from the metronome's fixed tempo. */
  onFixed(): void;
  /** Writes a steady grid's tempo to the metronome. */
  onSetTempo(): void;
  /** The tempo the performer set by hand, which the beat is found from when `use` is on. Not shown when not given. */
  myTempo?: { bpm: number; use: boolean; onUse(use: boolean): void };
  /** The performer's bass notes (spec 87): the strip's beats pick one to edit, and the list shows them. Not shown when not given. */
  bassNotes?: Omit<BassNotesContext, "grid" | "harmony">;
}

/** The beat grid: find the beat, the corrections to it, the fixed tempo, and the strip that shows it. */
export function BandGridSection({
  grid,
  harmony,
  blocked,
  busy,
  work,
  onGrid,
  onFind,
  onCancel,
  onFixed,
  onSetTempo,
  myTempo,
  bassNotes,
}: BandGridSectionProps) {
  // The beat whose bass note is open in the editor. A beat is toggled off by picking it again.
  const [editing, setEditing] = useState<number | null>(null);
  return (
    <section aria-label={t`Beat grid`} className="flex min-w-0 flex-col gap-3">
      <h3 className="font-semibold"><Trans>Beat grid</Trans></h3>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={blocked} onClick={onFind}>
          <Trans>Find the beat</Trans>
        </Button>
        {myTempo && (
          <label className="flex items-center gap-1.5 text-xs">
            <Checkbox checked={myTempo.use} disabled={blocked} onCheckedChange={(value) => myTempo.onUse(value === true)} />
            <Trans>Use my tempo ({myTempo.bpm} BPM)</Trans>
          </label>
        )}
        <Button size="sm" variant="outline" disabled={blocked || !grid} onClick={() => grid && onGrid(halveTempo(grid))}>
          <Trans>Half tempo</Trans>
        </Button>
        <Button size="sm" variant="outline" disabled={blocked || !grid} onClick={() => grid && onGrid(doubleTempo(grid))}>
          <Trans>Double tempo</Trans>
        </Button>
        <Button size="sm" variant="outline" disabled={blocked || !grid} onClick={() => grid && onGrid(shiftDownbeat(grid, -1))}>
          <Trans>Downbeat ←</Trans>
        </Button>
        <Button size="sm" variant="outline" disabled={blocked || !grid} onClick={() => grid && onGrid(shiftDownbeat(grid, 1))}>
          <Trans>Downbeat →</Trans>
        </Button>
        <Button size="sm" variant="outline" disabled={blocked || !grid} onClick={() => grid && onGrid(nudgeGrid(grid, -0.01))}>
          <Trans>Nudge −10 ms</Trans>
        </Button>
        <Button size="sm" variant="outline" disabled={blocked || !grid} onClick={() => grid && onGrid(nudgeGrid(grid, 0.01))}>
          <Trans>Nudge +10 ms</Trans>
        </Button>
        <Button size="sm" variant="outline" disabled={blocked} onClick={onFixed}>
          <Trans>Use fixed BPM</Trans>
        </Button>
        {busy && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            <Trans>Cancel</Trans>
          </Button>
        )}
      </div>
      {work && (
        <p role="status" className="flex items-center gap-2">
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
          {work}
        </p>
      )}
      {grid ? (
        <>
          <p>
            {grid.bpm.toFixed(1)} BPM, {grid.steady ? t`steady` : t`drifting`}<Trans>, {grid.beats.length} beats, {grid.beatsPerBar} per bar.</Trans>
          </p>
          {grid.steady && (
            <div>
              <Button size="sm" variant="outline" disabled={blocked} onClick={onSetTempo}>
                <Trans>Set metronome to this tempo</Trans>
              </Button>
            </div>
          )}
          <BandGrid
            grid={grid}
            harmony={harmony}
            overrides={bassNotes?.overrides}
            selected={editing}
            onSelect={bassNotes ? (beat) => setEditing(editing === beat ? null : beat) : undefined}
          />
          {bassNotes && editing !== null && editing < grid.beats.length && (
            <BassNoteEditor key={editing} beat={editing} context={{ ...bassNotes, grid, harmony }} onClose={() => setEditing(null)} />
          )}
          {bassNotes && <BassNoteList harmony={harmony} overrides={bassNotes.overrides} disabled={bassNotes.disabled} onChange={bassNotes.onChange} />}
        </>
      ) : (
        <p className="text-silkscreen-3"><Trans>No beat grid yet. Find the beat, or use the fixed BPM.</Trans></p>
      )}
    </section>
  );
}
