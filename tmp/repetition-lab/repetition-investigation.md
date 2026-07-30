# Repeated Reply Investigation

Generated at: 2026-07-29
Updated at: 2026-07-30

Scope: diagnosis only. No production runtime code was changed.

## Prompt Structure Extracted

Current group-chat generation is composed in `chatEngine.ts` from ordered prompt blocks:

1. `engine_prefix`
2. `speaker_identity`
3. `prompt_play_mode`
4. character/runtime context: `humanization`, `inner_life`, `pending_reply`, `user_guidance`, `world_event_context`, `world_influence`, `current_intent`, `private_turn_priority`
5. session/runtime contracts: `engine_constraints`, `analysis_room_contract`, `role_action_visibility`, `expression_feedback`
6. style controls: `natural_chat_rhythm`, `conversation_move`, `expression_surface_choice`, `turn_length_variety`, `turn_format_variety`, `turn_plan`, `runtime_role_constraint`, `response_surface`, `style_quarantine`
7. output controls: `visible_message_surface_contract`, `generation_constraints`, `inline_interaction_contract`
8. `engine_suffix`

The relevant anti-repeat prompt is mainly:

- `generation_constraints`: says not to repeat semantic points from "forbidden lines", but only lists counts such as "Your previous AI turns: N item(s)" and "Other AI turns: N item(s)".
- `style_quarantine`: says recent messages are facts/positions/pressure, not writing samples.
- `turn_length_variety` / `turn_format_variety`: only activate on layout or length repetition.
- `humanization`: adds natural chat behavior and also tells the model to continue the social situation, not wording.

The prompt therefore has anti-repeat intent, but it does not expose concrete recent forbidden sentences in the anti-repeat block.

## Runtime Findings

There are two duplicate systems:

- `generationRuntime.ts` + `duplicateValidatorRegistry.ts`: validates a symbolic turn seed such as `moveClass:targetScope:targetIds`, then records a `duplicateDecision` in runtime trace. It does not validate the final visible model text.
- `chatEngine.ts` final generation path: `evaluateHiddenEchoDraft()` compares generated visible text against recent messages. In the failing report, it correctly detected an exact repeat and emitted `surface_echo_warning`, but the message was still returned and committed.

Important code evidence:

- `buildSurfaceEchoRetryPrompt()` exists and looks intended for retrying echo drafts.
- `LocalInterceptionEvent` has `surface_echo_retry` and `surface_echo_skip` kinds.
- But in `generateNonDuplicateResponse()`, `echoReason` currently only triggers `surface_echo_warning`; there is no retry/continue and no final skip.

So the hard duplicate root cause is not only prompt quality. The system already detected at least one exact duplicate but did not enforce the decision.

## Root Cause: Wrong Chat Role Projection for Multi-Agent Rooms

The deeper cause is in `conversationProjection.ts`.

`projectConversationForModel()` currently projects every prior message from the current speaker as an OpenAI `assistant` message:

```ts
if (message.type === 'ai' && currentSpeakerId && message.senderId === currentSpeakerId) {
  projected.push({ role: 'assistant', content: compactTranscriptContent(message.content) });
}
```

This is reasonable for a direct one-user/one-assistant chat, but it is dangerous for a multi-character group room.

For the failing `outing_conflict_room` turn 4, current speaker was 老李 and the projected message shape was effectively:

```txt
user: Conversation transcript for context only...
user: 瑟瑟: 瑟瑟确实有点怕，不下雨的话晚霞应该是漂亮的。
user: 阿晚: 晚霞确实好看…要不先看天气再定装备？
assistant: 行，那就先定这个。瑟瑟，加班的事到底有没有定数？...
```

Then the system asks the model to generate 老李's next reply. From the model API's perspective, the last conversational turn is already an `assistant` message containing exactly 老李's previous reply. There is no new user/other-speaker message after it. That is a strong continuation/copy prior, and it explains why the model can emit the same sentence again.

The current tests also lock this behavior in:

- `conversationProjection.test.ts`: "uses assistant only for the current speaker own prior turns"
- `promptBuilder.test.ts`: "projects group chat history with other AI speakers as named user-side context" and expects current speaker history to be `assistant`

So the root is not "the model is bad" and not merely "the duplicate guard is weak". The root is that a multi-agent transcript is being encoded as a single assistant's chat history. In group rooms, previous turns should be room transcript evidence, not assistant dialogue history.

