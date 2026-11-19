# Prototype validation

## Two-second voice silence threshold · 2026-11-16 · v3.8.1

Complete suite: **282 passed, 0 failed**. `git diff --check` passed.

- Changed the default voice silence threshold from five seconds to two seconds. Initial page help and active-listening captions now both say two seconds. Existing final recognition collection, wake listening, manual controls, text input and light compositions are unchanged.
- Updated existing fake-clock checks: no early finishing at 1,999 ms, finishing at 2,000 ms, continued speech resets the timer, unvoiced noise and final-only corrections do not reset it, and a turn submits once. All thirty voice tests passed. Browser confirmed “Auto-sends after 2 seconds of silence.” Screenshot: `outputs/housemate-v3.8.1-voice-two-seconds.jpg`.
- Static files are served fresh by the existing running local Node service, so no server restart or lamp disconnection was needed. No live microphone capture or physical lamp retest was performed.

## S02 flowing tide with passing red/blue glows · 2026-11-16 · v3.8.0

Complete suite: **282 passed, 0 failed**. `git diff --check` passed.

- Native ordinary S02 retains its violet/rose-red waves and adds five independently staggered diffused glows, using the selected palette's red and blue roles. Their sizes differ; each gently appears, expands, drifts and fully disappears before returning. Cycle positions and sizes change only while the glow is invisible. The finite opening still completes once while the waves and spot cycles continue.
- The default third swatch is now blue `#81B7FF`. Named/kept colors and smaller color counts use the same selected palette slots, so the renderer injects no hardcoded accent hues. The retry branch retains its previous geometry, violet/red opening, golden transition and warm star finish.
- A rendering regression isolates the blue role to verify visible appearance, complete fade and a later return; separate connected footprints verify different spot sizes. Existing monochrome checks retain the two tidal folds. Zero amplitude, reduced motion and smooth adjacent frames pass. Independent audit across three seeds through forty seconds at 60 Hz found a maximum channel step of 4/255. Renewal and the other ten visible native responses remained byte-identical to the pre-spots renderer; named single hues and gray remained intact.
- Actual RGB-frame animation and contact sheet: `outputs/housemate-v3.8-s02-waves-spots.gif` and `outputs/housemate-v3.8-s02-waves-spots-contact.png`. Browser screenshot: `outputs/housemate-v3.8-s02-waves-spots.jpg`.

The local service remains running at http://127.0.0.1:3000/. No deployment or repository push was made. No physical lamp or live microphone session was repeated.

## S02 violet and visible rose red · 2026-11-16 · v3.7.2

Complete suite: **281 passed, 0 failed**. `git diff --check` passed.

- Matched the requested reference's violet/rose-red color relationship with a clearly visible rose-red second tide, replacing the initially too-subtle rose-violet tint. The default opening pair is `#BDA3FC` and `#FF8494`; existing wave geometry, diffusion, rhythm and lifecycle are unchanged.
- Renewal begins with the same revised violet/red pair, then retains its existing golden transition and warm star finish. Other response palettes and render code are unchanged. Existing regressions verify the shared introduction, visible violet/red without a default golden transition, and the sparse warm renewal ending. Palette checks retain luminosity and hue exclusions.
- Browser: “我好倒霉，下雨了。” returned actual AI `setback` and displayed the revised diffused violet/red waves. Text and Talk to Dino remained available. Screenshot: `outputs/housemate-v3.7.2-s02-violet-red.jpg`.

The local service remains running at http://127.0.0.1:3000/. No deployment or repository push was made. No physical lamp or live microphone session was repeated.

## Situation boundaries and courage for nervousness · 2026-11-16 · v3.7.0

Complete suite: **281 passed, 0 failed**. Changed module syntax checks and `git diff --check` passed.

- S01 now includes positive anticipation. S04 is reserved for expressed nervousness, worry or a request for courage. A bare future presentation is S06 ordinary sharing. Current catalog labels, AI instructions, local fallback and Light study use these same meanings; older stored plan names remain readable.
- Fixed the rain/bad-luck misclassification: setback recognition covers expressed bad luck, frustration and ruined plans in Chinese, English and Korean. Weather and meal keywords no longer make an unfamiliar narrative locally authoritative as everyday sharing, so the AI can interpret its full meaning. Negated anticipation and nervousness have regression coverage. Server tests deliberately return incorrect upstream labels to verify the canonical boundaries, and verify that provisional everyday fallbacks do not override an AI-recognized setback.
- S04 is one twelve-second gesture: a softly wavering violet field opens at the sides as peach/gold warmth rises from within, then a broad, steady warm breath continues. It has no retry constellation or celebration ending. The renderer uses the effective selected palette throughout, with luminous white joins between violet and warm colors. One native S04 expression remains in Light study.
- Six actual configured AI calls returned the intended classes: bad luck in rain and a rain-ruined walk → S02; neutral rain and a bare presentation → S06; positive anticipation → S01; a nervous presentation → S04. Browser verification also confirmed actual AI S02 for “我好倒霉，下雨了” and S04 for a request for courage. Text input, Talk to Dino and the current layout remain available.
- Independent RGB audit: seeds 0, 4589 and 4294967295 sampled through forty seconds at 60 Hz had a maximum adjacent-channel step of 2/255. Warm breathing continued, with violet retained at the sides. Zero amplitude, reduced motion, seven named hues and seven single-hue bans passed. Across 3,160 unaffected response/voice frames, output matched v3.6 exactly, including S02 renewal, S05 and S06.
- Screenshot: `outputs/housemate-v3.7-s04-courage.jpg`. Actual RGB-frame animation and contact sheet: `outputs/housemate-v3.7-s04-courage.gif` and `outputs/housemate-v3.7-s04-courage-contact.png`.

The local service remains running at http://127.0.0.1:3000/. No deployment or repository push was made. No physical lamp or live microphone session was repeated.

## Warm renewal and one shared S04 choreography · 2026-11-16 · v3.6.0

Complete suite: **276 passed, 0 failed**. Changed module syntax checks and `git diff --check` passed.

- S02/default remains the same cool tide. S02/renew uses a twelve-second violet-to-yellow opening: warm yellow enters from the side, broadens through the violet field, then the violet recedes and the broad warm glow releases into seven sparse gold/cream points. The warm points continue twinkling with a faint warm resident glow. All colors come from the effective palette; the stars add no hidden finishing hues.
- S04 now has one connected twelve-second composition and one Light study expression option. A spacious violet current opens first; gold enters the same flow; a warm breath grows within it while violet remains around the edges. Tension, anticipation, a bare future event and encouragement requests all create the same default/horizon_glow profile. Existing saved expression names remain schema-valid and render through the same choreography; old palette families remain readable.
- Violet and yellow meet through a smooth luminous white shoulder rather than a muddy complementary RGB average. Renderer regressions verify cool acknowledgment, yellow entry, a warm phase and sparse moving stars, plus S04 coexistence, continuing breath, identical geometry for legacy expression names, soft frame steps, amplitude zero and reduced motion. Profile/HTTP tests verify that old S04 expression arguments and stale overrides cannot restore separate native variants.
- Four actual AI calls returned the intended profiles: retry after a setback → setback/renew/renewal_gold; bare presentation tomorrow, nervous presentation and anticipated meeting → upcoming/default/horizon_glow, all twelve seconds with four colors. Browser checks confirmed actual AI renewal and an actual tense/anticipatory S04 turn. Light study listed only “Uncertainty, anticipation & encouragement” for S04. Text entry and Talk to Dino remained available, with no captured console errors.
- Across 2,400 frames, all unaffected visible responses, including S02/default, S01, S05 and S06, stayed byte-identical to the previous renderer. Sampled voice frames were also byte-identical. Screenshots: `outputs/housemate-v3.6-s02-gold-stars.jpg` and `outputs/housemate-v3.6-s04-shared-current.jpg`. Actual RGB-frame animation/contact sheet: `outputs/housemate-v3.6-gold-horizon.gif` and `outputs/housemate-v3.6-gold-horizon-contact.png`.

