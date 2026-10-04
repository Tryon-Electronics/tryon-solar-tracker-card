// Tryon Solar Tracker Card v0.4.0. Edit this source and run scripts/build.py.
(() => {
  /* SOLAR_CYCLE_HELPER */
  const ROLES = {
    requested: ['sensor', 'requested_solar_angle', 'Requested Solar Angle'],
    error: ['sensor', 'tracking_error', 'Tracking Error'],
    mode: ['select', 'tracking_mode', 'Tracking Mode'],
    status: ['sensor', 'tracking_status', 'Tracking Status'],
    sun_elevation: ['sensor', 'sun_elevation', 'Sun Elevation'],
    sun_azimuth: ['sensor', 'sun_azimuth', 'Sun Azimuth'],
    latitude: ['number', 'site_latitude', 'Site Latitude'],
    longitude: ['number', 'site_longitude', 'Site Longitude'],
    facing: ['number', 'panel_facing_azimuth', 'Panel Facing Azimuth'],
    minimum: ['number', 'panel_minimum_angle', 'Panel Minimum Angle'],
    maximum: ['number', 'panel_maximum_angle', 'Panel Maximum Angle'],
    epoch: ['sensor', 'tracker_epoch', 'Tracker Epoch'],
    safety_park: ['binary_sensor', 'safety_bus_park_active', 'Safety Bus Park Active'],
    motor_enable: ['switch', 'motor_enable', 'Motor Enable'],
    local_angle: ['number', 'local_requested_angle', 'Local Requested Angle'],
    calibrated: ['binary_sensor', 'panel_calibrated', 'Panel Calibrated'],
    time_valid: ['binary_sensor', 'time_valid', 'Time Valid'],
    wind_fresh: ['binary_sensor', 'wind_data_fresh', 'Wind Data Fresh'],
    at_target: ['binary_sensor', 'panel_at_target', 'Panel At Target'],
    motor_fault: ['binary_sensor', 'motor_fault', 'Motor Fault'],
    angle_fault: ['binary_sensor', 'angle_sensor_fault', 'Angle Sensor Fault'],
    wrong_fault: ['binary_sensor', 'wrong_direction_fault', 'Wrong Direction Fault'],
    no_move_fault: ['binary_sensor', 'no_movement_fault', 'No Movement Fault'],
    reset_faults: ['button', 'reset_motor_fault', 'Reset Motor Fault'],
    stop: ['button', 'stop_panel', 'Stop Panel'],
  };
  const normalize = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const available = state => state && (state.entity_id?.startsWith('button.') ? state.state !== 'unavailable' : !['unknown','unavailable',''].includes(state.state));
  const numeric = state => available(state) && Number.isFinite(Number(state.state)) ? Number(state.state) : null;
  const angle = n => n === null ? '—' : `${n.toFixed(1)}°`;
  function resolve(config, hass, registry) {
    const anchor = registry?.find(e => e.entity_id === config.entity);
    const ids = {actual: config.entity};
    const prefix = config.entity?.match(/^sensor\.(.+)_actual_solar_angle$/)?.[1];
    for (const [role, [domain, suffix, name]] of Object.entries(ROLES)) {
      if (config[role]) { ids[role] = config[role]; continue; }
      if (anchor?.device_id) {
        const sameDevice = registry.filter(e => e.device_id === anchor.device_id && !e.disabled_by && e.entity_id.startsWith(domain + '.'));
        // Local original names outrank suffix matches from ESP-NOW peer telemetry.
        const exactName = sameDevice.filter(e => normalize(e.original_name) === normalize(name));
        const exactId = sameDevice.filter(e => prefix && e.entity_id === `${domain}.${prefix}_${suffix}`);
        const suffixMatches = sameDevice.filter(e => !normalize(e.original_name).includes('espnow') && !normalize(e.entity_id).includes('espnow') && e.entity_id.endsWith('_' + suffix));
        const candidates = exactName.length ? exactName : exactId.length ? exactId : suffixMatches;
        // Ambiguous entities require an explicit selection; never choose another array.
        if (candidates.length === 1) ids[role] = candidates[0].entity_id;
      } else if (prefix) {
        const candidate = `${domain}.${prefix}_${suffix}`;
        if (hass.states[candidate]) ids[role] = candidate;
      }
    }
    return ids;
  }
  // Keep existing SVG and control nodes alive; change only text and attributes.
  function patchChildren(parent, desired) {
    for (let i=0; i<desired.childNodes.length; i++) {
      const next=desired.childNodes[i], current=parent.childNodes[i];
      if (!current) { parent.appendChild(next.cloneNode(true)); continue; }
      if (current.nodeType!==next.nodeType || current.nodeName!==next.nodeName) {
        parent.replaceChild(next.cloneNode(true),current); continue;
      }
      if (current.nodeType!==Node.ELEMENT_NODE) {
        if(current.nodeValue!==next.nodeValue)current.nodeValue=next.nodeValue;
        continue;
      }
      for(const attr of [...current.attributes])if(!next.hasAttribute(attr.name))current.removeAttribute(attr.name);
      for(const attr of next.attributes)if(current.getAttribute(attr.name)!==attr.value)current.setAttribute(attr.name,attr.value);
      patchChildren(current,next);
      if(['INPUT','SELECT'].includes(current.tagName) && current.value!==next.value)current.value=next.value;
    }
    while(parent.childNodes.length>desired.childNodes.length)parent.lastChild.remove();
  }
  class TryonSolarTrackerCard extends HTMLElement {
    constructor() {
      super(); this.attachShadow({mode:'open'}); this._registry = null; this._pending = false;
      this._signature = ''; this._busy = false; this._controlsOpen = false;
      this.shadowRoot.addEventListener('click',e=>this._handleAction(e));
      this.shadowRoot.addEventListener('change',e=>this._handleAction(e));
      this.shadowRoot.addEventListener('focusout',()=>queueMicrotask(()=>{this._signature='';this._render();}));
    }
    setConfig(config) {
      if (config.entity && !config.entity.startsWith('sensor.')) throw new Error('Choose the tracker’s Actual Solar Angle sensor.');
      if (config.entity !== this._config?.entity) this._controlsOpen = config.controls_expanded === true;
      this._config = {...config}; this._signature = ''; this._render();
    }
    set hass(hass) { this._hass = hass; this._loadRegistry(); this._render(); }
    getCardSize() { return 9; }
    getGridOptions() { return {columns:12, min_columns:6}; }
    static getStubConfig(hass, entities) {
      return {entity: entities?.find(id => /_actual_solar_angle$/.test(id)) || Object.keys(hass.states).find(id => /_actual_solar_angle$/.test(id)),show_controls:true};
    }
    static getConfigForm() {
      return {
        schema: [
          {name:'entity',required:true,selector:{entity:{domain:'sensor'}}},
          {name:'title',selector:{text:{}}},
          {name:'show_controls',selector:{boolean:{}}},
          {name:'controls_expanded',selector:{boolean:{}}},
          {name:'entities',type:'expandable',title:'Entity overrides (optional)',flatten:true,
            schema:Object.entries(ROLES).map(([name,[domain]]) => ({name,selector:{entity:{domain}}}))},
        ],
        computeLabel: field => field.name === 'entity' ? 'Tracker — select its Actual Solar Angle sensor' :
          field.name === 'title' ? 'Title (optional)' : field.name === 'show_controls' ? 'Show controls' : field.name === 'controls_expanded' ? 'Open controls by default' :
          ROLES[field.name]?.[2] || field.name,
        computeHelper: field => field.name === 'entity' ? 'Related readings and controls are detected on the same device. Use overrides if an entity has been renamed.' : undefined,
      };
    }
    async _loadRegistry() {
      if (this._pending || this._registry || !this._hass?.callWS) return;
      this._pending = true;
      try { this._registry = await this._hass.callWS({type:'config/entity_registry/list'}); }
      catch (_) { this._registry = []; }
      finally { this._pending = false; this._signature = ''; this._render(); }
    }
    _state(role) { return this._hass.states[this._ids[role]]; }
    _enabled(role) { return available(this._state(role)); }
    _render() {
      if (!this._hass || !this._config) return;
      if (!this._busy && ['INPUT','SELECT'].includes(this.shadowRoot.activeElement?.tagName)) return;
      this._ids = resolve(this._config, this._hass, this._registry);
      const signature = JSON.stringify([this._config, this._ids, this._busy, this._message, this._controlsOpen,
        ...Object.values(this._ids).map(id => {const s=this._hass.states[id];return s?[id,s.state,s.attributes]:null;}),
        [this._hass.states['sun.sun']?.state,this._hass.states['sun.sun']?.attributes]]);
      if (signature === this._signature) return;
      this._signature = signature;
      const deviceId = this._registry?.find(e => e.entity_id === this._config.entity)?.device_id;
      const actual = numeric(this._state('actual')), requested = numeric(this._state('requested'));
      const error = numeric(this._state('error'));
      const title = this._config.title || this._state('actual')?.attributes.friendly_name?.replace(/\s*Actual Solar Angle$/i,'') || 'Solar Tracker';
      const mode = this._state('mode');
      const faults = ['motor_fault','angle_fault','wrong_fault','no_move_fault'];
      const fault = faults.some(role => this._state(role)?.state === 'on');
      // Disabled-by-default detailed diagnostics are optional; Motor Fault covers both.
      const required = ['requested','mode','motor_enable','motor_fault','angle_fault'];
      const optionalDiagnostics = ['wrong_fault','no_move_fault'].filter(role => this._ids[role] || this._config[role]);
      const missing = [...required,...optionalDiagnostics].filter(role => !this._enabled(role));
      const status = actual === null ? 'ANGLE UNAVAILABLE' : fault ? 'FAULT — CHECK TRACKER' :
        this._state('motor_enable')?.state === 'off' ? 'MOTOR DISABLED' :
        available(this._state('status')) ? this._state('status').state : 'STATUS UNAVAILABLE';
      const flags = [['calibrated','Calibrated'],['time_valid','Time valid'],['wind_fresh','Wind fresh'],['at_target','At target']];
      const html = `<style>
        :host{display:block}*{box-sizing:border-box}ha-card{display:block;padding:18px;border-radius:22px;background:linear-gradient(145deg,#14261b,#07100b);color:#eef8ed;font-family:var(--primary-font-family,system-ui)}
        header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin-bottom:18px}h2{font-size:20px;margin:0}.status{padding:7px 10px;border:1px solid #4b6c3e;border-radius:12px;font-size:11px;max-width:100%;overflow-wrap:anywhere}.fault{border-color:#db5b44;background:#522219}
        .scene{position:relative;background:linear-gradient(#09212a,#07150d);border:1px solid #294d35;border-radius:18px;overflow:hidden}.scene svg{display:block;width:100%;height:auto}.metrics,.controls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}.metric,.control{padding:12px;border:1px solid #34513c;border-radius:14px;background:#16271c}.metric span,label{display:block;font-size:12px;color:#c2d6c5}.metric strong{display:block;font-size:22px;margin-top:5px}.flags{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}.flags span{padding:5px 8px;border-radius:10px;background:#223425;font-size:11px}.flags .off{color:#ffcf7f}
        .solar-flat-countdown{position:absolute;right:12px;top:36px;max-width:55%;padding:4px 7px;border:1px solid #496438;border-radius:7px;background:#06140de6;color:#f8d77d;font:700 10px/1.3 system-ui;text-align:right;pointer-events:none}
        .solar-light-beam{fill:#ffdc6518}.solar-light-ray{fill:none;stroke:#fff1ac99;stroke-width:2;stroke-dasharray:7 12}
        button,select,input{font:inherit;min-height:44px;border:1px solid #57764e;border-radius:10px;color:#eef8ed;background:#203725;padding:8px;width:100%;margin-top:7px}button{cursor:pointer}button:disabled,select:disabled,input:disabled{opacity:.45;cursor:default}.toolbar{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}.toolbar button,.toolbar a{width:auto;flex:1;margin:0;font-size:13px}.toolbar a{display:flex;align-items:center;justify-content:center;min-height:44px;border:1px solid #57764e;border-radius:10px;color:#eef8ed;background:#203725;text-decoration:none;padding:8px}.stop{background:#842820}.warning,.message{font-size:12px;line-height:1.5;margin-top:14px;color:#ffdd98}.warning ul{margin:5px 0;padding-left:20px}.label{font-size:13px;fill:#e8f4df}.target{fill:#ffdb72}.actual{fill:#91f16c}.empty{padding:36px 14px;text-align:center;color:#ffdb9b}
      </style><ha-card>
        <header><h2>☀ ${escape(title)}</h2><span class="status ${fault?'fault':''}">${escape(status)}</span></header>
        <div class="scene">${actual === null ? '<div class="empty">Choose an available Actual Solar Angle sensor to display this tracker.</div>' : this._scene(actual,requested,error)}</div>
        <div class="metrics">${[['Actual angle',angle(actual)],['Requested angle',angle(requested)],['Tracking error',angle(error)],['Mode',available(mode)?mode.state:'Unavailable']].map(([k,v])=>`<div class="metric"><span>${k}</span><strong>${escape(v)}</strong></div>`).join('')}</div>
        <div class="flags">${flags.map(([role,label])=>`<span class="${this._state(role)?.state==='on'?'':'off'}">${label}: ${this._state(role)?.state==='on'?'yes':this._state(role)?.state==='off'?'no':'unknown'}</span>`).join('')}</div>
        ${missing.length ? `<div class="warning">Some entities are missing or unavailable. Check Entity overrides in the editor.<ul>${missing.map(role=>`<li>${ROLES[role][2]}</li>`).join('')}</ul></div>` : ''}
        <div class="toolbar">
          ${this._config.show_controls !== false ? `<button data-action="toggle-controls" aria-expanded="${this._controlsOpen}">${this._controlsOpen?'Hide controls':'Controls'}</button>` : ''}
          ${deviceId ? `<a data-action="settings" href="/config/devices/device/${encodeURIComponent(deviceId)}">Settings</a>` : ''}
          ${this._config.show_controls !== false ? `<button data-action="stop" class="stop" ${this._enabled('stop')?'':'disabled'}>STOP PANEL</button>` : ''}
        </div>
        ${this._config.show_controls !== false && this._controlsOpen ? this._controls() : ''}
        ${this._message ? `<div class="message" role="status">${escape(this._message)}</div>` : ''}
      </ha-card>`;
      if(!this.shadowRoot.firstChild)this.shadowRoot.innerHTML=html;
      else {const template=document.createElement('template');template.innerHTML=html;patchChildren(this.shadowRoot,template.content);}
    }
    _handleAction(e) {
      const control=e.target.closest?.('[data-action]');
      if(!control || control.disabled)return;
      const action=control.dataset.action;
      if(e.type==='click') {
        if(action==='toggle-controls'){this._controlsOpen=!this._controlsOpen;this._signature='';this._render();}
        if(action==='motor')this._call('motor_enable','switch',this._state('motor_enable').state==='on'?'turn_off':'turn_on');
        if(action==='park')this._call('mode','select','select_option',{option:'Park Flat'});
        if(action==='reset')this._call('reset_faults','button','press');
        if(action==='stop')this._call('stop','button','press');
      } else if(e.type==='change') {
        if(action==='mode')this._call('mode','select','select_option',{option:control.value});
        if(action==='angle') {
          const state=this._state('local_angle'),value=Number(control.value),{min,max}=state.attributes;
          if(Number.isFinite(value)&&value>=min&&value<=max)this._call('local_angle','number','set_value',{value});
        }
      }
    }
    _scene(actual,requested,error) {
      const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), n=role=>numeric(this._state(role));
      // These projection constants, dimensions and textures match the website.
      const project=(x,y,a)=>{const r=clamp(a,0,90)*Math.PI/180;return [520+x*.88+y*Math.cos(r)*.32,224+x*.18-y*Math.cos(r)*.28-y*Math.sin(r)*.9];};
      const corners=a=>[[-170,-110],[170,-110],[170,110],[-170,110]].map(([x,y])=>project(x,y,a));
      const points=p=>p.map(x=>x.map(v=>v.toFixed(1)).join(',')).join(' ');
      const c=corners(actual),under=c.map(([x,y])=>[x+3.5,y+9.5]);
      const interpolate=(u,v)=>[0,1].map(axis=>c[0][axis]*(1-u)*(1-v)+c[1][axis]*u*(1-v)+c[2][axis]*u*v+c[3][axis]*(1-u)*v);
      const texture=[];
      for(let i=1;i<24;i++)texture.push(`M${interpolate(i/24,0).join(' ')}L${interpolate(i/24,1).join(' ')}`);
      for(let i=1;i<12;i++)texture.push(`M${interpolate(0,i/12).join(' ')}L${interpolate(1,i/12).join(' ')}`);
      const cells=[-85,0,85].map(x=>{const a=project(x,-110,actual),b=project(x,110,actual);return `<path d="M${a.join(' ')}L${b.join(' ')}" stroke="#d7edff" stroke-width="2"/>`;}).join('');
      const mid=[project(-170,0,actual),project(170,0,actual)];
      const hasSite=n('latitude')!==null&&n('longitude')!==null;
      const lat=hasSite?n('latitude'):this._hass.config?.latitude,lon=hasSite?n('longitude'):this._hass.config?.longitude;
      const epoch=n('epoch'),ms=epoch!==null&&epoch>0?epoch*1000:Date.now();
      const minimum=n('minimum')??1.5,maximum=n('maximum')??84,facing=n('facing')??180;
      const schedule=SolarCycle.schedule(ms,lat,lon,facing,minimum,maximum);
      const estimate=schedule?SolarCycle.position(ms,lat,lon):null;
      const elevation=n('sun_elevation') ?? this._hass.states['sun.sun']?.attributes.elevation ?? estimate?.elevation;
      const azimuth=n('sun_azimuth') ?? this._hass.states['sun.sun']?.attributes.azimuth ?? estimate?.azimuth;
      const knownSun=Number.isFinite(elevation),day=knownSun&&elevation>0;
      const night=schedule?SolarCycle.night(ms,schedule,lat,lon):{p:.5,height:45};
      const progress=day&&Number.isFinite(azimuth)?clamp((azimuth-90)/180,0,1):night.p;
      const x=45+145*progress,y=day?148-100*clamp(elevation,0,90)/90:148-100*night.height/90*4*progress*(1-progress);
      const strength=day?Math.max(0,Math.sin(Math.PI*progress)):0,shine=interpolate(.28,.58);
      const mode=available(this._state('mode'))?this._state('mode').state:'MODE UNAVAILABLE';
      const fault=['motor_fault','angle_fault','wrong_fault','no_move_fault'].some(role=>this._state(role)?.state==='on');
      const timeInvalid=this._state('time_valid')?.state==='off';
      const options={mode,fault,safety:this._state('safety_park')?.state==='on',disabled:this._state('motor_enable')?.state==='off',flat:actual<=minimum+.75};
      const statusRoles=['mode','motor_enable','motor_fault','angle_fault',...['wrong_fault','no_move_fault'].filter(role=>this._ids[role]||this._config[role])];
      const missingStatus=statusRoles.some(role=>!this._enabled(role));
      const missingLimits=['facing','minimum','maximum'].some(role=>n(role)===null);
      const countdown=options.fault||options.safety?SolarCycle.label(ms,schedule,options):missingStatus?'CHECK TRACKER STATUS':timeInvalid?'CHECK TRACKER TIME':missingLimits?'COUNTDOWN · CHECK SITE / LIMITS':SolarCycle.label(ms,schedule,options);
      const estimateSource=[!hasSite?'HA LOCATION':null,epoch===null?'BROWSER TIME':null].filter(Boolean).join(' / ');
      const path=day?schedule?.path:`M45 148 Q117.5 ${148-200*night.height/90} 190 148`;
      const gauge=a=>{const r=(270-clamp(a,0,90))*Math.PI/180;return [860+96*Math.cos(r),310+96*Math.sin(r)];};
      const dot=gauge(actual),target=requested===null?null:gauge(requested);
      const sunLabel=knownSun?`SUN ${elevation.toFixed(1)}° ELEV${Number.isFinite(azimuth)?' · '+azimuth.toFixed(0)+'° AZ':''}`:'SUN POSITION UNAVAILABLE';
      return `<svg viewBox="0 0 900 420" class="solar-cinematic-scene" role="img" aria-label="Actual panel tilt ${angle(actual)}; requested ${angle(requested)}">
        <defs>
          <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b254b"/><stop offset=".32" stop-color="#237bbc"/><stop offset=".72" stop-color="#094a8b"/><stop offset="1" stop-color="#051736"/></linearGradient>
          <linearGradient id="gloss" x2="0" y2="1"><stop stop-color="#b3e8ff" stop-opacity=".26"/><stop offset=".45" stop-color="#50a9da" stop-opacity=".04"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient>
          <linearGradient id="metal" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#101d17"/><stop offset=".3" stop-color="#526a51"/><stop offset=".48" stop-color="#cbca7e"/><stop offset=".6" stop-color="#334b33"/><stop offset="1" stop-color="#07130e"/></linearGradient>
          <radialGradient id="flare"><stop stop-color="#fff"/><stop offset=".12" stop-color="#fff4b3" stop-opacity=".9"/><stop offset=".42" stop-color="#ffe6a1" stop-opacity=".25"/><stop offset="1" stop-color="#fff4ae" stop-opacity="0"/></radialGradient>
          <radialGradient id="sun"><stop stop-color="#fff6b7"/><stop offset=".5" stop-color="#ffd34b"/><stop offset="1" stop-color="#f2a916"/></radialGradient>
          <linearGradient id="sky"><stop stop-color="${day?'#08170e':'#050b10'}"/><stop offset="1" stop-color="${day?'#0d2418':'#091a1f'}"/></linearGradient>
        </defs>
        <rect width="900" height="420" fill="url(#sky)"/>
        <path class="solar-background-grid" d="${Array.from({length:24},(_,i)=>`M${i*40} 0V420`).join(' ')} ${Array.from({length:11},(_,i)=>`M0 ${i*40}H900`).join(' ')}" fill="none" stroke="#284647" stroke-width=".6" opacity=".4"/>
        ${day?'':'<path d="M58 84h2 M231 62h2 M343 100h2 M690 72h2 M804 114h2" stroke="#b8d5d3" stroke-width="2" opacity=".6"/>'}
        <text x="28" y="33" class="label" style="font-size:15px;font-weight:900">${sunLabel}</text><text x="872" y="33" text-anchor="end" class="label" style="font-size:15px;font-weight:900">${escape(mode.toUpperCase())}</text>
        <text x="28" y="53" fill="#c1d9ca" font-size="10">${knownSun?(day?'SEASONAL SUN PATH':'MOON · ILLUSTRATIVE NIGHT ARC'):'CHECK SUN ENTITIES / LOCATION'}${estimateSource?' · '+estimateSource:''}</text>
        <polygon class="solar-light-beam" points="${x},${y} ${c[0].join(',')} ${c[3].join(',')}" opacity="${strength}"/>
        <path class="solar-light-ray" d="M${x} ${y}L${shine.join(' ')}" opacity="${strength}"/>
        ${knownSun&&path?`<path class="solar-orbit-path" d="${path}" fill="none" stroke="${day?'#f8d77d':'#9fbacb'}" stroke-width="2.5" stroke-dasharray="5 12" opacity=".8"/>`:''}
        ${knownSun?day?`<g class="solar-scene-sun" transform="translate(${x} ${y})"><circle r="38" fill="#ffdc68" opacity=".16"/><circle r="15" fill="url(#sun)" stroke="#fff0a4" stroke-width="2"/></g>`:`<g class="solar-scene-moon" transform="translate(${x} ${y})"><circle r="18" fill="#dbe8e0"/><circle cx="8" cy="-6" r="17" fill="#091a1f"/></g>`:''}
        <g class="solar-ground-rings">${[[240,58],[210,49],[180,40]].map(([rx,ry],i)=>`<ellipse cx="520" cy="338" rx="${rx}" ry="${ry}" fill="none" stroke="${i===1?'#e6ce50':'#70f35f'}" stroke-width="${i===1?2.5:1.5}" opacity="${i===1?.8:.5}"/>`).join('')}</g>
        <g class="solar-pedestal"><ellipse cx="520" cy="347" rx="64" ry="18" fill="#050d08" stroke="#73d84e" stroke-width="2"/><path d="M467 325V341 Q520 359 573 341V325Z" fill="url(#metal)" stroke="#879858" stroke-width="2"/><ellipse cx="520" cy="325" rx="53" ry="16" fill="#1c301d" stroke="#eedf69" stroke-width="2"/><path d="M503 229L503 324 Q520 334 537 324L537 229Z" fill="url(#metal)" stroke="#afa853" stroke-width="2"/><ellipse cx="520" cy="229" rx="27" ry="12" fill="#465333" stroke="#f4d970" stroke-width="3"/></g>
        ${requested===null?'':`<polygon class="solar-target-panel" points="${points([[-178,-115],[178,-115],[178,115],[-178,115]].map(([x,y])=>project(x,y,requested)))}" fill="#f0bc470e" stroke="#f0bc47" stroke-width="4" stroke-dasharray="12 9" opacity=".35"/>`}
        <polygon points="${points(under)}" fill="#06110c" stroke="#1b3427" stroke-width="3"/><polygon points="${points([c[0],c[1],under[1],under[0]])}" fill="#14291e" stroke="#385847" stroke-width="2.5"/><polygon points="${points([c[1],c[2],under[2],under[1]])}" fill="#0d2117" stroke="#2c4b39" stroke-width="2.5"/>
        <polygon class="solar-actual-panel" points="${points(c)}" fill="url(#panel)" stroke="#f1d56d" stroke-width="5"/><polygon points="${points(c)}" fill="url(#gloss)" opacity=".65"/>
        ${cells}<path d="M${mid[0].join(' ')}L${mid[1].join(' ')}" stroke="#d7edff" stroke-width="3"/>
        <path class="solar-cell-texture" d="${texture.join(' ')}" fill="none" stroke="#bddfff" stroke-width=".6" opacity=".32"/><path class="solar-panel-bevel" d="M${c[0].join(' ')}L${c[3].join(' ')}L${c[2].join(' ')}" fill="none" stroke="#fff3af" stroke-width="2.5"/>
        <g class="solar-panel-gleam" transform="translate(${shine.join(' ')})" opacity="${strength*.9}"><circle r="43" fill="url(#flare)"/><path d="M-35 0H35 M0 -35V35" stroke="#fff8cb" stroke-width="1.6"/></g>
        <g class="solar-angle-gauge"><path d="M860 214 A96 96 0 0 0 764 310" fill="none" stroke="#b7d8c526" stroke-width="5" stroke-linecap="round"/><path d="M860 214 A96 96 0 0 0 764 310" fill="none" stroke="#70f35f" stroke-width="5" stroke-linecap="round" stroke-dasharray="${151*clamp(actual,0,90)/90} 999"/>
        ${target?`<circle cx="${target[0]}" cy="${target[1]}" r="6" fill="#f0bc47" stroke="#251b05" stroke-width="3"/>`:''}<circle cx="${dot[0]}" cy="${dot[1]}" r="7" fill="#70f35f" stroke="#092014" stroke-width="3"/>
        <text x="748" y="334" fill="#91b98b" font-size="11" font-weight="900">90°</text><text x="852" y="202" fill="#91b98b" font-size="11" font-weight="900">0° FLAT</text><text x="752" y="188" fill="#73917f" font-size="9" font-weight="900" letter-spacing="1.15">PANEL TILT</text></g>
        <rect x="28" y="365" width="844" height="38" rx="14" fill="#030c07d1" stroke="#70f35f21"/><text x="52" y="389" class="label target" font-weight="900">TARGET ${angle(requested)}</text><text x="357" y="389" class="label actual" font-weight="900">ACTUAL ${angle(actual)}</text><text x="668" y="389" class="label" font-weight="900">ERROR ${angle(error)}</text>
      </svg><div class="solar-flat-countdown">${escape(countdown)}</div>`;
    }
    _controls() {
      const disabled=role=>!this._enabled(role)||(this._busy&&role!=='stop')?'disabled':'';
      const mode=this._state('mode'),local=this._state('local_angle');
      const options=mode?.attributes.options || [];
      return `<div class="controls">
        <div class="control"><label>Tracking Mode<select data-action="mode" ${disabled('mode')}>${options.map(option=>`<option ${mode.state===option?'selected':''}>${escape(option)}</option>`).join('')}</select></label></div>
        <div class="control"><label>Local Angle<input data-action="angle" type="number" min="${escape(local?.attributes.min)}" max="${escape(local?.attributes.max)}" step="${escape(local?.attributes.step || 1)}" value="${numeric(local)??''}" ${disabled('local_angle')}></label></div>
        <button data-action="motor" ${disabled('motor_enable')}>${this._state('motor_enable')?.state==='on'?'Disable motor':'Enable motor'}</button>
        <button data-action="park" ${disabled('mode')} ${options.includes('Park Flat')?'':'disabled'}>Park Flat</button>
        <button data-action="reset" ${disabled('reset_faults')}>Reset Faults</button>
      </div>`;
    }
    async _call(role,domain,service,data={}) {
      if((this._busy && role!=='stop') || !this._enabled(role))return;
      const id=this._ids[role]; if(!id.startsWith(domain+'.'))return;
      this._busy=true;this._message='Sending command…';this._render();
      try {await this._hass.callService(domain,service,{...data,entity_id:id});this._message='Command sent. Waiting for tracker feedback.';}
      catch(_) {this._message='Command failed. Check the tracker connection and your Home Assistant permissions.';}
      finally {this._busy=false;this._render();}
    }
  }
  if(!customElements.get('tryon-solar-tracker-card'))customElements.define('tryon-solar-tracker-card',TryonSolarTrackerCard);
  window.customCards=window.customCards||[];
  if(!window.customCards.some(c=>c.type==='tryon-solar-tracker-card'))window.customCards.push({
    type:'tryon-solar-tracker-card',name:'Tryon Solar Tracker',description:'Choose one tracker angle entity for its illustration, readings, and controls.',
    documentationURL:'https://github.com/Tryon-Electronics/tryon-solar-tracker-card',
    getEntitySuggestion:(_hass,id)=>/^sensor\..+_actual_solar_angle$/.test(id)?{config:{type:'custom:tryon-solar-tracker-card',entity:id}}:null,
  });
})();
