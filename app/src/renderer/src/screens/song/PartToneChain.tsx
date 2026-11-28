// A part's tone chain in the Band settings (spec 89 for the bass, 104 for the drums): up to six blocks, played in order, each with its levels, mix
// and on switch, and the chain's dry/wet. The bass offers pedal, preamp, amp, cab IR and space IR; the drums offer outboard, preamp and space
// IR. Changing the chain saves it; Generate is what renders it. Tones need the desktop app (the TONE3000 browser and the file dialogs are
// there), so the web build shows the chain disabled.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { isElectron } from "@/host";
import {
  BASS_TONE_INPUT_DB,
  BASS_TONE_OUTPUT_DB,
  MAX_TONE_BLOCKS,
  PART_ROLES,
  TONE_BLOCK_TYPE,
  type PartTone,
  type PartToneFile,
  type TonePart,
  type ToneBlock,
  type ToneRole,
} from "@/song/band/arrangement";
import { captureRenderSeconds, PART_TONE_PRESETS, presetBlocks } from "@/song/band/part-tone";
import { PartSourceDialog, presetPartSearch, restorePartSearch } from "./PartSourceDialog";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

/** The track of a band slider, as BandSettingsForm draws them: a lighter track keeps the full length visible at any value. */
const BAND_TRACK = "bg-white/15";

const ROLE_LABEL: Record<ToneRole, string> = { get pedal() { return t`Pedal`; }, get preamp() { return t`Preamp`; }, get amp() { return t`Amp`; }, get cab() { return t`Cab IR`; }, get space() { return t`Space IR`; }, get outboard() { return t`Outboard`; } };
const ADD_LABEL: Record<ToneRole, string> = {
  get pedal() { return t`Add pedal…`; },
  get preamp() { return t`Add preamp…`; },
  get amp() { return t`Add amp…`; },
  get cab() { return t`Add cab IR…`; },
  get space() { return t`Add space IR…`; },
  get outboard() { return t`Add outboard…`; },
};
/** The part's name in the headings and notes. */
const PART_LABEL: Record<TonePart, { title: string; clean: string; plural: string }> = {
  bass: { get title() { return t`Bass tone`; }, get clean() { return t`Clean bass`; }, get plural() { return t`Bass tones`; } },
  drums: { get title() { return t`Drum tone`; }, get clean() { return t`Clean drums`; }, get plural() { return t`Drum tones`; } },
};

export interface PartToneChainProps {
  part: TonePart;
  tone: PartTone;
  /** The song's length in seconds, for the render-time estimate. */
  songSeconds: number;
  onChange(tone: PartTone): void;
}

