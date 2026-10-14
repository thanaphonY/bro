const snmp = require('net-snmp');
const db = require('../config/dbConfig');
const { saveDataPoint } = require('../core/dataSaver');
const { decodeView1 } = require('./pemon/decode');
const { parseDcStatusHtml, attachBatteryData } = require('./pemon/dc_status');
const { parseAcStatusHtml, attachAcData } = require('./pemon/ac_status');

const intervals = new Map();
const inflight = new Set();

/** Confirmed SNMPv1 limits. Live channels come from the web UI, not these OIDs. */
const SNMP_LIMITS = [
  { key: 'dc.limit.high_float_v', oid: '1.3.6.1.4.1.12807.3.1.1.1.1.0', scale: 0.01, unit: 'V', label: 'DC High Float Limit' },
  { key: 'dc.limit.low_discharge_v', oid: '1.3.6.1.4.1.12807.3.1.1.1.2.0', scale: 0.01, unit: 'V', label: 'DC Low Discharge Limit' },
  { key: 'dc.limit.low_float_v', oid: '1.3.6.1.4.1.12807.3.1.1.1.3.0', scale: 0.01, unit: 'V', label: 'DC Low Float Limit' },
  { key: 'ac.limit.high_freq_hz', oid: '1.3.6.1.4.1.12807.3.1.1.1.7.0', scale: 0.1, unit: 'Hz', label: 'AC High Frequency Limit' },
  { key: 'ac.limit.low_freq_hz', oid: '1.3.6.1.4.1.12807.3.1.1.1.8.0', scale: 0.1, unit: 'Hz', label: 'AC Low Frequency Limit' },
  { key: 'ac.limit.high_voltage_v', oid: '1.3.6.1.4.1.12807.3.1.1.1.9.0', scale: 0.1, unit: 'V', label: 'AC High Voltage Limit' },
  { key: 'ac.limit.low_voltage_v', oid: '1.3.6.1.4.1.12807.3.1.1.1.10.0', scale: 0.1, unit: 'V', label: 'AC Low Voltage Limit' },
  { key: 'ac.limit.high_current_a', oid: '1.3.6.1.4.1.12807.3.1.1.1.11.0', scale: 0.1, unit: 'A', label: 'AC High Current Limit' },
  { key: 'ac.limit.low_current_a', oid: '1.3.6.1.4.1.12807.3.1.1.1.12.0', scale: 0.1, unit: 'A', label: 'AC Low Current Limit' },
  { key: 'ac.limit.high_power_kw', oid: '1.3.6.1.4.1.12807.3.1.1.1.13.0', scale: 0.001, unit: 'kW', label: 'AC High Power Limit' },
  { key: 'ac.limit.low_power_kw', oid: '1.3.6.1.4.1.12807.3.1.1.1.14.0', scale: 0.001, unit: 'kW', label: 'AC Low Power Limit' },
];

function put(points, key, value, unit, label) {
  if (value == null || value === '') return;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return;
  points.push({ key, value: number, unit: unit || '', label: label || key, source: 'http' });
}

