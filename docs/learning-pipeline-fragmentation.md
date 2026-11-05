# Teach, Deep and autonomous memory integration audit

## Confirmed diagnosis

The supplied export has 15 current records: 13 SERVICE claims classified as
Neuroscience and two AUTONOMOUS claims in Neuron anatomy / Neural signaling.
Both autonomous records have `topic: Neuroscience`, suggesting that the source
assessment chose a narrower category and a broader topic. This is not evidence
that different sources require different knowledge identities.

The original FOUNDATION task successfully acquired two sources, accepted two
claims and stored two memories (SOURCE_EVALUATION, HTTP 200, COMPLETED). The later
semantic request separately submitted four pairs and failed with upstream 200 /
COMPLETION_INCOMPLETE. Those are different calls and different phases.

The neuron records overlap on dendrites receiving input, the cell body processing
signals, and the axon carrying output. They are **not whole-claim equivalents**:
the Teach text additionally describes electrical/chemical signaling; the research
text mentions the nucleus, soma and terminals. Collapsing them would lose scope
or imply stronger source support than the evidence provides.

### Actual code paths

| Step | Direct Teach / direct Deep | Deep research / autonomous research |
| --- | --- | --- |
| UI interpretation | Supplied claim → `teachMemory()` | Learning objective → research task |
| Model call | `/api/mindling/learn` | Hosted search, then existing SOURCE_EVALUATION completion |
| Previous model context | `learningContext()`: ≤8 candidate excerpts, ≤12 categories | Research objective, plan, retrieved passages; **no stored memories/categories** |
| Classification | Model can reuse a category ID/name | Source model chose category/topic independently |
| Identity | Model assessment supports same/related/new/update/contradiction; exact local shortcut | `researchRelation()` exact text support, narrow numeric conflict frame, native checks |
| Commit | Shared `learn()` dispatches to `applyMemoryDecision()` | Shared `learn()` explicitly disallows a service assessment with research authorization; uses native analysis then source classification override |
| Links | `LINK_TO_EXISTING` writes model associations during commit | Native semantic rules may connect supported grammatical patterns; broader model links happen after commit in `runSemantic()` |

References: `src/learning/teach-memory.js`,
`src/preview/sandbox/learning-assessment.js`, `memory-decision.js`,
`memory-mutation.js`, `engine.js`, `src/autonomous/learning-engine.js`,
`memory-evolution.js`, and `src/server/mindling-reasoning.cjs`.

Direct Deep is not a separate classification engine: it uses the same assessment
as Teach, with a different activity. A Deep *research request* uses the research
pipeline instead. Treating both meanings of “Deep” as one path obscures the issue.

## Why the paths fragment knowledge

1. **Missing context before classification.** The source evaluator could not know
   that Neuroscience already existed. Category creation uses the common
   `assignCategory()` function, but reuse is by supplied ID or normalized label;
   it does not infer that Neuron anatomy belongs within Neuroscience.
2. **Inconsistent decisions before persistence.** Teach supports model-selected
   same/related/contradiction decisions. Research's `researchRelation()` classifies
   the actual neuron pair as `new`, despite obvious overlap. “new” here means
   not proven an exact duplicate or locally detected conflict, not semantically
   unrelated. The exported native `relationship: related` is a retrieval hint;
   it intentionally does not authorize persistent links.
3. **Post-commit dependency.** The semantic worker is not the only possible link
   mechanism (local rules, exact support and version relationships also exist),
   but it is the broad model-assisted mechanism for research connections. Source
   learning can finish successfully before this separate call fails.
4. **Finite delivery.** The worker permits four pairs/call and four lifetime
   attempts/task. Two newly researched records against thirteen others can yield
   up to 27 pairs before existing-link exclusions, more than sixteen pair slots.
   Stable-ID batching does not guarantee the neuron pair was among the four sent;
   the pasted counters do not contain pair IDs. A complete scan cannot be promised.
5. **Source is provenance, not semantics.** PR #132 already admits captured current
   SERVICE records into semantic selection. Source labels no longer exclude this
   pair there. However, research authorization still selects a different integration
   branch at commit. No category rule intentionally assigns categories by source.
6. **No semantic equivalence record.** Exact same text can retain additional source
   evidence via `researchSupport`, deduplicated by source/quote hashes. Semantically
   equivalent paraphrases have no corresponding model-assisted pre-commit decision
   in research. The seven semantic relation types also contain no equivalence or
   corroboration type. `complements` is suitable for supported partial overlap,
   but must not be treated as identity or factual verification.

## Minimal correction in this PR

Give the **existing tool-free SOURCE_EVALUATION call** bounded existing knowledge
context, reusing `learningContext()` from direct Teach/Deep. No new inference,
search or recovery call is introduced; the output schema and 2,600 completion-token
ceiling stay unchanged. Input tokens can increase because relevant context is now
provided; no claim is made that this is zero inference cost.

