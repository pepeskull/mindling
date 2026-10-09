# Knowledge Area 2.0 Phase 4B: independent topic annotation pilot

## Purpose and isolation

The standalone tool in `tools/topic-annotation/` tests whether people can consistently apply the established `SAME_AREA`, `DIFFERENT_AREA`, and `UNCERTAIN` definitions. It evaluates the annotation task, not an AI model, and is not imported by Mindling's production application.

The tool uses HTML, CSS, vanilla JavaScript, local files, and namespaced browser `localStorage`. It does not access Mindling's IndexedDB, canonical memories, Knowledge Areas, semantic models, or network inference. There is no backend, account, telemetry, or personal-information field.

## Run locally

From the repository root:

```bash
python3 -m http.server 8000
```

Open:

```text
http://localhost:8000/tools/topic-annotation/
```

HTTP is needed because the tool loads ES modules and its JSON dataset. Opening `index.html` directly with `file://` is not supported consistently by browsers.

## Independent annotation procedure

1. Choose and record one seed for the whole pilot.
2. Give Annotator A and Annotator B separate browser profiles or separate devices. Do not share screens or files while annotation is in progress.
3. Each selects **Independent annotation**, enters a non-identifying pseudonym and the identical seed, and completes the dataset independently.
4. Exactly one of `SAME_AREA`, `DIFFERENT_AREA`, or `UNCERTAIN` is required for every pair. A rationale of 8–500 characters is mandatory.
5. Each exports their own JSON. The annotation view never displays another annotator's result, expected labels, or dataset category.
6. Partial work is stored under a namespaced localStorage key and can also be exported. **Resume annotation JSON** validates the dataset ID/version, seed, pair IDs, labels, rationales, timestamps, and duplicate constraints before loading.

Pseudonyms permit letters, numbers, `.`, `_`, and `-` only. Do not enter names, emails, employer IDs, or other identifying information in pseudonyms or rationales.

The recorded seed controls pair order and left/right presentation deterministically. Dataset ID and version are part of the random seed, so an exported run can be reproduced exactly. Original sentence order remains unchanged in the dataset and exports.

## Agreement and adjudication procedure

1. A third person opens a separate workspace and selects **Agreement and adjudication**.
2. They enter a third, distinct pseudonym and import the two independent JSON files.
3. The tool requires matching dataset ID, dataset version, and seed, and distinct annotator pseudonyms.
4. It computes pre-adjudication analysis before displaying disagreements.
5. Only disagreements are offered for adjudication. The adjudicator sees both original judgments and rationales, chooses one of the same three labels, and must provide a new rationale.
6. Export the combined JSON and CSV after adjudication. The combined JSON retains both immutable source runs, adjudications, and the analysis snapshot.

Adjudication never rewrites the two source annotations. Pre-adjudication raw agreement, kappa, confusion matrix, category agreement, and uncertainty frequency therefore remain unchanged.

## Metrics

For pairs judged by both annotators, the tool reports:

- raw agreement: identical judgments divided by compared pairs;
- Cohen's kappa: `(observed agreement - expected agreement) / (1 - expected agreement)`, using the two annotators' three-label marginals;
- a 3×3 confusion matrix with Annotator A as rows and Annotator B as columns;
- raw agreement within each hidden example category;
- `UNCERTAIN` frequency across both annotators' judgments;
- disagreement, adjudication, and unresolved-disagreement counts;
- final per-pair resolution source (`AGREEMENT`, `ADJUDICATED`, or `UNRESOLVED`).

Kappa is reported as unavailable when there are no common judgments or expected agreement equals one. Agreement measures consistency only; it does not prove that agreed labels are semantically correct.

## Dataset format and sample

`pilot-dataset.json` is an unlabeled, human-reviewable interface sample containing 28 newly authored pairs. It does not copy the frozen 70-pair evaluation corpus and contains no gold judgment. Its seven sampling categories cover:

- different facts about the same subject;
- related but distinct subjects;
- lexically similar but different subjects;
- broad versus narrow subjects;
- ambiguous memories;
- multi-subject memories;
- multilingual and unseen topic families.

Categories support stratified analysis but are hidden while annotating. They are not a runtime taxonomy.

Custom JSON datasets can contain 1–500 pairs, enabling the planned 300–500-pair protocol pilot. Schema:

```json
{
  "schemaVersion": 1,
  "datasetId": "stable-dataset-id",
  "version": "immutable-version",
  "title": "Human-readable title",
  "pairs": [
    {
      "id": "unique-pair-id",
      "category": "sampling-stratum",
      "left": "First independently understandable sentence.",
      "right": "Second independently understandable sentence."
    }
  ]
}
```

Changing any sentence requires a new dataset version. Keep a provenance and license manifest beside a real pilot dataset; the interface sample is CC0. Do not include frozen evaluation examples, silently generated labels, personal user memories, or text without documented reuse rights.

## Export formats and integrity

Individual JSON exports contain schema version, dataset identity/version, seed, pseudonym, creation time, and one timestamped label/rationale per pair. Individual CSV exports include the untouched source sentences and the same metadata.

Combined adjudication exports add both source judgments/rationales and a final judgment plus resolution source. CSV cells are quoted and embedded quotes are escaped. Import rejects:

- unknown schema versions;
- mismatched dataset IDs or versions;
- unknown or duplicate pair IDs;
- unknown judgments;
- missing/short rationales;
- seed mismatch;
- identical annotator identities;
- an adjudicator matching either annotator;
- adjudication of a pair that was not a disagreement.

The browser tool is not an authentication or access-control system. Procedural independence requires separate profiles/devices and controlled transfer of completed JSON files. Anyone with a file can read it, so rationales must contain no personal or confidential information.

## Pilot decision and stop conditions

The 28-pair sample validates the interface only and must not be used to approve classifier training. The actual protocol pilot requires 300–500 independently authored, licensed, topic-family-separated pairs across English, Swedish, Spanish, and cross-lingual strata.

Stop before a classifier experiment if:

1. overall agreement remains below 0.80 after one protocol clarification;
2. any major language or example stratum remains below 0.70 agreement;
3. kappa, confusion, or rationale review shows systematic collapse between `DIFFERENT_AREA` and `UNCERTAIN`;
4. broad/narrow cases cannot be resolved without a fixed taxonomy;
5. adjudication volume makes the definition operationally unstable;
6. legally reusable, provenance-controlled statements cannot be assembled;
7. reviewers agree for superficial wording reasons rather than the operational subject definition;
8. the sample is too stylistically narrow to represent Mindling-like memories.

Passing agreement gates only supports proceeding to the separately approved offline classifier POC. It does not establish semantic truth, model feasibility, Topic Graph correctness, or production readiness.
