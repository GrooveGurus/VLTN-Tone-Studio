import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { defaultFills, FILLS, type Fills, type SectionOverride, type SectionPlan } from "@/song/band/arrangement";
import { OCTAVE_SHIFTS, type OctaveShift } from "@/song/band/bass-parts";
import { findStyle } from "@/song/band/styles";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

const OCTAVE_LABELS: Record<string, string> = { get "-1"() { return t`−1 octave`; }, get "0"() { return t`Same`; }, get "1"() { return t`+1 octave`; } };

/**
 * The bass options a section keeps out of the table: octave, fills, hit the one, slides, dead notes and pickups. Each shows the value the
 * section plays now, and the style's default for the three techniques, so a change is measured against what the style does.
 */
export function BandSectionMore({
  name,
  plan,
  disabled,
  onChange,
}: {
  name: string;
  plan: SectionPlan;
  disabled: boolean;
  onChange(patch: SectionOverride): void;
}) {
  const technique = findStyle(plan.style)?.bass.techniques;
  const styleDefault = (on: boolean | undefined) => (on === undefined ? "" : `Style: ${on ? "on" : "off"}`);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label={t`More bass options for ${name}`}>
          <Trans>More</Trans>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-72 flex-col gap-3">
        <label className="flex items-center justify-between gap-2 text-sm">
          <Trans>Octave</Trans>
          <Select value={String(plan.octave)} disabled={disabled} onValueChange={(value) => onChange({ octave: Number(value) as OctaveShift })}>
            <SelectTrigger size="sm" aria-label={t`Octave of ${name}`} className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OCTAVE_SHIFTS.map((shift) => (
                <SelectItem key={shift} value={String(shift)}>
                  {OCTAVE_LABELS[String(shift)]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex items-center justify-between gap-2 text-sm">
          <Trans>Fills</Trans>
          <span className="flex items-center gap-2">
            <Trans><span className="text-xs text-silkscreen-3">Default {defaultFills(name)}</span></Trans>
            <Select value={String(plan.fills)} disabled={disabled} onValueChange={(value) => onChange({ fills: Number(value) as Fills })}>
              <SelectTrigger size="sm" aria-label={t`Fills of ${name}`} className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILLS.map((fills) => (
                  <SelectItem key={fills} value={String(fills)}>
                    {fills}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </span>
        </label>
        <label className="flex items-center justify-between gap-2 text-sm">
          <Trans><span>
            Hit the one <span className="text-xs text-silkscreen-3">(a chorus after another section)</span>
          </span></Trans>
          <Checkbox
            aria-label={t`Hit the one in ${name}`}
            disabled={disabled}
            checked={plan.hitTheOne}
            onCheckedChange={(on) => onChange({ hitTheOne: on === true })}
          />
        </label>
        <label className="flex items-center justify-between gap-2 text-sm">
          <Trans><span>
            Slides <span className="text-xs text-silkscreen-3">{styleDefault(technique?.slides)}</span>
          </span></Trans>
          <Checkbox aria-label={t`Slides in ${name}`} disabled={disabled} checked={plan.slides} onCheckedChange={(on) => onChange({ slides: on === true })} />
        </label>
        <label className="flex items-center justify-between gap-2 text-sm">
          <Trans><span>
            Dead notes <span className="text-xs text-silkscreen-3">{styleDefault(technique?.deadNotes)}</span>
          </span></Trans>
          <Checkbox
            aria-label={t`Dead notes in ${name}`}
            disabled={disabled}
            checked={plan.deadNotes}
            onCheckedChange={(on) => onChange({ deadNotes: on === true })}
          />
        </label>
        <label className="flex items-center justify-between gap-2 text-sm">
          <Trans><span>
            Pickups <span className="text-xs text-silkscreen-3">{styleDefault(technique?.pickups)}</span>
          </span></Trans>
          <Checkbox aria-label={t`Pickups in ${name}`} disabled={disabled} checked={plan.pickups} onCheckedChange={(on) => onChange({ pickups: on === true })} />
        </label>
      </PopoverContent>
    </Popover>
  );
}
