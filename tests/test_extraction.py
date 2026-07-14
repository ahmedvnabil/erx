import httpx
import pytest

from egypt_research_mcp.extraction import extract_article, fetch_article


def test_extract_article_prefers_main_content_and_removes_page_chrome() -> None:
    html = """
    <html lang="ar"><head><title>عنوان الصفحة</title></head><body>
      <nav>الرئيسية الأخبار اتصل بنا</nav>
      <article><h1>قرار اقتصادي جديد</h1>
        <p>أعلنت الجهة الرسمية تفاصيل القرار الاقتصادي الجديد اليوم.</p>
        <p>ويتضمن القرار مجموعة من الإجراءات الموثقة والقابلة للمراجعة.</p>
      </article>
      <footer>جميع الحقوق محفوظة</footer>
    </body></html>
    """

    extracted = extract_article(html, "https://example.org/news/1")

    assert extracted.title == "قرار اقتصادي جديد"
    assert "تفاصيل القرار" in extracted.content
    assert "الرئيسية الأخبار" not in extracted.content
    assert "جميع الحقوق" not in extracted.content


def test_extract_article_rejects_empty_or_non_article_pages() -> None:
    extracted = extract_article(
        "<html><body><nav>الرئيسية الأخبار</nav></body></html>",
        "https://example.org/news/2",
    )

    assert extracted.content == ""
    assert extracted.title == ""


def test_fetch_article_accepts_html_from_source_host() -> None:
    html = "<article><h1>عنوان موثق</h1><p>" + ("نص المقال الكامل " * 10) + "</p></article>"
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            200, text=html, headers={"content-type": "text/html; charset=utf-8"}
        )
    )
    with httpx.Client(transport=transport) as client:
        extracted = fetch_article(
            client, "https://news.example.org/item/1", "news.example.org"
        )

    assert extracted.title == "عنوان موثق"
    assert len(extracted.content) > 100


def test_fetch_article_rejects_cross_host_urls_without_requesting() -> None:
    transport = httpx.MockTransport(
        lambda request: pytest.fail("unsafe URL should not be requested")
    )
    with httpx.Client(transport=transport) as client:
        with pytest.raises(ValueError, match="outside the configured source host"):
            fetch_article(client, "https://attacker.example/item", "news.example.org")
