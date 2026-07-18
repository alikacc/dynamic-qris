# QRIS Dinamis

A free, open-source, 100%-client-side web app that turns a **static QRIS**
code (the kind printed on a placard at a *warung* or small merchant) into a
**dynamic QRIS** with a fixed amount baked in — so the buyer doesn't have to
type the amount themselves and risk a typo.

Nothing is uploaded anywhere. The uploaded photo is decoded in the browser,
the payload is edited in the browser, and the new QR image is generated in
the browser. It's a static site — you can host it for free on GitHub Pages.

**Live logic is unit-tested** — see [Testing](#testing) below.

## How it works

A QRIS payload is a standardized [EMVCo "QR Code Specification for Payment
Systems"](https://www.emvco.com/emv-technologies/qr-codes/) string: a flat
sequence of `TAG (2 digits) + LENGTH (2 digits) + VALUE` fields, e.g. tag
`59` is always the merchant name, `60` the city, `54` the transaction
amount, `63` a CRC-16 checksum over everything before it.

To convert static → dynamic, this tool:

1. Parses the payload into its fields.
2. Sets the "point of initiation method" (tag `01`) to `12` (dynamic).
3. Inserts or replaces the transaction amount (tag `54`).
4. Recalculates the CRC-16/CCITT-FALSE checksum (tag `63`) over the new
   payload.

It never touches the merchant account / acquirer fields (tags `26`–`51`,
which carry the actual payout destination) — it only adds an amount to
**your own** code. It doesn't register anything with a payment provider, so
if you need automatic transaction records or reconciliation, keep using
your official QRIS provider's app alongside this tool.

## Project structure

```
qris-dynamic-generator/
├── index.html          # the app
├── css/style.css        # mobile-first styling
├── js/
│   ├── qris.js           # the core library — parsing / CRC / static→dynamic
│   │                      #   (dependency-free, usable outside the browser too)
│   └── app.js             # UI wiring (DOM + the two CDN libraries below)
├── test/qris.test.js      # zero-dependency Node test suite for qris.js
├── LICENSE                # MIT
└── README.md
```

### Third-party libraries (loaded via CDN, no build step needed)

| Library | What it's for |
|---|---|
| [`html5-qrcode`](https://github.com/mebjas/html5-qrcode) | Decodes the QR code out of an uploaded photo, entirely client-side |
| [`qrcodejs`](https://github.com/davidshimjs/qrcodejs) | Renders the new dynamic QR code as an image |

Both are loaded from [cdnjs](https://cdnjs.com/), so there's nothing to
`npm install` to run the site itself.

## Running it locally

Since it's a static site, you can just open `index.html` directly in a
browser. For the most realistic test (and so relative paths behave exactly
like they will on GitHub Pages), serve it over a tiny local server instead:

```bash
# Option A — Python (already on most machines)
cd qris-dynamic-generator
python3 -m http.server 8000
# then open http://localhost:8000

# Option B — Node
npx serve .
```

To test on your **phone** while developing on a computer on the same Wi-Fi,
find your computer's local IP (e.g. `192.168.1.23`) and visit
`http://192.168.1.23:8000` from your phone's browser.

## Testing

### The parsing/generation logic (`qris.js`)

This is a plain Node test suite with **no dependencies** — it checks the
CRC-16 implementation against the standard published test vector, builds a
synthetic QRIS payload, and round-trips it through parse → convert to
dynamic → re-parse, asserting the amount, checksum, and merchant identity
all come out correctly:

```bash
node test/qris.test.js
```

You should see every line printed as `ok` and a final `10 test(s) passed.`

### The web app itself

There's no automated browser test here (keeping the project dependency-free
and easy to understand), so test it manually:

1. Serve the site locally (see above) and open it on your phone.
2. Tab **"Unggah Foto"**: take/upload a photo of any static QRIS code and
   confirm the merchant name/city shown match the real placard.
3. Tab **"Tempel Teks"**: if you have a raw QRIS string, paste it directly
   and confirm the same info appears.
4. Enter an amount, tap **"Buat QR Dinamis"**, and scan the *resulting* QR
   with your own banking/e-wallet app — it should show the merchant name
   and the exact amount you typed, ready to confirm.
5. Try **"Unduh PNG"** and **"Salin"** and confirm the downloaded image /
   copied text match what's on screen.
6. Try an obviously invalid input (e.g. paste `hello world`) and confirm
   you get a friendly error instead of a blank screen or crash.

## Deploying to GitHub Pages

1. Create a new GitHub repository and push this folder's contents to it
   (make sure `index.html` sits at the **root** of the repo, or in `/docs`
   if you prefer that layout — just adjust step 3 accordingly):

   ```bash
   git init
   git add .
   git commit -m "Initial commit: QRIS Dinamis"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```

2. On GitHub, go to your repo's **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**,
   pick the `main` branch and the `/ (root)` folder, then **Save**.
4. Wait a minute or two — GitHub will give you a URL like
   `https://<your-username>.github.io/<your-repo>/`. That's it, it's live.

Because everything runs client-side and is served as static files, there's
no server cost, database, or backend to maintain — it'll keep working for
free no matter how much traffic it gets.

## Honest limitations

- **Sub-fields inside tags 02–51 are shown raw, not decoded.** Those tags
  carry acquirer/switching-specific info (like the National Merchant ID),
  and their exact internal layout can differ between payment service
  providers. Rather than guess and risk showing you wrong labels, this tool
  displays them as raw tag/value pairs under "Detail teknis."
- **This isn't an official Bank Indonesia / ASPI tool**, and generating a
  QR this way doesn't create any transaction record on a payment provider's
  side — it's purely a convenience layer on top of a code you already own.
- Very old or heavily damaged photos may fail to scan — the paste-text tab
  is there as a reliable fallback.

## License

MIT — see [LICENSE](./LICENSE). Third-party libraries keep their own
licenses (`html5-qrcode` is Apache-2.0, `qrcodejs` is MIT).
# dynamic-qris
