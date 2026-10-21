# Prototype validation

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

No physical LED matrix is connected. Diffusion is an approximation produced from the same 16×16 logical frame. No microphone, account, database, analytics or cross-session memory has been added. Palette, timing and movement meanings remain prototype hypotheses pending workshops and user studies. Local rules cover representative Chinese/English/Korean routes; unrestricted interpretation depends on the configured AI and is not guaranteed by demo-mode tests.

## Final manual follow-up

- Export plan downloaded a valid JSON file. It contains only the versioned light-plan fields and no text/history field.
- Simulated failure visibly showed the failure-preview label, interrupted-return state and Retry AI button. Retry cleared the banner and completed into a waiting-for-input light state.
- Final multilingual refinements also tested: “keep this one” / “就保持这样” / “이대로” keep the current palette; “don't leave me alone” invites company; “tired” does not become a red-color ban.

## Color correction update · 2026-10-22

`npm test`: **55 passed, 0 failed**, including HTTP integration; changed JavaScript syntax checks and `git diff --check` passed. The original interaction/renderer/cancellation checks remain included.

- Current-color rejection is a deterministic local R08, including after keeping a palette; replacement is selected by actual RGB/hue difference and remembered across later turns.
- Seven single-hue palettes are verified through all variants and the actual white-mixed RGB rendering. A separate gray family makes all-hue exclusion reproducible from an exported plan alone.
- Combined bans, positive selection and motion feedback work in one turn; contrastive wording such as “Use blue, not pink” does not reverse the desired hue. Representative unrelated clothing/color-metaphor statements do not alter color preferences.
- Named requests replace old locks and conflicting older dislikes. An older pending AI response cannot undo a newer correction. Manual previews override an old palette lock; saved-scene restoration retains saved preferences.
- Real local HTTP chain: “换成蓝色” → “保持现在的颜色” → “不要这个颜色” → “不要蓝色改成粉色，慢一点”. The corrections returned `local_rule`; actual swatches changed blue → warm coral → pink, with speed scale 0.65. A following real OpenAI request, “今天过得很开心”, returned `source:ai`, `celebrate`, and retained the requested pink and speed preference.
- In-app Chromium browser: verified manual pink preview overriding a blue lock, then keeping pink and sending “不要这个颜色” visibly changed it to warm coral. Verified the combined no-blue/pink/slower input against the current-plan JSON, actual swatches and preference text. Captured before/after screenshots in `/private/tmp/housemate-color-before.png` and `/private/tmp/housemate-color-rejected.png`.

This update repairs direct color control. Multi-emotion weights, unrestricted color generation and the previously discussed R03/R04 priority are not implemented by this patch.
