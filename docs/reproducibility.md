# Reproducibility & Citation — ERX / إعادة الإنتاج والاستشهاد

ERX (Egypt Research Commons) is built to be **citable** and **reproducible** so that
academic and investigative work grounded in it can be verified and reproduced by others.

منصة ERX مصممة لتكون **قابلة للاستشهاد** و**قابلة لإعادة الإنتاج**، بحيث يمكن التحقق من
أي بحث يعتمد عليها وإعادة إنتاج نتائجه.

## 1. Stable citation identifiers & permalinks / المعرّفات الثابتة والروابط الدائمة

Every search result and document returned by ERX (via the MCP tools or the REST API)
carries a `citation` object with two stability guarantees:

- **`citationId`** — a deterministic identifier of the form `erx:<12 hex chars>`,
  derived as the first 12 hex characters of `sha256(canonicalUrl)`. It depends **only**
  on the document's canonical source URL, so the same source always maps to the same
  `citationId` — across machines, across database rebuilds, and across ERX versions.
- **`permalink`** — a stable URL of the form
  `https://erx-mcp.zad.tools/documents/<documentId>` that resolves to the ERX record.

المعرّف `citationId` مشتق حسابيًا من الرابط الأصلي (canonical URL) للوثيقة، لذا فهو ثابت
عبر الأجهزة وإعادة بناء قاعدة البيانات وإصدارات ERX المختلفة. أما `permalink` فهو رابط دائم
يشير إلى سجل الوثيقة داخل ERX.

The full `citation` object is:

```json
{
  "title": "…",
  "sourceName": "…",
  "url": "https://source.example/original-article",
  "publishedAt": "2026-07-15T10:00:00.000Z",
  "archivedAt": "2026-07-20T08:00:00.000Z",
  "citationId": "erx:9f2c1a7b4de0",
  "permalink": "https://erx-mcp.zad.tools/documents/1234"
}
```

> `citationId` is stable against the source URL; `permalink` is stable against the ERX
> record id. Prefer `citationId` when you need an identity that survives re-ingestion.

## 2. How to cite an ERX document / كيفية الاستشهاد بوثيقة

Cite the original source, then add the ERX identifier, permalink, and the date you
accessed it (ERX is a living corpus, so the accessed date matters).

استشهد بالمصدر الأصلي أولًا، ثم أضف معرّف ERX والرابط الدائم وتاريخ الاطلاع.

**Example (English):**

> Ministry of Finance. "قرار وزاري جديد" (2026-07-15). Egypt Research Commons (ERX),
> `erx:9f2c1a7b4de0`, https://erx-mcp.zad.tools/documents/1234 (accessed 2026-07-20).

**مثال (بالعربية):**

> وزارة المالية، «قرار وزاري جديد» (2026-07-15)، منصة ERX للأبحاث المصرية،
> المعرّف `erx:9f2c1a7b4de0`، https://erx-mcp.zad.tools/documents/1234 (تاريخ الاطلاع 2026-07-20).

## 3. Producing a dataset snapshot / إنتاج لقطة من مجموعة البيانات

To reproduce results you should cite a **fixed snapshot** of the corpus rather than the
live database. Generate one with the `dataset-dump` command (or the wrapper script):

```bash
# Build then dump (wrapper):
node scripts/export-dataset.mjs data/dataset --database data/research.db

# Or directly against a compiled build:
npm run build
node dist/cli.js dataset-dump --database data/research.db --output data/dataset
```

This writes a versioned, checksummed snapshot into the output directory
(default `dist-dataset/`):

- **`documents.jsonl`** — one searchable document per line (excludes `document_type == "excluded"`).
- **`sources.json`** — the source catalog with health and provenance metadata.
- **`manifest.json`** — snapshot metadata:

```json
{
  "name": "egypt-research-commons-dataset",
  "version": "1.0.0",
  "generatedAt": "2026-07-20T08:00:00.000Z",
  "documentCount": 4210,
  "sourceCount": 63,
  "files": [
    { "name": "documents.jsonl", "sha256": "…", "bytes": 1234567 },
    { "name": "sources.json", "sha256": "…", "bytes": 45678 }
  ],
  "license": "MIT (code); source content rights reserved to owners",
  "citation": "Egypt Research Commons (ERX) dataset snapshot v1.0.0, generated 2026-07-20T08:00:00.000Z. https://erx-mcp.zad.tools"
}
```

The `sha256` checksums let anyone verify that the files they hold match the manifest,
which is what makes a snapshot reproducible.

قيم التحقق `sha256` تتيح لأي شخص التأكد من أن الملفات التي بحوزته مطابقة للـ manifest،
وهذا ما يجعل اللقطة قابلة لإعادة الإنتاج.

## 4. Archiving & citing a snapshot / أرشفة اللقطة والاستشهاد بها

For a citable, permanent record, **archive the snapshot on Zenodo** (or a similar
research data repository) to mint a DOI, then cite that DOI in your paper. Recommended steps:

للحصول على سجل دائم قابل للاستشهاد، **أرشِف اللقطة على Zenodo** للحصول على معرّف DOI، ثم استشهد به.

1. Run `dataset-dump` to produce `documents.jsonl`, `sources.json`, and `manifest.json`.
2. Upload the three files to Zenodo as a new dataset deposit.
3. Record the ERX `version` and `generatedAt` from `manifest.json` in the Zenodo metadata.
4. Publish to mint a DOI, then cite it, e.g.:

> Morsy, A. *Egypt Research Commons (ERX) dataset snapshot v1.0.0* [Data set]. Zenodo.
> https://doi.org/10.5281/zenodo.XXXXXXX (generated 2026-07-20).

See also `CITATION.cff` in the repository root for citing the ERX **software** itself.
