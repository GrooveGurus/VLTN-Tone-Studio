import { SettingsCard } from "@/components/ui/settings-card";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { host } from "@/host";
import { BAND_SYNC_LIMITS } from "@shared/band-sync";
import type { BandSyncStatus } from "@shared/host/band-sync";
import { HelpNote } from "@/components/ui/help-note";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

/**
 * Band sync (spec 44): lets bandmates follow the song on their phones or tablets over this network. It is off until the performer starts
 * it, and while it runs the panel says so, with the address, the PIN and a way to stop it.
 */
export function BandSyncSettings() {
  const [status, setStatus] = useState<BandSyncStatus | null>(null);
  const [error, setError] = useState("");
  const [address, setAddress] = useState("");
  const [port, setPort] = useState(String(BAND_SYNC_LIMITS.defaultPort));
  const [allowControl, setAllowControl] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    if (!host.bandSync) return;
    let live = true;
    void host.bandSync.status().then((next) => live && setStatus(next));
    const stop = host.bandSync.onStatus((next) => setStatus(next));
    return () => {
      live = false;
      stop();
    };
  }, []);
  useEffect(() => {
    if (!status) return;
    setAllowControl(status.allowControl);
    if (!status.listening) {
      setAddress(status.address ?? "");
      setPort(String(status.port));
    }
  }, [status]);
  const url = status?.listening ? status.url : null;
  useEffect(() => {
    let live = true;
    if (!url) setCode(null);
    else
      void QRCode.toDataURL(url, { margin: 1, width: 180 })
        .then((image) => live && setCode(image))
        .catch(() => live && setCode(null));
    return () => {
      live = false;
    };
  }, [url]);
  if (!host.bandSync || !status) return null;
  const run = (action: Promise<BandSyncStatus>) => {
    setError("");
    action.then(setStatus).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };
  const portNumber = Number(port);
  const portValid = Number.isInteger(portNumber) && portNumber >= BAND_SYNC_LIMITS.portMin && portNumber <= BAND_SYNC_LIMITS.portMax;
  return (
    <SettingsCard
      title={t`Band sync on this network`}
      summary={status.listening ? t`On` : t`Off`}
      storageKey="band-sync"
      defaultOpen={false}
      actions={
        status.listening ? (
          <span className="rounded-md bg-amber-500/20 px-2 py-1 text-xs font-semibold text-amber-200" role="status">
            <Trans>Listening</Trans>
          </span>
        ) : undefined
      }
    >
      <p role="status" className="text-sm text-silkscreen-2">
        {error || status.message}
      </p>
      {status.listening ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex flex-col gap-2 text-sm">
            <Trans><span>Followers open this address in a browser on the same network:</span></Trans>
            <code className="rounded-md bg-black/30 px-2 py-1 text-base select-all">{status.url}</code>
            <span>
              PIN: <strong className="font-mono text-2xl tracking-[0.25em]">{status.pin}</strong>
            </span>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => run(host.bandSync!.newPin())}>
                <Trans>New PIN</Trans>
              </Button>
              <Button variant="destructive" onClick={() => run(host.bandSync!.stop())}>
                <Trans>Stop band sync</Trans>
              </Button>
            </div>
          </div>
          {code && <img src={code} alt={t`QR code with the band sync address`} className="h-44 w-44 rounded-md bg-white p-2" />}
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-4 text-sm">
          <label className="flex flex-col gap-1">
            <Trans>Network address</Trans>
            <Select value={address} onValueChange={setAddress} disabled={!status.addresses.length}>
              <SelectTrigger aria-label={t`Band sync network address`} className="w-72">
                <SelectValue placeholder={t`No local network`} />
              </SelectTrigger>
              <SelectContent>
                {status.addresses.map((entry) => (
                  <SelectItem key={entry.address} value={entry.address}>
                    {`${entry.address} (${entry.name})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <Trans>Port</Trans>
            <Input
              aria-label={t`Band sync port`}
              inputMode="numeric"
              className="w-28"
              value={port}
              onChange={(event) => setPort(event.target.value.replace(/\D/g, "").slice(0, 5))}
            />
          </label>
          <Button disabled={!address || !portValid} onClick={() => run(host.bandSync!.start({ address, port: portNumber, allowControl }))}>
            <Trans>Start band sync</Trans>
          </Button>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          aria-label={t`Allow followers to control playback`}
          checked={allowControl}
          onCheckedChange={(checked) => run(host.bandSync!.setAllowControl(checked === true))}
        />
        <Trans>Allow followers to play, pause and stop (off: they only follow the song)</Trans>
      </label>
      <HelpNote>
        <p>
          <Trans>Band sync is off unless you start it. Followers see the song, lyrics and chords; they never load songs or read your library. The traffic is not
          encrypted, so only the PIN keeps others out: use it on a network you trust, and stop it when the set is over.</Trans>
        </p>
      </HelpNote>
    </SettingsCard>
  );
}