The new optional `includeUnranked` projection option fills unused candidate slots
up to eight, so a small brain is visible even when the public topic “Neuroscience”
is absent from its neuron prose. Ranked retrieval still leads for larger stores;
coverage is bounded, not exhaustive. Research excludes historical/superseded
records. Direct Teach/Deep defaults are unchanged.

The prompt distinguishes broad category from narrow topic and asks the model to
reuse an existing category name when appropriate, even across origins. It explicitly
forbids treating stored assertions as source evidence, merging different scopes,
or promoting agreement to verification. Existing excerpts carry `complete=false`
when shortened. This context is organizational, not permission to rewrite evidence.

Only the tool-free completion receives `existingKnowledge`. The search function
explicitly destructures public request/queries/plan; neither stored text nor memory
IDs are forwarded to hosted web search. The signed checkpoint remains public source
evidence only, with its unchanged signature/size contract. A permitted evaluation
retry can use current bounded context without repeating search. A completion that sees private context cannot author a public follow-up search:
its `nextQuestion` is constrained to null and rejected follow-ups are reported as
metadata rejections. Existing public-only clients retain follow-ups. Normal
public-topic autonomous scheduling remains available, but automatic continuation
via a new `nextQuestion` from this context-aware completion is deliberately
disabled to prevent private-memory disclosure through a later search. No private snapshot
is appended to task records, avoiding new checkpoint-persistence pressure.

If the model returns Neuroscience, the existing canonical category assignment
reuses its ID at commit. New and taught passages remain separate records with
unchanged source quotes, hashes and verification status. Previously saved categories
are not silently migrated or rewritten. No Knowledge Network UI changes.

## What this deliberately does not claim to fix

- There is not yet one common model-assisted identity/mutation contract for every
  pathway. This is the small context/classification correction supported by the
  evidence, not a broad integration rewrite.
- A model can still choose a narrower or unsuitable category. Offline mocks prove
  availability and correct persistence, not real inference accuracy.
- Existing failed semantic requests remain spent/unknown and are not automatically
  replayed. This PR does not promise to repair the already disconnected records.
- COMPLETION_INCOMPLETE currently means a non-`stop` finish reason. The saved
  diagnostic does not include the original finish reason/usage, so output-token
  exhaustion versus another incomplete termination cannot be proven here. The
  token budget is not increased speculatively.
- Partial overlap and contradiction recognition are not exhaustive in the native
  research path. Numeric conflicts are narrow, and arbitrary paraphrases can be
  stored separately. No unsafe lexical merge is added to conceal that limitation.

## Proposed next integration step, before a larger rewrite

A common model-assisted integration decision could be included in the existing
source-evaluation response: new / partial overlap / equivalent support / refinement /
contradiction, supplied existing-memory ID, category membership and exact evidence
for both sides. Its application must be a shared bounded adapter to canonical
mutation, not a second memory database.

That requires versioned response validation, snapshot binding through receipt and
retry, complete-scope checks for equivalence, retained source support on reinforcement,
and atomic idempotence. Contradictions should retain evidence without automatically
superseding facts. Optional relationship evidence must fit the existing completion
budget, whose real capacity is currently unverified given incomplete semantic
responses. These changes are not smuggled into this small PR or simulated with
keyword decisions. No additional paid calls are enabled by default.

## Verification and limits

`tests/support/neuroscience-integration.json` is a clearly labelled projection of
the two actual supplied records. Original text, integrity lengths, identifiers,
classification and research provenance are copied, not invented. Neural/native
rendering/debug fields unrelated to this test are omitted. It is not represented
as the full 15-record export.

`tests/research-learning-context.test.mjs` passes with mocked upstream responses:
- Exact actual neuron text and source quote hash checked.
- Topic-only lexical miss reproduced; small-brain candidate inclusion verified.
- Existing categories and passages reach both FOUNDATION and DEEP evaluation.
- No private memory reaches hosted search; existing memory text cannot replace a
  cited source quote.
- Model-selected Neuroscience reuses the saved category ID via real canonical
  integration, retaining both overlapping records and source evidence.
- No autonomous XP/Energy change or mutation of the taught record.
- Existing semantic contract accepts a mocked `complements` assessment across
  categories, rejects a contradiction assessment, and persists reciprocally once.
- Missing/incomplete output fails safely; signed-checkpoint recovery uses one
  remaining evaluation request and zero additional search requests.

The final source-evaluation/checkpoint/receipt group passes **59/59**. Additional checks: semantic diagnostics and semantic scheduling scripts pass,
including no replay of uncertain dispatched work and existing budget/isolation
bounds. The existing four-suite regression group yields **65 pass / 1 fail** on
both this branch and untouched main (`3a82114`). The unchanged Stage Preview test
expects 500 XP after ten activities; current production policy yields 50. No XP
code was altered to make that historical assertion pass.

No paid API calls, browser automation, builds, migrations or production writes.
Mocked semantic judgments cannot establish the live model's performance. After
review/deployment, a newly authorized research task should expose the known broad
area to source evaluation; compare its saved category and provenance, and inspect
semantic completion independently rather than treating research completion as
proof of successful linking.
