# v0.3.0 — HACS card with website graphics

Install through HACS as a custom **Dashboard** repository:
https://github.com/Tryon-Electronics/tryon-solar-tracker-card

Select one Actual Solar Angle entity to discover that tracker’s readings and controls. The basic view includes Controls, Settings and an always-accessible Stop Panel button. Controls start collapsed.

The scene matches the website and displays reported panel angles, seasonal sunlight and sunrise/flat-target countdowns. Both the JS module and landscape image are bundled together in dist.

Requires Home Assistant 2026.6.0+. Uses existing ESPHome entities; MQTT and other custom cards are not required.

Validation: HACS validation and mocked browser tests passed in GitHub Actions. The tests do not send commands to hardware. A real Home Assistant HACS installation has not yet been tested.

Maintainer: create a GitHub release tagged v0.3.0 from main with this description. Leave release assets empty so HACS installs the full dist folder, including the landscape image.
