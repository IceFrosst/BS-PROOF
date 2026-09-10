# Result card: exact-product photo (design note)

Goal: after a label scan identifies the exact product, show the tub the user scanned, not just text.
Sourcing order for the live version: (1) the manufacturer or retailer product page the research step already
found — cache a thumbnail, never hotlink, and record the page URL as provenance; (2) Open Food Facts image for the
matched barcode (CC BY-SA / ODbL — attribute); (3) the user's own scan photo, cropped, as fallback.
Every photo carries a visible source chip ("Photo · brand site" / "retailer" / "Open Food Facts" / "your scan").
Risks: wrong-SKU or old-packaging mismatch (mitigate with "Not your product?" → re-pick or use scan photo);
copyright on retailer images (thumbnail from a cited page under the research citation, or prefer OFF/user photo);
tracking/hotlink leakage (proxy and cache, strip referrer); a photo implying endorsement or certainty the score does
not have (chip + neutral framing, photo never changes the score).
Prototype uses a hatched placeholder only; no fetch, no image asset.
