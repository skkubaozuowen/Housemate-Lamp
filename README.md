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

## Dino voice · version 2.5

Choose **Chinese**, **Korean** or **English**, then explicitly click **Talk to Dino** and allow microphone access. Chinese (`zh-CN`) is the default; Korean uses `ko-KR` and English uses `en-US`. A compact, irregular blue-and-green glow flows in the existing light field while Dino receives a turn. Gentle ambient motion continues in quiet moments; measured microphone amplitude adds expansion and color strength through the Web Audio analyser. It is generated as the same **16 × 16 RGB frame** used by the webpage, matrix preview and connected USB lamp, without a separate CSS sphere. Reduced-motion fixes the geometry while retaining amplitude-related color changes. Text input and the existing 20 light responses remain available.

After a turn contains words, **five seconds of silence automatically submits its text** to the existing light planner. Continued speech resets the silence countdown; recognition can take up to another 1.2 seconds to finish its last words. **Send now** submits sooner; **Cancel turn** cancels the turn; **Type instead** returns to typing. Existing typed text is preserved separately during voice entry and is never added to an automatically submitted voice turn. Each turn has a 2000-character limit and a one-minute capture limit. Voice mode is an explicit opt-in to this automatic submission behavior; the normal text-only **Share** action still works.

After the light response, enabled voice mode waits for **“Hi Dino”** on the visible page. Say the English wake phrase, **wait for the blue halo, then speak in your selected language**. Standby recognition uses English so a Chinese recognizer does not mishear the wake phrase as “海底捞”; the new turn switches back to Chinese, Korean or English as selected. **Talk now** also starts a turn. This is page-scoped browser recognition while voice mode is on, not an operating-system or always-on wake-word service. Browser recognition may stop or become unavailable, so the visible status and Talk now control remain the recovery path. **Turn voice off**, hiding the page or leaving it releases the current microphone capture and stops recognition; returning to a hidden page does not silently enable listening again. Voice errors leave typing available, and stale audio/recognition callbacks cannot revive a cancelled turn.

Listening is a temporary renderer layer: it does not change the selected emotional palette, color preferences or response library. During listening the underlying scene's clock is held; after sending, the current halo blends into the normal receipt/planning/emotion sequence. Cancelling or turning voice off restores the current scene. **Pause light** freezes the voice field too. USB output still requires an explicitly connected local lamp session and keeps the existing 8 fps transport limit, mapping and brightness cap; voice mode never claims a lamp or increases its brightness.

Recognition uses the browser's [SpeechRecognition API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition), including `webkitSpeechRecognition` where available. Live amplitude measurement uses [Web Audio](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) with a temporary microphone stream; it records no file and does not play microphone audio through the speakers. Availability, microphone permissions, language support and connectivity depend on the browser and speech service. Use the working Chrome page at `http://127.0.0.1:3000/` or an HTTPS deployment. Audio may be processed by the browser's online speech provider, including in **Local demo** mode and during enabled wake listening. This app adds no audio-upload endpoint, persistent transcript, API key or transcription library. Submitted text follows the existing OpenAI/local planner path. Unsupported or insecure browsers disable the voice feature while keeping text input usable.

## Arduino lamp · local USB

For the USB-connected lamp on this Mac, start the local service with:

```sh
npm run start:lamp
```

