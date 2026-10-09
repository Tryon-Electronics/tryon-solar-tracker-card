# v0.5.0 — Status templates and sensor units

Selected status sensors now display their unit automatically, such as `6535 W`.
Adds a multiline Status template field to the visual editor and `status_template`
in YAML. Uses native Home Assistant Jinja subscriptions for live dependency
updates; no per-reading template polling or browser JavaScript evaluation.

Templates replace the normal label and are rendered as escaped text. Existing
fault/safety/disabled/angle-unavailable messages retain priority. Invalid templates
show a recoverable error. Subscriptions are cleaned up on removal, configuration
changes and delayed subscription races.

Redownload **main** in HACS and refresh Home Assistant. Existing `status` sensor
configurations automatically gain units; templates are optional. No firmware
or wiring update is needed.

Validation includes existing four-card/mobile tests and dedicated template,
unit, live-update, lifecycle, safety-priority and error-recovery browser tests.