## Scheduler Findings

The duplicate report also showed the same speaker being picked again immediately:

- `outing_conflict_room` turn 4 picked 老李 after 老李 had just spoken.
- Its `speakerScore.finalScore` was `0.05` and `repetition_penalty` was present, so the scheduler knew it was repetitive.

The scheduler penalty is a weight multiplier, not an absolute block. Also `BASE_COOLDOWN_MS = 3000`, while real LLM generation often takes longer than 3 seconds; by the next automatic turn, cooldown can already have expired. This means consecutive speakers are possible when other candidates score low or when runtime pressure points back to the same actor.

This is a separate cause from text duplication: same-speaker repetition increases risk, but final text validation still needs to reject exact/near repeats.

## Experiments

Scripts added under `tmp/repetition-lab`:

- `repetition-prompt-lab.mjs`: tests prompt variants on failing transcript windows.
- `repetition-retry-lab.mjs`: tests retry prompts after a known repeated draft is rejected.
- `repetition-projection-lab.mjs`: first projection-format comparison; per-turn judge was too slow and did not parse reliably with the current reasoner model.
- `repetition-projection-lab-v2.mjs`: projection/continuation experiment with deterministic local metrics.

Important harness correction on 2026-07-30:

- The first projection experiments only reconstructed previous context from AI `transcript`.
- The original acceptance report also contains `seedUserMessages` and `userInjectionLog`.
- Those user messages are essential for the real failure windows:
  - `outing_conflict_room` turn 4 depends on the user injection "先确认她到底还能不能去".
  - `memory_contradiction_room` depends on the seed user request "你们帮我选".
  - `direct_mention_hijack_room` depends on explicit user mention of 安安.
- `repetition-projection-lab-v2.mjs` now reconstructs a chronological window with seed user messages and after-turn user injections before running prompt experiments. Any earlier prompt-quality conclusion that ignored user messages should be treated as weaker evidence.

Reports:

- `tmp/repetition-lab/reports/repetition-prompt-lab-2026-07-29T08-11-40-731Z.md`
- `tmp/repetition-lab/reports/repetition-retry-lab-2026-07-29T08-15-05-511Z.md`
- `tmp/repetition-lab/reports/repetition-projection-lab-v2-2026-07-29T09-02-36-741Z.md`
- `tmp/repetition-lab/reports/repetition-projection-lab-v2-2026-07-29T09-10-41-343Z.md`

Prompt lab results, 5 failing windows, 4 trials each:

| Variant | Duplicate Rate | Avg Quality Pattern |
|---|---:|---|
| `baseline_abstract` | 0/20 hard duplicates | lower and less stable on first repeated window; semantic repeat risk remained |
| `concrete_forbidden_lines` | 0/20 hard duplicates | best stability; average scores usually higher |
| `move_first_with_banlist` | 0/20 hard duplicates | sometimes high, but had low-score cases from jumping away from the current core |

Retry lab result on the exact repeat window, 5 trials each:

| Variant | Duplicate Rate | Avg Judge Score |
|---|---:|---:|
| current `surface_echo_retry` wording | 0/5 | 84 |
| concrete retry with banned recent lines + new detail requirement | 0/5 | 92 |

Projection lab V2 tested only two variants across 10 high-risk windows, 8 trials each:

| Variant | Hard Duplicate | Avg Own Similarity | Avg Original Similarity | Avg Max Recent Similarity |
|---|---:|---:|---:|---:|
| `old_assistant_projection` | 0/80 | 0.144 | 0.119 | 0.172 |
| `all_named_transcript_projection` | 0/80 | 0.154 | 0.137 | 0.185 |

This is an important negative result. Merely converting every group-room line into a named transcript did not improve repetition risk in this sample; it often increased similarity. The likely reason is that marking "自己刚才说过" makes the old line highly salient without telling the model what new conversational job to perform.

Projection lab V3 added two more variants across 6 high-risk consecutive-speaker windows, 6 trials each:

| Variant | Hard Duplicate | Avg Own Similarity | Avg Original Similarity | Avg Max Recent Similarity |
|---|---:|---:|---:|---:|
| `old_assistant_projection` | 0/36 | 0.144 | 0.119 | 0.172 |
| `all_named_transcript_projection` | 0/36 | 0.154 | 0.137 | 0.185 |
| `own_lines_quarantined_projection` | 0/36 | 0.146 | 0.127 | 0.175 |
| `continuation_contract_projection` | 0/36 | 0.128 | 0.114 | 0.160 |

