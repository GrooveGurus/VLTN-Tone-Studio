import { useState, useSyncExternalStore, type FormEvent } from "react";
import { BAND_SYNC_LIMITS } from "@shared/band-sync";
import { FollowerView } from "./FollowerView";
import type { FollowerClient, FollowerState } from "./follower-client";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

/**
 * The band follower's page (spec 44). It asks for the PIN until the performer's app accepts it, then shows the song. It has no controls of
 * its own beyond the follower's: text size, transpose for this device, and the transport when the performer allows it.
 */
export function FollowerApp({ client }: { client: FollowerClient }) {
  const state = useSyncExternalStore(client.subscribe, client.getState);
  if (state.phase === "pin") return <PinForm client={client} state={state} />;
  return <FollowerView client={client} state={state} />;
}

function PinForm({ client, state }: { client: FollowerClient; state: FollowerState }) {
  const [pin, setPin] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (new RegExp(`^\\d{${BAND_SYNC_LIMITS.pinDigits}}$`).test(pin)) client.submitPin(pin);
  };
  return (
    <main className="follower follower-pin">
      <form onSubmit={submit} aria-label={t`Join the band sync`}>
        <h1><Trans>VLTN band sync</Trans></h1>
        <p role="status">{state.message}</p>
        <label>
          PIN
          <input
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, BAND_SYNC_LIMITS.pinDigits))}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            aria-label="PIN"
          />
        </label>
        <button type="submit" disabled={pin.length !== BAND_SYNC_LIMITS.pinDigits}>
          <Trans>Join</Trans>
        </button>
      </form>
    </main>
  );
}
