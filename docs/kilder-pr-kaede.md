# Tilbudspriser direkte fra kæderne – kilde pr. kæde

Undersøgt 26.10.2026. Spørgsmålet: kan ugens tilbud hentes fra kædens **egen** kilde i stedet for via Tjek/eTilbudsavis (hvis vilkår §8.4 forbyder tredjeparter at hente Tjek-hostet indhold systematisk)? Kun fakta: varenavn, størrelse, pris, gyldighed. Ingen billeder eller reklametekst.

Metode: få, høflige forespørgsler pr. site. Intet login, ingen cookie-accept, ingen omgåelse af spærringer. Ikke juridisk rådgivning.

## Overblik

| Kæde | Avisen vises via | Egen strukturerede kilde | robots.txt | Vilkår mod scraping? | Vurdering |
|---|---|---|---|---|---|
| **REMA 1000** | Tjek (avis-viseren) | ✅ REMA's eget API: `api.digital.rema1000.dk/api/search/products?filter[labels]=9001` ("Avisvare") – 288 varer med pris, størrelse, datoer | Alt tilladt på API-hosten | Ingen fundet | **Egen kilde – OK** |
| **Lidl** | Schwarz' egen leaflet-tjeneste | ✅ `endpoints.leaflets.schwarz/v4/flyer?flyer_identifier=…` – 91 madtilbud med navn, pris, datoer. Størrelse fra lidl.dk-kategorisider (`data-grid-data`). Faste hverdagspriser (uden slutdato) fra `/c/hverdagensfavoritter/a10105653` og `/c/madvaerket/a10105652` – ca. 40 varer, bruges som hyldepris | Ikke blokeret | Ingen fundet | **Egen kilde – OK** |
| **Føtex** | iPaper på avis.foetex.dk | ⚠️ Kun ustruktureret sidetekst (`pageTexts`) med navne, størrelser, priser. Strukturerede hotspots er token-beskyttede (403) | Flipbook-sider tilladt | Ingen fundet | **Egen kilde – men kræver tekst-parsing** |
| **Bilka** | iPaper på avis.bilka.dk | ⚠️ Som Føtex. Gyldighed står i teksten. Bilka ToGo-priser også via Sallings officielle API | Flipbook-sider tilladt | Ingen fundet | **Egen kilde – men kræver tekst-parsing** |
| **Netto** | Tjek (viseren) + offentlig PDF via download-knappen | ✅ Avis-PDF'en har fuldt tekstlag og læses med layout-parser (implementeret i repoet idebanken-mad-app-pdf-aviser) | Alt tilladt | Ingen for websitet | **Egen avis-PDF** |
| **Kvickly, SuperBrugsen, Brugsen, 365discount** | Tjek (fælles Coop-platform) | ❌ Kun ~14 forside-tilbud pr. kæde i egen HTML, uden datoer. Coops pris-endpoint ligger under robots-blokeret `/umbraco/` og kræver Tjek-ID'er | `/umbraco/` blokeret | Ingen fundet | **Kun via Tjek** (forside-udpluk: egen kilde) |
| **MENY, SPAR, Min Købmand, LET-KØB** | iPaper | ❌ Strukturerede data token-beskyttede (403). MENY's webshop er kun vin og bag Cloudflare | `/api/` blokeret på hovedsites | Ingen fundet | **Kun via Tjek** |
| **Løvbjerg** | Tjek-widget + egen PDF (64 MB) | ❌ Kun PDF – kræver OCR | Crawl-delay 10 s | Ingen fundet | **Kun via Tjek / PDF** |
| **ABC Lavpris** | Egne JPG-billeder pr. region | ❌ Kun billeder – kræver OCR | Kun `/admin` blokeret | Ingen fundet | **Kun billeder** |

## Hvad det betyder

- **Klar egen kilde (2 kæder):** REMA 1000 og Lidl. Strukturerede data, ingen login, ingen spærring, intet forbud i vilkår. Kan erstatte Tjek for disse to med det samme.
- **Mulig egen kilde med arbejde (2 kæder):** Føtex og Bilka via iPaper-sideteksten. Kræver en parser til fri tekst og er mere skrøbelig.
- **Kun via Tjek eller aftale (11 kæder):** Netto, Coop-kæderne, Dagrofa-kæderne, Løvbjerg, ABC. Her er vejen en licens fra Tjek eller en direkte aftale med kæden.
- **Ingen omgåelse:** token-beskyttede iPaper-data og robots-blokerede endpoints rører vi ikke – det ville være at omgå en adgangskontrol.