The local service remains running at http://127.0.0.1:3000/. No deployment or repository push was made. No physical lamp or live microphone session was repeated.

## Selected S02/S04 framework expressions · 2026-11-15 · v3.5.0

Complete suite: **276 passed, 0 failed**. Changed module syntax and `git diff --check` passed.

- S02 selects two framework directions: blue-violet tides stay with discomfort; an explicitly expressed willingness to try again preserves the same initial tide, then aqua/mint waves grow through it. The renewal accent is a moving wave rather than the previous amber round fields. S04 selects three distinct expressions: neutral uncertainty uses violet tangential wisps around open space; anticipation uses rising warm streams; tension or a request for courage uses a broad warm apricot/rose breath. The local planner, AI prompt, profile palettes and study labels agree on these choices.
- Native S02/S04 keep their own gentle movement after their finite introduction, without restarting it. Tests cover once-only completion, one RAF, pause/hidden time, switching AI/demo without resetting time, new-input/repair/stop interruption, static manual Hold, zero amplitude and reduced motion. Rendered evidence covers the same cool first half of S02, gradual green emergence only for renewal, distinct S04 geometry even with the same color, violet negative space and clear warm breathing.
- Read-only audit across five seeds and five variants found continuous motion through forty seconds, including veil wrap points and duration boundaries. Maximum adjacent 60 Hz channel step was 4/255. Named blue, gray and declined hues remained valid through the normal preference path. Across 2,160 frames, all nine other visible responses (including the new S06 and S05), plus sampled voice frames, stayed byte-identical to the previous renderer.
- Five actual configured AI checks all returned source AI and the intended profiles: sadness → S02/default/dusk_indigo; wanting to try again → S02/renew/regrowth_glow; a bare upcoming presentation → S04/neutral/violet_current; anticipating a meeting → S04/anticipation/peach_amber; nervous presentation → S04/tense/apricot_rose. Browser verification used an actual nervous-presentation turn and an actual retry-after-setback turn. Text entry and Talk to Dino remain available.
- Screenshots: `outputs/housemate-v3.5-s04-courage.jpg` and `outputs/housemate-v3.5-s02-regrowth.jpg`. Actual renderer-frame comparison: `outputs/housemate-v3.5-s02-s04-flow.gif` and `outputs/housemate-v3.5-s02-s04-contact.png`.

The local service remains running at http://127.0.0.1:3000/. No deployment or repository push was made. No physical lamp or live microphone session was repeated.

## Distributed S06 acknowledgment · 2026-11-15 · v3.4.5

Complete suite: **276 passed, 0 failed**. Changed module syntax and `git diff --check` passed.

- S06 now opens with three scattered warm pinpoints and compact soft ripples. Each location answers once with a staggered smooth brightness envelope. The broad resident field enters gradually as these echoes fade, then the existing two large halos continue breathing and wandering. All opening shapes use the currently selected palette; no celebration colors or continuing sparkles are introduced.
- The renderer regression checks several distinct opening centers distributed across both matrix axes, a change in the leading response location, smooth adjacent frames, and the existing separated two-halo tail, motion controls and lifecycle. Comparison against the preceding renderer found 4,800 non-S06 frames and 446 S06 ambient-tail frames byte-identical.
- Browser: entered “今天去散步了。”, confirmed actual AI S06/everyday with its finite 4.2-second plan, and retained the main page after completion. Text entry and Talk to Dino remained available; no console errors were captured. Screenshot: `outputs/housemate-v3.4.5-s06-echo.jpg`. Actual RGB-frame opening/tail preview and contact sheet: `outputs/housemate-v3.4.5-s06-echo.gif` and `outputs/housemate-v3.4.5-s06-contact.png`.

The local service remains running at http://127.0.0.1:3000/. No deployment or repository push was made.

## Directional S05 color transport · 2026-11-15 · v3.4.4

Complete suite: **276 passed, 0 failed**. Changed renderer syntax and `git diff --check` passed.

- Open S05 now transports the existing blue/aqua/pink/lime palette along its diagonal axis. The continuous clock moves the color coordinate through a reflected sequence, so neighboring colors gradually replace one another without a final-to-first jump. The luminous soft mask, white edges and gentle curvature remain. Paired/layered compositions retain their feeling allocation while a traveling color ripple moves within the regions.
- Tests now check observable directional transport: chromatic features match positions farther along the diagonal several seconds later, more closely than their original or reverse positions. Other checks cover the palette passing through visible regions over time, continuous tails, soft matrix gradients, amplitude zero, reduced motion, explicit blue/gray palettes, declined intermediate hues and contextual emphasis. Across five sampled seeds and three modes over forty seconds, adjacent 60 Hz frames changed by at most one RGB channel step.
- Across 1,600 actual frames, all ten non-S05 visible responses, including the enlarged wandering S06, remained byte-identical to the preceding renderer. Layout, voice and API classification were not changed.
- Browser: entered “今天心里五味杂陈，说不清是什么感觉。”, confirmed source AI and S05/open, and checked the diagonal gradient on the main page. Text entry and Talk to Dino remained available. Screenshot: `outputs/housemate-v3.4.4-s05-color-flow.jpg`. Supplementary actual RGB-frame animation/contact sheet: `outputs/housemate-v3.4.4-s05-flow.gif` and `outputs/housemate-v3.4.4-s05-contact.png`.

The local service remains running at http://127.0.0.1:3000/. No deployment or repository push was made. The existing layered crest mask can still make an individual secondary/tertiary color very faint at a wave trough; this revision does not change that mask.

## Broader, independently wandering S06 · 2026-11-15 · v3.4.3

Complete suite: **276 passed, 0 failed**. Changed module syntax and `git diff --check` passed.

- The initial local glow now separates clearly into two larger halos, with final radii around .29/.275 of the field. Each follows a different slow two-dimensional path while continuing its gentle breathing. A minimum center spacing prevents the broad halos from merging into one indistinct mass; the opening still runs once.
- Read-only sampling across eight seeds and 1,792 frames from 4.2 to 60 seconds retained two distinct luminous centers, with chromatic coverage of 68–125 of the 256 pixels. Each center moved 3–4 LED columns and 5–6 rows. Additional default peach/amber palette samples also retained two centers. Adjacent 60 Hz frames changed by at most one RGB channel step in these sampled runs.
- Renderer regressions now cover broad coverage, visible separation, independent movement on both axes, continued breathing, smooth boundaries and static motion controls. Across 1,600 frames, the ten non-S06 visible responses remained byte-identical to the preceding renderer.
- Browser: entered “今天去散步了。”, confirmed AI S06/everyday and the finite native plan, then visually checked the enlarged separated warm lights after completion. Text and voice controls remained available; no console errors were captured. Screenshot: `outputs/housemate-v3.4.3-s06-wandering.jpg`.

The local service remains running at http://127.0.0.1:3000/. No deployment or repository push was made.

## S06 breathing finish · 2026-11-15 · v3.4.2

Complete suite: **276 passed, 0 failed**. Changed module syntax checks and `git diff --check` passed.

- S06's local acknowledgment plays once, then gently separates into two filled cream/apricot lights. Their brightness and radius breathe slowly with a small phase offset and minimal positional drift. The native scene and its clock remain active after completion; the opening does not loop.
- Tests cover two distinct luminous centers through the tail, continuous breathing, stable positions, a smooth completion boundary, bounded adjacent-frame changes, static zero amplitude and reduced motion, manual hold, one completion and one RAF, pause/hidden time, AI/demo switching, and interruption by stop, color correction or new input.
- Across 1,600 actual frames, all ten non-S06 visible responses remained byte-identical to the pre-revision renderer.
- Browser: entered “今天去散步了。”, confirmed source AI, S06/everyday, finite 4.2-second local_echo and nextState hold after the opening. The main page retained two warm soft lights; Talk to Dino and text input remained available. No console errors were captured. Screenshot: `outputs/housemate-v3.4.2-s06.jpg`.

