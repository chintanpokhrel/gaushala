// Runs Code.gs against in-memory stand-ins for the Google services it uses.
// Usage: node --test apps-script/Code.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(key = 'secret') {
  const sheets = {};
  const props = {};
  const makeSheet = (name) => {
    const cells = [];
    return (sheets[name] = {
      cells,
      frozen: 0,
      clearContents() { cells.length = 0; },
      getLastRow() { return cells.length; },
      getRange(r, c, rows, cols) {
        return {
          setNumberFormat() {},
          setFontWeight() {},
          setValues(v) {
            assert.strictEqual(v.length, rows);
            v.forEach((row, i) => { assert.strictEqual(row.length, cols); cells[r - 1 + i] = row.slice(); });
          },
          getValues() { return cells.slice(r - 1, r - 1 + rows).map((row) => row.slice(c - 1, c - 1 + cols)); },
        };
      },
      setFrozenRows(n) { this.frozen = n; },
    });
  };
  const ctx = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getSheetByName: (n) => sheets[n] || null, insertSheet: makeSheet }),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }),
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (text) => ({ text, setMimeType() { return this; } }),
    },
  };
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8').replace("var KEY = 'change-me';", `var KEY = '${key}';`);
  vm.runInContext(src, ctx);
  const call = (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ key: 'secret', ...body }) } }).text);
  return { call, sheets };
}

// Long enough for several chunks, and shaped so a chunk boundary lands on "=" and on digits.
const bigJson = JSON.stringify({ version: 1, pad: 'x'.repeat(39990), eq: '=SUM(A1)', num: '0012'.repeat(30000) });

test('push then pull returns the exact backup', () => {
  const { call } = load();
  assert.deepStrictEqual(call({ action: 'push', baseRev: 0, json: bigJson, tabs: {} }), { ok: true, rev: 1 });
  const res = call({ action: 'pull' });
  assert.strictEqual(res.rev, 1);
  assert.strictEqual(res.json, bigJson);
});

test('chunks always start with the guard letter', () => {
  const { call, sheets } = load();
  call({ action: 'push', baseRev: 0, json: bigJson, tabs: {} });
  assert.ok(sheets._backup.cells.length > 2);
  sheets._backup.cells.forEach((r) => assert.strictEqual(r[0][0], 'J'));
});

test('a phone that did not see the latest revision is refused', () => {
  const { call } = load();
  call({ action: 'push', baseRev: 0, json: '{"a":1}', tabs: {} });
  call({ action: 'push', baseRev: 1, json: '{"a":2}', tabs: {} });
  assert.deepStrictEqual(call({ action: 'push', baseRev: 1, json: '{"a":3}', tabs: {} }), { ok: false, conflict: true, rev: 2, lastPush: '' });
  assert.strictEqual(call({ action: 'pull' }).json, '{"a":2}');
});

test('a refused phone is told which push made the newest revision', () => {
  const { call } = load();
  call({ action: 'push', baseRev: 0, pushId: 'p1', json: '{"a":1}', tabs: {} });
  // The phone never got the answer to p1, so it still thinks the sheet is at rev 0.
  assert.deepStrictEqual(call({ action: 'push', baseRev: 0, pushId: 'p2', json: '{"a":2}', tabs: {} }), { ok: false, conflict: true, rev: 1, lastPush: 'p1' });
});

test('a new phone (rev 0) cannot wipe an existing backup, but force can replace it', () => {
  const { call } = load();
  call({ action: 'push', baseRev: 0, json: '{"a":1}', tabs: {} });
  assert.strictEqual(call({ action: 'push', baseRev: 0, json: '{}', tabs: {} }).conflict, true);
  assert.deepStrictEqual(call({ action: 'push', baseRev: 0, force: true, json: '{"b":1}', tabs: {} }), { ok: true, rev: 2 });
});

test('wrong key and default key are rejected', () => {
  assert.strictEqual(load().call({ key: 'nope', action: 'pull' }).error, 'key');
  assert.strictEqual(load('change-me').call({ key: 'change-me', action: 'pull' }).error, 'key');
});

test('empty sheet pulls as no backup', () => {
  assert.deepStrictEqual(load().call({ action: 'pull' }), { ok: true, rev: 0, json: '' });
});

test('readable tabs are rectangular and keep risky text as text', () => {
  const { call, sheets } = load();
  call({
    action: 'push', baseRev: 0, json: '{}',
    tabs: { Customers: [['Name', 'Phone', 'Balance'], ['=Ram', '9800000001'], ['Sita', null, -20.5]] },
  });
  // Values cross the vm boundary; compare as plain data.
  assert.deepStrictEqual(JSON.parse(JSON.stringify(sheets.Customers.cells)), [
    ['Name', 'Phone', 'Balance'],
    ["'=Ram", "'9800000001", ''],
    ['Sita', '', -20.5],
  ]);
  assert.strictEqual(sheets.Customers.frozen, 1);
});