function buildHttpPoints(decoded) {
  const points = [];
  put(points, 'dc.string_count', decoded.counts?.dc_strings, '', 'DC String Count');
  put(points, 'ac.system_count', decoded.counts?.ac_systems, '', 'AC System Count');
  put(points, 'io.system_count', decoded.counts?.io_systems, '', 'IO System Count');

  (decoded.dc || []).forEach((string) => {
    const n = string.index;
    put(points, `dc.string${n}.voltage_v`, string.voltage_v, 'V', `DC String ${n} Voltage`);
    put(points, `dc.string${n}.current_a`, string.current_a, 'A', `DC String ${n} Current`);
    put(points, `dc.string${n}.vstr_v`, string.vstr_v, 'V', `DC String ${n} Vstr`);
    put(points, `dc.string${n}.idc_a`, string.idc_a, 'A', `DC String ${n} Idc`);
    put(points, `dc.string${n}.temp_c`, string.temp_c, '°C', `DC String ${n} Temperature`);
    put(points, `dc.string${n}.high_float_v`, string.high_float_v, 'V', `DC String ${n} High Float`);
    put(points, `dc.string${n}.low_float_v`, string.low_float_v, 'V', `DC String ${n} Low Float`);
    put(points, `dc.string${n}.low_discharge_v`, string.low_discharge_v, 'V', `DC String ${n} Low Discharge`);
    put(points, `dc.string${n}.fault_raw`, string.fault_raw, '', `DC String ${n} Fault`);
    put(points, `dc.string${n}.remain_min`, string.remain_min, 'min', `DC String ${n} Remain Time`);
    put(points, `dc.string${n}.remain_ah`, string.remain_ah, 'Ah', `DC String ${n} Remain AH`);
    put(points, `dc.string${n}.cell_avg_v`, string.cell_avg_v, 'V', `DC String ${n} Cell Average`);
    (string.cells || []).forEach((cell) => {
      put(
        points,
        `dc.string${n}.cell${cell.index}.voltage_v`,
        cell.voltage_v,
        'V',
        `DC String ${n} Cell ${cell.index}`
      );
    });
  });

  (decoded.ac || []).forEach((sys) => {
    put(points, `ac.sys${sys.index}.line_count`, sys.line_count, '', `AC System ${sys.index} Lines`);
    put(points, `ac.sys${sys.index}.fault_raw`, sys.fault_raw, '', `AC System ${sys.index} Fault`);
    (sys.lines || []).forEach((line) => {
      put(points, `ac.sys${sys.index}.line${line.index}.voltage_v`, line.voltage_v, 'V', `AC ${sys.index} Line ${line.index} Voltage`);
      put(points, `ac.sys${sys.index}.line${line.index}.current_a`, line.current_a, 'A', `AC ${sys.index} Line ${line.index} Current`);
      put(points, `ac.sys${sys.index}.line${line.index}.frequency_hz`, line.frequency_hz, 'Hz', `AC ${sys.index} Line ${line.index} Frequency`);
      put(points, `ac.sys${sys.index}.line${line.index}.power_kw`, line.power_kw, 'kW', `AC ${sys.index} Line ${line.index} Power`);
      put(points, `ac.sys${sys.index}.line${line.index}.power_factor`, line.power_factor, '', `AC ${sys.index} Line ${line.index} Power Factor`);
      put(points, `ac.sys${sys.index}.line${line.index}.flag`, line.flag, '', `AC ${sys.index} Line ${line.index} Flag`);
    });
  });

  (decoded.io || []).forEach((sys) => {
    put(points, `io.sys${sys.index}.fault_raw`, sys.fault_raw, '', `IO System ${sys.index} Fault`);
    (sys.sensors || []).forEach((sensor, idx) => {
      const k = idx + 1;
      if (!sensor.enabled) return;
      put(points, `io.sys${sys.index}.temp${k}_c`, sensor.celsius, '°C', `IO ${sys.index} Temperature ${k}`);
      put(points, `io.sys${sys.index}.hum${k}_pct`, sensor.humidity_pct, '%', `IO ${sys.index} Humidity ${k}`);
    });
    (sys.inputs || []).forEach((input, idx) => {
      if (!input.present) return;
      put(points, `io.sys${sys.index}.in${idx + 1}`, input.fault ? 1 : 0, '', input.name || `In${idx + 1}`);
    });
    (sys.outputs || []).forEach((output, idx) => {
      put(points, `io.sys${sys.index}.out${idx + 1}`, output.on ? 1 : 0, '', output.name || `Out${idx + 1}`);
    });
  });

  (decoded.sys || []).forEach((unit) => {
    put(points, `sys.${String(unit.key).toLowerCase()}.ok`, unit.ok ? 1 : 0, '', `${unit.key} OK`);
  });

  const equipment = decoded.equipment || {};
  put(points, 'eq.backup_min', equipment.estimate_backup_min, 'min', 'Estimated Backup Time');
  put(points, 'eq.remain_min', equipment.estimate_remain_min, 'min', 'Estimated Remain Time');
  return points;
}

function snmpNumber(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (raw == null) return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

function scaleSnmp(raw, scale) {
  const number = snmpNumber(raw);
  if (number == null) return null;
  const factor = Number(scale) || 1;
  return factor === 0 || factor === 1 ? number : number * factor;
}

function patternRegExp(pattern) {
  const escaped = String(pattern)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\{n\\\}/g, '\\d+')
    .replace(/\\\{m\\\}/g, '\\d+')
    .replace(/\\\{k\\\}/g, '\\d+');
  return new RegExp(`^${escaped}$`);
}

function bestPattern(catalog, key) {
  const matches = (catalog || []).filter((metric) => {
    const pattern = metric.key || '';
    if (!pattern.includes('{')) return pattern === key;
    return patternRegExp(pattern).test(key);
  });
  matches.sort((a, b) => String(b.key || '').length - String(a.key || '').length);
  return matches[0] || null;
}