The local service remains running at http://127.0.0.1:3000/. No deployment or repository push was made.

## Reference-based S05 appearance · 2026-11-15 · v3.4.1

Final complete suite: **275 passed, 0 failed**. Renderer/controller syntax and `git diff --check` passed. This revision changes S05 appearance and its default open palette; classification, layout and voice modules retain their existing behavior.

- Open S05 follows the original D05 co-design's continuous diagonal gradient and exact saved swatches: #42BAFF, #3EDBD6, #ED8ADE and #B5EB58. A single soft mask interpolates the colors along a rotated axis, with gentle curvature, breathing and white edges. Separate dense color clouds are removed.
- Layered S05 follows D04's broad flowing wavy ribbons with white gaps and sparse tiny glimmers. Paired S05 connects contextual gradients in one luminous field while retaining optional visual emphasis. Native finite openings still lead to moving ambient tails.
- Tests cover diagonal chromatic progression, luminous channels and white space, color presence in layered fields, continuous motion, reduced motion, pause/queued plans, handoffs, named hues and explicit gray. Optional declined-hue metadata is passed into the renderer and saved in exports. Gradient segments that would regenerate a declined hue instead pass smoothly through white.
- Across 1,600 actual frames, all ten non-S05 visible responses remained byte-identical to the pre-revision renderer. Voice frames were also byte-identical.
- Browser: reloaded the final local service, typed “今天心里五味杂陈，说不清是什么感觉。”, confirmed actual AI S05/open, and visually checked the continuous cyan/pink/lime gradient on the compact main page. Text entry and Talk to Dino remain available. No console errors were captured. Screenshot: `outputs/housemate-v3.4.1-reference.jpg`. Actual renderer-frame artifacts: `outputs/housemate-v3.4.1-s05-reference.gif` and `outputs/housemate-v3.4.1-s05-contact.png`.

The local service remains running at http://127.0.0.1:3000/. Live microphone capture and a physical lamp were not retested. No deployment or repository push was made.

## Interwoven feelings · 2026-11-15 · v3.4.0

Final complete suite: **272 passed, 0 failed**, including loopback HTTP, saved scenes, color preferences, voice, shared matrix/USB output and renderer lifecycle regressions. Changed app/research syntax checks and `git diff --check` passed.

- S05 now unfolds into two or three irregular color regions made from overlapping soft lobes. Each follows a different rhythm of translation, stretching and partial overlap, then continues at a gentler amplitude after the finite opening. There is no rigid orbit or repeated introduction. Existing B03-to-scene handoffs remain continuous. S01's native celebration was checked across 161 actual frames over twenty seconds and remained byte-identical to the previous renderer.
- `mixedMode` distinguishes paired, layered and open compositions. Paired preserves two concrete feeling strands; layered preserves three. Open responds to explicitly complex or hard-to-name feelings with comparable aqua, pink-purple and peach regions, rather than asserting which emotions are present. The retained legacy feeling fields in an open plan are ignored. Visual emphasis 0.5 gives balanced regions in both two- and three-region compositions; larger values can give the primary more area.
- Warm-only joy/hope, cool-only calm/sadness and warm/cool combinations are available. Tests check all three modes, independent motion through the ambient tail, smooth gradients, relative emphasis, named-color limits, hue exclusions, reduced motion, and paused behavior. New mode/tertiary information survives keeping a palette, receipt/processing, saving, restoring and exporting; no conversation text is added.
- The semantic boundary now keeps ordinary anticipation plus nervousness in S04, fatigue plus fulfilment in S03, and difficulty plus willingness to retry in S02. Explicit happiness while alone remains S01. Emotional layering, graduation joy with attachment, and explicitly complex or difficult-to-name emotional accounts can enter S05. The default S05 Light study preview is an open, balanced composition.
- Nine actual configured AI checks all returned `source:ai`: happy while alone → S01; birthday joy with disappointment → S05 paired joy/sadness/0.8; graduation joy with reluctance to leave → S05 paired joy/sadness/0.5; 五味杂陈 → S05 open; explicitly complex joy, disappointment and anticipation → S05 layered joy/sadness/hope/0.5; explicitly complex joy and anticipation → S05 paired joy/hope (all warm); presentation anticipation plus nervousness → S04 tense; tired but fulfilled → S03 fulfilled; difficulty plus wanting to retry → S02 renew.
- Browser: reloaded the final service, typed “今天发生了好多事，心里五味杂陈，说不清是什么感觉。”, and confirmed `source:ai`, `mixedMode:open`, four rendered colors and balanced emphasis in Light study. The main page visibly showed aqua, purple and peach diffusing together while text input and Talk to Dino remained available. No console errors were captured. Screenshot: `outputs/housemate-v3.4-interwoven.jpg`. Supplementary `outputs/housemate-v3.4-s05-flow.gif` and `outputs/housemate-v3.4-s05-contact.png` are generated from actual renderer RGB frames.

The local service remains running at http://127.0.0.1:3000/ with the original layout and Arduino connection controls. No live microphone or physical lamp session was retested in this revision. No deployment, GitHub push or Railway monitoring was started.

## Connected exchange and contextual mixed feelings · 2026-11-15 · v3.3.0

Final complete suite: **257 passed, 0 failed**, including real loopback HTTP integration, voice lifecycle, controller, preferences, serial bridge and renderer tests. `git diff --check` and changed app/research syntax checks passed.

- B03 now uses two softly filled luminous balls, with no hollow ring. B04 uses a single exploratory glow that probes, pauses, returns and tries another direction; the final quarter remains still while inviting more input.
- B02 inherits the listening/current scene's colors and carries them into real pending processing. Renderer handoffs continue the outgoing motion and unfold incoming geometry from the previous light positions. At the transition start the exact displayed frame is retained, including interruption during another transition. Fast/local results do not manufacture a processing delay.
- Transition tests cover B02/B03 into all six situations, exact native endpoints, one RAF, no blank frame, paused replacement, reduced motion and bounded 60 Hz frame changes. Independent frame checks found maximum per-channel steps of 4–7 across those transitions. S01's native celebration was compared over 241 frames across thirty seconds and remained byte-identical to v3.2.
- S05 now retains two contextual feeling gradients and a primary visual share between 0.5 and 0.9. Related colors within each glow form soft internal gradients; primary and companion differ in area and keep independent motion after the introduction. Tests verify stronger primary coverage, reversed feeling roles, spatial/temporal gradient smoothness and exact named/kept palettes with hue exclusions. Semantic pairs are included in saved scenes and exports; no conversation text is added.
- Solitude is separated from expressed loneliness. Explicit happiness while alone celebrates; explicit joy plus loneliness can be mixed. Bare/contrasting solitude stories stay open to contextual AI interpretation. Actual anticipation plus worry can also be mixed; wanting to calm down does not automatically invent a second current feeling.
- Real configured AI checks returned `source:ai`: “虽然一个人过生日，但我真的很开心。” → celebrate/apricot_rose; “生日很开心，但也有点孤单。” → mixed/joy/sadness/0.8; “有一点开心，但是特别孤单和难过。” → mixed/sadness/joy/0.8; “我生日了但是是一个人。” → mixed/joy/sadness/0.55. The final restarted service also returned mixed/anxiety/hope/0.65 for “对新的工作有些期待，也担心自己适应不了。”, and repeated the happy-alone celebration correctly.
- Browser: typed the happy-alone birthday and confirmed S01 with source AI in Light study; then typed the happy/lonely birthday and confirmed S05 joy/sadness/0.8 and four rendered colors. The main view visibly retained the large gold glow and smaller blue companion after the introduction. Talk to Dino and text input remain available; no console errors were captured. Screenshot: `outputs/housemate-v3.3-mixed.jpg`. `outputs/housemate-v3.3-transitions.gif` records actual LightRenderer frames for voice → B02 → B03 → S05/S01.

