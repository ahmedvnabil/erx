from __future__ import annotations

import hashlib
import re

from .models import KnowledgeIndexReport
from .normalization import normalize_arabic
from .retrieval import LocalEmbeddingProvider
from .store import ResearchStore


_ENTITY_LEXICON = (
    (
        "المبادرة المصرية للحقوق الشخصية",
        "organization",
        ("المبادرة المصرية",),
    ),
    ("النيابة العامة", "organization", ()),
    ("مجلس النواب", "organization", ("البرلمان المصري",)),
    ("وزارة الداخلية", "organization", ()),
    ("محكمة النقض", "organization", ()),
    ("الجهاز المركزي للتعبئة العامة والإحصاء", "organization", ("التعبئة والإحصاء",)),
    ("القاهرة", "location", ()),
    ("الإسكندرية", "location", ()),
    ("سيناء", "location", ()),
    ("رفح", "location", ()),
    ("العريش", "location", ()),
)

_REPORTING_VERBS = (
    "اعلن",
    "قال",
    "اكد",
    "ذكر",
    "افاد",
    "صرح",
    "اوضحت",
    "اوضح",
)


class KnowledgeIndexer:
    def __init__(
        self,
        store: ResearchStore,
        *,
        embedding_provider: LocalEmbeddingProvider | None = None,
    ) -> None:
        self.store = store
        self.embedding_provider = embedding_provider

    def index_document(self, document_id: int) -> KnowledgeIndexReport:
        document = self.store.get_document(document_id)
        if document is None:
            raise ValueError(f"Unknown document: {document_id}")
        self.store.reset_document_knowledge(document_id)
        text = f"{document.title}\n{document.excerpt}\n{document.content}"
        normalized = normalize_arabic(text)

        entities = []
        for canonical_name, entity_type, aliases in _ENTITY_LEXICON:
            candidates = (canonical_name, *aliases)
            mentions = sum(normalized.count(normalize_arabic(name)) for name in candidates)
            if not mentions:
                continue
            self.store.link_entity(
                document_id,
                canonical_name,
                entity_type,
                mentions=mentions,
                confidence=0.95 if normalize_arabic(canonical_name) in normalized else 0.8,
                aliases=list(aliases),
            )
            entities.append(canonical_name)

        claims = []
        for sentence in re.split(r"[.!؟\n]+", document.content):
            sentence = " ".join(sentence.split()).strip()
            normalized_sentence = normalize_arabic(sentence)
            if len(sentence) < 25 or not any(
                verb in normalized_sentence for verb in _REPORTING_VERBS
            ):
                continue
            self.store.upsert_claim(document_id, sentence)
            claims.append(sentence)

        locations = [
            name
            for name, entity_type, _ in _ENTITY_LEXICON
            if entity_type == "location" and normalize_arabic(name) in normalized
        ]
        occurred_at = document.event_at or document.published_at or document.archived_at
        self.store.upsert_event_for_document(
            document_id,
            title=document.title,
            summary=document.excerpt or document.content[:500],
            occurred_at=occurred_at,
            event_type=document.topics[0] if document.topics else document.document_type,
            location=locations[0] if locations else None,
        )
        self.store.purge_orphan_knowledge()

        embedded = self.embedding_provider is not None
        if self.embedding_provider:
            vector = self.embedding_provider.embed(text)
            self.store.upsert_embedding(
                document_id,
                provider=self.embedding_provider.provider,
                model=self.embedding_provider.model,
                vector=vector,
                content_hash=hashlib.sha256(text.encode()).hexdigest(),
            )
        return KnowledgeIndexReport(
            document_id=document_id,
            entities=len(entities),
            claims=len(claims),
            events=1,
            embedded=embedded,
        )

    def backfill(self, *, limit: int = 10_000) -> list[KnowledgeIndexReport]:
        return [
            self.index_document(document_id)
            for document_id in self.store.list_document_ids(limit=limit)
        ]
