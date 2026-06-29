# ADR 0013: Aruco Marker Visualization and DRY Viewport Mapping

## Kontekst
W ramach uwiarygodnienia odczytywania markera ArUco dla końcowego użytkownika (tzw. "Wizualizacja Zaufania"), zaistniała potrzeba wyrenderowania zidentyfikowanego markera bezpośrednio na zdjęciu wynikowym (w locie, jeszcze przed eksportem) przy użyciu natywnego renderera `react-native-svg`. Rzutowanie wierzchołków na obraz musiało być bezwzględnie poprawne i odporne na asymetryczne wymiary ekranów i mechanikę letterboxingu (właściwość `contain` / `xMidYMid meet`).

Problem z kodem bazowym polegał na tym, że logika przeliczania ułamków pikseli z oryginalnego wymiaru (np. 1200x1600) na wyrenderowany na ekranie komponent (np. 390x520) była zduplikowana i zaszyta głęboko w funkcji `getTrueDistance`, co groziło desynchronizacją rzutowania przy próbach podłączenia innych wektorów.

## Decyzja
Zdecydowano na wdrożenie dwóch mechanik:
1. **DRY Viewport Mapping**: Ekstrakcja matematyki letterboxingu (`renderedW`, `renderedH`, `offsetX`, `offsetY`, `imgAspect`, `viewAspect`) do nadrzędnego bloku wewnątrz funkcji ekranu wyniku. Na bazie tych stałych utworzono dwie funkcje pomocnicze pracujące w czasie rzeczywistym:
   - `mapOriginalToScreen`: przeliczająca surowe piksele zdjęcia na przestrzeń SVG.
   - `mapScreenToOriginal`: przeliczająca uderzenia dotyku z ekranu na surowe piksele zdjęcia.
2. **Natywny Polygon SVG**: Utworzenie przezroczystego zielonego elementu `<Polygon>` z `react-native-svg` (zarówno na ekranie głównym jak i na off-screenowym rzucie dla Share/Eksportu). Wierzchołki czerpią wartości bezpośrednio ze zidentyfikowanej macierzy w module ArUco (tablica 4 narożników), przepuszczone przez nową funkcję `mapOriginalToScreen`.

## Konsekwencje (Zalety / Wady)
- **Zalety:**
  - Matematyka skalowania staje się "Single Source of Truth" dla ekranu wyniku.
  - Użytkownik widzi wizualnie "trapez" markera, czyli dokładnie to, w jaki sposób obiektyw i algorytm zinterpretowały fizyczny obiekt, wliczając kompresję perspektywiczną ujęcia (jeśli zdjęcie zrobiono pod kątem). Gwarantuje to absolutne zaufanie do obliczeń na linii telefon-użytkownik.
  - Zastosowanie wektora omija problem nakładania obrazów rastrowych.
- **Wady:**
  - `mapOriginalToScreen` podlega w całości poprawności właściwości `preserveAspectRatio="xMidYMid meet"`. Jakiekolwiek niestandardowe zachowania tej właściwości na egzotycznych wersjach Androida mogą wymagać drobnych kalibracji, choć w praktyce `meet` to matematyczny standard rzutu izometrycznego.
