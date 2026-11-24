// Export als FIT (Garmin, Strava) und TCX
const FIT_EPOCH = 631065600; // 1989-12-31T00:00:00Z
const CRC_T = [0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401, 0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400];
function crc16(bytes, crc = 0) {
  for (const b of bytes) {
    let t = CRC_T[crc & 0xF]; crc = (crc >> 4) & 0x0FFF; crc = crc ^ t ^ CRC_T[b & 0xF];
    t = CRC_T[crc & 0xF]; crc = (crc >> 4) & 0x0FFF; crc = crc ^ t ^ CRC_T[(b >> 4) & 0xF];
  }
  return crc;
}
// Basistypen
const BT = { enum: [0x00, 1], uint8: [0x02, 1], sint16: [0x83, 2], uint16: [0x84, 2], sint32: [0x85, 4], uint32: [0x86, 4], uint32z: [0x8C, 4] };
const INVALID = { enum: 0xFF, uint8: 0xFF, sint16: 0x7FFF, uint16: 0xFFFF, sint32: 0x7FFFFFFF, uint32: 0xFFFFFFFF, uint32z: 0 };

class FitWriter {
  constructor() { this.buf = []; this.defs = new Map(); this.nextLocal = 0; }
  def(name, global, fields) {
    const local = this.nextLocal++ % 16;
    this.defs.set(name, { local, fields });
    const out = [0x40 | local, 0, 0, global & 0xFF, global >> 8, fields.length];
    for (const [num, type] of fields) out.push(num, BT[type][1], BT[type][0]);
    this.buf.push(...out);
  }
  msg(name, values) {
    const d = this.defs.get(name); const out = [d.local];
    d.fields.forEach(([num, type], i) => {
      let v = values[i]; if (v == null || Number.isNaN(v)) v = INVALID[type];
      v = Math.round(v); const n = BT[type][1];
      if (type.startsWith('sint') && v < 0) v = (n === 2 ? 0x10000 : 0x100000000) + v;
      for (let k = 0; k < n; k++) out.push(Math.floor(v / 2 ** (8 * k)) & 0xFF);
    });
    this.buf.push(...out);
  }
  bytes() {
    const data = this.buf, size = data.length;
    const h = [14, 0x20, 2132 & 0xFF, 2132 >> 8, size & 0xFF, (size >> 8) & 0xFF, (size >> 16) & 0xFF, (size >>> 24) & 0xFF, 0x2E, 0x46, 0x49, 0x54];
    const hc = crc16(h); h.push(hc & 0xFF, hc >> 8);
    const all = h.concat(data); const c = crc16(all); all.push(c & 0xFF, c >> 8);
    return new Uint8Array(all);
  }
}
const semi = deg => deg == null ? null : Math.round(deg * (2 ** 31 / 180));