The best tested direction so far is not "all named transcript" alone. It is a continuation contract for consecutive same-speaker turns:

- If the previous visible speaker was also the current speaker, do not repeat the same request, pressure, summary, or closing.
- Do not merely make the previous line stricter.
- Pick a different conversational job: add a concrete logistical detail, answer a detail raised by someone else, soften/repair the pressure, set a new deadline, or hand the floor to a specific person.
- The reply must contain at least one new fact, concrete action, or changed stance not present in the previous own line.

After complete user context was restored, a more precise result emerged:

| Variant | Cases | Trials | Avg Judge | Duplicate Control | Naturalness | Context Fit | Job Choice | Wins |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `old_assistant_projection` | 5 | 2 | 73.0 | 92.6 | 80.0 | 76.0 | 72.0 | 0 |
| `continuation_contract_projection` | 5 | 2 | 88.4 | 98.0 | 88.0 | 91.0 | 92.0 | 2 |
| `focused_situational_job_contract_projection` | 5 | 2 | 93.4 | 98.0 | 95.6 | 98.0 | 97.0 | 3 |

Report: `tmp/repetition-lab/reports/repetition-projection-lab-v2-2026-07-30T01-10-29-920Z.md`.

The fixed continuation contract lowered surface similarity, but it sometimes solved the wrong problem. In the outing conflict case, it jumped from "confirm whether 瑟瑟 can go" into deposits, alternate dates, or logistics. This avoided repetition but weakened response quality. The better direction is `focused_situational_job_contract_projection`: keep the unresolved core pressure, avoid copying old wording, and only change the conversational job when context actually demands it.

A stricter V2 focused contract was then tested:

| Variant | Cases | Trials | Avg Judge | Duplicate Control | Naturalness | Context Fit | Job Choice | Wins |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `focused_situational_job_contract_projection` | 5 | 2 | 91.6 | 97.0 | 93.0 | 98.0 | 97.0 | 4 |
| `focused_situational_job_contract_v2_projection` | 5 | 2 | 90.0 | 96.0 | 92.0 | 96.0 | 95.0 | 1 |

Report: `tmp/repetition-lab/reports/repetition-projection-lab-v2-2026-07-30T01-17-43-787Z.md`.

V2 added hard rules for "user asks for a decision", "user named another person", and "intentional repeat". It improved exact chant behavior, but was not better overall. The reason is important: making too many rules highest-priority makes the reply slightly more mechanical and can disconnect it from the rich room context. The production prompt should not copy V2 wholesale. It should use the focused situational contract as the base, plus only a few narrow conditional overrides.

Clean prompt structure test on 2026-07-30:

After the focused contract was applied, a separate `clean_prompt_v2_projection` experiment was added to test whether a cleaner prompt architecture can solve more than repetition. This variant does not keep adding checklist rules. It uses a simple priority stack:

1. latest user or room pressure;
2. character voice and relationships;
3. natural chat surface;
4. JSON protocol.

It also states that ordinary group chat is not an essay, speech, report, or script; replies should answer one live point; heat can raise intensity without forcing every next speaker to get longer; physical actions should usually be omitted, and never become action + speech + action + speech.

Two focused A/B runs compared `focused_situational_job_contract_projection` and `clean_prompt_v2_projection`.

Report: `tmp/repetition-lab/reports/repetition-projection-lab-v2-2026-07-30T02-26-33-520Z.md`

| Finding | Interpretation |
|---|---|
| Clean V2 lowered duplicate similarity in several repetition-risk cases. | The cleaner architecture helps the model treat transcript as state instead of wording to echo. |
| Focused contract still won more quality-guardrail cases. | The focused contract is better at preserving the unresolved practical task. |
| Clean V2 sometimes became too terse or under-committed. | Pure brevity and naturalness can weaken useful answers when the room needs a decision, instruction, or repair. |

Report: `tmp/repetition-lab/reports/repetition-projection-lab-v2-2026-07-30T02-31-04-903Z.md`

This run added `synthetic_long_speech_drift`, based on the "十皇共议" failure pattern where replies gradually became emperor speeches and sometimes included action + speech + action.

