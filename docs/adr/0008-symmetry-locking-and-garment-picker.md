# ADR 0008: Wdrożenie funkcji Symmetry Locking i usunięcie twardych identyfikatorów z pomiarów

## Kontekst
W pierwotnej wersji ekranu wyników "Złączone Krawędzie" stanowiło wyłącznie element dekoracyjny (martwy badge / atrapę). Zmuszało to użytkownika do obustronnie powolnego ręcznego ustawiania punktów dla pomiarów horyzontalnych (Klatka, Talia, Ramiona), bez żadnego odniesienia do linii symetrii. Ponadto typ wymierzanego ubrania zostawał zapisany do bazy na sztywno jako 'unknown' i eksportowana była pusta struktura `lines: []`.

## Decyzja
Utworzono dedykowaną logikę React State `symmetryLocked`. Aktywacja przycisku "Złączone krawędzie" automatycznie wiąże współrzędne X odpowiadających sobie prawych i lewych węzłów (np. `sl` i `sr`). Przesunięcie węzła w lewo zmusza w locie jego odbicie lustrzane o proporcjonalne odsunięcie od wspólnego środka ekranu `SCREEN_W / 2`, budując pełną lustrzaną dynamikę.

Zaimplementowano mini komponent `GarmentPicker`, pozwalający użytkownikowi podać semantykę zmierzonego ubrania, eliminując wpis `unknown`. Podczas zapisu wymiarów algorytm kalkuluje na bieżąco listę obiektów Euklidesowych `MeasurementLine` i osadza je w historii, likwidując lukę pustej tablicy.

## Status
Zaakceptowane. Skrypty działają lokalnie i usunęły "leniwe" zachowania kodu z poprzedniej warstwy.