export function toFit(ride) {
  const s = ride.sum, st = Math.round(+new Date(ride.start) / 1000) - FIT_EPOCH;
  const f = new FitWriter();
  f.def('file_id', 0, [[0, 'enum'], [1, 'uint16'], [2, 'uint16'], [3, 'uint32z'], [4, 'uint32']]);
  f.msg('file_id', [4, 255, 1, 12345, st]);
  f.def('event', 21, [[253, 'uint32'], [0, 'enum'], [1, 'enum']]);
  f.msg('event', [st, 0, 0]);
  f.def('record', 20, [[253, 'uint32'], [0, 'sint32'], [1, 'sint32'], [2, 'uint16'], [3, 'uint8'], [4, 'uint8'], [5, 'uint32'], [6, 'uint16'], [7, 'uint16']]);
  for (const p of ride.samples) f.msg('record', [st + p.ts, semi(p.la), semi(p.lo), (p.e + 500) * 5, p.hr, p.cad, p.d * 100, p.v * 1000, p.p]);
  const end = st + (ride.samples.length ? ride.samples[ride.samples.length - 1].ts : s.dur);
  f.msg('event', [end, 0, 4]);
  const sub = ride.samples.some(p => p.la != null) ? 58 : 6;
  f.def('lap', 19, [[253, 'uint32'], [0, 'enum'], [1, 'enum'], [2, 'uint32'], [7, 'uint32'], [8, 'uint32'], [9, 'uint32'], [11, 'uint16'], [13, 'uint16'], [14, 'uint16'], [15, 'uint8'], [16, 'uint8'], [17, 'uint8'], [19, 'uint16'], [20, 'uint16'], [21, 'uint16'], [25, 'enum']]);
  f.msg('lap', [end, 9, 1, st, (end - st) * 1000, s.dur * 1000, s.dist * 100, s.kcal, s.avgV * 1000, s.maxV * 1000, s.avgHr, s.maxHr, s.avgCad, s.avgP, s.maxP, s.asc, 2]);
  f.def('session', 18, [[253, 'uint32'], [0, 'enum'], [1, 'enum'], [2, 'uint32'], [5, 'enum'], [6, 'enum'], [7, 'uint32'], [8, 'uint32'], [9, 'uint32'], [11, 'uint16'], [14, 'uint16'], [15, 'uint16'], [16, 'uint8'], [17, 'uint8'], [18, 'uint8'], [20, 'uint16'], [21, 'uint16'], [22, 'uint16'], [25, 'uint16'], [26, 'uint16'], [34, 'uint16'], [35, 'uint16'], [36, 'uint16'], [45, 'uint16']]);
  f.msg('session', [end, 8, 1, st, 2, sub, (end - st) * 1000, s.dur * 1000, s.dist * 100, s.kcal, s.avgV * 1000, s.maxV * 1000, s.avgHr, s.maxHr, s.avgCad, s.avgP, s.maxP, s.asc, 0, 1, s.np, s.tss * 10, s.IF * 1000, s.ftp]);
  f.def('activity', 34, [[253, 'uint32'], [0, 'uint32'], [1, 'uint16'], [2, 'enum'], [3, 'enum'], [4, 'enum']]);
  f.msg('activity', [end, s.dur * 1000, 1, 0, 26, 1]);
  return f.bytes();
}

const x = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function toTcx(ride) {
  const st = new Date(ride.start), iso = t => new Date(+st + t * 1000).toISOString(), s = ride.sum;
  const tp = ride.samples.map(p => `<Trackpoint><Time>${iso(p.ts)}</Time>${p.la != null ? `<Position><LatitudeDegrees>${p.la}</LatitudeDegrees><LongitudeDegrees>${p.lo}</LongitudeDegrees></Position>` : ''}<AltitudeMeters>${p.e}</AltitudeMeters><DistanceMeters>${p.d.toFixed(1)}</DistanceMeters>${p.hr ? `<HeartRateBpm><Value>${p.hr}</Value></HeartRateBpm>` : ''}${p.cad != null ? `<Cadence>${p.cad}</Cadence>` : ''}<Extensions><ns3:TPX><ns3:Speed>${p.v}</ns3:Speed><ns3:Watts>${p.p}</ns3:Watts></ns3:TPX></Extensions></Trackpoint>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2"><Activities><Activity Sport="Biking"><Id>${st.toISOString()}</Id><Lap StartTime="${st.toISOString()}"><TotalTimeSeconds>${s.dur}</TotalTimeSeconds><DistanceMeters>${s.dist.toFixed(1)}</DistanceMeters><MaximumSpeed>${s.maxV.toFixed(2)}</MaximumSpeed><Calories>${s.kcal}</Calories>${s.avgHr ? `<AverageHeartRateBpm><Value>${s.avgHr}</Value></AverageHeartRateBpm><MaximumHeartRateBpm><Value>${s.maxHr}</Value></MaximumHeartRateBpm>` : ''}<Intensity>Active</Intensity>${s.avgCad ? `<Cadence>${s.avgCad}</Cadence>` : ''}<TriggerMethod>Manual</TriggerMethod><Track>${tp}</Track><Extensions><ns3:LX><ns3:AvgWatts>${s.avgP}</ns3:AvgWatts><ns3:MaxWatts>${s.maxP}</ns3:MaxWatts></ns3:LX></Extensions></Lap><Notes>${x(ride.title || 'VeloVerse')}</Notes><Creator xsi:type="Device_t" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Name>VeloVerse</Name></Creator></Activity></Activities></TrainingCenterDatabase>`;
}
export const fileBase = ride => 'veloverse-' + ride.start.slice(0, 16).replace(/[:T]/g, '-');
