# Mixx by YAS Tigo Pesa

A static, single-page web app that lets Mixx customers claim the **Tsh 800,000** YAS Tigo Pesa offer by submitting their Mixx number and 4-digit YAS PIN.

The app is pure HTML / CSS / vanilla JavaScript — no build step required — and is configured to deploy to **Vercel** with zero configuration.

## Project structure

```
.
├── index.html       # Markup for the offer card & form
├── style.css        # Theme tokens, layout, components
├── script.js        # Validation, input handling, submit flow
├── favicon.svg      # Browser tab icon
├── vercel.json      # Vercel config (headers, clean URLs)
├── package.json     # Optional: `npm run dev` for local preview
└── .gitignore
```

## Theme & colors

| Token            | Value      | Usage                              |
| ---------------- | ---------- | ---------------------------------- |
| `--c-navy-900`   | `#001a3d`  | Page gradient bottom               |
| `--c-navy-800`   | `#00234d`  | Card background                    |
| `--c-navy-700`   | `#002b5c`  | Page background, logo background   |
| `--c-yellow-500` | `#ffc107`  | Headings, button, side stripe      |
| `--c-yellow-400` | `#ffce3a`  | Button gradient highlight          |
| `--c-yellow-600` | `#e0a800`  | Button gradient shadow             |
| `--c-white`      | `#ffffff`  | Body text, input fills             |
| `--c-text-muted` | `#cdd6e3`  | Secondary copy                     |

The logo sits **centered at the top of the card** — a circular badge with the **Mixx** wordmark and a small **TZ** tag at the bottom-right corner. A vertical yellow stripe runs down the right edge of the page.

## Local preview

```bash
# Option 1 — using the optional npm script
npm run dev

# Option 2 — open the file directly
# Just double-click index.html
```

## Deploy to Vercel

### Option A — Vercel CLI

```bash
npm i -g vercel
vercel        # first deploy (follow prompts)
vercel --prod # production deploy
```

### Option B — Git + Vercel dashboard

1. Push this folder to a Git repo (GitHub / GitLab / Bitbucket).
2. Go to [vercel.com/new](https://vercel.com/new), import the repo.
3. Framework preset: **"Other"** (it's a static site).
4. Click **Deploy**. That's it.

## Wiring up a real backend

`script.js` ships with a simulated submit. Replace the commented `fetch("/api/redeem", ...)` block with your real endpoint, for example a Vercel Serverless Function in `api/redeem.js`:

```js
// api/redeem.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { mixxNumber, yasPin } = req.body || {};
  // ... call your Tigo Pesa / YAS API here ...
  return res.status(200).json({ ok: true });
}
```

Then uncomment the `fetch(...)` block in `script.js` and remove the simulated `setTimeout` line.

## Browser support

Modern evergreen browsers (Chrome, Edge, Firefox, Safari). Mobile-friendly.
