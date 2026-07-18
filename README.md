# QRIS Dinamis

QRIS Dinamis is a dependency-light, browser-first toolkit for converting a static Indonesian QRIS payload into a dynamic QRIS payload with a fixed transaction amount.

It is designed to work as both:

- a ready-to-use static web application for merchants and operators; and
- a small, readable QRIS/EMVCo utility that developers can reuse in another web project or Node-based tool.

The application performs QRIS parsing, validation, conversion, and QR generation on the client. No account, database, API server, or merchant backend is required.

## What it does

The core conversion changes only the fields required for a fixed amount:

1. Parse the QRIS TLV payload.
2. Set the point-of-initiation method to dynamic (`01 = 12`).
3. Add or replace the transaction amount (`54`).
4. Ensure the currency field is present (`53 = 360`, IDR).
5. Rebuild the payload in field order.
6. Recalculate the EMVCo CRC16 checksum (`63`).

Merchant account information and merchant identity fields are preserved. The tool does not create a payment transaction or change the destination account.

## Product features

- Upload a QR image from a device or paste a raw QRIS string.
- Validate QRIS structure and CRC16 checksum.
- Convert static QRIS into dynamic QRIS for an exact Rupiah amount.
- Display merchant confirmation before generating the final code.
- Generate a scannable QR image in the browser.
- Copy the raw dynamic payload.
- Download the generated QR as PNG.
- Share the generated QR through supported mobile browsers.
- Remember a QRIS locally for later use when the user enables the save option.
- Install the application as a phone home-screen shortcut through the web app manifest.
- Cache the application shell with a service worker for repeat visits.

## Project layout

```text
.
├── index.html                 # Browser application markup
├── css/style.css              # Responsive application styling
├── js/app.js                  # UI state, upload flow, persistence, and output actions
├── js/qris.js                 # Dependency-free QRIS parser and converter
├── test/qris.test.js          # Node test suite for the QRIS engine
├── manifest.webmanifest       # Installable web app metadata
├── sw.js                      # Application-shell service worker
├── icon.svg                   # Home-screen/application icon
├── LICENSE
└── README.md
```

## Quick start

The project is intentionally a static site. Python's built-in server is enough for local development:

```bash
git clone <your-repository-url>
cd qris-dynamic-generator
python3 -m http.server 8000
```

Open:

```text
http://localhost:8000
```

For phone testing, connect the phone and computer to the same network and open the computer's local IP address, for example:

```text
http://192.168.1.23:8000
```

Use an HTTP server instead of opening `index.html` directly. Service workers, install prompts, and some browser APIs require a secure context or localhost.

## Development workflow

There is no build step and no package manager requirement for the current version.

After editing files:

1. Refresh the browser.
2. If the service worker is enabled, clear the site's cache or unregister the worker when testing asset changes.
3. Test on both a desktop browser and a real mobile browser.
4. Run the QRIS test suite before opening a pull request.

The browser loads these third-party libraries from CDN:

- `html5-qrcode` for QR image decoding
- `qrcodejs` for rendering generated QR images

The QRIS engine itself has no external dependencies.

## Use as an npm package

The reusable QRIS engine is also published as a package entry point. The web UI, image scanner, service worker, and browser-specific assets remain in this repository, while npm consumers receive the dependency-free parser and converter.

Install it in an existing Node.js or JavaScript project:

```bash
npm install @alikacc/qris-dinamis
```

Use it with CommonJS:

```js
const QRIS = require('@alikacc/qris-dinamis');

const parsed = QRIS.parse(payload);

if (!parsed.isValid || !parsed.crcValid) {
  throw new Error(parsed.error || 'Invalid QRIS payload');
}

const dynamic = QRIS.toDynamic(payload, 125000);

if (!dynamic.ok) {
  throw new Error(dynamic.error);
}

console.log(dynamic.result);
```

Use it with an ES module import:

```js
import QRIS from '@alikacc/qris-dinamis';

const result = QRIS.toDynamic(staticPayload, 125000);
if (result.ok) console.log(result.result);
```

