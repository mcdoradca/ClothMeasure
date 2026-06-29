# ADR 0012: Usunięcie Shrinkage Bias Network (Modyfikatory Krawieckie)

## Status
ZAAKCEPTOWANE

## Kontekst
System pomiaru aplikacji opierał się na wykrywaniu wektorowym markera ArUco (10x10 cm) z użyciem Direct Linear Transformation (DLT) do korekty perspektywy poprzez macierz homografii (ADR 0009). W trakcie wcześniejszych faz projektu wprowadzono "Shrinkage Bias Network" (`allowances`), który był mnożnikiem korekcyjnym zależnym od typu ubrania (np. `length` dla T-Shirta mnożył dystans przez 1.072).
Użytkownik zgłosił błędy w pomiarach rzędu 2-3 cm. Po dokładnej diagnostyce (sprawdzenie skali wydruku i paralaksy) użytkownik dokonał pomiaru fizycznego bez nałożonych modyfikatorów.

## Decyzja
Fizyczne testy empiryczne udowodniły, że "surowe" algorytmy DLT obliczające dystans euklidesowy na przestrzeni ustandaryzowanej osiągają **idealną zgodność co do milimetra** z fizyczną miarką krawiecką. Dodatkowe modyfikatory sztucznie deformowały precyzyjną matematykę homograficzną.
Podjęto decyzję o całkowitym usunięciu siatki `allowances` z wyników kalkulacji dystansu.

## Konsekwencje
- Zwiększona dokładność systemu i usunięcie zjawiska sztucznego zaniżania/zawyżania pomiarów.
- Pomiary są teraz reprezentacją rzeczywistego, 2-wymiarowego dystansu w płaszczyźnie markera ArUco. Ewentualny błąd leży wyłącznie po stronie fizycznego ułożenia materiału, a nie ukrytych korekt logicznych.
- Kod uległ znacznemu uproszczeniu, ponieważ system działa deterministycznie dla każdego typu odzieży.