function fillTokens(text, key) {
  const string = key.match(/string(\d+)/);
  const sys = key.match(/sys(\d+)/);
  const line = key.match(/line(\d+)/);
  const cell = key.match(/cell(\d+)/);
  const temp = key.match(/temp(\d+)/);
  const hum = key.match(/hum(\d+)/);
  const input = key.match(/\.in(\d+)/);
  return String(text || '')
    .replaceAll('{n}', (string || sys || [''])[1] || '')
    .replaceAll('{m}', (line || cell || [''])[1] || '')
    .replaceAll('{k}', (temp || hum || input || [''])[1] || '');
}

function voltageTriggers(high, low) {
  const triggers = [];
  if (Number.isFinite(high)) {
    triggers.push({
      id: 'pemon-high-float',
      enable: true,
      value: String(high),
      operator: '>=',
      message: 'DC string high float {{value}} V',
      severity: 'major',
      repeat_interval: '15',
      clear_condition: {
        value: String(high),
        operator: '<',
        message: 'DC string voltage normal {{value}} V',
      },
    });
  }
  if (Number.isFinite(low)) {
    triggers.push({
      id: 'pemon-low-discharge',
      enable: true,
      value: String(low),
      operator: '<=',
      message: 'DC string low discharge {{value}} V',
      severity: 'critical',
      repeat_interval: '15',
      clear_condition: {
        value: String(low),
        operator: '>',
        message: 'DC string voltage recovered {{value}} V',
      },
    });
  }
  return triggers;
}

function rangeTriggers(highId, lowId, high, low, unit, name) {
  const triggers = [];
  if (Number.isFinite(high)) {
    triggers.push({
      id: highId,
      enable: true,
      value: String(high),
      operator: '>=',
      message: `AC high ${name} {{value}} ${unit}`,
      severity: 'warning',
      repeat_interval: '15',
      clear_condition: { value: String(high), operator: '<', message: `AC ${name} normal {{value}} ${unit}` },
    });
  }
  if (Number.isFinite(low)) {
    triggers.push({
      id: lowId,
      enable: true,
      value: String(low),
      operator: '<=',
      message: `AC low ${name} {{value}} ${unit}`,
      severity: 'warning',
      repeat_interval: '15',
      clear_condition: { value: String(low), operator: '>', message: `AC ${name} recovered {{value}} ${unit}` },
    });
  }
  return triggers;
}

function acVoltageTriggers(high, low) {
  const triggers = [];
  if (Number.isFinite(high)) {
    triggers.push({
      id: 'pemon-ac-high-voltage',
      enable: true,
      value: String(high),
      operator: '>=',
      message: 'AC high voltage {{value}} V',
      severity: 'warning',
      repeat_interval: '15',
      clear_condition: { value: String(high), operator: '<', message: 'AC voltage normal {{value}} V' },
    });
  }
  if (Number.isFinite(low)) {
    triggers.push({
      id: 'pemon-ac-low-voltage',
      enable: true,
      value: String(low),
      operator: '<=',
      message: 'AC low voltage {{value}} V',
      severity: 'warning',
      repeat_interval: '15',
      clear_condition: { value: String(low), operator: '>', message: 'AC voltage recovered {{value}} V' },
    });
  }
  return triggers;
}

