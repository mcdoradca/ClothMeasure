# ADR 0005: Hibernacja Canny Edge na rzecz ManualUI (z perspektywą na API)

## Kontekst
Architektura aplikacji ClothMeasure opierała się w swoim natywnym rdzeniu na wykorzystaniu algorytmów analizy kształtu (Canny Edge Detection, Flood Fill) do wyłuskania krawędzi ubrań z tła. Ostatnie testy wykazały, że środowisko użytkownika (koce we wzory, drewniany parkiet, skosy ubrań) rzuca zbyt wiele szumu, by prosta detekcja matematyczna mogła bez "semantycznego rozumienia obrazu" wydobyć idealne miary z wysoką skutecznością.
Pojawił się projekt całkowitego usunięcia logiki Canny Edge i wdrożenia na siłę zewnętrznego API do usuwania tła.

## Problem
Zewnętrzne API do usuwania tła i segmentacji wymaga stałego połączenia z siecią, płatnych kluczy dostępowych, a ponadto większość darmowych usług dokonuje ukrytego kadrowania/zmniejszania wyciętego obrazu, co całkowicie rujnuje kalibrację punktową z użyciem ArUco. Usunięcie starej logiki również oznacza wyrzucenie wielu godzin prac na lokalnych algorytmach.

## Decyzja
Podjęto strategiczną decyzję o tymczasowym odpięciu i **ZAHIBERNOWANIU** algorytmów Canny Edge z głównej ścieżki (brak usuwania plików z projektu). Zamiast nich na ekranie `/result` wprowadzono interaktywne **Manual UI** bazujące na `PanResponder`, które przenosi ciężar zaznaczenia punktów brzegowych na użytkownika w zamian za 100% niezawodność, niezależnie od warunków oświetleniowych czy tła.

## Konsekwencje
System zyska na stabilności, czas ładowania w tle po wykonaniu zdjęcia zredukuje się o ułamki sekund, a użytkownik będzie miał ostateczną pewność pomiaru.
W etapie V2 przewiduje się stworzenie modułu Dual-Track, który po zdefiniowaniu odpowiedniego API bez strat jakości/skali przez dewelopera, wyśle obraz na serwer, a wycięty kanał alpha zostanie przekazany z powrotem do uśpionych obecnie algorytmów w celu pełnej automatyzacji. Do tego momentu aplikacja pozostaje z manualnym sterowaniem punktami w trybie pewności matematycznej, a wszystkie pliki automatyczne (m.in. `edgeDetection.ts`) otrzymują status "Deprecated/Hibernated".