export function PartToneChain({ part, tone, songSeconds, onChange }: PartToneChainProps) {
  const label = PART_LABEL[part];
  const desktop = isElectron;
  const chain = tone.kind === "chain" ? tone : null;
  const blocks = chain?.blocks ?? [];
  const full = blocks.length >= MAX_TONE_BLOCKS;
  /** The picker: the role it searches for, and the slot it fills (null adds a block at the end). */
  const [picking, setPicking] = useState<{ role: ToneRole; slot: number | null } | null>(null);

  const save = (next: ToneBlock[]) => onChange({ kind: "chain", blocks: next, dryWet: chain?.dryWet ?? 1, fast: chain?.fast ?? false });
  const update = (index: number, patch: Partial<ToneBlock>) => save(blocks.map((block, i) => (i === index ? { ...block, ...patch } : block)));
  const move = (index: number, by: number) => {
    const next = [...blocks];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    save(next);
  };
  const remove = (index: number) => save(blocks.filter((_, i) => i !== index));

  const open = (role: ToneRole, slot: number | null) => {
    presetPartSearch(part, role);
    setPicking({ role, slot });
  };
  const close = () => {
    restorePartSearch();
    setPicking(null);
  };
  const pick = (file: PartToneFile) => {
    if (!picking) return;
    close();
    if (picking.slot !== null) update(picking.slot, { file });
    else save([...blocks, { type: TONE_BLOCK_TYPE[picking.role], role: picking.role, file, inputDb: 0, outputDb: 0, mix: 1, on: true }]);
  };

  const names = blocks.map((block) => block.file?.name ?? `${ROLE_LABEL[block.role]}, empty`);
  const summary = blocks.length === 0 ? t`Clean, as generated` : names.join(" → ");
  const captures = blocks.filter((block) => block.on && block.file && block.type === "capture").length;
  const estimate =
    songSeconds <= 0
      ? null
      : captures === 0
        ? t`Only IRs: a few seconds at Generate.`
        : t`About ${Math.round(captureRenderSeconds(blocks, songSeconds, chain?.fast ?? false, part === "drums"))} s at Generate for this song.`;

  return (
    <section aria-label={label.title} className="flex flex-col gap-3 sm:col-span-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium">{label.title}</span>
        <span className="min-w-0 text-silkscreen-2">{summary}</span>
        {blocks.length > 0 && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => onChange({ kind: "clean" })}>
              {label.clean}
            </Button>
          </div>
        )}
      </div>
      {!desktop && <p className="text-silkscreen-3"><Trans>{label.plural} need the desktop app.</Trans></p>}

      {blocks.length === 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Trans><span className="text-silkscreen-2">Start from a preset:</span></Trans>
          {PART_TONE_PRESETS[part].map((preset) => (
            <Button
              key={preset.name}
              variant="outline"
              size="sm"
              disabled={!desktop}
              onClick={() => onChange({ kind: "chain", blocks: presetBlocks(preset.blocks), dryWet: 1, fast: false })}
            >
              {preset.name}
            </Button>
          ))}
        </div>
      )}

      {blocks.length > 0 && (
        <ol aria-label={t`${label.title} blocks`} className="flex flex-col gap-3">
          {blocks.map((block, index) => {
            const label = `${ROLE_LABEL[block.role]} ${index + 1}`;
            return (
              <li key={index} className="flex flex-col gap-2 rounded-md border border-white/10 p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="w-16 text-xs uppercase tracking-wide text-silkscreen-3">{ROLE_LABEL[block.role]}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {block.file ? (
                      <>
                        {block.file.name}
                        {block.file.older && <span className="ml-2 text-silkscreen-3"><Trans>(older capture)</Trans></span>}
                      </>
                    ) : (
                      <span className="text-silkscreen-2"><Trans>Empty slot</Trans></span>
                    )}
                  </span>
                  <Button variant="outline" size="sm" disabled={!desktop} onClick={() => open(block.role, index)}>
                    {block.file ? t`Change…` : t`Choose…`}
                  </Button>
                  <label className="flex items-center gap-2">
                    <Switch aria-label={t`${label} on`} checked={block.on} onCheckedChange={(on) => update(index, { on })} />
                    <Trans>On</Trans>
                  </label>
                  <Button variant="ghost" size="sm" aria-label={t`Move ${label} up`} disabled={index === 0} onClick={() => move(index, -1)}>
                    <Trans>Up</Trans>
                  </Button>
                  <Button variant="ghost" size="sm" aria-label={t`Move ${label} down`} disabled={index === blocks.length - 1} onClick={() => move(index, 1)}>
                    <Trans>Down</Trans>
                  </Button>
                  <Button variant="ghost" size="sm" aria-label={t`Remove ${label}`} onClick={() => remove(index)}>
                    <Trans>Remove</Trans>
                  </Button>
                </div>
                <div className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
                  <label className="flex items-center gap-3">
                    <Trans>In {block.inputDb} dB</Trans>
                    <Slider
                      trackClassName={BAND_TRACK}
                      aria-label={t`${label} input`}
                      min={BASS_TONE_INPUT_DB[0]}
                      max={BASS_TONE_INPUT_DB[1]}
                      step={1}
                      value={[block.inputDb]}
                      onValueChange={([db]) => update(index, { inputDb: db })}
                    />
                  </label>
                  <label className="flex items-center gap-3">
                    <Trans>Out {block.outputDb} dB</Trans>
                    <Slider
                      trackClassName={BAND_TRACK}
                      aria-label={t`${label} output`}
                      min={BASS_TONE_OUTPUT_DB[0]}
                      max={BASS_TONE_OUTPUT_DB[1]}
                      step={1}
                      value={[block.outputDb]}
                      onValueChange={([db]) => update(index, { outputDb: db })}
                    />
                  </label>
                  <label className="flex items-center gap-3">
                    <Trans>Mix {Math.round(block.mix * 100)}%</Trans>
                    <Slider
                      trackClassName={BAND_TRACK}
                      aria-label={t`${label} mix`}
                      min={0}
                      max={100}
                      step={5}
                      value={[Math.round(block.mix * 100)]}
                      onValueChange={([percent]) => update(index, { mix: percent / 100 })}
                    />
                  </label>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex flex-wrap gap-2">
        {PART_ROLES[part].map((role) => (
          <Button key={role} variant="outline" size="sm" disabled={!desktop || full} onClick={() => open(role, null)}>
            {ADD_LABEL[role]}
          </Button>
        ))}
        {full && <span className="self-center text-silkscreen-3"><Trans>Six blocks is the most a chain holds.</Trans></span>}
      </div>

      {chain && blocks.length > 0 && (
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
          <label className="flex items-center gap-3">
            <Trans>Chain {Math.round(chain.dryWet * 100)}% wet</Trans>
            <Slider
              trackClassName={BAND_TRACK}
              aria-label={t`${label.title} chain mix`}
              min={0}
              max={100}
              step={5}
              value={[Math.round(chain.dryWet * 100)]}
              onValueChange={([percent]) => onChange({ ...chain, dryWet: percent / 100 })}
            />
          </label>
          <label className="flex items-center gap-2">
            <Switch aria-label={t`Fast render`} checked={chain.fast} onCheckedChange={(fast) => onChange({ ...chain, fast })} />
            <Trans>Fast render (Lite where the file has one)</Trans>
          </label>
          {estimate && <span className="self-center text-silkscreen-2">{estimate}</span>}
        </div>
      )}

      {picking && <PartSourceDialog part={part} role={picking.role} open onClose={close} onPick={(file) => pick(file)} />}
    </section>
  );
}
