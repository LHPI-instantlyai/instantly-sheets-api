from firecrawl import Firecrawl
import re

firecrawl = Firecrawl(api_key="fc-83313d19e915493ea604a12cd3a8f97c")

US_INDICATORS = [
    # Country names & common synonyms
    r"\bUnited States\b",
    r"\bU\.S\.A?\b",
    r"\bUSA\b",
    r"\bAmerica\b",

    # US territories
    r"\bAmerican Samoa\b",
    r"\bGuam\b",
    r"\bPuerto Rico\b",
    r"\bU\.S\. Virgin Islands\b",
    r"\bNorthern Mariana Islands\b",
    r"\bU\.S\. Minor Outlying Islands\b",

    # ZIP codes (5-digit or ZIP+4)
    # r"\b\d{5}(?:-\d{4})?\b",

    # US phone numbers with country code
    r"\+1[-\s]?\(?\d{3}\)?[-\s]?\d{3}[-\s]?\d{4}\b",

    # US-specific TLDs
    r"\.us\b",
    r"\.gov\b",
    r"\.mil\b",

    # Common street suffixes (reduces false hits on “Lane”, “Drive”, etc.)
    # r"\b(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Lane|Ln|Drive|Dr|Court|Ct|Circle|Cir|Way|Highway|Hwy)\b",

    # US currency (simple $-digit check)
    r"\$\s?\d",

    # Full list of 50 states + DC
    r"\b(?:Alabama|Alaska|Arizona|Arkansas|California|Colorado|"
    r"Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|"
    r"Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|"
    r"Massachusetts|Michigan|Minnesota|Mississippi|Missouri|"
    r"Montana|Nebraska|Nevada|New Hampshire|New Jersey|"
    r"New Mexico|New York|North Carolina|North Dakota|Ohio|"
    r"Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|"
    r"South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|"
    r"Washington|West Virginia|Wisconsin|Wyoming|"
    r"District of Columbia)\b",

    # Two-letter USPS codes for states + DC & territories
  
]
US_REGEX = re.compile("|".join(US_INDICATORS), re.IGNORECASE)

def operates_in_us(website: str) -> bool:
    """
    Scrapes a site and returns True if US indicators appear
    in any of the returned fields.
    """
    # 1. Scrape the site
    doc = firecrawl.scrape(website, formats=["html", "markdown"])
    
    # 2. Safely extract each field rather than using doc.get()
    content = ""
    for field in ("html", "markdown"):
        value = getattr(doc, field, None)
        if isinstance(value, str):
            content += value

    # 3. Run the compiled US‐focused regex
    return bool(US_REGEX.search(content))


if __name__ == "__main__":
    site = "https://corporate.exxonmobil.com"
    if operates_in_us(site):
        print(f"{site} appears to operate in the US.")
    else:
        print(f"{site} does NOT appear to operate in the US.")
