# QRIS Dinamis

> A small, privacy-first utility for turning a static QRIS into a QRIS with a fixed payment amount.

QRIS Dinamis is a browser-only tool for Indonesian merchants and anyone who needs to request an exact amount. Choose a QRIS image, paste its payload, enter the amount, and download a ready-to-scan QR code.

## Why this project exists

Static QRIS codes are convenient, but they ask the payer to type the amount manually. This project adds the amount locally, recalculates the EMVCo CRC16 checksum, and leaves the merchant identity untouched.

## Highlights

- Local QRIS image decoding and text validation
- Static-to-dynamic conversion with CRC16 recalculation
- QR preview, PNG download, copy, and native share actions
- Saved QRIS shortcut stored in the browser with `localStorage`
- Installable as a phone home-screen shortcut through the web app manifest
- No sign-in, database, server, or uploaded images
- Responsive interface for phones and desktop browsers

## Run it locally

This is a static site. A local HTTP server is recommended so the installable app features work:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000` in a browser. On a phone, use the computer's local network address, for example `http://192.168.1.23:8000`.

## Test the QRIS engine

```bash
node test/qris.test.js
```

The core logic in `js/qris.js` has no dependencies and can also be used from Node-compatible code. The browser interface loads `html5-qrcode` and `qrcodejs` from CDN for image decoding and QR rendering.

## Privacy and limitations

The QRIS payload, uploaded image, and generated code are processed in the browser. The last valid QRIS is stored only in that browser's local storage so it can be reused later. Clearing site data removes it.

This project is independent and is not affiliated with Bank Indonesia, ASPI, or any QRIS provider. It does not create transaction records or provide payment reconciliation. Always review the merchant and amount in your payment app before confirming.

## License

MIT — see [LICENSE](./LICENSE).

© 2026 Alikacc.
