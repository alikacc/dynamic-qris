/*!
 * qris.js — Open-source QRIS (Quick Response Code Indonesian Standard) toolkit.
 *
 * QRIS payloads follow the EMVCo "QR Code Specification for Payment Systems"
 * (Merchant Presented Mode): a flat TLV (Tag-Length-Value) string, where each
 * field is a 2-digit tag, a 2-digit length, and then that many characters of
 * value. Some tags (e.g. 26-51, 62) are themselves "templates" containing a
 * nested TLV string.
 *
 * This file has zero dependencies and no network calls — everything is pure
 * string/number manipulation, safe to run 100% client-side in a browser or
 * in Node for tests.
 *
 * Reference tags used below are the ones defined by the EMVCo spec (global,
 * used by QRIS/Indonesia, PromptPay/Thailand, VietQR/Vietnam, etc). Tags in
 * the 02-51 range ("Merchant Account Information") are network/acquirer
 * specific — this library parses their sub-fields generically rather than
 * guessing at proprietary sub-tag meanings.
 *
 * MIT License.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.QRIS = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TAG = {
    PAYLOAD_FORMAT_INDICATOR: '00',
    POINT_OF_INITIATION_METHOD: '01',
    MERCHANT_CATEGORY_CODE: '52',
    TRANSACTION_CURRENCY: '53',
    TRANSACTION_AMOUNT: '54',
    TIP_INDICATOR: '55',
    COUNTRY_CODE: '58',
    MERCHANT_NAME: '59',
    MERCHANT_CITY: '60',
    POSTAL_CODE: '61',
    ADDITIONAL_DATA: '62',
    CRC: '63'
  };

  var POI_STATIC = '11';
  var POI_DYNAMIC = '12';

  // ---------------------------------------------------------------------
  // CRC-16/CCITT-FALSE — poly 0x1021, init 0xFFFF, no reflect, no xorout.
  // This is the exact checksum variant required by the EMVCo QR spec.
  // ---------------------------------------------------------------------
  function crc16(str) {
    var crc = 0xffff;
    for (var i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (var b = 0; b < 8; b++) {
        if ((crc & 0x8000) !== 0) {
          crc = ((crc << 1) ^ 0x1021) & 0xffff;
        } else {
          crc = (crc << 1) & 0xffff;
        }
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  // ---------------------------------------------------------------------
  // Generic TLV parsing — works for both the top-level payload and any
  // nested "template" field (e.g. merchant account info, additional data).
  // ---------------------------------------------------------------------
  function parseTLV(str) {
    var fields = [];
    var i = 0;
    while (i + 4 <= str.length) {
      var tag = str.substring(i, i + 2);
      var lenStr = str.substring(i + 2, i + 4);
      var len = parseInt(lenStr, 10);
      if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lenStr) || isNaN(len)) {
        // Malformed from here on — stop rather than throw, caller decides
        // whether the overall payload is still usable.
        break;
      }
      var value = str.substring(i + 4, i + 4 + len);
      if (value.length !== len) break; // truncated payload
      fields.push({ tag: tag, length: len, value: value });
      i += 4 + len;
    }
    return { fields: fields, consumedLength: i, trailingGarbage: str.slice(i) };
  }

  function buildTLV(fields) {
    return fields
      .map(function (f) {
        var len = f.value.length.toString().padStart(2, '0');
        return f.tag + len + f.value;
      })
      .join('');
  }

  function findField(fields, tag) {
    for (var i = 0; i < fields.length; i++) {
      if (fields[i].tag === tag) return fields[i];
    }
    return null;
  }

  // ---------------------------------------------------------------------
  // Ordering used when we rebuild a payload after editing it. Fields that
  // share a rank keep their original relative order (stable sort).
  // ---------------------------------------------------------------------
  function tagRank(tag) {
    var n = parseInt(tag, 10);
    if (tag === TAG.PAYLOAD_FORMAT_INDICATOR) return 0;
    if (tag === TAG.POINT_OF_INITIATION_METHOD) return 1;
    if (n >= 2 && n <= 51) return 2; // merchant account info templates
    if (tag === TAG.MERCHANT_CATEGORY_CODE) return 3;
    if (tag === TAG.TRANSACTION_CURRENCY) return 4;
    if (tag === TAG.TRANSACTION_AMOUNT) return 5;
    if (n >= 55 && n <= 57) return 6; // tip indicator / convenience fee
    if (tag === TAG.COUNTRY_CODE) return 7;
    if (tag === TAG.MERCHANT_NAME) return 8;
    if (tag === TAG.MERCHANT_CITY) return 9;
    if (tag === TAG.POSTAL_CODE) return 10;
    if (tag === TAG.ADDITIONAL_DATA) return 11;
    if (n >= 64 && n <= 99) return 12; // RFU / unreserved templates
    return 50;
  }

  function stableSortByRank(fields) {
    return fields
      .map(function (f, idx) { return { f: f, idx: idx }; })
      .sort(function (a, b) {
        var ra = tagRank(a.f.tag), rb = tagRank(b.f.tag);
        return ra !== rb ? ra - rb : a.idx - b.idx;
      })
      .map(function (x) { return x.f; });
  }

  var CURRENCY_LABELS = { '360': 'IDR — Rupiah Indonesia' };
  var COUNTRY_LABELS = { ID: 'Indonesia' };

  /**
   * Parses a raw QRIS/EMVCo payload string.
   * Never throws — check `.isValid` / `.error` instead.
   */
  function parse(raw) {
    if (typeof raw !== 'string') {
      return { isValid: false, error: 'Input harus berupa teks.' };
    }
    var cleaned = raw.trim();
    if (cleaned.length < 8) {
      return { isValid: false, error: 'Teks terlalu pendek untuk sebuah kode QRIS.' };
    }

    var parsedAll = parseTLV(cleaned);
    var fields = parsedAll.fields;
    var crcField = findField(fields, TAG.CRC);

    if (!crcField) {
      return { isValid: false, error: 'Tag checksum (63) tidak ditemukan — ini sepertinya bukan QRIS.' };
    }

    // Per spec the CRC is calculated over everything up to and including
    // the "6304" tag+length header of the CRC field itself.
    var crcHeaderIndex = cleaned.lastIndexOf(TAG.CRC + '04');
    if (crcHeaderIndex === -1) {
      return { isValid: false, error: 'Format checksum tidak sesuai standar EMVCo.' };
    }
    var payloadForCrc = cleaned.substring(0, crcHeaderIndex + 4);
    var calculatedCrc = crc16(payloadForCrc);
    var providedCrc = crcField.value.toUpperCase();
    var crcValid = calculatedCrc === providedCrc;

    var bodyFields = fields.filter(function (f) { return f.tag !== TAG.CRC; });

    var poi = findField(bodyFields, TAG.POINT_OF_INITIATION_METHOD);
    var amountField = findField(bodyFields, TAG.TRANSACTION_AMOUNT);
    var currencyField = findField(bodyFields, TAG.TRANSACTION_CURRENCY);
    var countryField = findField(bodyFields, TAG.COUNTRY_CODE);
    var nameField = findField(bodyFields, TAG.MERCHANT_NAME);
    var cityField = findField(bodyFields, TAG.MERCHANT_CITY);
    var postalField = findField(bodyFields, TAG.POSTAL_CODE);
    var mccField = findField(bodyFields, TAG.MERCHANT_CATEGORY_CODE);

    var merchantAccountBlocks = bodyFields
      .filter(function (f) {
        var n = parseInt(f.tag, 10);
        return n >= 2 && n <= 51;
      })
      .map(function (f) {
        var sub = parseTLV(f.value).fields;
        var gui = findField(sub, '00');
        return {
          tag: f.tag,
          globallyUniqueId: gui ? gui.value : null,
          subFields: sub.map(function (s) { return { tag: s.tag, value: s.value }; })
        };
      });

    var currencyCode = currencyField ? currencyField.value : null;

    return {
      isValid: true,
      crcValid: crcValid,
      crcProvided: providedCrc,
      crcCalculated: calculatedCrc,
      raw: cleaned,
      fields: bodyFields,
      info: {
        pointOfInitiationMethod: poi ? poi.value : null,
        isStatic: !poi || poi.value === POI_STATIC,
        isDynamic: !!poi && poi.value === POI_DYNAMIC,
        merchantName: nameField ? nameField.value : null,
        merchantCity: cityField ? cityField.value : null,
        postalCode: postalField ? postalField.value : null,
        merchantCategoryCode: mccField ? mccField.value : null,
        countryCode: countryField ? countryField.value : null,
        countryLabel: countryField ? (COUNTRY_LABELS[countryField.value] || countryField.value) : null,
        currencyCode: currencyCode,
        currencyLabel: currencyCode ? (CURRENCY_LABELS[currencyCode] || currencyCode) : null,
        amount: amountField ? parseFloat(amountField.value) : null,
        merchantAccountBlocks: merchantAccountBlocks
      }
    };
  }

  /**
   * Rebuilds a full payload string (including a freshly-calculated CRC)
   * from a list of {tag, value} body fields (i.e. everything except '63').
   */
  function build(bodyFields) {
    var ordered = stableSortByRank(bodyFields.filter(function (f) { return f.tag !== TAG.CRC; }));
    var withoutCrc = buildTLV(ordered) + TAG.CRC + '04';
    return withoutCrc + crc16(withoutCrc);
  }

  /**
   * Converts a static (or already-dynamic) QRIS string into a dynamic one
   * carrying a fixed transaction amount, recalculating the checksum.
   * Does NOT touch merchant identity / acquirer fields (tags 02-51) —
   * only the point-of-initiation flag (01) and the amount (54) change.
   *
   * @param {string} raw - the original QRIS payload
   * @param {number} amount - amount in whole Rupiah (integer, >= 1)
   * @returns {{ok:true, result:string, previousAmount:number|null}|{ok:false, error:string}}
   */
  function toDynamic(raw, amount) {
    var parsed = parse(raw);
    if (!parsed.isValid) {
      return { ok: false, error: parsed.error };
    }
    if (!parsed.crcValid) {
      return { ok: false, error: 'Checksum kode ini tidak cocok — kemungkinan kode rusak atau sudah diubah.' };
    }
    if (!Number.isFinite(amount) || amount < 1 || Math.floor(amount) !== amount) {
      return { ok: false, error: 'Nominal harus berupa bilangan bulat Rupiah, minimal Rp 1.' };
    }
    if (amount > 99999999999) {
      return { ok: false, error: 'Nominal terlalu besar.' };
    }

    var fields = parsed.fields.slice(); // body fields, CRC already excluded

    // Force point-of-initiation-method to "12" (dynamic).
    var poiIdx = fields.findIndex(function (f) { return f.tag === TAG.POINT_OF_INITIATION_METHOD; });
    if (poiIdx === -1) {
      fields.unshift({ tag: TAG.POINT_OF_INITIATION_METHOD, value: POI_DYNAMIC });
    } else {
      fields[poiIdx] = { tag: TAG.POINT_OF_INITIATION_METHOD, value: POI_DYNAMIC };
    }

    // Replace (or insert) the amount field.
    var amountStr = String(amount);
    var amountIdx = fields.findIndex(function (f) { return f.tag === TAG.TRANSACTION_AMOUNT; });
    if (amountIdx === -1) {
      fields.push({ tag: TAG.TRANSACTION_AMOUNT, value: amountStr });
    } else {
      fields[amountIdx] = { tag: TAG.TRANSACTION_AMOUNT, value: amountStr };
    }

    // Ensure a currency tag exists (360 = IDR) — required by spec, some
    // real-world static codes omit it.
    if (!findField(fields, TAG.TRANSACTION_CURRENCY)) {
      fields.push({ tag: TAG.TRANSACTION_CURRENCY, value: '360' });
    }

    return {
      ok: true,
      result: build(fields),
      previousAmount: parsed.info.amount
    };
  }

  /** Quick check without full parsing detail — true/false. */
  function isValidChecksum(raw) {
    var p = parse(raw);
    return !!(p.isValid && p.crcValid);
  }

  return {
    TAG: TAG,
    crc16: crc16,
    parse: parse,
    build: build,
    toDynamic: toDynamic,
    isValidChecksum: isValidChecksum
  };
});