The package exports:

| Export | Purpose |
| --- | --- |
| `QRIS.parse(raw)` | Parse QRIS fields and merchant information |
| `QRIS.toDynamic(raw, amount)` | Add or replace a fixed Rupiah amount |
| `QRIS.build(fields)` | Build a payload and calculate its CRC |
| `QRIS.crc16(value)` | Calculate an EMVCo CRC16/CCITT-FALSE checksum |
| `QRIS.isValidChecksum(raw)` | Quickly validate a payload checksum |
| `QRIS.TAG` | Named QRIS/EMVCo tag constants |

The npm package does not decode image files or render QR images. Pair it with a browser QR decoder and QR renderer when building a full web or mobile interface.

### Package maintenance commands

Run the package test suite:

```bash
npm test
```

Inspect exactly what would be included in the npm tarball:

```bash
npm run pack:check
```

Create a local package tarball for testing in another project:

```bash
npm pack
npm install ./alikacc-qris-dinamis-1.0.0.tgz
```

### Publishing a release

The package is scoped, so publish it publicly with:

```bash
npm login
npm test
npm run pack:check
npm publish --access public
```

For future releases, update the version using npm's semver command, then publish again:

```bash
npm version patch   # bug fix: 1.0.0 → 1.0.1
npm version minor   # backwards-compatible feature
npm version major   # breaking API change
npm publish --access public
```

Do not publish credentials, private QRIS fixtures, or the complete browser application when the goal is only to release the reusable engine. The package's published file list is intentionally limited to `js/qris.js`, `README.md`, and `LICENSE`.

## Testing

Run the parser and converter tests:

```bash
node test/qris.test.js
```

The suite covers:

- CRC16/CCITT-FALSE against the standard `123456789` test vector
- QRIS field parsing
- Nested merchant account fields
- Merchant and location extraction
- Invalid and tampered payload handling
- Static-to-dynamic conversion
- Amount replacement without duplicate amount fields
- Recalculated checksum validation
- Invalid amount rejection

Manual browser checks should cover:

- JPG/PNG QR upload from desktop and phone
- Clear, tightly cropped QR images
- Raw QRIS paste
- Invalid text and checksum errors
- Saving and reusing a QRIS
- Clearing a saved QRIS
- Amount formatting and validation
- QR download, copy, and share actions
- Home-screen installation on a supported phone browser

## QRIS engine API

`js/qris.js` exposes a global `QRIS` object in the browser and a CommonJS module in Node.

### `QRIS.parse(raw)`

Parses a QRIS or EMVCo merchant-presented QR payload.

```js
const parsed = QRIS.parse(payload);

if (!parsed.isValid) {
  console.error(parsed.error);
}

if (parsed.crcValid) {
  console.log(parsed.info.merchantName);
  console.log(parsed.info.merchantCity);
}
```

The result includes:

| Property | Meaning |
| --- | --- |
| `isValid` | Whether the payload has a recognizable structure |
| `crcValid` | Whether the stored CRC matches the calculated CRC |
| `raw` | Trimmed original payload |
| `fields` | Top-level body fields excluding the CRC field |
| `crcProvided` | CRC value found in the payload |
| `crcCalculated` | CRC value calculated from the payload |
| `info` | Normalized merchant, currency, amount, and account information |

### `QRIS.toDynamic(raw, amount)`

Creates a dynamic payload with an integer Rupiah amount.

```js
const result = QRIS.toDynamic(staticPayload, 125000);

if (!result.ok) {
  throw new Error(result.error);
}

console.log(result.result);
```

The amount must be a positive integer and cannot exceed the payload's supported limit. The method refuses payloads with invalid checksums before modifying them.

### `QRIS.build(fields)`

Builds a complete payload from body fields and appends a freshly calculated CRC field.

```js
const payload = QRIS.build([
  { tag: '00', value: '01' },
  { tag: '53', value: '360' }
]);
```