The final local service remains running at http://127.0.0.1:3000/ with the Arduino connection controls available. No physical USB lamp or live microphone session was retested in this revision; their existing protocol/lifecycle regressions pass. No deployment, repository push or periodic Railway monitoring was started.

## Soft gradients and distinct movement · 2026-11-15 · v3.2.0

Complete suite: **240 passed, 0 failed**, including loopback HTTP integration, controller, voice, hardware bridge and renderer regressions. `git diff --check` passed. The main layout and voice modules remain unchanged.

- S02 retains slowly folding blue-violet tides. S03 now lowers and broadens a sloping cyan veil, decelerating into rest; it no longer repeats the same pair of wave bands. Same-palette frame comparisons also distinguish their movement structures. Explicit ongoing companionship retains continuous motion.
- S05 uses related rose, peach and lilac-blue colors with broad overlapping fields and continuous independent movement. B02 is a blended local nod/ripple. B03 uses two feathered hollow rings orbiting with traveling highlights, at approximately 4.4 seconds per revolution with the default speed. Their related palettes use smooth color blending.
- B04 uses an incomplete arc that probes, hesitates, retreats, then tries another direction. Its final quarter is static before the waiting state. Frame tests verify both the hesitation and final pause; B03 loop seams remain continuous, while zero amplitude and reduced motion remain static.
- S01 rendering was compared across 160 frames over twenty seconds and remained byte-identical to the preceding version. Preference-controlled colors, S01/S05 moving tails, manual motion choices and shared 768-byte matrix frames remain covered.
- Browser: reloaded the running service and clicked all six changed Light study entries. The visible plans matched S02, S03, S05, B02, B03 and B04, including B03's 4500 ms loop and B04's 4200 ms finite waiting response. A synthetic “I'm home.” turn removed the welcome view; the B03 preview visibly displayed the two hollow halos on the main page. No browser console errors were captured. Screenshot: `outputs/housemate-v3.2-thinking.jpg`. The supplementary six-panel `outputs/housemate-v3.2-flow-preview.gif` uses actual renderer frames over ten seconds.

The local service remains running at http://127.0.0.1:3000/. No physical Arduino or live microphone session was retested in this visual revision.

## Living flow and good-news interpretation · 2026-11-15 · v3.1.0

Complete suite: **237 passed, 0 failed**, including HTTP integration, voice regression and renderer lifecycle tests. The main layout, CSS and voice modules are unchanged.

- S01 plays the opening once, fades out the warm wash, then continues nine independently twinkling and drifting points. Allowed finishing colors are blue, violet and mint; palette locks and individual hue exclusions still control the actual RGB colors.
- S05 retains independently moving/morphing warm and cool regions after its finite opening. Tail completion does not replace the native scene with hold; changing AI/demo preserves its elapsed time. New input, correction, pause, hold, withdrawal and reduced motion retain their intended controls. The renderer emits completion once and keeps one RAF while a tail is active.
- Rounded B02/B03 blue-cyan-violet fields replace the flattened processing shape. Local color weighting reduces broad gray mixtures where different hue regions overlap while preserving soft brightness coverage. Voice halo RGB generation is unchanged.
- Good-news meaning precedes a generic future-time cue across birthdays, graduation, reunion and job acceptance. Unfamiliar future stories remain open to AI classification. Negative/mixed birthdays and nervous upcoming events retain their respective responses.
- Real configured OpenAI checks: “我明天生日” → S01; an unfamiliar synthetic story about moving into a long-awaited new home tomorrow → S01; nervous presentation tomorrow → S04 tense. All returned `source:ai`.
- Browser: an actual typed future birthday returned AI celebration; after its eight-second opening the main page displayed the separate blue/violet/mint glimmers, with the plan still native and finite. A following mixed-feeling birthday returned AI S05 and retained its moving color regions after the opening. No browser console errors were captured; Talk to Dino remained available. Screenshots: `outputs/housemate-v3.1-celebration.jpg` and `outputs/housemate-v3.1-mixed.jpg`. The supplementary `outputs/housemate-v3.1-flow-preview.gif` is generated from actual renderer frames for S01 and S05 over twenty seconds.

The local service remains at http://127.0.0.1:3000/. This session did not retest a physical Arduino or capture live microphone speech.

## Situation framework · 2026-11-15 · v3.0.0

Final complete suite: **227 passed, 0 failed**, Node 24.21.0, including actual loopback HTTP integration. `git diff --check` passed. No dependency installation or build step was added.

- Five exchange signals and six everyday situation families, with bounded expression variants. Tests cover quiet recognition, setbacks with/without an expressed new attempt, fatigue with fulfilment, tense/positive/neutral upcoming events, and simultaneous positive/negative feelings.
- Temporary named colors yield to a new emotional scene; explicit palette keeping, hue exclusions, combined corrections, cancellation and stale-result protection remain covered. Late celebration accents obey the effective color preferences and exports record their actual RGB values.
- Deterministic RGB checks cover distinct spatial and temporal signatures, simultaneous warm/cool regions through the ending, the clarification pause, finite endpoints, continuous invited companionship, and reduced motion.
- Existing speech/voice lifecycle, five-second silence submission, English wake phrase with selected-language handoff, measured-volume halo, shared matrix/USB frames and serial bridge tests pass. Voice modules and main-page CSS were not changed.
- Actual configured OpenAI requests returned `source:ai`: synthetic birthday-with-loneliness-and-joy → `mixed / bittersweet / mixed_warm_cool`; synthetic nervous presentation → `upcoming / tense / sea_glass`.
- Browser: all eleven preview buttons returned their corresponding response plans. Switching S02 to Ready to try again loaded `renew / recovery_glow / 4` and replayed. An actual typed mixed-feeling turn completed through AI on the main page. The compact layout retained text input, Talk to Dino, language choice and lamp controls, with distinct warm/cool fields visible together. Screenshot: `outputs/housemate-v3-mixed.png`.

The local service is running at http://127.0.0.1:3000/ with USB control available. No USB board was detected in this session, so physical-lamp response was not retested. Live microphone recognition was not repeated; its behavior is covered by the existing regression tests. No deployment or periodic Railway monitoring was started.

## Initial automated checks · 2026-10-21

`npm test`: **36 passed, 0 failed** on Node 24.21.0. No dependency installation or build is necessary. Local HTTP integration tests require permission to bind a loopback port in the Codex sandbox; the complete suite was run successfully with that permission.

- Multilingual representative scenarios: arrival, invited company, sharing sadness, requested soothing, support before a presentation, completed paper acceptance/birthday, thanks, boundaries, correction, palette dislike/lock, limited yes/no, ambiguous reference, farewell and knowledge questions.
- Explicit solitude overrides nervousness; negative self-evaluation does not become affirmation; unknown future outcomes do not become fabricated yes/no answers.
- Receipt → real pending processing → response; immediate local routes do not manufacture a processing delay.
- New input aborts old requests; late replies cannot take control. Empty input does not interrupt a scene.
- Thanks after withdrawal preserves color and returns to stillness; returning home reopens interaction.
- Slower feedback changes subsequent plans and survives returning to accompaniment and AI/demo switches.
- New moment clears history, preferences, saved scenes and feedback and invalidates in-flight responses.
- Strict JSON shape/ranges/enums; unknown/missing/extra fields; malformed JSON, refusal, incomplete generation, upstream rejection, transport failure, deadline and client-disconnect abort.
- No-key explicit demo, demo-only no-network operation, local priority routing and secret/static-file boundary.
- AI suggestions are constrained to catalog motion/closure and a bounded finite duration.
- Each of 20 catalog scenes produces deterministic, finite 768-byte RGB data. All 11 families and 3 variations respect banned hue groups, including conflicts with locks.
- Frame comparisons distinguish receipt/acceptance, decline/error, company/solitude, encouragement/celebration and waiting/processing. This verifies distinct rendering signatures, not that viewers reliably understand them.
- One renderer RAF, captured-frame transitions, finite endpoint freeze, static/reduced-motion energy saving, paused plan queue, pause/resume time continuity and hidden-time exclusion.

