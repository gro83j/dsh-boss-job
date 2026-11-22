import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  flattenCityTree,
  parseCityPayload,
  readCityCache,
  resolveCityEntry,
  writeCityCache,
  CITY_CACHE_TTL_MS,
} from '../src/core/city.mjs';

const tree = [
  {
    code: 101210000,
    name: '浙江',
    subLevelModelList: [
      { code: 101210100, name: '杭州', subLevelModelList: [] },
      { code: 101210200, name: '宁波', subLevelModelList: [] },
    ],
  },
  {
    code: 101010000,
    name: '北京',
    subLevelModelList: [{ code: 101010100, name: '北京', subLevelModelList: [] }],
  },
];

test('flattenCityTree 展开省-市并记录省份', () => {
  const cities = flattenCityTree(tree);
  assert.deepEqual(
    cities.map((c) => `${c.province}/${c.name}/${c.code}`),
    ['浙江/杭州/101210100', '浙江/宁波/101210200', '北京/北京/101010100'],
  );
});

test('parseCityPayload 去重且兼容 zpData 包裹', () => {
  const cities = parseCityPayload({ code: 0, zpData: tree });
  assert.equal(cities.length, 3);
  assert.equal(cities.find((c) => c.name === '杭州').province, '浙江');
});

test('resolveCityEntry 支持 code、名称与「市」后缀', () => {
  const cities = parseCityPayload(tree);
  assert.equal(resolveCityEntry(cities, { code: '101210100' }).name, '杭州');
  assert.equal(resolveCityEntry(cities, { name: '杭州' }).code, '101210100');
  assert.equal(resolveCityEntry(cities, { name: '杭州市' }).code, '101210100');
  assert.equal(resolveCityEntry(cities, { name: '上海' }), null);
});

test('城市缓存可读回且过期后失效', () => {
  const env = { BOSS_JOB_HOME: mkdtempSync(tmpdir() + '/bj-') };
  const cities = parseCityPayload(tree);
  const now = 1_700_000_000_000;
  writeCityCache(env, cities, now);
  assert.equal(readCityCache(env, now + 1000).cities.length, 3);
  assert.equal(readCityCache(env, now + CITY_CACHE_TTL_MS + 1), null);
});
