import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { referenceBandPower, type GuitarAnalysis } from "@/song/tonematch/analyse";
import { bandMean } from "@/song/tonematch/ltas";
import { CurvePlot } from "./CurvePlot";
import { Confidence, fmtDb, Section } from "./parts";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

export const GAIN_TEXT = { get clean() { return t`Clean`; }, get crunch() { return t`Crunch`; }, get high() { return t`High gain`; } } as const;

function Row({ label, value, detail, confidence }: { label: string; value: ReactNode; detail?: ReactNode; confidence: number }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 border-t border-seam py-2 first:border-t-0">
      <dt className="text-[12px] text-silkscreen-3">{label}</dt>
      <dd className="flex min-w-0 flex-col gap-0.5">
        <b className="text-[13px] font-semibold">{value}</b>
        {detail && <span className="text-[12px] text-pretty text-silkscreen-3">{detail}</span>}
      </dd>
      <dd>
        <Confidence value={confidence} />
      </dd>
    </div>
  );
}

/** The stem's spectrum as 1/3-octave band power next to the generic guitar reference, both levelled at 100 Hz–4 kHz. */
function spectrumSeries(a: GuitarAnalysis) {
  const power = a.ltas.centers.map((fc, i): [number, number] => [fc, a.ltas.db[i] + 10 * Math.log10(fc)]);
  const offset = bandMean({ centers: a.ltas.centers, db: power.map(([, db]) => db) }, 100, 4000);
  const ref = a.ltas.centers.map((fc): [number, number] => [fc, referenceBandPower(fc)]);
  const refOffset = bandMean({ centers: a.ltas.centers, db: ref.map(([, db]) => db) }, 100, 4000);
  return [
    { label: t`Guitar stem`, points: power.map(([f, db]): [number, number] => [f, db - offset]), className: "stroke-block-amp" },
    { label: t`Typical guitar`, points: ref.map(([f, db]): [number, number] => [f, db - refOffset]), className: "stroke-silkscreen-3", dashed: true },
  ];
}

export function AnalysisCard({ analysis: a }: { analysis: GuitarAnalysis }) {
  const sparse = a.level.activeShare < 0.08;
  return (
    <Section title={t`What the guitar stem shows`}>
      {sparse && (
        <p role="note" className="flex items-start gap-2 rounded-md bg-led-warn/10 px-3 py-2 text-[12px] text-pretty text-silkscreen-2">
          <TriangleAlert className="mt-0.5 size-3.5 flex-none text-led-warn" aria-hidden />
          <Trans>The guitar plays in only {Math.round(a.level.activeShare * 100)} % of the song, or the separation found little guitar. Every estimate below is rough.</Trans>
        </p>
      )}
      <dl className="flex flex-col">
        <Row
          label={t`Gain`}
          value={GAIN_TEXT[a.gain.gainClass]}
          detail={t`Saturation score ${a.gain.score.toFixed(2)} of 1: upper harmonics ${fmtDb(a.gain.hfRatioDb)} against the body, ${a.gain.crestDb.toFixed(1)} dB of pick dynamics, spectral flatness ${a.gain.flatness < 0.001 ? t`below 0.001` : a.gain.flatness.toFixed(3)}.`}
          confidence={a.gain.confidence}
        />
        <Row
          label={t`Delay`}
          value={a.delay.detected ? t`Echo every ${Math.round(a.delay.timeMs)} ms` : t`No clear echo`}
          detail={
            a.delay.detected
              ? t`Each repeat about ${Math.round(a.delay.feedback * 100)} % of the one before; the first ${(-20 * Math.log10(a.delay.level + 1e-6)).toFixed(1)} dB under the guitar${a.delay.dark ? t`; repeats lose their highs` : ""}.`
              : t`Searched 60 ms to 1.2 s between pick attacks and their repeats.`
          }
          confidence={a.delay.confidence}
        />
        <Row
          label={t`Reverb`}
          value={a.reverb.detected ? t`Tail of about ${a.reverb.rt60.toFixed(1)} s` : t`No clear tail`}
          detail={
            a.reverb.detected
              ? t`Measured on ${a.reverb.tails} note endings; the tail starts ${Math.abs(a.reverb.levelDb).toFixed(1)} dB under the note.`
              : t`${a.reverb.dryOffsets} note endings stop dry, ${a.reverb.tails} have a tail.`
          }
          confidence={a.reverb.confidence}
        />
        <Row
          label={t`Tone`}
          value={t`Bass ${fmtDb(a.tone.bassDb)}, mids ${fmtDb(a.tone.midDb)}, treble ${fmtDb(a.tone.trebleDb)}`}
          detail={t`Against a typical guitar through a cabinet. Low mids ${fmtDb(a.tone.lowMidDb)}, presence ${fmtDb(a.tone.presenceDb)}.`}
          confidence={a.tone.confidence}
        />
        <Row
          label={t`Level`}
          value={`${a.level.rmsDb.toFixed(1)} dBFS while playing`}
          detail={t`Plays in ${Math.round(a.level.activeShare * 100)} % of the song; peaks at ${a.level.peakDb.toFixed(1)} dBFS.`}
          confidence={a.level.confidence}
        />
      </dl>
      <CurvePlot title={t`Spectrum of the guitar stem against a typical guitar`} series={spectrumSeries(a)} />
    </Section>
  );
}
