import type { BassPartChoice } from "@/song/band/bass-parts";
import { t } from "@lingui/core/macro";

/** The names the Band panel shows for each bass part, and for Auto. */
export const BASS_PART_LABELS: Record<BassPartChoice, string> = {
  get auto() { return t`Auto`; },
  get ring() { return t`Ring out`; },
  get pulse() { return t`Root pulse`; },
  get groove() { return t`Groove`; },
  get melodic() { return t`Melodic`; },
  get walking() { return t`Walking`; },
  get pedal() { return t`Pedal`; },
  get rest() { return t`Rest`; },
};
