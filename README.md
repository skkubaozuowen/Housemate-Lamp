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

## Dino voice

Choose **Chinese**, **Korean** or **English**, then explicitly click **Talk to Dino** and allow microphone access. Chinese (`zh-CN`) is the default; Korean uses `ko-KR` and English uses `en-US`. A compact, irregular blue-and-green glow flows in the existing light field while Dino receives a turn. Gentle ambient motion continues in quiet moments; measured microphone amplitude adds expansion and color strength through the Web Audio analyser. It is generated as the same **16 × 16 RGB frame** used by the webpage, matrix preview and connected USB lamp, without a separate CSS sphere. Reduced-motion fixes the geometry while retaining amplitude-related color changes. Text input remains available alongside voice.

After a turn contains words, **two seconds of silence automatically submits its text** to the existing light planner. Continued speech resets the silence countdown; recognition can take up to another 1.2 seconds to finish its last words. **Send now** submits sooner; **Cancel turn** cancels the turn; **Type instead** returns to typing. Existing typed text is preserved separately during voice entry and is never added to an automatically submitted voice turn. Each turn has a 2000-character limit and a one-minute capture limit. Voice mode is an explicit opt-in to this automatic submission behavior; the normal text-only **Share** action still works.

After the light response, enabled voice mode waits for **“Hi Dino”** on the visible page. Say the English wake phrase, **wait for the blue halo, then speak in your selected language**. Standby recognition uses English so a Chinese recognizer does not mishear the wake phrase as “海底捞”; the new turn switches back to Chinese, Korean or English as selected. **Talk now** also starts a turn. This is page-scoped browser recognition while voice mode is on, not an operating-system or always-on wake-word service. Browser recognition may stop or become unavailable, so the visible status and Talk now control remain the recovery path. **Turn voice off**, hiding the page or leaving it releases the current microphone capture and stops recognition; returning to a hidden page does not silently enable listening again. Voice errors leave typing available, and stale audio/recognition callbacks cannot revive a cancelled turn.

Listening is a temporary renderer layer: it does not change the selected emotional palette, color preferences or response library. During listening the underlying scene's clock is held; after sending, the current halo blends into the normal receipt/planning/emotion sequence. Cancelling or turning voice off restores the current scene. **Pause light** freezes the voice field too. USB output still requires an explicitly connected local lamp session and keeps the existing 8 fps transport limit, mapping and brightness cap; voice mode never claims a lamp or increases its brightness.

Recognition uses the browser's [SpeechRecognition API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition), including `webkitSpeechRecognition` where available. Live amplitude measurement uses [Web Audio](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) with a temporary microphone stream; it records no file and does not play microphone audio through the speakers. Availability, microphone permissions, language support and connectivity depend on the browser and speech service. Use the working Chrome page at `http://127.0.0.1:3000/` or an HTTPS deployment. Audio may be processed by the browser's online speech provider, including in **Local demo** mode and during enabled wake listening. This app adds no audio-upload endpoint, persistent transcript, API key or transcription library. Submitted text follows the existing OpenAI/local planner path. Unsupported or insecure browsers disable the voice feature while keeping text input usable.

## Arduino lamp · local USB

For the USB-connected lamp on this Mac, start the local service with:

```sh
npm run start:lamp
```