function materializeMetrics(catalog, points, decoded, snmpByKey) {
  const acHigh = snmpByKey?.['ac.limit.high_voltage_v'];
  const acLow = snmpByKey?.['ac.limit.low_voltage_v'];
  return points.map((point) => {
    const pattern = bestPattern(catalog, point.key);
    const metric = pattern ? JSON.parse(JSON.stringify(pattern)) : {};
    metric.key = point.key;
    metric.label = fillTokens(pattern?.label || point.label, point.key);
    metric.unit = point.unit || metric.unit || '';
    metric.protocol = 'pemon';
    metric.type = metric.type || 'pemon_read';
    metric.datatype = metric.datatype || 'float';
    metric.enable = metric.enable !== false;
    metric.scale = metric.scale == null ? 1 : metric.scale;
    metric.pull_rate = metric.pull_rate == null ? 30 : metric.pull_rate;
    metric.store_policy = metric.store_policy || 'always';
    metric.source = point.source;
    metric.triggers = Array.isArray(metric.triggers) ? metric.triggers : [];
    metric.normal_condition = metric.normal_condition || [];

    const stringMatch = point.key.match(/^dc\.string(\d+)\.voltage_v$/);
    if (stringMatch) {
      const string = (decoded?.dc || []).find((row) => row.index === Number(stringMatch[1]));
      if (string) metric.triggers = voltageTriggers(string.high_float_v, string.low_discharge_v);
    }
    const acLine = point.key.match(/^ac\.sys(\d+)\.line(\d+)\.(voltage_v|current_a|frequency_hz|power_kw)$/);
    if (acLine) {
      const sys = (decoded?.ac || []).find((row) => row.index === Number(acLine[1]));
      const line = sys?.lines?.find((row) => row.index === Number(acLine[2]));
      if (line && line.flag === 0) {
        metric.triggers = [];
      } else if (acLine[3] === 'voltage_v') {
        const triggers = acVoltageTriggers(sys?.high_voltage_v ?? acHigh, sys?.low_voltage_v ?? acLow);
        if (triggers.length) metric.triggers = triggers;
      } else if (acLine[3] === 'frequency_hz') {
        const triggers = rangeTriggers(
          'pemon-ac-high-frequency',
          'pemon-ac-low-frequency',
          sys?.high_frequency_hz,
          sys?.low_frequency_hz,
          'Hz',
          'frequency'
        );
        if (triggers.length) metric.triggers = triggers;
      } else if (acLine[3] === 'power_kw') {
        const triggers = rangeTriggers(
          'pemon-ac-high-power',
          'pemon-ac-low-power',
          sys?.high_power_kw,
          sys?.low_power_kw,
          'kW',
          'power'
        );
        if (triggers.length) metric.triggers = triggers;
      }
    }
    return metric;
  });
}

function authHeader(user, pass) {
  return `Basic ${Buffer.from(`${user || ''}:${pass || ''}`, 'utf8').toString('base64')}`;
}

async function httpText(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        Authorization: authHeader(options.user, options.pass),
        Accept: '*/*',
        ...(options.contentType ? { 'Content-Type': options.contentType } : {}),
      },
      body: options.body,
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${url}`);
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function pullHttp(config) {
  const host = config.host;
  const port = Number(config.http_port || 80);
  const timeoutMs = Number(config.timeout || 20000);
  const user = config.username || 'admin';
  const pass = config.password || '';
  const base = `http://${host}:${port}`;
  const text = await httpText(`${base}/View1.js?${Date.now()}`, { user, pass, timeoutMs });
  const decoded = decodeView1(text);
  const battery = [];
  for (let i = 1; i <= (decoded.counts?.dc_strings || 0); i += 1) {
    const html = await httpText(`${base}/s/DC_1.htm`, {
      method: 'POST',
      user,
      pass,
      timeoutMs,
      contentType: 'application/x-www-form-urlencoded',
      body: `Vdc_STR_web=${i}`,
    });
    battery.push(parseDcStatusHtml(html));
  }
  attachBatteryData(decoded, battery);
  try {
    const acHtml = await httpText(`${base}/s/AC_2.htm?${Date.now()}`, { user, pass, timeoutMs });
    attachAcData(decoded, parseAcStatusHtml(acHtml));
  } catch (error) {
    console.warn(`[PEMON] ${host} AC_2.htm: ${error.message}`);
  }
  return decoded;
}

function snmpGet(host, port, community, oids, timeoutMs) {
  return new Promise((resolve, reject) => {
    const session = snmp.createSession(host, community || 'public', {
      version: snmp.Version1,
      port: Number(port) || 161,
      timeout: Number(timeoutMs) || 5000,
    });
    session.get(oids, (error, varbinds) => {
      try { session.close(); } catch (_e) { /* ignore */ }
      if (error) reject(error);
      else resolve(varbinds || []);
    });
  });
}

async function pullSnmpLimits(config) {
  const timeoutMs = Math.min(Number(config.timeout || 5000), 8000);
  const varbinds = await snmpGet(
    config.host,
    config.snmp_port || 161,
    config.snmp_community || config.community || 'public',
    SNMP_LIMITS.map((row) => row.oid),
    timeoutMs
  );
  const points = [];
  const byKey = {};
  SNMP_LIMITS.forEach((row, index) => {
    const varbind = varbinds[index];
    if (!varbind || snmp.isVarbindError(varbind)) return;
    const value = scaleSnmp(varbind.value, row.scale);
    if (value == null) return;
    points.push({ key: row.key, value, unit: row.unit, label: row.label, source: 'snmp' });
    byKey[row.key] = value;
  });
  return { points, byKey };
}

