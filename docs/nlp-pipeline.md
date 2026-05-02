# NLP Pipeline

Two stages run in sequence on every ingested article: ticker extraction, then sentiment analysis.

## Ticker extraction

NewsAPI returns articles untagged. We map free-text article content to one or more tickers in our scope.

### MVP — dictionary lookup

A hardcoded company-name → ticker map covering the 10-ticker scope:

```python
TICKER_DICT = {
    "Apple":     "AAPL",
    "Microsoft": "MSFT",
    "Nvidia":    "NVDA",
    "Tesla":     "TSLA",
    "Amazon":    "AMZN",
    "Meta":      "META",
    "Facebook":  "META",
    "Google":    "GOOGL",
    "Alphabet":  "GOOGL",
    "AMD":       "AMD",
    "Netflix":   "NFLX",
    "LegalZoom": "LZ",
    "Legal Zoom": "LZ",
}
```

Match strategy: case-insensitive substring search on `headline + summary`. Also match the bare ticker symbol (`AAPL`, `MSFT`, ...) to catch finance-jargon articles. An article matching multiple companies emits multiple `(article, ticker)` pairs.

### Better — spaCy NER

Replace the substring search with `spacy.load("en_core_web_sm")` and extract `ORG` entities, then dictionary-lookup each ORG. Reduces false positives like "Apple pie" or "Amazon rainforest."

```python
nlp = spacy.load("en_core_web_sm")
orgs = [ent.text for ent in nlp(text).ents if ent.label_ == "ORG"]
tickers = {TICKER_DICT[org] for org in orgs if org in TICKER_DICT}
```

### Advanced

- **Confidence scoring:** count of mentions × position weight (headline mention worth more than body)
- **Multi-ticker disambiguation:** if "Apple" and "AAPL" both appear, count as one signal not two
- **Ambiguity guard:** drop matches in obvious non-finance contexts (e.g., article in a "Food" category)
- **Ticker aliases for global names:** "GOOG" → "GOOGL" rollup, share-class handling

## Sentiment analysis

### MVP — FinBERT

Pretrained financial sentiment model from Hugging Face. Two reasonable choices:

| Model | Notes |
|---|---|
| `ProsusAI/finbert` | Most-cited, three-class (positive/negative/neutral), trained on Financial PhraseBank |
| `yiyanghkust/finbert-tone` | Newer, also three-class, trained on analyst reports — often better for headline-style text |

Default to `ProsusAI/finbert` for MVP, swap if backtest results suggest the other is better calibrated.

### Why not generic sentiment models

VADER, distilbert-sst2, and other general-purpose sentiment models were trained on movie reviews, tweets, and product reviews. They miscalibrate on finance jargon:

- "Apple **missed** estimates" → generic model: neutral; reality: negative
- "Tesla announces **buyback**" → generic model: neutral; reality: positive
- "Fed **cuts** guidance" → generic model: negative; reality: depends on whether cut was expected

**This is the single biggest pitfall to avoid.** Use a finance-specific model from day one.

### Input format

Concatenate headline and summary with a separator:

```
text = f"{article.headline}. {article.summary or ''}"
```

Truncate to the model's max token length (FinBERT: 512 tokens). For very long bodies (rare from NewsAPI summaries), prefer the headline.

### Output format

Per (article, ticker), produce:

```json
{
  "article_id": 123,
  "ticker": "AAPL",
  "sentiment_label": "positive",
  "sentiment_score": 0.82,
  "confidence": 0.88
}
```

Where:
- `sentiment_label`: argmax of the model's three-class output
- `sentiment_score`: signed scalar in [-1, +1] — `+prob[pos] - prob[neg]` (ignore neutral)
- `confidence`: max of the three softmax probs

### Latency expectations

FinBERT is ~110M params. On CPU, inference runs ~50–200ms per article. With ~200 articles/day at MVP scope, no GPU needed. Batch inference (16–32 articles per `model()` call) drops per-article cost significantly if latency becomes a concern.