| Case | Variant | Hard Dup | Long Reply | Action Risk | Avg Len | Judge |
|---|---|---:|---:|---:|---:|---:|
| long speech/action drift | focused contract | 0/3 | 0/3 | 0/3 | 85.7 | 88 |
| long speech/action drift | clean V2 | 0/3 | 0/3 | 0/3 | 67.3 | 93 |
| valid same-speaker expert answer | focused contract | 0/3 | 0/3 | 0/3 | 62.0 | 90 |
| valid same-speaker expert answer | clean V2 | 0/3 | 0/3 | 0/3 | 42.3 | 85 |
| named-other handoff | focused contract | 0/3 | 0/3 | 0/3 | 22.0 | 85 |
| named-other handoff | clean V2 | 0/3 | 0/3 | 0/3 | 13.7 | 95 |
| soften pressure without losing core | focused contract | 0/3 | 0/3 | 0/3 | 48.7 | 95 |
| soften pressure without losing core | clean V2 | 0/3 | 0/3 | 0/3 | 31.7 | 85 |
| intentional chant | focused contract | 0/3 | 0/3 | 0/3 | 12.0 | 100 |
| intentional chant | clean V2 | 0/3 | 0/3 | 0/3 | 3.0 | 95 |

Conclusion from the clean prompt test:

- Do not replace production wholesale with `clean_prompt_v2_projection`.
- Do extract the "natural chat surface" section into the production prompt because it directly targets long-form drift and action/script drift.
- Keep the focused situational job contract as the control layer because it better preserves decisions, repairs, and practical conversational pressure.
- The next production prompt change should be a structural merge: focused job selection first, then a small natural chat surface contract, without a large new checklist.

Production merge on 2026-07-30:

- Added `natural_chat_surface_contract` after `focused_situational_job_contract` and before final generation constraints in `chatEngine.ts`.
- The new block is deliberately scoped to surface shape. It explicitly must not override focused jobs, handoffs, direct answers, or decisions.
- It is chat-only. Longform/professional/creative surfaces are unaffected.
- It targets long-form drift and action/script drift with a small set of surface rules: live chat, one active point, do not let heat force every reply longer, omit ordinary actions, and never use action + speech + action + speech.

Post-merge A/B:

Report: `tmp/repetition-lab/reports/repetition-projection-lab-v2-2026-07-30T02-46-32-198Z.md`

The first three-way run showed the merged direction improved long-form drift, but one named-other handoff trial still hijacked the answer. The prompt was adjusted so the natural surface contract cannot override the focused job/handoff layer.

Follow-up report: `tmp/repetition-lab/reports/repetition-projection-lab-v2-2026-07-30T02-59-31-509Z.md`

| Case | Variant | Hard Dup | Long Reply | Action Risk | Avg Len | Judge |
|---|---|---:|---:|---:|---:|---:|
| long speech/action drift | focused contract | 0/4 | 1/4 | 0/4 | 100.8 | 88 |
| long speech/action drift | focused + natural surface | 0/4 | 0/4 | 0/4 | 73.0 | 87 |
| long speech/action drift | clean V2 | 0/4 | 0/4 | 0/4 | 71.5 | 85 |
| named-other handoff | focused contract | 0/4 | 0/4 | 0/4 | 31.8 | 75 |
| named-other handoff | focused + natural surface | 0/4 | 0/4 | 0/4 | 18.0 | 90 |
| named-other handoff | clean V2 | 0/4 | 0/4 | 0/4 | 15.5 | 90 |

Interpretation:

- The merged production direction reduces length drift without introducing action/script drift in the tested samples.
- It preserves the focused job layer better than replacing the whole prompt with clean V2.
- Named-other handoff improved after explicitly making the surface contract lower priority than focused jobs.
- Some same-topic lexical overlap remains normal when a reply must preserve the current unresolved task; this should not be optimized to zero.

## Metric Interpretation Update

The deterministic "semantic loop" metric can be misleading when the room's current task legitimately requires restating the same core issue. Example: after the user says "先确认瑟瑟到底还能不能去", a good reply must still ask 瑟瑟 about加班/能不能去. That is necessary core continuity, not a bug.

Therefore the target is not "zero semantic overlap". The target is:

- preserve the unresolved core task when it is still active;
- avoid exact text, same opener, same sentence frame, same closing, and same pressure shape;
- avoid a second broad preference question when the user asked for a decision;
- avoid adding arbitrary facts, deadlines, logistics, or softening just to look different;
- allow short deliberate repetition for chants, quotes, call-and-response, fixed answers, or playful mirroring.

## Interpretation

