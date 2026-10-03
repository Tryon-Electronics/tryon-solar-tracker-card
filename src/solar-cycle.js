// Browser-only solar estimates (Meeus/NOAA equations); never commands a motor.
// Reference: https://gml.noaa.gov/grad/solcalc/calcdetails.html
(() => {
  const R = Math.PI / 180, clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const wrap = v => ((v % 360) + 360) % 360;
  function position(ms, lat, lon) {
    const jd = ms / 86400000 + 2440587.5, t = (jd - 2451545) / 36525;
    const l = wrap(280.46646 + t*(36000.76983+.0003032*t));
    const m = wrap(357.52911+t*(35999.05029-.0001537*t))*R;
    const c = Math.sin(m)*(1.914602-t*(.004817+.000014*t))+Math.sin(2*m)*(.019993-.000101*t)+.000289*Math.sin(3*m);
    const omega = (125.04-1934.136*t)*R;
    const lambda = (l+c-.00569-.00478*Math.sin(omega))*R;
    const epsilon = (23+(26+(21.448-t*(46.815+t*(.00059-t*.001813)))/60)/60+.00256*Math.cos(omega))*R;
    const ra = Math.atan2(Math.cos(epsilon)*Math.sin(lambda),Math.cos(lambda));
    const dec = Math.asin(Math.sin(epsilon)*Math.sin(lambda));
    const h = (wrap(280.46061837+360.98564736629*(jd-2451545)+.000387933*t*t-t*t*t/38710000+lon)-ra/R)*R;
    let elevation = Math.asin(Math.sin(lat*R)*Math.sin(dec)+Math.cos(lat*R)*Math.cos(dec)*Math.cos(h))/R;
    // Same standard refraction approximation used by ESPHome's sun component.
    if (elevation > -1) elevation += 1.02 / Math.tan((elevation+10.3/(elevation+5.11))*R) / 60;
    const azimuth = wrap(Math.atan2(Math.sin(h),Math.cos(h)*Math.sin(lat*R)-Math.tan(dec)*Math.cos(lat*R))/R+180);
    return { elevation, azimuth, day:elevation>0 };
  }
  function target(pos, facing=180, minimum=1.5, maximum=84) {
    if (pos.elevation<=0) return minimum;
    const front = Math.cos(pos.elevation*R)*Math.cos((pos.azimuth-facing)*R);
    return front<=0 ? minimum : clamp(Math.atan2(front,Math.sin(pos.elevation*R))/R,minimum,maximum);
  }
  const cache = new Map();
  function schedule(ms,lat,lon,facing=180,minimum=1.5,maximum=84) {
    if (![ms,lat,lon,facing,minimum,maximum].every(Number.isFinite)) return null;
    const date = new Date(ms+lon*240000), key = [date.toISOString().slice(0,10),lat,lon,facing,minimum,maximum].join('|');
    if (cache.has(key)) return cache.get(key);
    const noon = Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate(),12)-lon*240000;
    const samples=[]; let peak=0, sunset=null, sunrise=null, flat=null, previousTime=null, previousTarget=null;
    for (let time=noon-43200000;time<=noon+43200000;time+=60000) {
      const pos=position(time,lat,lon), angle=target(pos,facing,minimum,maximum);
      peak=Math.max(peak,pos.elevation);
      if (pos.day) { if(sunrise===null) sunrise=time; sunset=time; }
      if (previousTarget>minimum+.001 && angle<=minimum+.001) {
        let lo=previousTime,hi=time;
        for(let i=0;i<12;i++){const mid=(lo+hi)/2; if(target(position(mid,lat,lon),facing,minimum,maximum)>minimum+.001)lo=mid;else hi=mid;}
        flat=hi; // Last falling crossing also supports east/west-facing arrays.
      }
      if(pos.day && new Date(time).getUTCMinutes()%5===0) {
        const x=45+145*clamp((pos.azimuth-90)/180,0,1),y=148-100*clamp(pos.elevation,0,90)/90;
        samples.push(`${samples.length?'L':'M'}${x.toFixed(1)} ${y.toFixed(1)}`);
      }
      previousTime=time; previousTarget=angle;
    }
    const result={path:samples.join(' '),peak,sunrise,sunset,flat,noon,lat,lon};
    if(cache.size>12)cache.clear(); cache.set(key,result); return result;
  }
  function clock(text,zone) {
    const match=String(text).match(/\w+ (\w+) (\d+) (\d{4}) \| (\d+):(\d+):(\d+) (AM|PM)/);
    if(!match)return NaN;
    const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const wall=Date.UTC(+match[3],months.indexOf(match[1]),+match[2],+match[4]%12+(match[7]==='PM'?12:0),+match[5],+match[6]);
    let utc=wall;
    try { const fmt=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',second:'numeric',hourCycle:'h23'});
      for(let i=0;i<3;i++){const p=Object.fromEntries(fmt.formatToParts(new Date(utc)).map(v=>[v.type,v.value]));utc+=wall-Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);}
    }catch(_){return NaN;} return utc;
  }
  function label(ms,s,options={}) {
    if(options.fault)return 'TRACKING STOPPED · FAULT';
    if(options.safety)return 'SAFETY PARK / HOLD';
    if(options.disabled)return 'MOTOR DISABLED';
    if(options.mode && options.mode!=='auto' && options.mode!=='Auto Sun')return options.mode==='local'||options.mode==='Local Angle'?'LOCAL ANGLE':'MANUAL PARK FLAT';
    if(!s || !Number.isFinite(ms))return 'FLAT TIME · CHECK TIME / LOCATION';
    const beforeSunrise=s.sunrise!==null && ms<s.sunrise;
    const afterSunset=s.sunset!==null && ms>s.sunset;
    if(beforeSunrise || afterSunset || (s.flat!==null && ms>=s.flat && options.flat)) {
      const sunrise=beforeSunrise?s.sunrise:schedule(ms+86400000,s.lat,s.lon)?.sunrise;
      if(!Number.isFinite(sunrise) || sunrise<=ms)return 'NO SUNRISE IN NEXT SOLAR DAY';
      const seconds=Math.max(0,Math.floor((sunrise-ms)/1000));
      return `SUN UP IN ~${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
    }
    if(s.flat===null)return 'NO EVENING FLAT CROSSING TODAY';
    if(ms>=s.flat)return 'PARKING FLAT';
    let seconds=Math.max(0,Math.floor((s.flat-ms)/1000));
    return `FLAT TARGET IN ~${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  }
  function atLocal(date,hour,zone='America/Chicago') {
    const d=new Date(Date.parse(date+'T00:00:00Z')+hour*3600000);
    return clock(`Day ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]} ${d.getUTCDate()} ${d.getUTCFullYear()} | ${d.getUTCHours()%12||12}:${String(d.getUTCMinutes()).padStart(2,'0')}:${String(d.getUTCSeconds()).padStart(2,'0')} ${d.getUTCHours()<12?'AM':'PM'}`,zone);
  }
  function night(ms,s,lat,lon) {
    let start=s.sunset,end=s.sunrise;
    if(start===null||end===null)return {p:.5,height:45};
    if(ms>=s.sunset)end=schedule(ms+86400000,lat,lon)?.sunrise;
    else start=schedule(ms-86400000,lat,lon)?.sunset;
    return {p:clamp((ms-start)/(end-start),0,1),height:clamp(90-s.peak,20,70)};
  }
  globalThis.SolarCycle={position,target,schedule,clock,label,atLocal,night};
})();
