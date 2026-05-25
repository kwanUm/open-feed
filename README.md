# OpenFeed

A new-tab browser extension that replaces your blank tab with a feed reader **that runs entirely inside your browser** — no backend, no account, no telemetry.

## The premise

Most feed readers route everything through a server: that's where they fetch your sources, parse the HTML, dedupe items, run filtering, and serve them back. That server sees everything you read.

OpenFeed flips it. The browser does all the work:

- **Fetching.** Public APIs (Hacker News, Reddit, GitHub Trending, dev.to, Lobsters, etc.) get fetched directly from the browser. RSS feeds (Medium, HackerNoon, FreeCodeCamp) go through the extension's background service worker to bypass CORS. For authenticated feeds (LinkedIn, X), the extension reads your already-logged-in session cookies and calls the same internal APIs the site itself uses.
- **Parsing + filtering.** Structured JSON sources parsed directly. RSS feeds parsed client-side with `htmlparser2`. Your reading preferences never leave your machine.
- **Storage.** All preferences, bookmarks, and read state live in `localStorage`. Nothing syncs anywhere.

The result: a personal, private feed assembled entirely client-side. The only network traffic is to the sources themselves.

## Status

Personal project, no guarantees. This is a fork of [hackertab.dev](https://github.com/medyo/hackertab.dev) (Apache-2.0).

**Sources supported:**
- GitHub Trending — GitHub Search API
- Hacker News — Firebase public API
- Reddit — public JSON API (`reddit.com/r/{sub}/hot.json`)
- Dev.to — public REST API
- Lobsters — public JSON API
- Medium — RSS via background service worker
- HackerNoon — RSS via background service worker
- FreeCodeCamp — RSS via background service worker
- Upcoming conferences — `tech-conferences/conference-data` on GitHub
- LinkedIn feed — via extension session cookies (must be logged in)
- X.com feed — via extension session cookies (must be logged in)
- Custom RSS feeds

## Heads-up on terms of service

LinkedIn, X, and Claude.ai restrict third-party automated access to their platforms. This tool isn't that — it runs entirely in your browser, uses your own session, reads only your own feed, and sends nothing to any third party. That said, their ToS language is broad, so use at your own discretion.

## Install

```bash
npm install
npm run build:chrome
```

Then load `dist/` as an unpacked Chrome extension (`chrome://extensions` → "Load unpacked").

## Develop

```bash
npm install
npm run dev
```

## License

Apache-2.0. See [LICENSE](./LICENSE).
