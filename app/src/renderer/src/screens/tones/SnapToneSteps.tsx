import { useEffect, useRef } from "react";
import { FileAudio, RotateCcw } from "lucide-react";
import { snapToneLabel } from "@shared/devices";
import { SIGNAL_IN_SUITE } from "@shared/host/snaptone";
import type { T3kModel } from "@shared/host/tones";
import { ARCH_LABEL, firstEmptySlot, isEmptySlot, sanitizeSlotName } from "@shared/tone3000";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { host, isElectron } from "@/host";
import { checkTestSignal, chooseTestSignal, useTestSignal } from "@/snaptone/signal";
import { useDevice, usePedalName, useProfile } from "@/state/device";
import { readSlots, runSend, updateDraft, writeSnapTone, type SendState } from "./store";
import { CabIrPicker } from "./CabIrPicker";
import { Step, StepError, UseOnGp5, kb, type StepStatus } from "./SendSteps";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

/**
 * Send a NAM capture to the pedal as a SnapTone: download, check, convert in the app, write the chosen user slot
 * over USB, link. No Valeton Suite involved. Same on GP-5 and GP-50. `noCabIr`: why no cab IR is offered
 * (noCabIrReason), null when one is.
 */
export function SnapToneSteps({ send, model, noCabIr }: { send: SendState; model: T3kModel | undefined; noCabIr: string | null }) {
  const { phase, step, error } = send;
  const listRef = useRef<HTMLOListElement>(null);
  const connected = useDevice((s) => s.status === "connected");
  const snapTones = useDevice((s) => s.snapTones);
  const device = useDevice((s) => s.device);
  const busy = useDevice((s) => s.busy);
  const hasSignal = useTestSignal((s) => s.has);
  const pedal = usePedalName();
  const profile = useProfile();

  useEffect(() => {
    if (phase === "idle") return;
    listRef.current?.querySelector('[data-step-status="current"], [data-step-status="fault"]')?.scrollIntoView({ block: "nearest" });
  }, [phase, step]);
  // The slot list comes from the pedal; propose the first free user slot once it is known.
  useEffect(() => {
    if (connected && !snapTones && !busy) void readSlots();
  }, [connected, snapTones, busy]);
  useEffect(() => {
    if (send.proposedSlot === null && snapTones) updateDraft(send.toneId, { proposedSlot: firstEmptySlot("snaptone", snapTones, device) });
  }, [send.proposedSlot, send.toneId, snapTones, device]);
  // A cab IR picked before the pedal changed to one without the choice must not reach the conversion; same phases as canPickIr.
  useEffect(() => {
    if (noCabIr !== null && send.cabIr && (phase === "idle" || phase === "ready" || phase === "error")) updateDraft(send.toneId, { cabIr: null });
  }, [noCabIr, send.cabIr, send.toneId, phase]);

  const status = (n: number): StepStatus => {
    if (phase === "linked") return "done";
    if (phase === "error" && n === step) return "fault";
    if (n < step) return "done";
    if (n === step && phase !== "idle") return "current";
    if (n === 1 && phase === "idle") return "current";
    return "pending";
  };
  const slot = send.proposedSlot;
  const occupant = slot === null ? null : snapTones?.find((s) => s.slot === slot);
  const replacing = occupant && !isEmptySlot(occupant) ? occupant.name : null;
  const slotText = slot === null ? t`a user slot` : snapToneLabel(profile.key, slot);
  const writeLabel = replacing ? t`Replace ${replacing} in ${slotText}` : t`Write to ${slotText}`;
  const linkedText = send.linkedSlot === null ? "" : snapToneLabel(profile.key, send.linkedSlot);
  const canEdit = phase === "idle" || phase === "ready" || (phase === "error" && step !== 3);
  // The cab IR goes into the conversion: choosing another after it ran drops the SnapTone and starts over (updateDraft).
  const canPickIr = phase === "idle" || phase === "ready" || phase === "error";
  const canWrite = connected && slot !== null && !busy;
  const modelLabel = model ? `${model.name}, ${ARCH_LABEL(model)}` : t`the model`;

  return (
    <ol ref={listRef} className="flex flex-col">
      <Step n={1} status={status(1)} title={step > 1 || phase === "linked" ? t`Downloaded ${modelLabel}` : t`Download ${modelLabel}`}>
        {phase === "running" && step === 1 && (
          <>
            <span className="text-silkscreen-3">{send.total ? t`${kb(send.received)} of ${kb(send.total)}` : send.received ? kb(send.received) : t`Starting the download…`}</span>
            <Progress value={send.total ? (send.received / send.total) * 100 : undefined} className="mt-1 w-56" aria-label={t`Download progress`} />
          </>
        )}
        {phase === "error" && step === 1 && <StepError error={error} />}
        {canEdit && (
          <span className="mt-1.5 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-silkscreen-2">
              <Trans><span>Name on the pedal</span></Trans>
              <Input
                value={send.name}
                maxLength={10}
                onChange={(e) => updateDraft(send.toneId, { name: sanitizeSlotName(e.target.value.toUpperCase()) })}
                className="h-8 w-32"
                aria-describedby={`name-hint-${send.toneId}`}
              />
            </label>
            <span id={`name-hint-${send.toneId}`} className="text-[11px] text-silkscreen-3">
              {send.name.length}/10
            </span>
            <SnapToneSlotPicker value={send.proposedSlot} onChange={(slot) => updateDraft(send.toneId, { proposedSlot: slot })} />
            {noCabIr === null ? (
              <CabIrPicker value={send.cabIr} onChange={(cabIr) => updateDraft(send.toneId, { cabIr })} disabled={!canPickIr} />
            ) : (
              <span className="w-full text-[11px] text-pretty text-silkscreen-3">{noCabIr}</span>
            )}
          </span>
        )}
        {(phase === "idle" || (phase === "error" && step < 4)) && (
          <span className="mt-2 flex flex-col items-start gap-1">
            <Button size="sm" disabled={!send.name || !model || hasSignal === false} onClick={() => void runSend(send.toneId)}>
              {phase === "error" && <RotateCcw data-icon="inline-start" />}
              {phase === "error" ? t`Retry` : replacing && connected ? t`Send, replacing ${replacing}` : t`Send to the ${pedal}`}
            </Button>
            {!connected && <span className="text-[11px] text-silkscreen-3"><Trans>Connect the {pedal} to write it; the conversion runs without it.</Trans></span>}
            <TestSignalNotice />
          </span>
        )}
      </Step>

      <Step n={2} status={status(2)} title={send.check ? t`Checked the file` : t`Check the file`}>
        {send.check?.reshaped && <span className="text-silkscreen-3"><Trans>Updated from NAM {send.check.version} to the 0.5.x layout</Trans></span>}
        {send.check && !send.check.reshaped && (
          <span className="text-silkscreen-3">
            NAM {send.check.version}, {send.check.arch === "A2" ? t`A2 (${send.check.size === "nano" ? t`Lite` : t`Full`} size)` : `A1 ${send.check.size}`}
          </span>
        )}
        {!send.check && phase !== "error" && <span className="text-silkscreen-3"><Trans>Confirm Tone Studio can convert it</Trans></span>}
        {phase === "running" && step === 2 && <Spinner className="mt-1" />}
        {phase === "error" && step === 2 && <StepError error={error} />}
      </Step>

      <Step n={3} status={status(3)} title={send.file ? t`Made the SnapTone` : t`Make the SnapTone`}>
        <span className="text-silkscreen-3">
          <Trans>Plays the test signal through the capture</Trans>{send.cabIr ? t` and ${send.cabIr.name}` : ""} <Trans>and measures it, like Valeton Suite does. Takes about 10 seconds.</Trans>
        </span>
        {phase === "converting" && <Progress value={send.progress * 100} className="mt-1 w-56" aria-label={t`SnapTone conversion progress`} />}
        {phase === "error" && step === 3 && <StepError error={error} />}
      </Step>

      <Step n={4} status={status(4)} title={phase === "linked" ? t`Wrote ${linkedText}` : t`Write ${slotText} on the ${pedal}`}>
        {replacing && phase !== "linked" && <span className="text-silkscreen-2"><Trans>Replaces {replacing}. A SnapTone can't be read back from the pedal, so keep the original file if you want it again.</Trans></span>}
        {phase === "writing" && <Progress value={send.progress * 100} className="mt-1 w-56" aria-label={t`SnapTone write progress`} />}
        {phase === "error" && step === 4 && <StepError error={error} />}
        {send.file && (phase === "ready" || (phase === "error" && step === 4)) && (
          <span className="mt-2 flex flex-col items-start gap-1">
            <Button size="sm" disabled={!canWrite} onClick={() => void writeSnapTone(send.toneId)}>
              {phase === "error" && <RotateCcw data-icon="inline-start" />}
              {writeLabel}
            </Button>
            {!connected && <span className="text-[11px] text-silkscreen-3"><Trans>Connect the {pedal} to write it.</Trans></span>}
            {connected && slot === null && <span className="text-[11px] text-silkscreen-3"><Trans>Choose a slot above.</Trans></span>}
          </span>
        )}
      </Step>

      <Step n={5} status={status(5)} title={phase === "linked" ? t`Linked to ${linkedText} on your ${pedal}` : t`Link the new SnapTone`}>
        {phase !== "linked" && (
          <span className="text-pretty text-silkscreen-3"><Trans>The {profile.captureBlock(slot ?? profile.snapTone.userRange[0])} block then shows this tone's image for that slot.</Trans></span>
        )}
        {phase === "linked" && send.linkedSlot !== null && <UseOnGp5 isIr={false} slot={send.linkedSlot} />}
      </Step>
    </ol>
  );
}

/** User SnapTone slot (GP-5: 50–79) with what it holds now; nothing when the pedal's list isn't read. */
export function SnapToneSlotPicker({ value, onChange, disabled }: { value: number | null; onChange: (slot: number) => void; disabled?: boolean }) {
  const snapTones = useDevice((s) => s.snapTones);
  const { snapTone, key } = useProfile();
  const [first, last] = snapTone.userRange;
  if (!snapTones) return null;
  const userSlots = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const label = (slot: number) => {
    const entry = snapTones.find((s) => s.slot === slot) ?? { name: "", kind: undefined };
    return `${snapToneLabel(key, slot)}${entry.kind === "unknown" ? ", contents unknown" : isEmptySlot(entry) ? ", empty" : `, ${entry.name}`}`;
  };
  return (
    <Select value={value === null ? "" : String(value)} onValueChange={(v) => onChange(Number(v))} disabled={disabled}>
      <SelectTrigger className="h-8 w-48" aria-label={t`SnapTone slot on the pedal`}>
        <SelectValue placeholder={t`Choose a slot`} />
      </SelectTrigger>
      <SelectContent>
        {userSlots.map((slot) => (
          <SelectItem key={slot} value={String(slot)}>
            {label(slot)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Where to find nam_input_wav.wav, for this platform. */
function signalWhere(): string {
  if (host.platform === "win32" || host.platform === "darwin") return t`In Valeton Suite: ${SIGNAL_IN_SUITE[host.platform]}.`;
  return t`In Valeton Suite: ${SIGNAL_IN_SUITE.win32} on Windows, or ${SIGNAL_IN_SUITE.darwin} on macOS. The Windows installer opens with 7-Zip.`;
}

/**
 * Shown while Tone Studio doesn't have Valeton's test signal: making a SnapTone plays it through the capture, and
 * it is Valeton's file, so the user points to it once.
 */
export function TestSignalNotice() {
  const has = useTestSignal((s) => s.has);
  const choosing = useTestSignal((s) => s.choosing);
  useEffect(() => void checkTestSignal(), []);
  if (has !== false) return null;
  return (
    <span className="mt-1 flex flex-col items-start gap-1">
      <span className="text-pretty text-silkscreen-2">
        <Trans>Making a SnapTone needs Valeton's test signal, nam_input_wav.wav. It is Valeton's file, so Tone Studio doesn't include it.{" "}</Trans>
        {isElectron ? t`Choose it once and Tone Studio keeps a copy.` : t`Choose it once per visit.`}
      </span>
      <span className="text-[11px] break-all text-silkscreen-3">{signalWhere()}</span>
      <Button size="sm" variant="outline" disabled={choosing} onClick={() => void chooseTestSignal()}>
        {choosing ? <Spinner data-icon="inline-start" /> : <FileAudio data-icon="inline-start" />}
        <Trans>Choose nam_input_wav.wav…</Trans>
      </Button>
    </span>
  );
}
