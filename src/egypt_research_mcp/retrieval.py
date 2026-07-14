from __future__ import annotations

import hashlib
import math
from collections import defaultdict

import httpx

from .models import HybridSearchResult
from .normalization import normalize_arabic
from .store import ResearchStore


_CONCEPT_GROUPS = (
    ("عامل", "عمال", "العاملين", "العماليه", "العمل", "حقوق"),
    ("قانون", "تشريع", "لايحه", "قرار"),
    ("سجن", "حبس", "احتجاز"),
    ("صحافه", "اعلام", "صحفي", "تعبير"),
    ("انتخاب", "انتخابات", "اقتراع"),
)


class LocalEmbeddingProvider:
    provider = "local"
    model = "arabic-hash-v1"

    def __init__(self, dimensions: int = 256) -> None:
        if dimensions < 64 or dimensions > 4_096:
            raise ValueError("dimensions must be between 64 and 4096")
        self.dimensions = dimensions
        self.model = f"arabic-hash-v1-{dimensions}"

    def embed(self, text: str) -> list[float]:
        normalized = normalize_arabic(text)
        tokens = normalized.split()
        expanded = list(tokens)
        token_set = set(tokens)
        for group in _CONCEPT_GROUPS:
            if token_set.intersection(group):
                expanded.extend(group)
        features = expanded + [
            normalized[index : index + 3]
            for index in range(max(0, len(normalized) - 2))
            if " " not in normalized[index : index + 3]
        ]
        vector = [0.0] * self.dimensions
        for feature in features:
            digest = hashlib.sha256(feature.encode()).digest()
            bucket = int.from_bytes(digest[:4], "big") % self.dimensions
            sign = 1.0 if digest[4] % 2 == 0 else -1.0
            vector[bucket] += sign
        norm = math.sqrt(sum(value * value for value in vector))
        return [value / norm for value in vector] if norm else vector

    def embed_query(self, text: str) -> list[float]:
        return self.embed(text)


class GeminiEmbeddingProvider:
    provider = "google"
    model = "gemini-embedding-2"

    def __init__(
        self,
        *,
        api_key: str,
        client: httpx.Client | None = None,
        dimensions: int = 768,
    ) -> None:
        if not api_key.strip():
            raise ValueError("Gemini API key is required")
        if dimensions < 128 or dimensions > 3_072:
            raise ValueError("dimensions must be between 128 and 3072")
        self.api_key = api_key
        self.client = client
        self.dimensions = dimensions

    def embed(self, text: str) -> list[float]:
        return self._embed(text, task_type="RETRIEVAL_DOCUMENT")

    def embed_query(self, text: str) -> list[float]:
        return self._embed(text, task_type="RETRIEVAL_QUERY")

    def _embed(self, text: str, *, task_type: str) -> list[float]:
        if not text.strip():
            raise ValueError("Embedding text cannot be empty")
        owns_client = self.client is None
        client = self.client or httpx.Client(timeout=30)
        try:
            response = client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:embedContent",
                headers={"x-goog-api-key": self.api_key},
                json={
                    "model": f"models/{self.model}",
                    "content": {"parts": [{"text": text[:32_000]}]},
                    "taskType": task_type,
                    "outputDimensionality": self.dimensions,
                },
            )
            response.raise_for_status()
            payload = response.json()
            vector = payload.get("embedding", {}).get("values")
            if not isinstance(vector, list) or len(vector) != self.dimensions:
                raise ValueError("Gemini returned an invalid embedding vector")
            return [float(value) for value in vector]
        finally:
            if owns_client:
                client.close()


def cosine_similarity(left: list[float], right: list[float]) -> float:
    if len(left) != len(right):
        return 0.0
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if not left_norm or not right_norm:
        return 0.0
    dot_product = sum(a * b for a, b in zip(left, right, strict=True))
    return dot_product / (left_norm * right_norm)


class HybridRetriever:
    def __init__(
        self, store: ResearchStore, *, provider: LocalEmbeddingProvider | None = None
    ) -> None:
        self.store = store
        self.provider = provider or LocalEmbeddingProvider()

    def search(
        self,
        query: str,
        *,
        limit: int = 20,
        source_types: list[str] | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
    ) -> list[HybridSearchResult]:
        if not 2 <= len(query.strip()) <= 1_000:
            raise ValueError("query must be between 2 and 1000 characters")
        limit = max(1, min(limit, 100))
        lexical = self.store.search(
            query,
            limit=min(100, limit * 5),
            source_types=source_types,
            date_from=date_from,
            date_to=date_to,
        )
        query_vector = self.provider.embed_query(query)
        semantic = sorted(
            (
                (document_id, cosine_similarity(query_vector, vector))
                for document_id, vector in self.store.list_embeddings(
                    provider=self.provider.provider,
                    model=self.provider.model,
                    source_types=source_types,
                    date_from=date_from,
                    date_to=date_to,
                )
            ),
            key=lambda item: item[1],
            reverse=True,
        )
        semantic = [item for item in semantic if item[1] > 0.02][: min(100, limit * 5)]
        scores: dict[int, float] = defaultdict(float)
        reasons: dict[int, set[str]] = defaultdict(set)
        for rank, result in enumerate(lexical, start=1):
            scores[result.document_id] += 1 / (60 + rank)
            reasons[result.document_id].add("lexical")
        for rank, (document_id, similarity) in enumerate(semantic, start=1):
            scores[document_id] += (1 / (60 + rank)) * max(0.2, similarity)
            reasons[document_id].add("semantic")

        ranked = sorted(scores, key=scores.get, reverse=True)[:limit]
        results: list[HybridSearchResult] = []
        for document_id in ranked:
            document = self.store.get_document(document_id)
            if document is None:
                continue
            values = document.model_dump(exclude={"content"})
            results.append(
                HybridSearchResult(
                    **values,
                    retrieval_score=round(scores[document_id], 8),
                    match_reasons=sorted(reasons[document_id]),
                )
            )
        return results