`node --check` on the changed browser modules and `git diff --check` also passed.

## Browser checks actually run

Codex in-app Chromium preview at localhost:3000:

- Desktop 1280 × 900 and phone 390 × 844: brand, open space, diffused color fields, composer, footer and research drawer checked visually. No horizontal overflow; phone drawer fits the viewport. This is a viewport simulation, not a physical iPhone/Safari test.
- Real configured OpenAI request using Chinese “今天有点紧张，想缓一缓。” returned a valid soothe plan; research source showed `ai`. Main page showed only the user's moment and light, without an AI reply or emotional analysis card.
- All 20 response buttons clicked individually; each produced the expected responseType in the visible plan JSON.
- Finite Celebrate modified to 1 second, allowed to complete, then replayed: selected study and edited duration stayed intact while the live scene returned to idle.
- Main diffusion/matrix switch and 16×16 research canvas checked.
- Accompaniment paused: two screenshots taken apart were byte-for-byte identical. Resume control returned to Pause light. Time continuity and paused network completion are additionally covered by automated tests.
- Explicit demo selected and Chinese anxiety-plus-solitude sent: withdrawal took priority. Thanks-after-solitude path checked in combination with lifecycle tests.

Further manual export, failure-preview and deployment observations are appended below if performed. Browser tests use synthetic demonstration phrases, not personal disclosures.

## Remaining research / platform limits

At this original baseline no physical LED matrix was connected; the v2.2.0 USB validation below supersedes that limitation. Optional microphone dictation was added in v2.3.0 below. Diffusion is an approximation produced from the same 16×16 logical frame. No account, database, analytics or cross-session memory has been added. Palette, timing and movement meanings remain prototype hypotheses pending workshops and user studies. Local rules cover representative Chinese/English/Korean routes; unrestricted interpretation depends on the configured AI and is not guaranteed by demo-mode tests.

## Final manual follow-up

- Export plan downloaded a valid JSON file. It contains only the versioned light-plan fields and no text/history field.
- Simulated failure visibly showed the failure-preview label, interrupted-return state and Retry AI button. Retry cleared the banner and completed into a waiting-for-input light state.
- Final multilingual refinements also tested: “keep this one” / “就保持这样” / “이대로” keep the current palette; “don't leave me alone” invites company; “tired” does not become a red-color ban.

## Color correction baseline · 2026-10-22 · v2.0.1

`npm test`: **55 passed, 0 failed**, including HTTP integration; changed JavaScript syntax checks and `git diff --check` passed. The original interaction/renderer/cancellation checks remain included.

- Current-color rejection is a deterministic local R08, including after keeping a palette; replacement is selected by actual RGB/hue difference and remembered across later turns.
- Seven single-hue palettes are verified through all variants and the actual white-mixed RGB rendering. A separate gray family makes all-hue exclusion reproducible from an exported plan alone.
- Combined bans, positive selection and motion feedback work in one turn; contrastive wording such as “Use blue, not pink” does not reverse the desired hue. Representative unrelated clothing/color-metaphor statements do not alter color preferences.
- Named requests replace old locks and conflicting older dislikes. An older pending AI response cannot undo a newer correction. Manual previews override an old palette lock; saved-scene restoration retains saved preferences.
- Real local HTTP chain: “换成蓝色” → “保持现在的颜色” → “不要这个颜色” → “不要蓝色改成粉色，慢一点”. The corrections returned `local_rule`; actual swatches changed blue → warm coral → pink, with speed scale 0.65. A following real OpenAI request, “今天过得很开心”, returned `source:ai`, `celebrate`, and retained the requested pink and speed preference.
- In-app Chromium browser: verified manual pink preview overriding a blue lock, then keeping pink and sending “不要这个颜色” visibly changed it to warm coral. Verified the combined no-blue/pink/slower input against the current-plan JSON, actual swatches and preference text. Captured before/after screenshots in `/private/tmp/housemate-color-before.png` and `/private/tmp/housemate-color-rejected.png`.

This update repairs direct color control. Multi-emotion weights, unrestricted color generation and the previously discussed R03/R04 priority are not implemented by this patch.

## One-moment color requests · 2026-10-22 · v2.0.2

This section supersedes v2.0.1's automatic keeping of a requested color. `npm test`: **59 passed, 0 failed**; planner/API syntax and diff checks passed.

- A direct named color changes the current scene without creating a palette lock. Settling, thanks, waiting, solitude and motion corrections retain that scene's palette.
- A new emotional response uses its original catalog theme, balanced variation and three tones, unless a palette was explicitly kept. Server validation prevents old color requests in AI history, or a model-selected old blue/one-tone palette, from overriding this rule. Existing hue exclusions and rejected palettes remain respected.
- Explicit “保持这个颜色” works both as a follow-up and in the same input as a new named color. A new temporary color releases an older lock. Manual Keep and saved-scene preferences retain their existing behavior.
- Real configured AI/API chain: “想要蓝色” returned `named_blue` with no lock; “我很开心” returned `source:ai`, `celebrate`, `apricot_rose`, balanced, three tones and no lock. Repeating blue, then explicitly keeping it, caused the next real AI celebration to retain `named_blue` as requested.
- Browser UI confirmed the same blue → new happy moment sequence, with source `ai`, an unlocked palette and the original yellow/pink/peach swatches. Screenshots: `/private/tmp/housemate-temporary-blue.png` and `/private/tmp/housemate-new-joy-after-blue.png`.

## Clearer motion and brighter palettes · 2026-10-22 · v2.1.0

`npm test`: **65 passed, 0 failed**, including the HTTP suite. Changed JavaScript syntax checks and `git diff --check` passed.

- All 20 responses have distinct spatial compositions and timing signatures. Fourteen easily confused pairs were compared at five progress points with identical colors, seed, energy, speed, amplitude and duration; this checks sustained RGB differences rather than relying on palette changes. It does not establish human recognition of all 20 meanings.
- Celebrate's original catalog defaults and Apricot & rose swatches are unchanged. Eight fixed-color reference frames, including its endpoint, match the pre-change SHA-256 hashes exactly.
- Nine everyday mixed palette families now use luminous chromatic pastels. Across all three variations their main colors have RGB channel spread (maximum minus minimum, divided by 255) at least 0.10 and relative luminance at least 0.38. Named color choices, Celebrate and explicit achromatic fallback retain their original swatches. Processing now defaults to Sea glass rather than Neutral haze.
- Modest increases to energy/amplitude and shorter transitions make other responses more apparent without changing their durations, completion states or finite/loop behavior. Zero amplitude removes processing orbits, accompaniment breathing and thanks orbital travel; default movement remains visible.
- Regression checks retain one RAF, pause/hidden-time continuity, static reduced-motion compositions, custom hold, finite endpoint freeze and all existing temporary-color/explicit-keep behavior. An independent read-only review also checked all 20 reduced-motion and hold scenes and each finite scene at its endpoint and 60 seconds later.
- In-app Chromium: previewed R01, B03, B05, B10, R03, R04, R08 and R05; checked actual visible plan JSON and swatches. Main diffusion visually distinguishes the compact processing field from wide calming bands and the connected empathy field. Celebrate still uses the original three colors, amplitude 0.75 and 4.2-second duration.
- Phone viewport 390 × 844: accompaniment preview, text, input and footer remain visible with document width 390 and no horizontal overflow. Desktop layout remains unchanged. This is browser viewport simulation, not a physical phone test.
- Captured `/private/tmp/housemate-v2.1-brighter-empathy.png`, `/private/tmp/housemate-v2.1-processing.png`, `/private/tmp/housemate-v2.1-soothe.png` and `/private/tmp/housemate-v2.1-phone.png`. The animated overview `/private/tmp/housemate-motion-overview.gif` renders actual 16×16 RGB frames for all 20 default scenes at real timing; it is a source-frame comparison, not a recording of controller transitions.
- At the user's request the `housemate` Railway heartbeat was set to **PAUSED**. This visual revision was tested locally; no Railway deployment was attempted.

