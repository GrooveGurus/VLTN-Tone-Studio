// Tests read the English text: the source language is active with no catalog (the macros keep the message in tests).
import { i18n } from "@lingui/core";

i18n.loadAndActivate({ locale: "en", messages: {} });
