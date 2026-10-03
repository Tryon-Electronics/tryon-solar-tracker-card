// Browser tests use a fake hass object. No calls reach a real tracker.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({headless:true, ...(process.platform==='win32'?{channel:'msedge'}:{})});
  try {
    const page = await browser.newPage({viewport:{width:480,height:1000}});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.route('http://card.test/**',route=>route.request().url().endsWith('/tryon-solar-tracker-card.js') ? route.fulfill({path:path.join(__dirname,'../dist/tryon-solar-tracker-card.js'),contentType:'text/javascript'}) : route.request().url().endsWith('/solar-landscape-v1.png') ?
      route.fulfill({path:path.join(__dirname,'../dist/solar-landscape-v1.png'),contentType:'image/png'}) :
      route.fulfill({contentType:'text/html',body:'<body style="margin:12px;background:#f0f2ec"><tryon-solar-tracker-card></tryon-solar-tracker-card></body>'}));
    await page.goto('http://card.test/');
    await page.addScriptTag({url:'http://card.test/hacsfiles/tryon-solar-tracker-card/tryon-solar-tracker-card.js',type:'module'});
    await page.evaluate(async()=>{
      window.calls=[];window.registry=[];window.states={};
      function add(id,device,name,state,attributes={}) {
        registry.push({entity_id:id,device_id:device,original_name:name});
        states[id]={entity_id:id,state,attributes:{friendly_name:'Solar Array '+device+' '+name,...attributes}};
      }
      const roles=[['sensor','actual_solar_angle','Actual Solar Angle','35'],['sensor','requested_solar_angle','Requested Solar Angle','42'],['sensor','tracking_error','Tracking Error','7'],['sensor','tracking_status','Tracking Status','AUTO SUN - TRACKING'],['select','tracking_mode','Tracking Mode','Auto Sun',{options:['Auto Sun','Local Angle','Park Flat']}],['number','local_requested_angle','Local Requested Angle','25',{min:0,max:84,step:.1}],['switch','motor_enable','Motor Enable','on'],['button','reset_motor_fault','Reset Motor Fault','2026-10-02'],['button','stop_panel','Stop Panel','2026-10-02'],...['Motor Fault','Angle Sensor Fault','Wrong Direction Fault','No Movement Fault','Panel Calibrated','Time Valid','Wind Data Fresh','Panel At Target'].map(name=>['binary_sensor',name.toLowerCase().replaceAll(' ','_'),name,name.includes('Fault')?'off':'on'])];
      roles.push(['number','site_latitude','Site Latitude','41.283815'],['number','site_longitude','Site Longitude','-96.13358'],['number','panel_facing_azimuth','Panel Facing Azimuth','180'],['number','panel_minimum_angle','Panel Minimum Angle','1.5'],['number','panel_maximum_angle','Panel Maximum Angle','84'],['sensor','tracker_epoch','Tracker Epoch',String(Date.parse('2026-06-21T17:00:00Z')/1000)],['sensor','sun_elevation','Sun Elevation','70'],['sensor','sun_azimuth','Sun Azimuth','160'],['binary_sensor','safety_bus_park_active','Safety Bus Park Active','off']);
      for(const device of ['2','4'])for(const [domain,suffix,name,state,attributes] of roles)add(`${domain}.solar_array_${device}_${suffix}`,device,name,state,attributes);
      // Renamed control is discovered through its original name on the same device.
      const old='select.solar_array_4_tracking_mode',renamed='select.south_array_mode';
      states[renamed]={...states[old],entity_id:renamed};delete states[old];registry.find(e=>e.entity_id===old).entity_id=renamed;
      window.card=document.querySelector('tryon-solar-tracker-card');
      window.hass={states,callWS:async()=>registry,callService:async(domain,service,data)=>calls.push({domain,service,data})};
      card.setConfig({entity:'sensor.solar_array_4_actual_solar_angle'});card.hass=hass;await Promise.resolve();await Promise.resolve();
    });
    assert.equal(await page.evaluate(()=>calls.length),0,'loading sends no movement commands');
    assert.equal(await page.locator('.controls').count(),0,'basic view starts with controls collapsed');
    assert.equal(await page.locator('[data-action="settings"]').getAttribute('href'),'/config/devices/device/4');
    assert(await page.locator('[data-action="stop"]').isEnabled(),'STOP is accessible in basic view');
    await page.locator('[data-action="toggle-controls"]').click();
    assert.equal(await page.evaluate(()=>calls.length),0,'opening controls sends no commands');
    assert.equal(await page.locator('.solar-landscape').getAttribute('href'),'http://card.test/hacsfiles/tryon-solar-tracker-card/solar-landscape-v1.png');
    assert((await page.locator('.solar-flat-countdown').innerText()).startsWith('FLAT TARGET IN'));
    assert.equal(await page.locator('.solar-cell-texture').count(),1);
    assert.equal(await page.locator('.solar-scene-sun').count(),1);
    const summerPath=await page.locator('.solar-orbit-path').getAttribute('d');
    await page.evaluate(()=>{states['sensor.solar_array_4_tracker_epoch'].state=String(Date.parse('2026-12-21T18:00:00Z')/1000);card.hass=hass});
    assert.notEqual(await page.locator('.solar-orbit-path').getAttribute('d'),summerPath,'seasonal path changes');
    await page.evaluate(()=>{states['sensor.solar_array_4_tracker_epoch'].state=String(Date.parse('2026-06-22T04:00:00Z')/1000);states['sensor.solar_array_4_sun_elevation'].state='-16';card.hass=hass});
    assert.equal(await page.locator('.solar-scene-moon').count(),1);
    assert((await page.locator('.solar-flat-countdown').innerText()).startsWith('SUN UP IN'));
    if(process.env.CARD_NIGHT_SCREENSHOT)await page.screenshot({path:process.env.CARD_NIGHT_SCREENSHOT,fullPage:true});
    await page.evaluate(()=>{states['binary_sensor.solar_array_4_safety_bus_park_active'].state='on';card.hass=hass});
    assert.equal(await page.locator('.solar-flat-countdown').innerText(),'SAFETY PARK / HOLD');
    await page.evaluate(()=>{states['sensor.solar_array_4_tracker_epoch'].state=String(Date.parse('2026-06-21T17:00:00Z')/1000);states['sensor.solar_array_4_sun_elevation'].state='70';states['binary_sensor.solar_array_4_safety_bus_park_active'].state='off';card.hass=hass});
    const actualPoints=await page.locator('.solar-actual-panel').getAttribute('points');
    await page.evaluate(()=>{states['sensor.solar_array_4_actual_solar_angle'].state='65';card.hass=hass});
    assert.notEqual(await page.locator('.solar-actual-panel').getAttribute('points'),actualPoints,'geometry follows reported angle');
    await page.evaluate(()=>{states['sensor.solar_array_4_actual_solar_angle'].state='35';card.hass=hass});
    assert((await page.locator('h2').innerText()).includes('Solar Array 4'));
    assert.equal(await page.locator('[data-action="mode"]').inputValue(),'Auto Sun');
    await page.locator('[data-action="mode"]').selectOption('Local Angle');
    assert.deepEqual(await page.evaluate(()=>calls.at(-1)),{domain:'select',service:'select_option',data:{option:'Local Angle',entity_id:'select.south_array_mode'}});
    await page.locator('[data-action="stop"]').click();
    assert.equal(await page.evaluate(()=>calls.at(-1).data.entity_id),'button.solar_array_4_stop_panel');
    await page.locator('[data-action="angle"]').fill('39');
    await page.evaluate(()=>{states['sensor.solar_array_4_actual_solar_angle'].state='36';card.hass=hass});
    assert.equal(await page.locator('[data-action="angle"]').inputValue(),'39','state refresh preserves editing');
    await page.locator('[data-action="angle"]').press('Tab');
    assert.equal(await page.evaluate(()=>calls.at(-1).data.value),39);
    await page.evaluate(()=>{states['button.solar_array_4_stop_panel'].state='unavailable';states['binary_sensor.solar_array_4_motor_fault'].state='unknown';card.hass=hass});
    assert(await page.locator('[data-action="stop"]').isDisabled());
    assert((await page.locator('.warning').innerText()).includes('Motor Fault'));
    // Two matching controls on one device stay unresolved; no fallback to Array 2.
    await page.evaluate(()=>{registry.push({entity_id:'select.other_mode',device_id:'4',original_name:'Tracking Mode'});states['select.other_mode']={state:'Auto Sun',attributes:{options:['Auto Sun']}};card._signature='';card.hass=hass});
    assert(await page.locator('[data-action="mode"]').isDisabled());
    await page.evaluate(()=>{card.setConfig({entity:'sensor.solar_array_4_actual_solar_angle',mode:'select.south_array_mode',title:'<img src=x onerror=alert(1)>'});card.hass=hass});
    assert.equal(await page.locator('h2 img').count(),0,'title is escaped');
    assert(await page.locator('[data-action="mode"]').isEnabled());
    await page.evaluate(()=>{states['sensor.solar_array_4_actual_solar_angle'].state='unavailable';card.hass=hass});
    assert.equal(await page.locator('.scene svg').count(),0,'missing actual angle does not show fake motion');
    await page.evaluate(()=>{card.setConfig({entity:'sensor.solar_array_2_actual_solar_angle',show_controls:false});card.hass=hass});
    assert.equal(await page.locator('.controls').count(),0);
    assert((await page.locator('h2').innerText()).includes('Solar Array 2'));
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile has no horizontal overflow');
    await page.evaluate(()=>{card.setConfig({entity:'sensor.solar_array_4_actual_solar_angle'});states['sensor.solar_array_4_actual_solar_angle'].state='35';registry.splice(registry.findIndex(e=>e.entity_id==='select.other_mode'),1);card.hass=hass});
    await page.locator('[data-action="toggle-controls"]').click();
    // A service failure is visible. STOP remains usable while another call waits.
    await page.evaluate(()=>{hass.callService=()=>new Promise(resolve=>{window.finish=resolve});card.hass=hass});
    await page.locator('[data-action="motor"]').click();
    await page.evaluate(()=>{states['button.solar_array_4_stop_panel'].state='2026-10-02';card.hass=hass});
    assert(await page.locator('[data-action="stop"]').isEnabled());
    await page.evaluate(()=>{finish();hass.callService=async()=>{throw Error('offline')}});
    await page.locator('[data-action="reset"]').click();
    assert((await page.locator('.message').innerText()).includes('Command failed'));
    assert.deepEqual(errors,[]);
    await page.evaluate(()=>{states['binary_sensor.solar_array_4_motor_fault'].state='off';states['sensor.solar_array_4_actual_solar_angle'].state='42';states['sensor.solar_array_4_tracking_error'].state='0';states['sensor.solar_array_4_tracking_status'].state='AUTO SUN - AT TARGET';card._message='';card.hass=hass});
    await page.locator('[data-action="toggle-controls"]').click();
    assert.equal(await page.locator('.controls').count(),0);
    if(process.env.CARD_SCREENSHOT)await page.screenshot({path:process.env.CARD_SCREENSHOT,fullPage:true});
    console.log('PASS: website graphics, seasonal path, night countdown, safety override, reported panel geometry, discovery, controls, unavailable states and mobile');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