## Softer receipt and retry · 2026-10-22 · v2.1.1

`npm test`: **66 passed, 0 failed**, including HTTP integration. Renderer/catalog syntax checks and `git diff --check` passed.

- B02 replaces the cross-screen capsule with overlapping round Gaussian fields: one local bloom, a slight upward nod and a soft fade. Its duration is 1.2 seconds with a 260 ms transition, giving the receipt more room than the previous 850 ms pass.
- B12 replaces broken strokes and the sudden strength drop with a continuous light cloud. It curves outward, diffuses during a short hesitation and returns on a gentle arc. Its duration is 2.6 seconds with a 420 ms transition. Retry, waiting and fallback behavior remain covered by controller/API tests.
- A new displayed-RGB continuity regression checks adjacent 60 Hz frames at defaults and maximum energy/amplitude/speed. Each pixel channel must change by no more than 12 and the average field change by no more than 2 per frame. This guards abrupt dimming or reappearance, rather than asserting implementation-specific shapes.
- Independent read-only review checked continuity at the hesitation/return boundaries, finite endpoint freeze and reduced-motion stillness. The existing exact Celebrate reference hashes and response-pair distinction checks pass.
- Actual in-app Chromium previews verified B02 and B12 plan JSON, durations and soft diffused compositions. Screenshots: `/private/tmp/housemate-soft-b02-browser.png` and `/private/tmp/housemate-soft-b12-browser.png`. `/private/tmp/housemate-soft-signals.gif` compares their actual 16×16 RGB frames at original playback speed; it is a source-frame preview, not a controller-transition recording.
- Local server restarted with v2.1.1. The Railway heartbeat remains paused; no Railway deployment was attempted.

## Local Arduino USB integration · 2026-10-25 · v2.2.0

`npm test`: **99 passed, 0 failed**. Original 66 tests remain, including the byte-identical Celebrate reference frames. Added nine browser bridge tests, seventeen protocol/service/HTTP tests and seven real POSIX pseudo-terminal transport tests. The latter exercise actual OS byte transport, partial writes, EAGAIN, unplug and bounded queues; they do not substitute for LED checks.

- User confirmed WS2812B and a connected separate power source. The supply's rating is still unknown. DIN is D6, 256 configured pixels, RGB logical frames, physical NEO_GRB / 800 kHz. Firmware and server cap brightness at 3 / 255; physical gradient precision is correspondingly limited.
- avrdude successfully read signature `1E 95 0F` using the Nano Old Bootloader upload rate 57600 baud. Original 32768-byte flash was read to the ignored local backup before upload. Existing Arduino AVR core 1.8.7 and Adafruit NeoPixel compiled the sketch: 5164 bytes flash, 252 bytes static SRAM plus 768-byte runtime NeoPixel buffer. Arduino CLI uploaded successfully.
- Actual USB protocol at 115200 baud returned the expected READY identity and matching hello, off, ping and RGB-frame acknowledgements. Browser status showed 173 acknowledged frames before calibration. Port-open alone is not treated as success.
- The one-pixel red test was held with independent browser heartbeats; the user explicitly confirmed “有一颗红灯亮着”. After Sync with page and an R05 Celebrate preview, the user confirmed “能看到灯光在变化”. This verifies visible light changes, not every pixel's orientation or exact chromatic match.
- Browser Light study exposes connect/disconnect, RGB/off tests, brightness, serpentine rows, rotation, mirror and resume sync. Frames are copied from the displayed post-transition renderer buffer, latest-only, up to 8 fps, with one frame HTTP request and one serial packet in flight. Temporary busy responses keep ownership and retry the latest image. Settings/tests wait for the active frame ACK.
- Physical control is disabled unless explicitly enabled, restricted to loopback/local Host and matching Origin, exact JSON/binary content types and an in-memory owner token. Tests cover hostile origins/hosts, Unicode/incorrect tokens, non-enumerated ports, frame lengths, CRC, all matrix orientations, handshake failures and serial removal. Public config remains availability-only; key files, firmware backups and server sources stay outside the static allowlist.
- Browser leases run independently of RAF, including pause and finite endpoints. Lease expiry queues off then closes; the firmware also has a four-second watchdog. Automated tests verify these paths; a complete physical power-loss/watchdog timing study has not been performed.
- The service runs locally with `npm run start:lamp`. Railway USB remains disabled, and its paused monitoring/deployment state was not changed. Precise front-panel orientation, green/blue channel checks, photometric matching and higher brightness remain physical calibration tasks after identifying the power supply.
- After restarting the final service, the in-app browser submitted the synthetic text “今天是我的生日，我很开心。”; Light study showed `source: ai`, R05 Celebrate and Apricot & rose while the actual USB frame counter continued increasing. Saved `/private/tmp/housemate-arduino-connected.png` with connected status and 472 acknowledged frames. This screenshot is software connection evidence; the user's observations above are the separate physical-light evidence.

## Keep the lamp connected in background pages · 2026-10-25 · v2.2.1

`npm test`: **110 passed, 0 failed**. JavaScript syntax and diff checks passed. No firmware or wiring change was needed.

- The reported dark lamp still had a running local service and an enumerated USB board. Server status showed 951 acknowledged frames followed by `The page disconnected. Connect again to resume.` The original owning page remained open and showed an expired token. This identifies a browser lease timeout; it does not establish a power or LED failure. The old 4.5-second lease depended on a one-second browser interval whose requests allowed a five-second timeout, making ordinary scheduling stalls enough to close ownership.
- Replaced interval polling with an authenticated, same-origin streaming POST lease. Its header handshake is bounded to five seconds, then the healthy stream has no total timeout. Node keeps the serial watchdog alive independently of browser RAF/timers while the stream remains connected. A hidden page holds its displayed light. Closing the page, explicit disconnect, USB failure or service shutdown still releases ownership and turns the lamp off. No automatic port reconnection, saved token, query-string credential, public USB access or higher brightness was added.
- Six new backend tests use real loopback HTTP streams with fake serial devices to cover a 60-second timer gap, replacement/late cleanup, closure grace, disconnect, USB failure and authorization. Five additional client tests cover stream setup failure, malformed non-stream responses, timeout, EOF and stale cancellation; the held-output regression now advances three minutes with no polling or animation.
- Restarted the actual local service with the fix and reconnected the same persistent browser page. API confirmed `leaseConnected:true`. After Hold light, the real frame counter stayed at 96 for 24 seconds while Arduino ACK timestamps advanced at six-second observations. The connection remained ready with no error, demonstrating physical keepalives without new RGB frames. The user then explicitly confirmed “已经亮了”. Exact physical color/orientation and high-brightness calibration retain the v2.2.0 limits.

## Follow the page the user is actually using · 2026-10-25 · v2.2.2