Requires Python 3 (the Mac's `/usr/bin/python3` is used by default; `HOUSEMATE_PYTHON` can select another interpreter). Open **http://127.0.0.1:3000/** in the browser you will actually use and click **Connect lamp** below the input. The status must say **USB lamp · following this page**. If another page owns the lamp, explicitly choose **Use lamp here** to transfer control; the old token, stream and queued frames are invalidated. Opening a page, focusing it or typing does not silently claim the lamp. After a refresh, connect again. **Light controls** opens the study's Arduino section for calibration. The lamp follows the exact same 256-pixel RGB buffer as this page, at up to eight acknowledged frames per second. The 20 light responses and their palettes are unchanged. One-pixel RGB tests hold until **Sync with page**. Rotation, zigzag rows, mirror and low brightness can be adjusted in the drawer. Close other serial monitors before connecting.

The installed firmware targets Nano / ATmega328P with **Old Bootloader**, D6, 256 WS2812B pixels and a separate regulated 5 V supply with shared ground. Brightness is capped at **3 / 255** while the supply rating remains unverified. Physical gradients are coarse at this limit; matching screen appearance requires later calibration. Firmware, protocol, power guidance and upload commands are in [hardware/README.md](hardware/README.md). Original board flash is backed up locally under the ignored `.local-hardware/backups/` directory.

Hardware control is opt-in through `HOUSEMATE_HARDWARE=1` and accepts only loopback requests from the same local origin. One page owns an in-memory token; no automatic port reconnection occurs. An authenticated HTTP stream keeps that page connected independently of browser animation and polling timers, which [browsers may throttle in background tabs](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API). A background page holds its current light; returning to it resumes page rendering. Closing/disconnecting sends off immediately, with a 4.5-second fallback grace after a broken stream; the firmware's separate watchdog blanks the lamp if Node or USB stops responding. The stream does not put its token in the URL or save it. `npm start` and Railway keep USB control disabled. A Railway service cannot access this computer's USB cable.

## AI and local demo

Use the existing ignored `API Key.txt`, or set `OPENAI_API_KEY` on the server. The key is never sent to the browser. `OPENAI_MODEL` defaults to the existing `gpt-6-sol`; `PORT` and `HOST` configure listening. Railway's `PORT` binds to `0.0.0.0` automatically.

The OpenAI Responses API returns a strict, bounded light plan, **not prose**. See [official Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses). All enums, numeric bounds, refusal, incomplete output, malformed JSON, timeout and upstream failure are handled. Model parameters are constrained again by local session preferences. `store:false` is used.

With no key, the page clearly labels **Local demo** and runs the same planner format and renderer entirely in the browser. Choose Local demo in Light study even when a key is configured. Local rules recognize representative Chinese, English and Korean phrases; this is a demonstration of known interaction routes, not unrestricted language understanding. Explicit boundaries, corrections, greetings and thanks are routed locally even in AI mode. Other messages use AI with up to ten prior user turns and validated light context.

On AI failure the light plays a separate interrupted-return gesture, offers **Retry AI**, and continues with a valid local response. The study drawer includes a no-network failure simulation to exercise this exact presentation path. It is not a timed reminder service.

## Response library

All 20 responses can be previewed without AI. Each catalog entry includes a design hypothesis, not a claim of proven comprehension.

Version 2.1 gives each response a more distinct path, composition and rhythm, with modestly stronger movement and shorter transitions. Everyday palettes use brighter chromatic pastels in place of muted gray mixtures. Celebrate keeps its original yellow/pink/peach palette, three expanding ripples and timing.

| ID | Internal name | Signature / ending |
| --- | --- | --- |
| B01 | idle | Slow edge wandering; stays available |
| B02 | acknowledge | One local cloud blooms and lifts slightly; receipt without agreement |
| B03 | processing | Two compact orbiting fields only while a real request is pending |
| B04 | greet | One outward open arc; returns to idle |
| B05 | affirm | Two sides join through a visible bridge; accepts a known choice |
| B06 | decline | Two upright fields part like gates and settle |
| B07 | clarify | Two offset regions alternate once; waits still |
| B08 | wait | Two areas gather into one quiet central pool |
| B09 | notify | Two local halos; ends |
| B10 | complete | Three regions dock together below the center |
| B11 | farewell | Slow retreat into the base; returns to idle |
| B12 | error | Soft cloud curves outward, hesitates and returns; retry available |
| R01 | empathize | Pause, then regions approach with a connecting stroke; holds |
| R02 | accompany | Traveling parallel breathing bands; continues when invited |
| R03 | soothe | Irregular angled flow settles into horizontal bands; holds |
| R04 | encourage | Three connected rising steps; supports an upcoming action |
| R05 | celebrate | Three controlled openings; brief, then idle |
| R06 | receive_thanks | One small local circuit in the same palette; restores prior stable state |
| R07 | withdraw | Edge motion decelerates to stillness; preserves color |
| R08 | repair | Diagonal sweep replaces the field; remembers session feedback |

A negative self-judgment routes to empathize, never agreement. General knowledge and unknowable future outcomes route to clarify rather than arbitrary yes/no. An explicit request for solitude takes priority over anxiety or other emotion words. Thanks after withdrawal returns to stillness. Returning or inviting company can start interaction again.

## Light study / workshop

The drawer is closed by default. It provides:

- Twenty direct previews, replay and hold; design hypothesis for each response.
- Eleven mixed palette families, seven single-hue palettes for explicit color requests and an achromatic fallback, each with misted / balanced / accented variations, one to four visible tones and a reproducible seed.
- Primitive, flow speed, amplitude, energy, duration, loop and color transition controls.
- Diffusion / crisp matrix view. Both consume the same **768-byte RGB frame**; the matrix is not a downsampled screenshot.
- Palette lock and release; session scenes with restore; current plan copy/export.
- Session-only likes, dislikes and suggested changes, exported only when requested. Exports include settings and intentionally entered workshop notes; conversation text is never automatically attached.
- AI/demo selection and simulated request failure.

Color corrections run locally in both AI and demo mode. “不要这个颜色” / “I don't like this color” / “이 색 말고” release the old palette lock and select a visibly different allowed palette. Rejected palettes are skipped in subsequent choices. Direct requests such as “换成粉色” / “make it blue” change only the current moment; they replace an old lock or conflicting old dislike without creating a new lock. The color remains while that moment settles, or while saying thanks or adjusting movement. A new emotional response starts its own catalog theme: “想要蓝色” then “我很开心” returns to the yellow/pink celebration theme. Only “保持这个颜色” / “keep this color” or the study's **Keep this palette** button keeps a palette across new emotions. “不要蓝色改成粉色，慢一点” applies the ban, requested pink and motion change together. Named color requests currently support blue, pink, purple, green, orange, red and yellow; this is not unrestricted RGB or multi-emotion color mixing.

Manual study previews also replace conflicting old color preferences so the selected palette is actually shown. Keeping a palette and restoring a saved scene retain the intended session preferences. If every chromatic hue is declined, a real gray palette keeps exported plans reproducible; a further rejection with no permitted alternative asks for clarification.

Motion feedback affects later plans. A short thanks preserves color. New moment cancels requests and invalidates late responses, clears text, preferences, scene memories and workshop notes. No database, account or analytics SDK is used. A microphone is optional and requested only for voice input. USB access uses the explicitly enabled local Node service. Refreshing closes the session; nothing is written to localStorage.

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
| `public/lib/hardware.js` | Explicit local USB session, latest-frame streaming and lamp controls |
| `public/lib/speech.js` | Browser recognition adapter, draft insertion and cancellation |
| `public/lib/dino-voice.js` | Opt-in Dino turns, five-second silence submission, page-scoped wake listening and voice UI |
| `public/lib/voice-audio.js` | Temporary microphone stream, real amplitude measurement and capture cleanup |
| `lamp-bridge.js` | Loopback-only lamp API, mapping, CRC packets, ACK flow control and browser lease |
| `hardware/serial_transport.py` | Exclusive POSIX serial I/O using Python standard library |
| `hardware/HousemateLamp/HousemateLamp.ino` | D6 WS2812B driver, bounded parser and disconnect watchdog |

Renderer uses elapsed time rather than frame counts, excludes paused/hidden time, captures the displayed frame for continuous transitions, and owns one cancellable render loop. Reduced-motion uses stable simplified compositions. A plan arriving while paused is queued without changing the displayed light. Resuming shows the latest valid plan. Hidden tabs stop rendering.

The shared RGB hardware boundary is row-major `(y * 16 + x) * 3 + channel`, channel order R/G/B, integers 0–255. The USB adapter maps this buffer into the physical chain order without changing semantic routing. Bluetooth output is not implemented.

## Deployment

Existing target stays **Railway**, repository `skkubaozuowen/Housemate-Lamp`, branch `codex/housemate`. Repository root, start command `npm start`, Node 20+, no build command. Keep the existing `OPENAI_API_KEY` service variable; never commit the key file. The HTTPS origin check supports Railway's TLS proxy. Static files are allowlisted, so credentials and server modules cannot be downloaded.

Public page: https://housemate-lamp-production.up.railway.app/

## Research limits and extension points

These palette/movement/timing combinations are prototype engineering choices. Whether people understand or prefer them remains to be compared in the designer workshop and, where appropriate, user research. They do not establish universal color meanings or health effects. The provided implementation brief motivates dimensions using Clark & Brennan (grounding), Reis/Clark/Holmes (responsiveness), Harrison et al. and Liu et al. (point-light expressiveness), Russell (affect), and Wilms/Oberfeld and Jonauskaite et al. (color associations). Their results are not validation of these specific 2D animations.

Reserved extensions, without current hardware dependencies: E01 propose/negotiate palette options; E02 direct attention inside the lamp surface; E03 recall a saved session scene; E04 shared waiting. Session scene recall is available in the study drawer. There is no cross-session memory.
