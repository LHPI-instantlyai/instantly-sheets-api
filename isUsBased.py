import argparse
from dotenv import load_dotenv
import os
import re
from firecrawl import Firecrawl
from collections import Counter

# Load environment variables
load_dotenv()

# Initialize Firecrawl
firecrawl_api_key = os.getenv("FIRECRAWL_API")
firecrawl = Firecrawl(api_key=firecrawl_api_key)

# US-specific indicators with weights
US_INDICATORS = {
    r"\bUnited States\b": 5,
    r"\bU\.S\.A?\b": 5,
    r"\bUSA\b": 5,
    r"\bAmerica\b": 4,

    r"\bAmerican Samoa\b": 3,
    r"\bGuam\b": 3,
    r"\bPuerto Rico\b": 3,
    r"\bU\.S\. Virgin Islands\b": 3,
    r"\bNorthern Mariana Islands\b": 3,
    r"\bU\.S\. Minor Outlying Islands\b": 3,

    r"\+1[-\s]?\(?\d{3}\)?[-\s]?\d{3}[-\s]?\d{4}\b": 2,
    r"\.us\b": 2,
    r"\.gov\b": 3,
    r"\.mil\b": 3,

    r"\$\s?\d": 1,  # very weak indicator

    # States
    r"\b(?:Alabama|Alaska|Arizona|Arkansas|California|Colorado|"
    r"Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|"
    r"Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|"
    r"Massachusetts|Michigan|Minnesota|Mississippi|Missouri|"
    r"Montana|Nebraska|Nevada|New Hampshire|New Jersey|"
    r"New Mexico|New York|North Carolina|North Dakota|Ohio|"
    r"Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|"
    r"South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|"
    r"Washington|West Virginia|Wisconsin|Wyoming|"
    r"District of Columbia)\b": 5,
}

# Compile regex patterns with their weights
US_PATTERNS = [(pat, re.compile(pat, re.IGNORECASE), weight) for pat, weight in US_INDICATORS.items()]


def analyze_us_matches(website: str):
    """Scrape the website and return US indicator matches with weighted confidence scores."""
    doc = firecrawl.scrape(website, formats=["html", "markdown"])

    content = ""
    for field in ("html", "markdown"):
        value = getattr(doc, field, None)
        if isinstance(value, str):
            content += value

    matches_with_weights = []
    total_weight = 0

    for pat, regex, weight in US_PATTERNS:
        matches = regex.findall(content)
        if matches:
            count = len(matches)
            weighted_score = count * weight
            total_weight += weighted_score
            matches_with_weights.append({
                "pattern": pat,
                "count": count,
                "weight": weight,
                "score": weighted_score
            })

    if total_weight == 0:
        return None

    # compute confidence share
    for m in matches_with_weights:
        m["confidence"] = round((m["score"] / total_weight) * 100, 2)

    return matches_with_weights


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("website", help="Website URL to check")
    args = parser.parse_args()

    site = args.website.strip()
    matches = analyze_us_matches(site)

    if matches:
        print("US")
        print("Matches with weighted confidence:")
        for m in matches:
            print(f"- {m['pattern']}  |  count: {m['count']}  |  weight: {m['weight']}  |  confidence: {m['confidence']}%")
    else:
        print("NOT_US")