The strongest root cause is runtime enforcement: exact echo detection fires but does not retry or block. This can allow a known repeated draft to be committed.

The deeper prompt/input root cause is not only role projection. The current speaker's own previous group-room turns are sent as `assistant` messages, which can invite continuation. But experiments show that simply converting those lines to named transcript is not sufficient and can increase similarity. The more precise root cause is consecutive or recently repeated same-speaker generation without a context-appropriate conversational job. The model is asked to speak again while the unresolved task and speaker stance are effectively unchanged, but the prompt does not clearly say whether to answer, decide, hand off, soften, preserve the core ask, or intentionally repeat as a social move.

The lab itself also had an input-context bug before 2026-07-30: it omitted seed user messages and user injections. That made early prompt comparisons under-represent user intent and explicit mentions. This is fixed in the experiment harness and should be considered when interpreting older reports.

The prompt-level weakness is secondary: the anti-repeat instruction is too abstract. It says "forbidden lines" but does not list the exact recent lines. The model must infer what is forbidden from ordinary transcript messages, and under multi-role pressure it can still reuse the same move.

The scheduler weakness is that cooldown is time-based and short, while LLM turns are slow. Repetition penalty reduces probability but still allows immediate same-speaker selection.

## Recommended Fix Direction

Do not make a broad prompt rewrite first. The current safest sequence is:

1. Add a focused situational job contract in the test harness and acceptance tests before production code:
   - It should activate when the selected speaker was also the latest visible speaker, has repeated the same target/move recently, or the latest user pressure demands a specific response.
   - It must preserve the current unresolved need. Do not switch to a fresh logistical action merely to be different.
   - If the user asked for a decision, give a recommendation or conditional decision instead of another broad preference question.
   - If the user explicitly named another character and the selected speaker is not that character, use a short clean handoff instead of hijacking the answer.
   - If the scene is a chant, quote, fixed answer, call-and-response, or playful mirroring, allow concise intentional repetition.
   - Do not require "new fact / action / softening / deadline" every time. Those are optional moves, not a checklist.
2. Re-test projection separately:
   - For `chatType === 'group'`, do not blindly project all visible messages as named transcript with "自己刚才说过".
   - Test a version where own previous lines are either omitted from the main transcript and placed in a no-repeat quarantine, or kept as assistant history but followed by a strong continuation contract.
   - Keep `assistant` role for true direct user-to-character chats where the current speaker really is the assistant in a two-party exchange.
   - For `ai_direct`, decide separately: it is a pair-private two-character channel, so the safer version is also named transcript context unless there is a clear one-assistant owner.
3. Then wire `evaluateHiddenEchoDraft()` into the existing retry path as a safety net:
   - attempt 1/2: emit `surface_echo_retry`, use `buildSurfaceEchoRetryPrompt()` or an improved version, then continue.
   - final attempt: emit `surface_echo_skip` and throw `EmptyGeneratedResponseError` so existing speaker rotation can choose another actor.
4. Improve the retry prompt, not the whole base prompt:
   - include concrete banned recent visible lines.
   - require a context-appropriate change: a direct answer, decision, handoff, softened practical ask, or concise intentional repeat when explicitly social.
   - avoid a hard "move-first" schema because tests showed it can derail context.
5. Separately consider scheduler policy:
   - for automatic group continuation, same-speaker after previous turn should be a stronger block unless user guidance explicitly targets them.
   - do not rely on a 3-second cooldown as the main anti-repeat mechanism.
6. Add acceptance assertions:
   - group-room projection must not end with prior same-speaker `assistant` content.
   - exact repeat must trigger local interception retry/skip.
   - after retry, committed content must not match recent own or room line.
   - consecutive same-speaker is allowed only when point-name, direct answer, or strong pending reply justifies it.

## Current Recommendation

Do not change production projection yet. The current experimental winner is the focused situational contract, not the fixed continuation checklist and not the all-named transcript projection.

Next production candidate:

1. Keep full user context visible in prompt projection and acceptance harnesses.
2. Add a focused situational job contract near `conversation_move` / `generation_constraints`, with concrete recent own lines quarantined as no-repeat evidence.
3. Keep `intentionalRepeat` support, but make it explicit that accidental template drift cannot use it.
4. Wire surface echo detection to retry/skip so detected exact repeats cannot be committed.
5. Only then revisit group-room role projection, with tests proving that direct chats still preserve normal assistant continuity.
