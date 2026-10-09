// Mock Home Assistant's native template subscription; never calls real services.
const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 try {
  const page=await browser.newPage({viewport:{width:390,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://template.test/**',route=>route.request().url().endsWith('.js')?route.fulfill({path:path.join(__dirname,'../dist/tryon-solar-tracker-card.js'),contentType:'text/javascript'}):route.fulfill({contentType:'text/html',body:'<tryon-solar-tracker-card></tryon-solar-tracker-card>'}));
  await page.goto('http://template.test/');
  await page.addScriptTag({url:'http://template.test/card.js',type:'module'});
  await page.evaluate(async()=>{
   window.states={};
   for(const [domain,suffix,state] of [['sensor','actual_solar_angle','35'],['sensor','requested_solar_angle','42'],['select','tracking_mode','Auto Sun'],['switch','motor_enable','on'],['binary_sensor','motor_fault','off'],['binary_sensor','angle_sensor_fault','off'],['binary_sensor','safety_bus_park_active','off']]) {
    const id=`${domain}.solar_array_0_${suffix}`;states[id]={entity_id:id,state,attributes:{friendly_name:'Solar Array 1 Actual Solar Angle'}};
   }
   states['sensor.totals_pv_power']={entity_id:'sensor.totals_pv_power',state:'6535',attributes:{unit_of_measurement:'W'}};
   window.subscriptions=[];window.stopped=[];window.commands=[];
   window.connection={subscribeMessage:async(callback,message)=>{const id=subscriptions.length;subscriptions.push({callback,message});return ()=>stopped.push(id);}};
   window.hass={states,connection,callWS:async()=>[],callService:async(...args)=>commands.push(args)};
   window.card=document.querySelector('tryon-solar-tracker-card');
   window.config={entity:'sensor.solar_array_0_actual_solar_angle',status:'sensor.totals_pv_power'};
   card.setConfig(config);card.hass=hass;await Promise.resolve();await Promise.resolve();
  });
  assert.equal(await page.locator('header .status').innerText(),'6535 W','entity unit appended automatically');
  assert.equal(await page.evaluate(()=>subscriptions.length),0,'no subscription needed for entity mode');
  await page.evaluate(()=>{states['sensor.totals_pv_power'].state='unavailable';card.hass=hass;});
  assert.equal(await page.locator('header .status').innerText(),'STATUS UNAVAILABLE','unavailable entity has no invented watts');
  await page.evaluate(()=>{states['sensor.totals_pv_power'].state='6535';window.template="{{ states('sensor.totals_pv_power') ~ ' ' ~ (state_attr('sensor.totals_pv_power', 'unit_of_measurement') or '') }}";card.setConfig({...config,status_template:template});});
  assert.deepEqual(await page.evaluate(()=>subscriptions[0].message),{type:'render_template',template:await page.evaluate(()=>template),variables:{entity:'sensor.totals_pv_power',tracker_entity:'sensor.solar_array_0_actual_solar_angle'},report_errors:true});
  await page.evaluate(()=>{window.panel=card.shadowRoot.querySelector('.solar-actual-panel');subscriptions[0].callback({result:'PV 6535 W',listeners:{entities:['sensor.totals_pv_power']}});});
  assert.equal(await page.locator('header .status').innerText(),'PV 6535 W');
  await page.evaluate(()=>{subscriptions[0].callback({result:'PV 7123 W'});for(let i=0;i<20;i++)card.hass={...hass};});
  assert.equal(await page.locator('header .status').innerText(),'PV 7123 W','dependency updates without tracker updates');
  assert.equal(await page.evaluate(()=>subscriptions.length),1,'reuses subscription across HA updates');
  assert(await page.evaluate(()=>panel===card.shadowRoot.querySelector('.solar-actual-panel')),'preserves panel nodes');
  await page.evaluate(()=>{states['binary_sensor.solar_array_0_motor_fault'].state='on';card.hass=hass;});
  assert.equal(await page.locator('header .status').innerText(),'FAULT — CHECK TRACKER','template cannot hide motor fault');
  await page.evaluate(()=>{states['binary_sensor.solar_array_0_motor_fault'].state='off';states['binary_sensor.solar_array_0_safety_bus_park_active'].state='on';card.hass=hass;});
  assert.equal(await page.locator('header .status').innerText(),'SAFETY PARK / HOLD');
  await page.evaluate(()=>{states['binary_sensor.solar_array_0_safety_bus_park_active'].state='off';states['switch.solar_array_0_motor_enable'].state='off';card.hass=hass;});
  assert.equal(await page.locator('header .status').innerText(),'MOTOR DISABLED');
  await page.evaluate(()=>{states['switch.solar_array_0_motor_enable'].state='on';card.hass=hass;subscriptions[0].callback({error:'bad expression',level:'ERROR'});});
  assert.equal(await page.locator('header .status').innerText(),'TEMPLATE ERROR');
  assert.equal(await page.locator('.template-warning').count(),1);
  await page.evaluate(()=>subscriptions[0].callback({result:'<img src=x onerror=alert(1)> W'}));
  assert.equal(await page.locator('header img').count(),0,'rendered text is escaped');
  assert.equal(await page.locator('.template-warning').count(),0,'recovers after template error');
  await page.evaluate(()=>card.setConfig({...config,status_template:'{{ 12 }} W'}));
  assert.deepEqual(await page.evaluate(()=>stopped),[0],'editing replaces subscription');
  await page.evaluate(()=>{subscriptions[0].callback({result:'STALE'});subscriptions[1].callback({result:'12 W'});});
  assert.equal(await page.locator('header .status').innerText(),'12 W','ignores old results');
  await page.evaluate(()=>card.remove());
  assert.deepEqual(await page.evaluate(()=>stopped),[0,1],'detaching unsubscribes');
  await page.evaluate(()=>document.body.append(card));
  assert.equal(await page.evaluate(()=>subscriptions.length),3,'reconnecting subscribes again');
  await page.evaluate(()=>card.setConfig(config));
  assert.deepEqual(await page.evaluate(()=>stopped),[0,1,2],'clearing template unsubscribes');
  assert.equal(await page.locator('header .status').innerText(),'6535 W');
  // A delayed subscription must clean up if the card disconnects before it resolves.
  await page.evaluate(()=>{hass.connection={subscribeMessage:(callback,message)=>new Promise(resolve=>{window.pendingResolve=resolve;window.lateCallback=callback;})};card.hass=hass;card.setConfig({...config,status_template:'{{ 99 }} W'});card.remove();pendingResolve(()=>stopped.push('late'));});
  await page.waitForFunction(()=>stopped.includes('late'));
  await page.evaluate(()=>{lateCallback({result:'stale'});document.body.append(card);hass.connection={subscribeMessage:async()=>{throw Error('not allowed')}};card.hass=hass;});
  await page.waitForFunction(()=>document.querySelector('tryon-solar-tracker-card').shadowRoot.querySelector('.template-warning'));
  assert.equal(await page.locator('header .status').innerText(),'TEMPLATE ERROR','subscription rejection is visible');
  assert.equal(await page.evaluate(()=>commands.length),0,'display templates send no service commands');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'fits phone width');
  assert.deepEqual(errors,[]);
  console.log('PASS: status units, native template subscription, live updates, lifecycle races, error recovery, escaped output, safety precedence');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