Requires Python 3 (the Mac's `/usr/bin/python3` is used by default; `HOUSEMATE_PYTHON` can select another interpreter). Open **http://127.0.0.1:3000/** in the browser you will actually use and click **Connect lamp** below the input. The status must say **USB lamp · following this page**. If another page owns the lamp, explicitly choose **Use lamp here** to transfer control; the old token, stream and queued frames are invalidated. Opening a page, focusing it or typing does not silently claim the lamp. After a refresh, connect again. **Light controls** opens the study's Arduino section for calibration. The lamp follows the exact same 256-pixel RGB buffer as this page, at up to eight acknowledged frames per second. One-pixel RGB tests hold until **Sync with page**. Rotation, zigzag rows, mirror and low brightness can be adjusted in the drawer. Close other serial monitors before connecting.

The installed firmware targets Nano / ATmega328P with **Old Bootloader**, D6, 256 WS2812B pixels and a separate regulated 5 V supply with shared ground. Brightness is capped at **3 / 255** while the supply rating remains unverified. Physical gradients are coarse at this limit; matching screen appearance requires later calibration. Firmware, protocol, power guidance and upload commands are in [hardware/README.md](hardware/README.md). Original board flash is backed up locally under the ignored `.local-hardware/backups/` directory.

Hardware control is opt-in through `HOUSEMATE_HARDWARE=1` and accepts only loopback requests from the same local origin. One page owns an in-memory token; no automatic port reconnection occurs. An authenticated HTTP stream keeps that page connected independently of browser animation and polling timers, which [browsers may throttle in background tabs](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API). A background page holds its current light; returning to it resumes page rendering. Closing/disconnecting sends off immediately, with a 4.5-second fallback grace after a broken stream; the firmware's separate watchdog blanks the lamp if Node or USB stops responding. The stream does not put its token in the URL or save it. `npm start` and Railway keep USB control disabled. A Railway service cannot access this computer's USB cable.

## AI and local demo

Use the existing ignored `API Key.txt`, or set `OPENAI_API_KEY` on the server. The key is never sent to the browser. `OPENAI_MODEL` defaults to the existing `gpt-6-sol`; `PORT` and `HOST` configure listening. Railway's `PORT` binds to `0.0.0.0` automatically.

The OpenAI Responses API returns a strict, bounded light plan, **not prose**. See [official Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses). All enums, numeric bounds, refusal, incomplete output, malformed JSON, timeout and upstream failure are handled. Model parameters are constrained again by local session preferences. `store:false` is used.

With no key, the page clearly labels **Local demo** and runs the same planner format and renderer entirely in the browser. Choose Local demo in Light study even when a key is configured. Local rules recognize representative Chinese, English and Korean phrases; this is a demonstration of known interaction routes, not unrestricted language understanding. Explicit boundaries, corrections, greetings and thanks are routed locally even in AI mode. Other messages use AI with up to ten prior user turns and validated light context.

On AI failure the light plays a separate interrupted-return gesture, offers **Retry AI**, and continues with a valid local response. The study drawer includes a no-network failure simulation to exercise this exact presentation path. It is not a timed reminder service.

## Response library · version 3.9

The study drawer presents **five exchange signals and six everyday situations**. The same native light compositions are used by AI, local fallback, the matrix preview and USB output. The main layout and voice controls are unchanged.

| ID | Internal name | Signature / ending |
| --- | --- | --- |
| B01 | greet | A short, more legible blue-green opening; listening stays available and live voice continues to follow measured volume |
| B02 | acknowledge | The listening/current glow gathers and pulses once, carrying its colors into processing |
| B03 | processing | Two softly filled luminous balls split apart and orbit while a real request is pending, then unfold into the situation |
| B04 | clarify | A soft glow probes sideways, hesitates, returns and tries another direction, then pauses for a continuation |
| B05 | farewell | A gentle gathering gesture returning to ambient light |
| S01 | celebrate | Good news, joy and positive anticipation share warm expansion fading into blue/violet/mint twinkles on the original soft white ground; quiet recognition unfolds more slowly |
| S02 | setback | Violet/rose-red waves flow beneath differently sized red and blue glows that appear, drift and fade in staggered cycles; an expressed new attempt instead lets warm yellow enter, gradually take over, then leave softly twinkling gold/cream points |
| S03 | rest | A broad cyan veil opens and lowers into a spacious resting field; fulfillment retains a small warm region |
| S04 | upcoming | Nervousness or an expressed need for courage: a lightly wavering violet glow opens as peach/gold rises from within, then becomes a broad, steady warm breath |
| S05 | mixed | Luminous colors gradually replace one another along the existing gradient direction; contextual compositions retain feeling regions, and layered compositions add sparse glimmers |
| S06 | everyday | Three scattered warm pinpoints ripple once to mark receipt, then blend into two broad cream/apricot halos that separate, breathe and wander independently |

Examples: “虽然一个人过生日，但我真的很开心” celebrates; “生日很开心，但也有点孤单” keeps joy and loneliness together in S05. Solitude alone does not prove sadness; a bare or contrasting story stays open to contextual interpretation. “我明天生日”, “明天去领毕业证”, and “I got the job and start tomorrow” share good news, so a future-time word does not move them into S04. “明天发表，好期待” is also S01; “明天发表，好紧张” is S04, offering courage without predicting the outcome; “明天发表” is ordinary S06 narration when no emotion is expressed. Everyday sharing means ordinary narration without a clear positive/negative feeling, fatigue, tension, complex feeling or request for support. “今天下雨了” fits S06; “我好倒霉，下雨了” expresses a setback and belongs to S02. Familiar weather/meal words alone do not establish that a story is neutral: unfamiliar accounts remain open to AI interpretation. “很难受” retains blue-violet tides, while “很难受，但想再试试” lets warm yellow gently enter the violet field, become a warm glow, then resolve into sparse gold/cream twinkles. S04 has a single expression choice in Light study; legacy expression names and palette families remain readable in saved plans. Native S01, S02, S04, S05 and S06 finish their opening once and keep their finishing motion within the finite response interval. All ordinary situations then dissolve directly into the white basic lamp. Session boundaries, thanks, actual color corrections and legacy plan imports remain supported separately from the eleven previews.

S05 supports `mixedMode: paired | layered | open`, with bounded `feelingPrimary`, `feelingSecondary`, `feelingTertiary` and `feelingBalance` fields. Paired compositions connect two contextual gradients across one soft diagonal field; layered compositions carry up to three feelings through flowing wavy ribbons. Open compositions follow the original D05 design's continuous diagonal gradient, using its actual blue, aqua, pink and lime palette when the person describes an overall complex feeling without clear labels. Colors now travel along that diagonal and gradually replace their neighbors, using a reflected sequence to avoid an abrupt last-to-first color jump. Contextual compositions instead carry a traveling color ripple within their allocated feeling regions. Flow speed and amplitude control this motion, including the continuing tail; zero amplitude and reduced motion remain still. Open mode's legacy feeling fields are inert defaults, not an assertion that the person feels joy or sadness. Visual emphasis 0.5 gives comparable color presence; larger values give the first color region greater presence. It is a prototype composition choice, not a measurement of the person's feelings. Warm-only, cool-only and warm/cool pairings are available. Explicit color requests, kept palettes and declined hues still take precedence. Saved scenes and exports retain the full mode, color construction and rendered RGB values.

The trigger follows the account's meaning rather than counting emotional keywords. “生日开心，可没人一起庆祝，还是有些失落”, “终于毕业，开心又舍不得”, and an explicitly complex or hard-to-name emotional account can enter S05. Typical anticipation with nervousness stays in S04; fatigue with fulfilment stays in S03; a setback with willingness to try again stays in S02. Explicit happiness while alone stays in S01. The default Light study S05 preview uses the open, balanced composition.

Exchange transitions reuse the current colors and moving geometry: listening → receipt → pending processing → situation. The processing light appears only while a real request is outstanding; fast or local responses can proceed directly from receipt to the situation. A new voice turn blends the existing field into the measured-volume listening glow.

## Light study / workshop

The drawer is closed by default. It provides:

- Eleven direct previews, replay and hold; expression variants for contextual differences.
- Luminous mixed palettes, seven single-hue palettes for explicit color requests and an achromatic fallback, with misted / balanced / accented variations, one to four visible tones and a reproducible seed.
- Expression, primitive, flow speed, amplitude, energy, duration, loop and color transition controls.
- Diffusion / crisp matrix view. Both consume the same **768-byte RGB frame**; the matrix is not a downsampled screenshot.
- Palette lock and release; session scenes with restore; plan copy/export including the actual main and optional accent colors.
- Session-only likes, dislikes and suggested changes, exported only when requested. Exports include settings and intentionally entered workshop notes; conversation text is never automatically attached.
- AI/demo selection and simulated request failure.

## Finite replies and white basic light · version 3.10

Between exchanges the lamp is a steady, neutral white field using the same 768-byte RGB output as every expression. B01 has a 1.4-second opening and keeps a listening field; while voice recognition is active its subtle volume response continues until the two-second silence submission. B02 is a 0.85-second receipt. B03 uses a shorter 2.4-second orbit cycle only while a real request remains pending. B04 and B05 last 2.0 and 1.8 seconds and return to white; receipt and pending processing remain connected directly to the eventual response.

All eleven ordinary S01–S06 expressions play for 10–15 seconds, including their finishing motion. Their completion starts a two-second dissolve: the outgoing color fields keep moving while their contrast gradually fades into steady white, without a whole-lamp dimming stage. S01 celebration and S02 support retain the original soft white ground beneath their finishing stars; S02 also retains a faint warm resident glow. Paused time, hidden time and active voice input do not advance the underlying response clock. New speech, reset or a boundary can replace an outgoing fade without a later stale callback restoring it. Kept/declined color preferences remain available for the next expression, while the ordinary between-turn lamp stays white. Explicit manual Hold, color corrections and invited ongoing company retain their separate behavior.

## Contextual orchestration · version 3.9

The six situation families and their eleven contextual expressions now provide a visual vocabulary that the LLM can orchestrate for a particular utterance. The model's bounded speed, chromatic energy, movement amplitude, duration and transition values reach the renderer, together with a `composition` object: field size, spread, elongation, wave width/count, ripple count, spot count, accent size/presence, appearance spacing and support entry/strength. Only parameters meaningful to the chosen expression affect it. `stagger` controls spacing inside an animation; `transitionMs` remains the handoff between responses. The model may also choose an existing misted, balanced or accented palette variation; the family and basic color budget continue to come from the situation framework.

S01 ranges from quiet recognition to expansive celebration. S02 may retain the violet/red/blue waves or introduce warm support after acknowledgment, based on the account, its expressed intensity and the kind of response sought; saying “try again” is one route rather than a required password. An explicit request for listening or rejection of comfort retains the receiving expression. S03 keeps its fatigue/fulfilment distinction; S04 keeps its rising warm breath; S05 keeps open, paired and three-strand compositions; S06 keeps local opening ripples followed by two breathing, wandering lights. These variants are selected within the conversation, not offered as required choices to the person speaking.

The existing **Light study → Color & movement → Composition details** disclosure exposes relevant parameters for inspection and replay, including all three S05 modes. Use current light captures the actual AI settings. Save, restore and JSON exports retain the full composition, selected colors and timing. Library previews and Local demo retain the reference movement compositions with the current finite timing; open-ended parameter interpretation requires AI mode. Earlier saved plans without a composition object acquire the original defaults.

The planner interprets recognized words and conversation context, not microphone prosody. Listening's microphone-volume response is a separate local rendering layer. Energy adjusts colored-light presence in the existing diffusion model; it does not raise the physical lamp's current/brightness limit. The voice wake phrase, two-second silence submission and shared 768-byte RGB output remain in use.

Color corrections run locally in both AI and demo mode. “不要这个颜色” / “I don't like this color” / “이 색 말고” release the old palette lock and select a visibly different allowed palette. Rejected palettes are skipped in subsequent choices. Direct requests such as “换成粉色” / “make it blue” change only the current moment; they replace an old lock or conflicting old dislike without creating a new lock. The color remains while that moment settles, or while saying thanks or adjusting movement. A new emotional response starts its own catalog theme: “想要蓝色” then “我很开心” returns to the celebration theme. Only “保持这个颜色” / “keep this color” or the study's **Keep this palette** button keeps a palette across new emotions. “不要蓝色改成粉色，慢一点” applies the ban, requested pink and motion change together. Celebration stars are filtered hue by hue: declining blue can retain violet and mint. Named or explicitly kept palettes receive no extra hues. Pause, Hold light, reduced motion, boundaries and new input can stop or replace an ambient tail.

Manual study previews also replace conflicting old color preferences so the selected palette is actually shown. Keeping a palette and restoring a saved scene retain the intended session preferences. If every chromatic hue is declined, a real gray palette keeps exported plans reproducible; a further rejection with no permitted alternative asks for clarification.

Motion feedback affects later plans. A short thanks preserves the current lamp color. New moment cancels requests and invalidates late responses, clears text, preferences, scene memories and workshop notes. No database, account or analytics SDK is used. A microphone is optional and requested only for voice input. USB access uses the explicitly enabled local Node service. Refreshing closes the session; nothing is written to localStorage.

## Code boundaries

| File | Responsibility |
| --- | --- |
| `public/lib/catalog.js` | Five exchange signals, six situations, legacy defaults, timing and closure |
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
| `public/lib/dino-voice.js` | Opt-in Dino turns, two-second silence submission, page-scoped wake listening and voice UI |
| `public/lib/voice-audio.js` | Temporary microphone stream, real amplitude measurement and capture cleanup |
| `lamp-bridge.js` | Loopback-only lamp API, mapping, CRC packets, ACK flow control and browser lease |
| `hardware/serial_transport.py` | Exclusive POSIX serial I/O using Python standard library |
| `hardware/HousemateLamp/HousemateLamp.ino` | D6 WS2812B driver, bounded parser and disconnect watchdog |

Renderer uses elapsed time rather than frame counts, excludes paused/hidden time, captures the displayed frame for continuous transitions, and owns one cancellable render loop. Reduced-motion uses stable simplified compositions. A plan arriving while paused is queued without changing the displayed light. Resuming shows the latest valid plan. Hidden tabs stop rendering.

The shared RGB hardware boundary is row-major `(y * 16 + x) * 3 + channel`, channel order R/G/B, integers 0–255. The USB adapter maps this buffer into the physical chain order without changing semantic routing. Bluetooth output is not implemented.

## Deployment

Existing target stays **Railway**, repository `skkubaozuowen/Housemate-Lamp`, branch `codex/housemate`. Repository root, start command `npm start`, Node 20+, no build command. Keep the existing `OPENAI_API_KEY` service variable; never commit the key file. The HTTPS origin check supports Railway's TLS proxy. Static files are allowlisted, so credentials and server modules cannot be downloaded.

Auto deploy is currently disabled on this service. Publishing a pushed commit requires the existing Railway service's manual update; verify the served module matches the committed source before handing off the public page.

Public page: https://housemate-lamp-production.up.railway.app/

## Research limits and extension points

These palette/movement/timing combinations are prototype engineering choices. Whether people understand or prefer them remains to be compared in the designer workshop and, where appropriate, user research. They do not establish universal color meanings or health effects. The provided implementation brief motivates dimensions using Clark & Brennan (grounding), Reis/Clark/Holmes (responsiveness), Harrison et al. and Liu et al. (point-light expressiveness), Russell (affect), and Wilms/Oberfeld and Jonauskaite et al. (color associations). Their results are not validation of these specific 2D animations.

Reserved extensions, without current hardware dependencies: E01 propose/negotiate palette options; E02 direct attention inside the lamp surface; E03 recall a saved session scene; E04 shared waiting. Session scene recall is available in the study drawer. There is no cross-session memory.