`npm test`: **120 passed, 0 failed**. Syntax and diff checks passed. No firmware, brightness or power changes.

- On the follow-up report, the lamp was connected, its stream was live, and `testColor` was null. Its owner was still the chat's study preview. The user confirmed working in Chrome/Safari. Native Chrome inspection then showed an older local page without the new connection control; it was not the page sending the lamp's frames. A lit, acknowledged lamp therefore did not prove the user's other page was controlling it.
- Added a small main-page USB status and **Connect lamp / Use lamp here / Light controls** action, including states for another page, pause and calibration hold. The research drawer exposes the same explicit transfer action. Focus and visibility refresh status only; they never claim a serial port. Read-only status responses are guarded against connection-generation and status-revision races.
- Explicit takeover validates the USB target first, then serializes off, waits for the old transport process to release its exclusive device, and establishes the replacement firmware handshake/token. Concurrent claims are rejected. Old tokens, streams and requests waiting behind a ping cannot send frames into, clear flags on, or revoke the new session. An unavailable target leaves the existing lamp untouched. Server shutdown and failed-ping teardown also retain a pending-close promise until the device is released.
- Added six backend takeover cases and four client cases, retaining the original renderer, palette, heartbeat-stream, CRC, origin and body validation regressions. Takeover's asynchronous and malformed-input paths use fake serial devices with real loopback HTTP, not another physical upload.
- Disconnected and closed the chat's test tab. In the user's actual native Chrome window, opened `http://127.0.0.1:3000/`, clicked the visible main **Connect lamp**, and verified **USB lamp · following this page**. The local API showed READY, a live page lease and 69 acknowledged frames shortly after connection. Entered “想要蓝色”, submitted it, then entered and submitted “换成粉色” in that same Chrome page. The user explicitly confirmed “有，已经跟着变色了”. Native screenshot saved as `/private/tmp/housemate-chrome-lamp-following.png`, showing the pink response and current-page status. The native Chrome page remains the owner; no chat test page is left holding the device.

## Optional speech-to-text input · 2026-10-27 · v2.3.0

`npm test`: **142 passed, 0 failed**. All original 120 light/hardware tests remain, with 22 new speech/controller/DOM adapter tests. Syntax and diff checks passed.

- Added Speak/Stop, an accessible language selector (Chinese default, Korean, English), a live recognition status and a concise online-audio-processing notice. The existing composer, Share action, responsive styling, response catalog and lamp ownership controls remain in use. The browser's standard or prefixed SpeechRecognition is detected without constructing or starting a recognizer on page load. Unsupported/insecure contexts retain typed entry and Share.
- Voice results update only an editable draft and the existing character counter; no result handler calls the planner or submits a form. Cumulative results are rebuilt so provisional words can be corrected or removed without duplication. Selected text replacement and the combined 2000-character limit are covered. Repeated results at the limit do not abort a pending corrected final result.
- Tested explicit start, language configuration, Stop with late final events, cancellation/old-generation isolation, pending-permission cancellation, limit handling, error messages and no silent restart. Capture has a one-minute bound and a three-second fallback for a stalled Stop. DOM tests cover prefixed browsers, manual edits, background, Escape, language changes, listener cleanup and programmatic draft updates without self-cancellation. App reset, examples, Share, Retry AI and page exit cancel capture.
- Browser speech may send audio to its speech provider even in Local demo mode. No raw recording, audio endpoint, transcription SDK or extra API key was added; planner requests remain text-only on explicit Share. Public privacy copy was qualified to avoid implying browser dictation is necessarily offline.
- Started the updated local service and opened the actual native Chrome page at `http://127.0.0.1:3000/`. Verified the enabled microphone control, Chinese selection and processing notice. The user started the microphone and Chrome displayed Listening; the user then explicitly confirmed “能，已经识别成文字”. No agent-generated or simulated audio was used to claim this result. Additional automated cases use a fake recognizer and do not establish real Korean/English recognition quality.
- The native Chrome page subsequently showed the recognized greeting as a submitted moment, the microphone inactive and Speak restored. Saved `/private/tmp/housemate-voice-chrome.png` showing the real browser, voice controls and processing notice. In a separate temporary preview, verified the Korean and English menu selections without opening its microphone; closed that preview afterward. No temporary page claimed the Arduino.
- The Arduino was not connected during this voice update (no USB ports enumerated), so the existing physical lamp setup was left untouched. Voice capture is not emotion analysis of tone/prosody and does not add spoken AI replies; it feeds the same existing text-to-light planner after manual Share.

## Dino conversational voice · 2026-10-27 · v2.4.0

`npm test`: **188 passed, 0 failed**, retaining the original 142 tests and adding 30 Dino state-machine, six DOM integration, nine real-amplitude/microphone-lifecycle and one static-module access test. Automated microphone/recognition cases use injected test devices and do not establish real speech recognition quality.

- Explicit Talk to Dino enables a visible browser session. A separate blue orb uses measured, DC-corrected microphone RMS through Web Audio; no audio reaches a speaker destination or recording file. The meter is limited to 30 samples/second, with level smoothing and a reduced-motion brightness cue. Captured PCM is transient and never sent to the Node server.
- A nonempty voice turn reaches finalization after five seconds without voice activity. Recognition can supply changing interim speech as a fallback for soft speech; late final corrections do not extend the quiet deadline. Finalization accepts up to 1.2 seconds of final recognition results, then calls the same existing text-to-light controller once. One-minute/2000-character turn limits, empty turns, stale events and delayed submission completions are covered.
- After submission, English standby recognition accepts an utterance-prefixed Hi Dino, strips it and opens a new turn. The new recognizer switches back to the selected content language after a short guarded handoff; users wait for the blue orb before speaking content. Ordinary ambient speech, narrative mentions and a wake-only utterance are not sent to the planner. Cumulative results, split wake segments and corrected interims do not duplicate words or turns. Normal service timeouts preserve standby; repeated immediate disconnects produce a recoverable error instead of a rapid restart loop. Tests cover cross-language handoff cancellation and stale English callbacks.
- Typed drafts remain separate, unchanged and never part of voice auto-submission. Typing, turn cancellation and explicit manual turn changes invalidate the prior capture. Off, Escape, New moment, page hiding and exit release microphone/recognizer resources and timers. Returning to the page requires an explicit new enable. Permission delays, microphone disconnect, suspended audio and recognition/network failures are covered by cleanup tests.
- The actual native Chrome page at `http://127.0.0.1:3000/` loaded the new controls, obtained a real microphone stream and entered **I’m listening.** with the blue orb and visible microphone status. A real spoken command auto-submitted, but Chinese recognition initially transcribed Hi Dino as “海底捞” and wake failed. After switching standby to English, reloaded the actual Chrome page and asked the user to say Hi Dino, wait for the orb, say “换成蓝色”, then remain quiet for five seconds. The user explicitly confirmed **“可以唤起，也自动变色了”**. No synthetic speech was used. Saved `/private/tmp/housemate-dino-voice.png`. This confirms that live sequence on this user's Chrome, not recognition accuracy for every accent or Korean/English content. Chrome's per-page automatic translation was active during visual inspection; source UI remains English.
- Real visual inspection caught the voice actions clipping under the taller composer. Stage sizing now follows its actual remaining container height, with compact spacing and top-safe scrolling for very small windows. The final Chrome screenshot shows the orb, transcript, caption and all three turn actions above the unchanged text composer.
- Local service runs v2.4.0. No Railway deployment, firmware upload, lamp brightness adjustment, new audio endpoint or spoken AI reply was added. Hardware behavior still depends on the existing explicitly connected local USB session.

## Shared voice halo and matrix output · 2026-10-27 · v2.5.0

`npm test`: **203 passed, 0 failed**. The original 188 cases remain, with nine shared-renderer voice tests and six renderer-to-lamp integration cases. JavaScript syntax and `git diff --check` passed.

