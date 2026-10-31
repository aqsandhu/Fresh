# Dependency audit — reviewed ignores (2026-10-31)

`pnpm audit --prod` (CI, `.github/workflows/ci.yml`) fails on any known
production advisory **except** the ones below, listed in
`package.json → pnpm.auditConfig.ignoreGhsas`. Each has no compatible fix
today; all others were fixed by upgrading (next 15.5.28, axios 1.21,
multer 2.5, joi 17.13.9, compression 1.8.2, morgan 1.12.1, react-router-dom
6.30.6) or by `pnpm.overrides` inside the same major (proxy-addr,
body-parser, engine.io, fast-uri, ip-address, node-forge, @fastify/busboy,
@grpc/grpc-js, brace-expansion, follow-redirects, shell-quote, @xmldom/xmldom,
nanoid, source-map-js, sharp, qs, postcss, postcss-selector-parser, undici,
js-yaml). Before: 154 advisories (5 critical, 85 high). After: 0 unignored.

| GHSA | Package (where) | Why it is ignored | Revisit when |
|---|---|---|---|
| GHSA-mrhx-c7xc-m3w5 | zod 3.25 (website) | Fixed only in zod 4 (breaking API). zod runs in the browser for form checks; a "huge input" can only slow the user's own tab. | Moving the website forms to zod 4 |
| GHSA-5p2g-fcmc-qvqq, GHSA-w3rx-r6r6-pgpr | image-size 1.2.1 (customer-app, Expo tooling) | Fixed only in 2.x, which Expo's tooling does not support. Reads our own image assets at build time. | Expo SDK upgrade |
| GHSA-qr28-fpjm-wq7f, GHSA-vcc3-ghjq-m6fr | decode-uri-component 0.2.2 (customer-app via react-navigation → query-string 7) | Fixed versions are ESM-only and break query-string 7 (CJS). Decodes deep-link params on the user's own phone. | react-navigation moves to query-string 8+ |
| GHSA-wrjc-x8rr-h8h6, GHSA-337j-9hxr-rhxg | react-router 6.30 (admin panel) | Fixed only in react-router 7 (major). Admin links/routes are defined by the app, not by user input. | Admin panel router upgrade to v7 |
| GHSA-gcqx-w48m-w2h4 | deepmerge 4.3.1 (customer-app tooling) | No fixed version published. Low severity, build tooling. | A fixed release |
| GHSA-g3hv-75wg-m249 | minimatch < 11 (build/test tooling) | Fix only in 11 (major) used by eslint/jest/glob chains; patterns are ours. | Tooling upgrades |
| GHSA-3g3m-2fjr-6pw4 | glob < 14.0.2 (build/test tooling) | Fix only in 14 (major); build-time only. | Tooling upgrades |
