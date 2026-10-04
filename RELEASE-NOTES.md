# v0.4.0 — Lightweight ESP32-style scene

Replaces the landscape background with the ESP32-style dark grid. Removes continuous ray/ring animations and SVG blur filters. Keeps panel geometry, sun/moon paths, countdowns, readings and controls.

Telemetry updates patch existing text and SVG attributes rather than replacing the full card. Changes to Home Assistant state timestamps alone no longer trigger a redraw. No bitmap asset is required; the HACS package is one self-contained JS module.

Existing card configurations remain valid. In HACS, open Tryon Solar Tracker Card and select **⋮ → Redownload → main**, then refresh the browser or reopen the Home Assistant app. The update applies to all cards; no tracker firmware installation is needed.

Validation uses mocked Home Assistant readings and commands, including four cards on a narrow phone viewport. No test commands reach real hardware. Actual phone performance depends on the device and other dashboard cards.