- Removed the separate CSS sphere, highlight layers and blue-white background overlay. The transparent voice controls leave room for the existing full-page canvas. A blue/cyan Gaussian field now produces the actual 768-byte, 16 × 16 RGB frame used by diffusion, grid preview and `onFrame` USB output. Actual microphone level controls its extent and chromatic strength. This does not change the hardware brightness setting or claim that total physical luminance rises monotonically with volume.
- A temporary voice layer uses the renderer's existing single RAF and captured-frame transitions. Enter/exit fades take 450 ms; the underlying emotional scene's clock and completion freeze during listening. A newer plan can arrive beneath the voice layer without replacing the visible light. Sending releases the layer before the normal controller submission, so receipt and emotional response fade from the actual voice pixels. Cancelling restores the current plan without changing its palette/preferences/history. Pause, reduced-motion, held scenes, hidden time, pending levels and destruction are covered.
- All 20 original response geometries and colors retain their frame output. A SHA-256 baseline across 120 original scene frames remains `5152a1d68c9254d5e89c337c700c43da001256a9450752a425d8c3cd8cd6c93e`; the existing exact Celebrate hashes also pass.
- Integration tests use the real renderer, session controller, browser bridge, lamp service, pixel mapping, CRC and serial encoder with simulated HTTP/READY/ACK endpoints. They check byte equality from displayed RGB through the authenticated frame request to mapped serial payload, unchanged brightness cap 3, latest-frame backpressure, pause/resume, reduced-motion input refresh and restoration of the latest emotional plan. They also verify that voice does not connect USB or override a held calibration color. These are software transport tests, not physical lamp observations.
- Ran the local v2.5.0 service and reloaded the user's actual native Chrome page at `http://127.0.0.1:3000/`. Opening Talk to Dino obtained a real microphone stream and showed a broad diffused blue halo in the shared background, with no separate sphere. Saved `/private/tmp/housemate-dino-unified-halo.png`. After the live trial prompt, the user confirmed **“对，就是这种光晕”**. This confirms acceptance of the visual expression; no additional claim about recognition accuracy or exact physical color follows from it.
- The local lamp API reported no USB ports and no active session. The user chose **“暂时不方便接，先改网页”**. No Arduino was opened, flashed or brightened, and physical voice-to-lamp verification remains for a later USB connection. Existing wiring, power, firmware and Connect lamp workflow are unchanged. No Railway deployment was attempted.

## Compact blue-green voice flow · 2026-10-27 · v2.5.1

`npm test`: **203 passed, 0 failed**. Existing voice visual assertions were updated for this design; renderer lifecycle, USB transport and original 20-scene regression checks remain in place. Syntax and diff checks passed.

- Changed only the voice frame composition: overlapping blue, turquoise and mint Gaussian fields create an asymmetric gradient. The quiet initial colored footprint is 71 cells by the existing chromatic-contrast measure, compared with 104 for v2.5.0 (about 32% less area). Soft white edges preserve the existing diffuse appearance.
- Offset centers and elliptical proportions evolve on a gentle ten-second cycle, including during quiet listening. This ambient motion is separate from audio visualization; real microphone level still increases spread and color strength. Reduced-motion keeps geometry fixed while allowing level-related color changes. Existing assertions check distinct blue/green regions, compactness, temporal flow and adjacent-frame continuity.
- The local v2.5.1 service and the actual native Chrome page at `http://127.0.0.1:3000/` show the updated voice field with blue to the left and mint green to the right, blending through turquoise. Saved `/private/tmp/housemate-blue-green-flow.png`. The same RGB frame continues through the existing 16 × 16 output and USB transport. No CSS sphere, controller behavior, emotional response palette, firmware or brightness setting was changed. Physical lamp verification remains deferred at the user's request.

## R02 flowing water · 2026-10-27 · v2.5.2

`npm test`: **203 passed, 0 failed**. Existing renderer assertions cover zero-amplitude stillness, speed response, reduced-motion waves and continuity across the loop boundary. Syntax and diff checks passed.

- R02 Accompany now has three broad, softly blended wavefronts following curved paths, with a primary flow cycle of about 10.4 seconds at the existing default speed/amplitude. A continuous clock carries the curves across the catalog's 8.5-second loop boundary. This replaces R02's straight drifting bands while preserving its default Mist blue palette, parameters, invitation-based trigger and continuous accompaniment behavior.
- Zero amplitude freezes flow; reduced-motion retains a static curved-wave composition. Existing color preferences and speed corrections continue through the same renderer and shared 16 × 16 RGB output. No voice, controller, USB, firmware or brightness changes were made.
- The intentional R02 revision is excluded from the historical aggregate frame baseline. The other 19 responses match their pre-change aggregate SHA-256 `3364b056fbef1a80e4a614c74a13039f6b530926305b89717fa48490b58abc5b`; exact Celebrate frames and the blue-green voice field remain unchanged.
- Started local v2.5.2. Native Chrome inspection initially encountered a locked Mac; the user manually unlocked it. Reloaded the page, entered **“陪我待一会儿”**, and verified Light study selected **R02**, source **local rule**, Mist blue, speed 0.28, amplitude 0.62 and loop enabled. Closed the drawer to show the flowing pale-blue curves across the actual page. Saved `/private/tmp/housemate-r02-water-flow.png`. Physical lamp verification remains deferred; the visible USB state is disconnected.
# Contextual light orchestration · 2026-11-19 · v3.9.0

- Final full suite with bundled Node and `--test-concurrency=1`: **309 passed, 0 failed**. Sequential execution avoids an existing loopback lease test's scheduling sensitivity under parallel file execution. All revised and new server, planner, renderer, controller, voice and USB tests pass; `git diff --check` is clean.
- The model's numeric scene parameters now survive the API/profile boundary. A strict, backward-compatible twelve-field `composition` object controls spatial proportions, counts and internal timing. Six families and all eleven expressions retain their native visual structure. With default composition, the historical scene-frame SHA checks for the eleven expressions, five basic signals and voice continue to match.
- A mocked HTTP-to-controller integration verifies that different AI compositions change the actual RGB frame, and saving/exporting/restoring reproduces it exactly without attaching the utterance. An independent audit additionally checked 264 parameter-bound combinations / 1,056 frames, zero amplitude, reduced motion and all eleven saved-scene round trips. The webpage, matrix and existing USB sender consume the same frame; firmware and hardware brightness limits were not modified.
- Independent final-pixel checks across eleven expressions, seven hue exclusions, three parameter settings and six times found **0 forbidden-hue pixels among 354,816 pixels**. A luminous, continuous white shoulder prevents forbidden intermediate mixtures. The previously problematic S01 example changes by at most 1/255 per millisecond near the tested crossing. A final quantization margin covers low-chroma boundary colors.
- Actual online calls through the existing configured service used twelve invented Chinese test utterances, covering every expression and an additional strong-anger S02 case. All twelve returned `source: ai`, valid plans and the expected family/branch/mixed mode. After refining the S02 orchestration guidance, three further real calls returned: mild difficulty with 2 waves / 2 spots / accent scale .75; vividly expressed anger with 3 waves / 6 spots / accent scale 1.2; requested comfort with the supportive branch, no retry keyword, a .38 support entry and .65 support strength. These are observed sample outputs rather than fixed wording or deterministic trigger guarantees. Private API credentials were never printed or exposed to the browser.
- The local app was visually exercised through its normal composer and research drawer. The existing service was restarted on port 3000 with its original local USB feature enabled; the prior service had no connected device session. Hardware was disconnected during this update, so this verification establishes the software frame/transport behavior, not a new physical-lamp visual observation. Voice semantics remain recognized-text interpretation rather than acoustic emotion recognition.
