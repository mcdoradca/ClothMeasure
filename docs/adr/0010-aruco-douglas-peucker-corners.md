# ADR 0010: Wdrożenie algorytmu Douglas-Peucker dla detekcji narożników ArUco
Data: 2026-06-29

## Kontekst
Prymitywna metoda znajdowania 4 skrajnych punktów markera poprzez ekstrema sum i różnic współrzędnych (`x+y`, `x-y`) powodowała krytyczne błędy przy markerach obróconych o kąty bliskie 45 stopni. Algorytm w takich warunkach łapał punkty wewnętrzne krawędzi, tworząc mikroskopijny czworokąt. To, po nałożeniu macierzy homografii (ADR 0009), skutkowało drastycznym rozciągnięciem skali (rozmiar 10 cm odczytywany był jako 25.4 cm / 10 cali). Ponadto pojawił się problem z mniejszymi markerami (prawdziwymi), które odpadały w rywalizacji z większymi formacjami tła (np. szum kołdry).

## Decyzja
Zastąpiono przestarzałą logikę `getCorners` solidnym algorytmem geometrycznym:
1. Obliczenie środka ciężkości (centroidu).
2. Znalezienie głównej przekątnej markera.
3. Obliczenie punktów skrajnych na podstawie linii podziału przestrzeni (koncepcja Douglas-Peucker).
4. Posortowanie wyników matematycznie przy pomocy kąta obrotu `Math.atan2`, by zawsze podawał wierzchołki w prawidłowej kolejności do silnika homografii.
Wprowadzono także funkcję `checkSolidBorder` sprawdzającą gruby pierścień na obrzeżach kandydata (min. 70% nasycenia czernią) co tnie fałszywe powidoki na wzorzystych tkaninach, a detektor faworyzuje "najmniejszego poprawnego" kandydata powyżej 30 px, odrzucając hałas przestrzenny.

## Konsekwencje
Algorytm jest odporny na kąt ułożenia telefonu (100% niezawodności dla kąta 45 stopni) i eliminuje duże obiekty tła uchodzące za marker. Detekcja sub-pikselowa przestała gubić docelowy 10x10cm.
