from __future__ import annotations

from .normalization import normalize_arabic


STOPWORDS = {
    "في",
    "من",
    "على",
    "الى",
    "عن",
    "مع",
    "هذا",
    "هذه",
    "بعد",
    "قبل",
    "اليوم",
    "جديد",
    "جديدة",
    "مصر",
    "المصرية",
}


def headline_tokens(title: str) -> frozenset[str]:
    return frozenset(
        token
        for token in normalize_arabic(title).split()
        if len(token) > 2 and token not in STOPWORDS
    )


def similarity(left: frozenset[str], right: frozenset[str]) -> float:
    if not left or not right:
        return 0.0
    return len(left & right) / len(left | right)