function catalogFrom(device) {
  const saved = device.config?.pemon_catalog;
  if (Array.isArray(saved) && saved.length) return saved;
  return Array.isArray(device.metrics) ? device.metrics : [];
}

function keySignature(metrics) {
  return (metrics || []).map((metric) => metric.key).filter(Boolean).sort().join('\n');
}

async function rememberTopology(device, catalog, metrics, previousMetrics) {
  const hadCatalog = Array.isArray(device.config?.pemon_catalog) && device.config.pemon_catalog.length > 0;
  if (hadCatalog && keySignature(previousMetrics) === keySignature(metrics)) return;

  const config = { ...(device.config || {}), pemon_catalog: catalog };
  device.config = config;
  await db.query(
    `UPDATE devices SET metrics = $1::jsonb, config = $2::jsonb, updated_at = NOW() WHERE id = $3`,
    [JSON.stringify(metrics), JSON.stringify(config), device.id]
  );
}

async function pollDevice(device) {
  if (inflight.has(device.id)) {
    console.warn(`[PEMON] ${device.name} skip overlapping poll`);
    return;
  }
  const config = device.communication_config || {};
  if (!config.host) {
    console.warn(`[PEMON] id=${device.id} name="${device.name}" missing host`);
    return;
  }

  inflight.add(device.id);
  const timestamp = new Date();
  let httpOk = 0;
  let snmpOk = 0;
  let decoded = null;
  let httpPoints = [];
  let snmpPoints = [];
  let snmpByKey = {};

  try {
    decoded = await pullHttp(config);
    httpPoints = buildHttpPoints(decoded);
    httpOk = 1;
  } catch (error) {
    console.error(`[PEMON] ${device.name} HTTP:`, error.message);
  }

  try {
    const snmpResult = await pullSnmpLimits(config);
    snmpPoints = snmpResult.points;
    snmpByKey = snmpResult.byKey;
    snmpOk = snmpPoints.length ? 1 : 0;
  } catch (error) {
    console.error(`[PEMON] ${device.name} SNMP:`, error.message);
  }

  const points = httpPoints.concat(snmpPoints);
  points.push(
    { key: 'pemon.http_ok', value: httpOk, unit: '', label: 'HTTP', source: 'pemon' },
    { key: 'pemon.snmp_ok', value: snmpOk, unit: '', label: 'SNMP', source: 'pemon' }
  );
  if (!httpOk && !snmpOk) {
    inflight.delete(device.id);
    return;
  }

  try {
    const previousMetrics = Array.isArray(device.metrics) ? device.metrics : [];
    const catalog = catalogFrom(device);
    const metrics = materializeMetrics(catalog, points, decoded, snmpByKey);
    device.metrics = metrics;
    await saveDataPoint(device, points.map((point) => ({
      key: point.key,
      value: point.value,
      timestamp,
    })));
    if (httpOk) await rememberTopology(device, catalog, metrics, previousMetrics);
    console.log(
      `[PEMON] ${device.name} http=${httpOk} snmp=${snmpOk} points=${points.length} dc=${decoded?.counts?.dc_strings ?? '-'} ac=${decoded?.counts?.ac_systems ?? '-'}`
    );
  } catch (error) {
    console.error(`[PEMON] ${device.name} save:`, error.message);
  } finally {
    inflight.delete(device.id);
  }
}

function fetchPEMON(device) {
  const existing = intervals.get(device.id);
  if (existing) clearInterval(existing);

  const seconds = Math.max(Number(device.communication_config?.pull_rate) || 30, 10);
  console.log(
    `[PEMON] polling id=${device.id} name="${device.name}" host=${device.communication_config?.host || '?'} every ${seconds}s`
  );
  pollDevice(device);
  intervals.set(device.id, setInterval(() => pollDevice(device), seconds * 1000));
}

function cleanupPEMONDevice(deviceId) {
  const timer = intervals.get(deviceId);
  if (timer) clearInterval(timer);
  intervals.delete(deviceId);
  inflight.delete(deviceId);
}

module.exports = {
  SNMP_LIMITS,
  buildHttpPoints,
  materializeMetrics,
  fetchPEMON,
  cleanupPEMONDevice,
};
