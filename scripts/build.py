"""Bundle the tracker solar helper and HA card into one offline JS resource."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = (root / 'src/card.js').read_text(encoding='utf-8')
helper = (root / 'src/solar-cycle.js').read_text(encoding='utf-8').strip()
assert source.count('/* SOLAR_CYCLE_HELPER */') == 1
helper = helper.replace('globalThis.SolarCycle=', 'solarEnvironment.cycle=')
bundle = 'const solarEnvironment = {};\n' + helper + '\nconst SolarCycle = solarEnvironment.cycle;'
(root / 'dist/tryon-solar-tracker-card.js').write_text(
    source.replace('/* SOLAR_CYCLE_HELPER */', bundle), encoding='utf-8')
