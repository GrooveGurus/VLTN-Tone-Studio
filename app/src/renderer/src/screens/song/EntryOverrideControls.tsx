import { normaliseOverride, type EntryEndBehaviour, type EntryOverride } from "@shared/entry-overrides";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

const field = "rounded border border-seam bg-transparent p-2";

/**
 * One entry's settings: where its song ends, and whether it starts by itself. The default for each is the song's own, so a control that is
 * left alone changes nothing. Changes are passed up as the whole override, or null when nothing differs from the song.
 */
export function EntryOverrideControls({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: EntryOverride | null;
  disabled?: boolean;
  onChange(next: EntryOverride | null): void;
}) {
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm">
      <select
        aria-label={t`${label} end`}
        className={field}
        disabled={disabled}
        value={value?.endBehaviour ?? ""}
        onChange={(e) => onChange(normaliseOverride({ ...value, endBehaviour: (e.target.value || undefined) as EntryEndBehaviour | undefined }))}
      >
        <option value=""><Trans>Song's own end</Trans></option>
        <option value="next"><Trans>Play the next song</Trans></option>
        <option value="stop"><Trans>Stop the playlist</Trans></option>
        <option value="loop"><Trans>Loop the song</Trans></option>
      </select>
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          aria-label={t`${label} starts by itself`}
          disabled={disabled}
          checked={value?.autoplay !== false}
          onChange={(e) => onChange(normaliseOverride({ ...value, autoplay: e.target.checked ? undefined : false }))}
        />
        <Trans>Starts by itself</Trans>
      </label>
    </span>
  );
}
