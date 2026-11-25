# 0016. Learning plans, the model and the API key

Date: 2026-11-25. Issues: SAN-120 to SAN-123. PRD sections 7, 9 and 10.

## Context

The user picks topics, platforms, a level and a size, and gets a staged list of real problems. The PRD's rule is that the model selects and never invents. The key is the user's own, stored encrypted, and the app must work without one.

## Decisions

### The plan

1. **The model only ever sees and returns the app's own problem IDs.** For each topic the app sends up to 60 candidates from the catalog (`selectCandidates` in `src/core/plan.ts`): best known first, spread over difficulties to suit the level. Each line is an ID, the platform, the difficulty, the title and tags. No links and no statements are sent; the app has no statements to send.

2. **The answer is checked in core, twice over.** `validatePlanResponse` requires the stage shape and requires every ID to be a candidate shown under that topic, used once. A plan item is also a foreign key into `problems`, so the database itself cannot hold a plan with a problem the catalog lacks. A problem from the right catalog but the wrong topic or platform is refused too.

3. **One retry, with the errors.** A failed check is sent back to the model in plain words with its own answer, once. After that the user sees a plain error and nothing is saved (`src/llm/planGenerator.ts`).

4. **A generated plan is a draft.** The user can remove a problem, move one within its stage or group, or swap one for another catalog problem of the same topic. A swap is held to the same rule as the model's answer. Activating a draft archives the plan that was active: one plan is active at a time, and a partial unique index enforces it.

5. **Already-attempted problems are skipped on activation,** and come back as reviews through their cards. When such a problem is later reviewed while the plan is active, its item counts as done from then on: it was attempted as part of the plan. A plan made only of attempted problems cannot be activated.

6. **Progress follows the attempts.** Reporting a plan's problem marks its item done, inside the report's transaction. At launch `reconcileActivePlan` recomputes the active plan's item states from the attempts, like the streak (decision 0008). An attempt rated Again counts as done for the plan (the problem then returns as tomorrow's review), but the graduation cap needs a growth solve, as every accessory does (decision 0011). A finished plan stores the ID of the attempt that finished it (`finished_from_attempt`). The launch check replays the attempts to restore lost accessories, and with that ID it gives the cap only to a growth solve at or after the finish, never to one from before it. Attempt IDs are used and not times, because IDs only grow and the clock can be wrong.

7. **A finished plan is kept.** Its status becomes done; it cannot be deleted, because it is what earned the cap. Drafts and archived plans can be deleted.

8. **A pattern group's name becomes a pattern tag** on the problem's notes when the problem is reported (PRD section 5, "store pattern tags now").

### The model

9. **Default model `claude-opus-5-5`,** a setting (`planModel`). Settings offers four current models and accepts any model ID typed in, so a newer model needs no app update.

10. **Structured output, then our own reading of it.** The request carries a JSON schema (`output_config.format`). The client calls `messages.create` and reads the answer itself instead of using the SDK's `parse` helper: `parse` throws on an answer that was cut off or is not JSON, and those are answers the app has its own words for ("came back cut off", ask again).

11. **The request opts into the server-side refusal fallback** (`betas: ['server-side-fallback-2026-07-01']`, `fallbacks: 'default'`), so a refusal by the chosen model can be served by another model in the same call. If the API answers 400 to that request, the client asks once more without the fallback, so a retired beta flag cannot break plan generation. A plan made by a fallback model is still checked the same way, and the plan records the model that answered, not the one that was asked.

12. **Nothing optional is sent:** no `thinking`, no sampling parameters, no `tool_choice`, no tools. Newer models refuse some of these, and the defaults are right for one structured answer.

13. **Failures become plain messages in `src/llm`** (`toLlmError`): bad key, no access to the model, unknown model, rate limit, no connection, trouble at Anthropic. The SDK's own error text is never shown and never logged with the key.

### The key

14. **The key is sealed with Electron's `safeStorage`** (the macOS keychain holds the sealing key) and kept in its own file, `anthropic-api-key.bin`, next to the database. It is not in the database, so copying or exporting the database never carries the key, and it is never sent to the UI: the UI learns only whether a key is saved.

15. **A sealed key that cannot be opened counts as no key.** That is what happens after the data folder is copied to another Mac. The user types the key again there.

16. **"Test key" lists the models,** which costs nothing, and says whether the chosen model is among them.

### Errors across the bridge

17. **Main answers every bridge call with the value or a message; the preload unwraps it.** Electron rewrites the message of a rejected call ("Error invoking remote method ..."), and plan errors are written to be read. `dispatch` in `src/main/services/dispatch.ts` validates the input, runs the use case and turns a failure into `{ ok: false, message }`; `unwrapReply` in `src/bridge/channels.ts` throws it again in the window with the message unchanged. This applies to every method, so older screens also lose the prefix. Failures are logged in main without the input.

### Tests

18. **No test reaches the network.** Unit tests give the plan generator saved answers (good, malformed, invented problems). The real client is driven against a fake `fetch`. End-to-end runs always use a scripted model that answers from a file and records what it was asked.

## Alternatives rejected

- **Letting the model write titles or links:** the failure the PRD exists to prevent.
- **Tool use to "pick" problems one call at a time:** more requests and more ways to fail, for a job one structured answer does.
- **The key in the database, encrypted:** export would then carry a blob that is useless elsewhere, and "the key is never in the database" is a simpler promise to keep and to test.
- **macOS Keychain through a native module:** `safeStorage` uses the keychain already and adds no native code.
- **Result types (`{ ok, reason }`) on every plan method:** it works for one method (`testApiKey` does it), but a dozen methods would each need the wrapper in the contract, the services, the mock and the UI.

## Limits

- No live call to Anthropic has been made by the build session: there was no key. The request shape is tested against a fake network, and the first real plan the owner generates is the first real call.
- The candidate list is capped at 60 per topic, so the model never sees the long tail of a large topic.
