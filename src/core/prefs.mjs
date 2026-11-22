import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { dataDir, prefsFile } from './paths.mjs';

export const DEFAULT_PREFS = {
  version: 1,
  cities: [{ name: '杭州', code: '101210100' }],
  directions: [],
  salary: { floor: 7000, currency: 'CNY' },
  experienceMonths: 0,
  activeDays: 3,
  avoid: [],
  keywords: [],
  notes: '',
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Missing file => defaults; corrupt file => defaults plus a warning. */
export function loadPrefs(env = process.env, { warn = () => {} } = {}) {
  try {
    const raw = readFileSync(prefsFile(env), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err && err.code === 'ENOENT') return clone(DEFAULT_PREFS);
    warn(`偏好文件损坏，已使用默认值：${err.message}`);
    return clone(DEFAULT_PREFS);
  }
}

export function savePrefs(prefs, env = process.env) {
  const file = prefsFile(env);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(prefs, null, 2) + '\n', 'utf8');
  return file;
}

/** Shallow merge, with avoid/keywords deduped instead of concatenated blindly. */
export function mergePrefs(base, patch) {
  const merged = { ...base, ...patch };
  for (const key of ['avoid', 'keywords']) {
    if (Array.isArray(base[key]) || Array.isArray(patch[key])) {
      merged[key] = [...new Set([...(base[key] || []), ...(patch[key] || [])])];
    }
  }
  return merged;
}

export { dataDir };
