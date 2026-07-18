// Zero-dependency test suite. Run with: node test/qris.test.js
const assert = require('assert');
const QRIS = require('../js/qris.js');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok  -', name);
  } catch (e) {
    console.error('  FAIL -', name);
    console.error('       ', e.message);
    process.exitCode = 1;
  }
}

console.log('CRC-16/CCITT-FALSE');
test('matches the standard published check value for "123456789"', () => {
  // This is the well-known reference "check" value for the CRC-16/CCITT-FALSE
  // variant (poly 0x1021, init 0xFFFF), used to validate implementations.
  assert.strictEqual(QRIS.crc16('123456789'), '29B1');
});

console.log('\nBuilding a synthetic static QRIS payload');

// Build a plausible static QRIS payload by hand, tag by tag, then let the
// library compute a real checksum for it — this becomes our test fixture.
function tlv(tag, value) {
  return tag + String(value.length).padStart(2, '0') + value;
}

// A synthetic (fake) merchant account info block, GUI + a couple of
// generic sub-fields, just to exercise nested parsing.
const merchantAccountInfo = tlv('00', 'ID.CO.QRIS.WWW') + tlv('01', 'ID10200001234567890') + tlv('02', 'ID2020000123456');

const staticBodyNoCrc =
  tlv('00', '01') +                          // payload format indicator
  tlv('01', '11') +                          // point of initiation: static
  tlv('26', merchantAccountInfo) +           // merchant account info template
  tlv('52', '5411') +                        // merchant category code
  tlv('53', '360') +                         // currency: IDR
  tlv('58', 'ID') +                          // country
  tlv('59', 'Warung Demo Testing') +         // merchant name
  tlv('60', 'Depok') +                       // merchant city
  tlv('61', '16424') +                       // postal code
  '6304';

const staticCrc = QRIS.crc16(staticBodyNoCrc);
const staticQris = staticBodyNoCrc + staticCrc;

test('checksum of the synthetic fixture is internally consistent', () => {
  assert.strictEqual(QRIS.isValidChecksum(staticQris), true);
});

console.log('\nQRIS.parse()');

test('parses merchant name, city, and static/dynamic flag correctly', () => {
  const p = QRIS.parse(staticQris);
  assert.strictEqual(p.isValid, true);
  assert.strictEqual(p.crcValid, true);
  assert.strictEqual(p.info.merchantName, 'Warung Demo Testing');
  assert.strictEqual(p.info.merchantCity, 'Depok');
  assert.strictEqual(p.info.isStatic, true);
  assert.strictEqual(p.info.isDynamic, false);
  assert.strictEqual(p.info.amount, null);
  assert.strictEqual(p.info.currencyLabel, 'IDR — Rupiah Indonesia');
  assert.strictEqual(p.info.countryLabel, 'Indonesia');
});

test('parses nested merchant account info sub-fields', () => {
  const p = QRIS.parse(staticQris);
  assert.strictEqual(p.info.merchantAccountBlocks.length, 1);
  assert.strictEqual(p.info.merchantAccountBlocks[0].globallyUniqueId, 'ID.CO.QRIS.WWW');
  assert.strictEqual(p.info.merchantAccountBlocks[0].subFields.length, 3);
});

test('flags a tampered checksum as invalid', () => {
  const tampered = staticQris.slice(0, -1) + (staticQris.slice(-1) === '0' ? '1' : '0');
  const p = QRIS.parse(tampered);
  assert.strictEqual(p.crcValid, false);
});

test('rejects garbage input gracefully instead of throwing', () => {
  const p = QRIS.parse('not a qris code at all');
  assert.strictEqual(p.isValid, false);
  assert.ok(p.error);
});

console.log('\nQRIS.toDynamic()');

test('injects the amount, flips POI to dynamic, and keeps checksum valid', () => {
  const r = QRIS.toDynamic(staticQris, 55000);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(QRIS.isValidChecksum(r.result), true);

  const reparsed = QRIS.parse(r.result);
  assert.strictEqual(reparsed.info.amount, 55000);
  assert.strictEqual(reparsed.info.isDynamic, true);
  // Identity fields must be untouched by the amount injection.
  assert.strictEqual(reparsed.info.merchantName, 'Warung Demo Testing');
  assert.strictEqual(reparsed.info.merchantCity, 'Depok');
  assert.strictEqual(
    reparsed.info.merchantAccountBlocks[0].globallyUniqueId,
    p_gui(staticQris)
  );
});

function p_gui(raw) {
  return QRIS.parse(raw).info.merchantAccountBlocks[0].globallyUniqueId;
}

test('re-running toDynamic with a new amount replaces the old one (no duplicate tag 54)', () => {
  const first = QRIS.toDynamic(staticQris, 20000).result;
  const second = QRIS.toDynamic(first, 75000);
  assert.strictEqual(second.ok, true);
  const reparsed = QRIS.parse(second.result);
  assert.strictEqual(reparsed.info.amount, 75000);
  // exactly one tag 54 in the rebuilt payload
  const count = reparsed.fields.filter(f => f.tag === '54').length;
  assert.strictEqual(count, 1);
});

test('rejects non-integer or zero amounts', () => {
  assert.strictEqual(QRIS.toDynamic(staticQris, 0).ok, false);
  assert.strictEqual(QRIS.toDynamic(staticQris, -100).ok, false);
  assert.strictEqual(QRIS.toDynamic(staticQris, 15.5).ok, false);
  assert.strictEqual(QRIS.toDynamic(staticQris, NaN).ok, false);
});

test('rejects a payload with a broken checksum before touching the amount', () => {
  const tampered = staticQris.slice(0, -1) + (staticQris.slice(-1) === '0' ? '1' : '0');
  const r = QRIS.toDynamic(tampered, 10000);
  assert.strictEqual(r.ok, false);
});

console.log(`\n${passed} test(s) passed.`);
