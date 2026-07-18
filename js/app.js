/*!
 * app.js — UI wiring for QRIS Dinamis.
 * Everything here runs entirely in the browser. No file is ever uploaded
 * anywhere; images are decoded locally and the resulting QR is generated
 * locally too.
 */
(function () {
  'use strict';

  var els = {
    tabUpload: document.getElementById('upload-tab-btn'),
    tabPaste: document.getElementById('paste-tab-btn'),
    panelUpload: document.getElementById('upload-panel'),
    panelPaste: document.getElementById('paste-panel'),

    uploadZone: document.getElementById('upload-zone'),
    fileInput: document.getElementById('file-input'),
    filePreview: document.getElementById('file-preview'),
    filePreviewImg: document.getElementById('file-preview-img'),
    filePreviewName: document.getElementById('file-preview-name'),

    pasteTextarea: document.getElementById('paste-textarea'),
    pasteSubmitBtn: document.getElementById('paste-submit-btn'),

    scanStatus: document.getElementById('scan-status'),

    step2Card: document.getElementById('step2-card'),
    infoMerchantName: document.getElementById('info-merchant-name'),
    infoMerchantCity: document.getElementById('info-merchant-city'),
    infoMcc: document.getElementById('info-mcc'),
    infoCountry: document.getElementById('info-country'),
    infoCurrency: document.getElementById('info-currency'),
    infoStatusBadge: document.getElementById('info-status-badge'),
    infoExistingAmountRow: document.getElementById('info-existing-amount-row'),
    infoExistingAmount: document.getElementById('info-existing-amount'),
    rawDetailsContent: document.getElementById('raw-details-content'),

    step3Card: document.getElementById('step3-card'),
    amountInput: document.getElementById('amount-input'),
    generateBtn: document.getElementById('generate-btn'),
    generateError: document.getElementById('generate-error'),

    outputCard: document.getElementById('output-card'),
    qrContainer: document.getElementById('qr-container'),
    outputMerchantValue: document.getElementById('output-merchant-value'),
    outputAmountValue: document.getElementById('output-amount-value'),
    rawOutputText: document.getElementById('raw-output-text'),
    copyBtn: document.getElementById('copy-btn'),
    downloadBtn: document.getElementById('download-btn'),
    shareBtn: document.getElementById('share-btn'),

    resetBtn: document.getElementById('reset-btn'),
    scanReaderInternal: document.getElementById('qr-reader-internal'),
    savedCard: document.getElementById('saved-card'),
    savedName: document.getElementById('saved-name'),
    useSavedBtn: document.getElementById('use-saved-btn'),
    removeSavedBtn: document.getElementById('remove-saved-btn'),
    installBtn: document.getElementById('install-btn')
  };

  var state = {
    currentPayload: null, // last successfully-parsed raw QRIS string
    currentParsed: null,
    dynamicResult: null // last generated dynamic string
  };

  var idrFormatter = new Intl.NumberFormat('id-ID');
  var savedKey = 'qris-dinamis.saved-payload';

  function getSavedPayload() {
    try { return localStorage.getItem(savedKey); } catch (e) { return null; }
  }

  function savePayload(raw) {
    try { localStorage.setItem(savedKey, raw); } catch (e) { /* storage may be disabled */ }
  }

  function renderSavedCard() {
    var saved = getSavedPayload();
    if (!saved) return;
    var parsed = QRIS.parse(saved);
    if (!parsed.isValid || !parsed.crcValid) return;
    els.savedName.textContent = parsed.info.merchantName || 'QRIS tersimpan';
    els.savedCard.hidden = false;
  }

  renderSavedCard();
  els.useSavedBtn.addEventListener('click', function () {
    var saved = getSavedPayload();
    if (saved) handleDecodedText(saved);
  });
  els.removeSavedBtn.addEventListener('click', function () {
    try { localStorage.removeItem(savedKey); } catch (e) { /* no-op */ }
    els.savedCard.hidden = true;
  });

  var deferredInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferredInstallPrompt = event;
    els.installBtn.hidden = false;
  });
  els.installBtn.addEventListener('click', function () {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.finally(function () {
      deferredInstallPrompt = null;
      els.installBtn.hidden = true;
    });
  });
  if ('serviceWorker' in navigator) window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });

  // -----------------------------------------------------------------
  // Tabs
  // -----------------------------------------------------------------
  function selectTab(which) {
    var uploadActive = which === 'upload';
    els.tabUpload.setAttribute('aria-selected', String(uploadActive));
    els.tabPaste.setAttribute('aria-selected', String(!uploadActive));
    els.panelUpload.hidden = !uploadActive;
    els.panelPaste.hidden = uploadActive;
  }
  els.tabUpload.addEventListener('click', function () { selectTab('upload'); });
  els.tabPaste.addEventListener('click', function () { selectTab('paste'); });

  // -----------------------------------------------------------------
  // Status helper
  // -----------------------------------------------------------------
  function setStatus(text, kind) {
    els.scanStatus.textContent = text || '';
    els.scanStatus.className = 'status-line' + (kind ? ' is-' + kind : '');
  }

  // -----------------------------------------------------------------
  // Upload flow
  // -----------------------------------------------------------------
  els.uploadZone.addEventListener('click', function () { els.fileInput.click(); });
  els.uploadZone.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); els.fileInput.click(); }
  });

  els.fileInput.addEventListener('change', function () {
    var file = els.fileInput.files && els.fileInput.files[0];
    if (!file) return;

    els.filePreview.hidden = false;
    els.filePreviewName.textContent = file.name;
    var objectUrl = URL.createObjectURL(file);
    els.filePreviewImg.src = objectUrl;

    setStatus('Membaca kode QR dari foto…', 'busy');

    scanImageFile(file)
      .then(function (decodedText) {
        setStatus('Kode QR berhasil dibaca.', 'ok');
        handleDecodedText(decodedText);
      })
      .catch(function (err) {
        console.error(err);
        setStatus(
          'Tidak bisa membaca kode QR dari foto ini. Pastikan foto jelas dan tidak buram, atau coba tab "Tempel Teks".',
          'error'
        );
      });
  });

  function scanImageFile(file) {
    if (typeof Html5Qrcode === 'undefined') {
      return Promise.reject(new Error('Pemindai QR gagal dimuat (periksa koneksi internet).'));
    }
    if (!els.scanReaderInternal) {
      return Promise.reject(new Error('Elemen pemindai tidak ditemukan.'));
    }
    var scanner = new Html5Qrcode(els.scanReaderInternal.id, { verbose: false });
    return scanner.scanFile(file, false).finally(function () {
      // scanFile doesn't open the camera, but always tidy up internal state.
      try { scanner.clear(); } catch (e) { /* no-op */ }
    });
  }

  // -----------------------------------------------------------------
  // Paste flow
  // -----------------------------------------------------------------
  els.pasteSubmitBtn.addEventListener('click', function () {
    var text = els.pasteTextarea.value.trim();
    if (!text) {
      setStatus('Tempelkan teks kode QRIS terlebih dahulu.', 'error');
      return;
    }
    setStatus('Memeriksa kode…', 'busy');
    // Defer a tick so the "busy" status actually paints before parsing.
    setTimeout(function () { handleDecodedText(text); }, 30);
  });

  // -----------------------------------------------------------------
  // Handle any decoded/pasted text the same way
  // -----------------------------------------------------------------
  function handleDecodedText(text) {
    var parsed = QRIS.parse(text);

    if (!parsed.isValid) {
      setStatus('Bukan format QRIS yang dikenali: ' + parsed.error, 'error');
      hideResults();
      return;
    }
    if (!parsed.crcValid) {
      setStatus(
        'Checksum kode ini tidak cocok — kode mungkin rusak, terpotong, atau sudah diubah. Coba pindai ulang.',
        'error'
      );
      hideResults();
      return;
    }

    setStatus('Kode QRIS valid.', 'ok');
    state.currentPayload = parsed.raw;
    state.currentParsed = parsed;
    savePayload(parsed.raw);
    renderSavedCard();
    renderParsedInfo(parsed);
  }

  function hideResults() {
    els.step2Card.hidden = true;
    els.step3Card.hidden = true;
    els.outputCard.hidden = true;
  }

  // -----------------------------------------------------------------
  // Render step 2 — parsed info
  // -----------------------------------------------------------------
  function renderParsedInfo(parsed) {
    var info = parsed.info;
    els.infoMerchantName.textContent = info.merchantName || '—';
    els.infoMerchantCity.textContent = info.merchantCity || '—';
    els.infoMcc.textContent = info.merchantCategoryCode || '—';
    els.infoCountry.textContent = info.countryLabel || '—';
    els.infoCurrency.textContent = info.currencyLabel || '—';

    if (info.isDynamic) {
      els.infoStatusBadge.textContent = 'Dinamis';
      els.infoStatusBadge.className = 'badge badge-dynamic';
    } else {
      els.infoStatusBadge.textContent = 'Statis';
      els.infoStatusBadge.className = 'badge badge-static';
    }

    if (info.amount != null) {
      els.infoExistingAmountRow.hidden = false;
      els.infoExistingAmount.textContent = 'Rp ' + idrFormatter.format(info.amount);
    } else {
      els.infoExistingAmountRow.hidden = true;
    }

    els.rawDetailsContent.textContent = buildRawDetailsText(parsed);

    els.step2Card.hidden = false;
    els.step3Card.hidden = false;
    els.outputCard.hidden = true;
    els.amountInput.focus({ preventScroll: false });
  }

  function buildRawDetailsText(parsed) {
    var lines = [];
    lines.push('Tag  Panjang  Nilai');
    parsed.fields.forEach(function (f) {
      lines.push(f.tag + '   ' + String(f.length).padStart(2, '0') + '       ' + f.value);
    });
    if (parsed.info.merchantAccountBlocks.length) {
      lines.push('');
      lines.push('Info akuisisi/switching (tag 02–51, sub-field mentah):');
      parsed.info.merchantAccountBlocks.forEach(function (block) {
        lines.push('  Tag ' + block.tag + (block.globallyUniqueId ? ' — ' + block.globallyUniqueId : ''));
        block.subFields.forEach(function (s) {
          lines.push('    ' + s.tag + ': ' + s.value);
        });
      });
    }
    lines.push('');
    lines.push('CRC tersimpan: ' + parsed.crcProvided + '  |  CRC dihitung ulang: ' + parsed.crcCalculated);
    return lines.join('\n');
  }

  // -----------------------------------------------------------------
  // Amount input — live thousands formatting
  // -----------------------------------------------------------------
  function digitsOnly(str) { return (str || '').replace(/[^\d]/g, ''); }

  els.amountInput.addEventListener('input', function () {
    var raw = digitsOnly(els.amountInput.value);
    raw = raw.replace(/^0+(?=\d)/, ''); // no leading zeros
    els.amountInput.value = raw ? idrFormatter.format(parseInt(raw, 10)) : '';
  });

  els.amountInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); els.generateBtn.click(); }
  });

  function currentAmountValue() {
    var raw = digitsOnly(els.amountInput.value);
    return raw ? parseInt(raw, 10) : NaN;
  }

  // -----------------------------------------------------------------
  // Generate dynamic QR
  // -----------------------------------------------------------------
  els.generateBtn.addEventListener('click', function () {
    els.generateError.textContent = '';
    if (!state.currentPayload) {
      els.generateError.textContent = 'Pindai atau tempelkan kode QRIS dahulu.';
      return;
    }
    var amount = currentAmountValue();
    var result = QRIS.toDynamic(state.currentPayload, amount);
    if (!result.ok) {
      els.generateError.textContent = result.error;
      return;
    }

    state.dynamicResult = result.result;
    renderOutput(result.result, amount, state.currentParsed.info.merchantName);
  });

  function renderOutput(dynamicString, amount, merchantName) {
    els.qrContainer.innerHTML = '';
    if (typeof QRCode === 'undefined') {
      els.generateError.textContent = 'Pembuat gambar QR gagal dimuat (periksa koneksi internet).';
      return;
    }
    new QRCode(els.qrContainer, {
      text: dynamicString,
      width: 220,
      height: 220,
      colorDark: '#201c16',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });

    els.outputMerchantValue.textContent = merchantName || '—';
    els.outputAmountValue.textContent = 'Rp ' + idrFormatter.format(amount);
    els.rawOutputText.textContent = dynamicString;

    els.outputCard.hidden = false;
    els.outputCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // -----------------------------------------------------------------
  // Copy / download / share
  // -----------------------------------------------------------------
  els.copyBtn.addEventListener('click', function () {
    if (!state.dynamicResult) return;
    var done = function () {
      var original = els.copyBtn.textContent;
      els.copyBtn.textContent = 'Tersalin!';
      setTimeout(function () { els.copyBtn.textContent = original; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(state.dynamicResult).then(done).catch(function () {
        fallbackCopy(state.dynamicResult, done);
      });
    } else {
      fallbackCopy(state.dynamicResult, done);
    }
  });

  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* no-op */ }
    document.body.removeChild(ta);
  }

  function getQrImageDataUrl() {
    var canvas = els.qrContainer.querySelector('canvas');
    if (canvas) return canvas.toDataURL('image/png');
    var img = els.qrContainer.querySelector('img');
    if (img) return img.src;
    return null;
  }

  els.downloadBtn.addEventListener('click', function () {
    var dataUrl = getQrImageDataUrl();
    if (!dataUrl) return;
    var a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'qris-dinamis.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });

  if (navigator.share) {
    els.shareBtn.hidden = false;
    els.shareBtn.addEventListener('click', function () {
      var dataUrl = getQrImageDataUrl();
      if (!dataUrl) return;

      fetch(dataUrl)
        .then(function (res) { return res.blob(); })
        .then(function (blob) {
          var file = new File([blob], 'qris-dinamis.png', { type: 'image/png' });
          var shareData = {
            title: 'QRIS Dinamis',
            text: 'QRIS dinamis senilai Rp ' + els.outputAmountValue.textContent.replace('Rp ', ''),
            files: [file]
          };
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            return navigator.share(shareData);
          }
          return navigator.share({ title: shareData.title, text: shareData.text });
        })
        .catch(function (err) {
          if (err && err.name !== 'AbortError') console.error(err);
        });
    });
  }

  // -----------------------------------------------------------------
  // Reset
  // -----------------------------------------------------------------
  els.resetBtn.addEventListener('click', function () {
    state.currentPayload = null;
    state.currentParsed = null;
    state.dynamicResult = null;
    els.fileInput.value = '';
    els.filePreview.hidden = true;
    els.pasteTextarea.value = '';
    els.amountInput.value = '';
    setStatus('', null);
    hideResults();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();