## Juridiske forbehold

Ingen af kæderne har webvilkår, der nævner scraping eller automatisk adgang. Det er ikke det samme som tilladelse: ophavsretslovens § 71 (database/katalog) og ophavsret til billeder og layout gælder stadig. Derfor: kun fakta, få forespørgsler (fx én gang dagligt), ingen omgåelse af spærringer. Få en IT/IP-advokat til at se modellen før lancering, og overvej at spørge kæderne direkte.

---

# Fuldt sortiment (hyldepriser) pr. kæde

Undersøgt 19.11.2026 fra GitHub Actions (robots.txt, sitemaps og offentlige produktsider). Spørgsmålet: kan vi få **hele** sortimentet med hyldepriser, ikke kun avisens tilbud? Samme regler som ovenfor: robots.txt skal tillade det, intet login, ingen omgåelse og ingen nøgler hentet ud af sidernes kode.

| Kæde | Fundet | Vurdering |
|---|---|---|
| **REMA 1000** | Webshop-API med hele sortimentet | ✅ Bruges allerede |
| **Lidl** | Faste hverdagspriser på kategorisider (~40 varer) | ⚠️ Bruges allerede, ingen fuld webshop |
| **Netto, Føtex, Bilka** | BilkaToGo har et produkt-sitemap med 43.731 varer, og robots.txt tillader produktsiderne. Siderne indeholder dog ingen pris i HTML'en: prisen hentes bagefter fra en søgetjeneste med en nøgle i sidens JavaScript. Netto har ingen produktsider. | ❌ Ikke uden at bruge en nøgle fra deres kode. **Lovlig vej:** Salling Groups officielle API (developer.sallinggroup.dev) med en gratis nøgle: *Product Suggestions* og *Anti Food Waste* (madspild-tilbud pr. butik). |
| **MENY, SPAR, Min Købmand** | Butikkernes webshops (fx `parkvej.meny.dk`) har `Crawl-delay: 100` i robots.txt | ❌ 100 sek. pr. forespørgsel gør et fuldt katalog (15–20.000 varer) urealistisk |
| **LET-KØB** | Siden svarede ikke | ❌ |
| **Kvickly, SuperBrugsen, Brugsen, 365discount** | Kun kategori- og indholdssider. Pris-endpoint under `/umbraco/` er blokeret i robots.txt | ❌ Kun avisens tilbud via Tjek |

**Konsekvens:** Uden for REMA og Lidl bruger appen fortsat avisens tilbud og REMA's hyldepris som "vejledende".

# Opskriftssider

| Side | robots.txt | Struktureret opskrift | Antal (sitemap) | Bruges |
|---|---|---|---|---|
| Valdemarsro | Tilladt (GPTBot blokeret) | Ja (`recipeIngredient` i siden) | ~3.000 indlæg, ca. 1 ud af 7 er en aftensret | ✅ |
| Arla.dk | Opskriftssider tilladt, oversigter blokeret | Ja (`recipeIngredient` i siden) | 3.118 opskrifter | ✅ |
| Madens Verden | Tilladt | Ja (JSON-LD Recipe) | ~4.960 indlæg | ✅ |
| Mummum | Tilladt | Ja (JSON-LD Recipe) | ~3.650 indlæg | ✅ |
| Spisbedre | Tilladt | Nej | 2.001 | ❌ |
| DK-kogebogen | Tilladt | Nej (kun Organization) | – | ❌ |

Billeder: kildernes billeder svarer 200 uden Referer og har lang cache (1 år hos Madens Verden). Mummums originaler er op til 1 MB, så vi bruger deres mindre srcset-version (870 px, webp).

Kun fakta (ingredienser, mængder, tid, portioner) gemmes. Fremgangsmåden skrives om med egne ord, og billedet vises fra kildens server med link til originalen.