### `QRIS.crc16(value)`

Calculates the EMVCo CRC16/CCITT-FALSE checksum for a string.

### `QRIS.isValidChecksum(raw)`

Returns a boolean for quick checksum validation.

## Image scanning notes

Image scanning is the least deterministic part of the browser application because it depends on the mobile browser's image decoder and the quality of the source image.

For best results:

- use a sharp JPG or PNG;
- crop closely around the QR;
- avoid glare, shadows, and perspective distortion;
- keep the QR large enough to occupy a meaningful part of the image;
- use a screenshot when a camera photo is difficult to decode.

If the image decoder cannot read a file, pasting the raw QRIS payload is the most reliable fallback. The UI keeps this path available because a valid image extension does not guarantee that the browser can decode the file contents.

## Privacy and storage model

The application is client-side by design:

- Uploaded images are decoded locally.
- QRIS payloads are not sent to an application backend.
- The optional saved QRIS is stored in the browser's `localStorage`.
- Clearing browser site data removes the saved QRIS.
- CDN dependencies still require network access on the first load unless they are separately bundled.

Do not use the local save option on a shared device if the QRIS payload should remain private.

## Deployment

Because the application is static, it can be deployed to GitHub Pages, Netlify, Vercel static hosting, Cloudflare Pages, or any ordinary web server.

For a production deployment:

1. Serve the site over HTTPS.
2. Keep `index.html` at the site root unless the relative asset paths are updated.
3. Confirm that `manifest.webmanifest`, `sw.js`, and `icon.svg` are publicly accessible.
4. Configure the host to serve the service worker from the appropriate scope.
5. Test installation and offline reload on a real phone.

If the application is hosted under a subdirectory, update `start_url` in `manifest.webmanifest` and the service worker asset paths in `sw.js`.

## Contribution opportunities

Contributions are welcome. Useful next improvements include:

### Reliability

- Add image preprocessing: crop, resize, contrast, and grayscale before decoding.
- Support more mobile image formats through client-side conversion.
- Provide a camera-scanning mode with a visible live preview.
- Add a second QR decoder fallback for difficult images.
- Improve error messages with actionable decoder diagnostics.

### QRIS coverage

- Add broader fixtures from different Indonesian payment providers.
- Expand nested merchant-account parsing while preserving unknown fields safely.
- Add optional service fee support where the payload and business rules allow it.
- Add more EMVCo edge-case tests.
- Add a structured field inspector for developer/debug builds.

### Product experience

- Add multiple saved merchant profiles instead of one local QRIS.
- Allow users to rename saved QRIS entries.
- Add recent amount presets.
- Add print-friendly QR output.
- Add a user-controlled light/dark theme.
- Add localization for English and additional Indonesian copy variants.
- Add a first-run installation and privacy guide.

### Engineering

- Bundle CDN dependencies for fully offline operation.
- Add browser automation tests for upload, persistence, and generation flows.
- Add TypeScript types or migrate the QRIS engine to TypeScript.
- Add a lightweight formatter and linting workflow.
- Add automated deployment checks for the manifest and service worker.

When contributing, keep the project dependency-light, avoid sending QRIS data to a server, preserve unknown QRIS fields, and add or update tests for changes to `js/qris.js`.

## Pull request checklist

- [ ] The change works on a desktop browser.
- [ ] The change works on a real mobile browser where relevant.
- [ ] `node test/qris.test.js` passes.
- [ ] No QRIS payload or uploaded image is sent to a new backend service.
- [ ] New QRIS behavior has a fixture or regression test.
- [ ] README or user-facing behavior is updated when necessary.

## Disclaimer

QRIS Dinamis is an independent utility. It is not an official Bank Indonesia, ASPI, bank, e-wallet, or payment-provider application. It does not initiate payments, create transaction records, or provide settlement and reconciliation.

Always verify the merchant name and amount in your banking or e-wallet application before confirming a payment.

## License

MIT — see [LICENSE](./LICENSE).

© 2026 Alikacc.
