# Translation glossary

How Tone Studio is translated (`npm run i18n:extract` collects the messages into `<locale>/messages.po`). The English
text in the code is the source; a message without a translation shows in English.

## Stays in English (names, the pedal's own labels, technical terms)

| Kind | Terms |
|---|---|
| Screens and sections of the app | Rig, Tones, Song, Setlist, Capture, Device (Library is translated: Livraria) |
| Product and service names | Tone Studio, GP-5, GP-50, GP-150, GP-180, GP-200, GP-200LT, GP-200JR, Valeton, GrooveGurus, GP-Snap, TONE3000, NAM, WebMIDI, WebGPU, WebAssembly |
| The pedal's labels, as printed on it | CTRL 1–8, TAP, BANK−/BANK+, SAVE, PARA, EXP, PRE, WAH, DST, AMP, NR, CAB, EQ, MOD, DLY, RVB, VOL, NS, Patch Settings, CTRL Settings, GLOBAL |
| Effect and model names | as the catalog names them (Mesa2C+ 2, COMP4…) |
| Technical terms used as-is by Brazilian players | preset, slot, SnapTone, User IR, IR, capture (NAM), firmware, mod, backup, stems, footswitch, tap tempo, delay, reverb, amp, cab, chorus, BPM, MIDI, USB, Bluetooth, dB, Hz, A2, Lite, Full |
| File formats and keys | .prst, .nam, .wav, Mod, Shift, Alt, Esc, Enter, F2, Del, Space |

## Translated

| English | pt-BR |
|---|---|
| scene / scene mode | cena / modo cena |
| base (the preset under the scenes) | base |
| save / write (to the pedal) | salvar / gravar |
| block | bloco |
| model (an effect in a block) | modelo |
| chain / signal chain | cadeia / cadeia de sinal |
| unsaved changes | alterações não salvas |
| settings | configurações |
| song / setlist (as words, not the screens) | música / setlist |
| drums / bass | bateria / baixo |
| knob | knob |
| connect / disconnect | conectar / desconectar |
| simulated pedal / simulator | pedal simulado / simulador |

## Style

- Address the player as **você**; short, plain sentences, like the English.
- Keep every placeholder exactly: `{0}`, `{pedal}`, `<0>…</0>`, `<1/>`. `npm run i18n:check` refuses a catalog that drops one.
- Keep the punctuation of the source (`…` stays `…`, `·` stays `·`).
