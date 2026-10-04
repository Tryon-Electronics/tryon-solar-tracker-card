# v0.4.1 — Always-visible sunrise/sunset countdown

Adds **SUN UP IN** at night and **SUN DOWN IN** during the day. Optional tracker site, facing, angle-limit or epoch sensors no longer block the timer. Uses saved tracker location when available, otherwise Home Assistant sun event times or its configured location.

A lightweight one-second timer changes only the countdown text. Safety and fault status stays visible in the header. Timers stop when cards leave the dashboard.

Redownload **main** in HACS, then refresh Home Assistant. Existing card YAML and tracker firmware do not need changes.

Browser tests cover sunrise/sunset without optional sensors, ticking without HA updates, unchanged panel nodes, cleanup and four cards on a phone viewport.
