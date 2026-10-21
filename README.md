# Housemate Lamp · Light as a response

Node.js + plain HTML/CSS/JavaScript prototype for a diffused **16 × 16 RGB** lamp. Type a moment; the lamp answers with color relationships, spatial motion, timing and closure. The everyday page shows no AI reply paragraphs, emotion tags or interpretation cards.

## Run

Node.js 20 or newer; no third-party dependencies or build step.

```sh
npm start
```

Open http://localhost:3000. Open **Light study** at the bottom for the research drawer, or use http://localhost:3000/?research=1. The same page works on phones; its input follows the visible viewport when the keyboard opens.

```sh
npm test
```

Checks use Node's built-in test runner. They cover semantic priority, schema validation, request cancellation and stale results, session reset, local fallback, RGB frames, paused/hidden time and the one-render-loop contract. Browser QA and its limits are recorded in [VALIDATION.md](VALIDATION.md).

## AI and local demo

Use the existing ignored `API Key.txt`, or set `OPENAI_API_KEY` on the server. The key is never sent to the browser. `OPENAI_MODEL` defaults to the existing `gpt-6-sol`; `PORT` and `HOST` configure listening. Railway's `PORT` binds to `0.0.0.0` automatically.

The OpenAI Responses API returns a strict, bounded light plan, **not prose**. See [official Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses). All enums, numeric bounds, refusal, incomplete output, malformed JSON, timeout and upstream failure are handled. Model parameters are constrained again by local session preferences. `store:false` is used.

With no key, the page clearly labels **Local demo** and runs the same planner format and renderer entirely in the browser. Choose Local demo in Light study even when a key is configured. Local rules recognize representative Chinese, English and Korean phrases; this is a demonstration of known interaction routes, not unrestricted language understanding. Explicit boundaries, corrections, greetings and thanks are routed locally even in AI mode. Other messages use AI with up to ten prior user turns and validated light context.

On AI failure the light plays a separate interrupted-return gesture, offers **Retry AI**, and continues with a valid local response. The study drawer includes a no-network failure simulation to exercise this exact presentation path. It is not a timed reminder service.

## Response library

All 20 responses can be previewed without AI. Each catalog entry includes a design hypothesis, not a claim of proven comprehension.

| ID | Internal name | Signature / ending |
| --- | --- | --- |
| B01 | idle | Very slow drift; stays available |
| B02 | acknowledge | One short local pass; receipt without agreement |
| B03 | processing | Restrained local loop only while a real request is pending |
| B04 | greet | One outward wave; returns to idle |
| B05 | affirm | Two regions join; accepts a known choice |
| B06 | decline | Regions separate and settle |
| B07 | clarify | Two regions alternate once; waits still |
| B08 | wait | Movement comes to rest; leaves room |
| B09 | notify | Two local increases; ends |
| B10 | complete | Dispersed regions consolidate |
| B11 | farewell | Slow retreat into the base; returns to idle |
| B12 | error | One interruption and return; retry available |
| R01 | empathize | Pause, then regions gradually connect; holds |
| R02 | accompany | Broad low-frequency bands; continues when invited |
| R03 | soothe | Irregularity becomes organized; holds |
| R04 | encourage | Progressive directional expansion; supports an upcoming action |
| R05 | celebrate | Three controlled openings; brief, then idle |
| R06 | receive_thanks | Small local return in the same palette; restores prior stable state |
| R07 | withdraw | Motion diminishes to stillness; preserves color |
| R08 | repair | Interrupts and changes parameters; remembers session feedback |

A negative self-judgment routes to empathize, never agreement. General knowledge and unknowable future outcomes route to clarify rather than arbitrary yes/no. An explicit request for solitude takes priority over anxiety or other emotion words. Thanks after withdrawal returns to stillness. Returning or inviting company can start interaction again.

## Light study / workshop

The drawer is closed by default. It provides:

- Twenty direct previews, replay and hold; design hypothesis for each response.
- Eleven palette families × misted / balanced / accented variations, one to four visible colors and a reproducible seed.
- Primitive, flow speed, amplitude, energy, duration, loop and color transition controls.
- Diffusion / crisp matrix view. Both consume the same **768-byte RGB frame**; the matrix is not a downsampled screenshot.
- Palette lock and release; session scenes with restore; current plan copy/export.
- Session-only likes, dislikes and suggested changes, exported only when requested. Exports include settings and intentionally entered workshop notes; conversation text is never automatically attached.
- AI/demo selection and simulated request failure.

Explicit color dislikes override palette locks and avoid that hue family in later choices. Motion feedback affects later plans. A short thanks preserves color. New moment cancels requests and invalidates late responses, clears text, preferences, scene memories and workshop notes. No database, account, analytics SDK, microphone or hardware permission is required. Refreshing closes the session; nothing is written to localStorage.

## Code boundaries

| File | Responsibility |
| --- | --- |
| `public/lib/catalog.js` | 20 response defaults, timing, closure, design notes |
| `public/lib/palettes.js` | Palette families, variants, hue exclusions, selection |
| `public/lib/planner.js` | Shared plan schema, normalization, multilingual local routing, preferences |
| `response-api.js` | OpenAI instructions, request, safe fallback |
| `public/lib/controller.js` | One current session, cancellation, reception/processing/response lifecycle |
| `public/lib/renderer.js` | Seeded normalized spatial primitives → 16×16 RGB → display |
| `public/lib/research.js` | Preview controls, session studies and manual JSON export |
| `public/app.js` | Minimal everyday interaction and responsive viewport |
| `server.js` | Static asset allowlist and plan/config API |

Renderer uses elapsed time rather than frame counts, excludes paused/hidden time, captures the displayed frame for continuous transitions, and owns one cancellable render loop. Reduced-motion uses stable simplified compositions. A plan arriving while paused is queued without changing the displayed light. Resuming shows the latest valid plan. Hidden tabs stop rendering.

The current RGB buffer is the future hardware boundary: row-major `(y * 16 + x) * 3 + channel`, channel order R/G/B, integers 0–255. A hardware adapter can consume it without changing semantic routing. No Arduino, serial or Bluetooth output is implemented.

## Deployment

Existing target stays **Railway**, repository `skkubaozuowen/Housemate-Lamp`, branch `codex/housemate`. Repository root, start command `npm start`, Node 20+, no build command. Keep the existing `OPENAI_API_KEY` service variable; never commit the key file. The HTTPS origin check supports Railway's TLS proxy. Static files are allowlisted, so credentials and server modules cannot be downloaded.

Public page: https://housemate-lamp-production.up.railway.app/

## Research limits and extension points

These palette/movement/timing combinations are prototype engineering choices. Whether people understand or prefer them remains to be compared in the designer workshop and, where appropriate, user research. They do not establish universal color meanings or health effects. The provided implementation brief motivates dimensions using Clark & Brennan (grounding), Reis/Clark/Holmes (responsiveness), Harrison et al. and Liu et al. (point-light expressiveness), Russell (affect), and Wilms/Oberfeld and Jonauskaite et al. (color associations). Their results are not validation of these specific 2D animations.

Reserved extensions, without current hardware dependencies: E01 propose/negotiate palette options; E02 direct attention inside the lamp surface; E03 recall a saved session scene; E04 shared waiting. Session scene recall is available in the study drawer. There is no cross-session memory.
