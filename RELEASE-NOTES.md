# v0.5.2 — Full-width Reset Faults control

**Reset Faults** now fills the bottom row of the expanded **Controls** section,
removing the empty half-row. It calls the selected tracker's existing **Reset
Motor Fault** button through Home Assistant. Missing or unavailable reset entities
keep the button disabled; no firmware or card YAML change is required.

Update the card in HACS and reload each browser or phone. For main-branch installs,
use **Redownload → main**. Browser checks verify the full-width layout, the exact
selected-device reset command, and unavailable/never-pressed button states.

# v0.5.1 — Tracking Status template in visual options

The multiline **Tracking Status template (optional)** field now appears directly
below the Tracking Status entity selector in **Entity overrides (optional)**.
Select any sensor and use `entity` in your Jinja template to refer to that sensor.
No entity name needs to be hardcoded and no YAML editing is required.

Redownload **main** in HACS and refresh Home Assistant to load the updated editor.
Existing status sensors and templates continue to work.

Validation checks the visual form field order and generic selected-entity template
subscription, alongside the card's existing mobile and lifecycle browser tests.

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
