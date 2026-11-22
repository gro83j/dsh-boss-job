/**
 * City catalogue: Boss Zhipin exposes the whole country's city tree at one
 * public endpoint. We resolve user-typed city names (multi-select, cross-region)
 * to the codes the search URL expects, instead of hardcoding any city.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from './paths.mjs';
import { evalJs } from './cdp.mjs';

export const CITY_URL = 'https://www.zhipin.com/wapi/zpgeek/common/data/city.json';
export const CITY_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Walk the province -> city tree and keep leaf entries (municipalities nest one level). */
export function flattenCityTree(tree, province = '') {
  const out = [];
  for (const node of Array.isArray(tree) ? tree : []) {
    if (!node || typeof node !== 'object') continue;
    const name = typeof node.name === 'string' ? node.name.trim() : '';
    const children = Array.isArray(node.subLevelModelList) ? node.subLevelModelList : [];
    const here = province || (name && children.length ? name : '');
    if (children.length) {
      out.push(...flattenCityTree(children, here));
    } else if (name && Number.isInteger(node.code)) {
      out.push({ name, code: String(node.code), province });
    }
  }
  return out;
}

/** Build a de-duplicated city list from the endpoint payload. */
export function parseCityPayload(payload) {
  const list = flattenCityTree(payload?.zpData ?? payload);
  const seen = new Map();
  for (const city of list) {
    if (!seen.has(city.code)) seen.set(city.code, city);
  }
  return [...seen.values()];
}

function normalize(name) {
  return String(name || '').trim().replace(/市$/, '');
}

/** Match by code first, then by exact name (optionally dropping the 市 suffix). */
export function resolveCityEntry(cities, { name, code } = {}) {
  const wantedCode = code === undefined || code === null ? '' : String(code);
  if (wantedCode) {
    const byCode = cities.find((c) => c.code === wantedCode);
    if (byCode) return byCode;
  }
  const wantedName = normalize(name);
  if (!wantedName) return null;
  const byName = cities.find((c) => normalize(c.name) === wantedName);
  if (byName) return byName;
  // e.g. user types a short name while the catalogue stores a longer one; try startsWith for those.
  return cities.find((c) => normalize(c.name).startsWith(wantedName)) ?? null;
}

function cacheFile(env) {
  return join(dataDir(env), 'cities.json');
}

/** Read the on-disk catalogue when it is still fresh. */
export function readCityCache(env, now = Date.now()) {
  try {
    const raw = JSON.parse(readFileSync(cacheFile(env), 'utf8'));
    if (!raw?.fetchedAt || !Array.isArray(raw.cities)) return null;
    if (now - raw.fetchedAt > CITY_CACHE_TTL_MS) return null;
    return raw;
  } catch {
    return null;
  }
}

export function writeCityCache(env, cities, now = Date.now()) {
  const file = cacheFile(env);
  mkdirSync(dataDir(env), { recursive: true });
  writeFileSync(file, JSON.stringify({ fetchedAt: now, cities }, null, 2));
  return file;
}

/** Fetch the catalogue from the page context (shares the site's cookies). */
export async function fetchCities(cdp) {
  const payload = await evalJs(
    cdp,
    `(async()=>{const r=await fetch(${JSON.stringify(CITY_URL)},{credentials:'include'});return await r.json();})()`,
    true,
    15000,
  );
  const cities = parseCityPayload(payload);
  if (!cities.length) throw new Error('city catalogue is empty: the endpoint format may have changed');
  return cities;
}

/** Cached catalogue, fetching through the live page when the cache is missing or stale. */
export async function loadCityCatalog(cdp, env, { refresh = false } = {}) {
  if (!refresh) {
    const cached = readCityCache(env);
    if (cached) return { cities: cached.cities, fetchedAt: cached.fetchedAt, fromCache: true };
  }
  const cities = await fetchCities(cdp);
  const fetchedAt = Date.now();
  writeCityCache(env, cities, fetchedAt);
  return { cities, fetchedAt, fromCache: false };
}

/** Resolve a mixed list of names/codes; returns {resolved, unknown}. */
export async function resolveCities(cdp, env, entries) {
  const { cities } = await loadCityCatalog(cdp, env);
  const resolved = [];
  const unknown = [];
  for (const entry of entries || []) {
    const input = typeof entry === 'string' ? { name: entry } : entry || {};
    const hit = resolveCityEntry(cities, input);
    if (hit) {
      if (!resolved.some((c) => c.code === hit.code)) resolved.push(hit);
    } else {
      unknown.push(input.name || input.code || '');
    }
  }
  return { resolved, unknown };
}
