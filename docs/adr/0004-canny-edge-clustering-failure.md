# ADR 0004: Awaria eksperymentalnego podejścia klasteryzacji krawędzi (Canny Edge) dla pomiarów ubrań

## Kontekst
W ramach rozwiązania problemu zawyżonych wymiarów (łapanie "tła" m.in. pościeli i markera) w modułach pomiarowych, wdrożone zostało eksperymentalne rozwiązanie `measureWidthAtY` polegające na gęstej klasteryzacji punktów z 5% szerokości obrazu (`edgeDetection.ts`) oraz wykluczenia strefy `markerExcludeBox` (`imageProcessor.ts` / `measurement.ts`). Zrezygnowano ze ślepego łapania skrajnych pierwszych i ostatnich pikseli na korzyść klastrów horyzontalnych. Do tego powrócono do odgórnego, sztywnego rozmiaru markera wynoszącego `10 cm` w kodzie wymiarowym i usunięto z zaokrągleń miejsca po przecinku.

## Problem (Halucynacja/Błąd Metody)
Nowe rozwiązanie z klasteryzacją (grupowanie punktów mieszczących się w bliskim sąsiedztwie z tolerancją 5%) całkowicie pominęło pomiary dla ramion i klatki piersiowej. Wymiary takie jak klatka/ramiona dla "rozłożonego t-shirtu" nie mają idealnie pionowej struktury w wycinku, lecz są rozszerzone (skośne brzegi rękawów). Ze względu na duże zróżnicowanie pozycji `x` na wysokości kilkudziesięciu pikseli w paśmie 5%, algorytm nie utworzył klastra, nie przekroczył bariery `bandHeight * 0.2` ani tolerancji gęstości, zwracając `null`. W efekcie połowa wymiarów zniknęła na ekranie aplikacji, a te które pozostały (na płaskich, prostych odcinkach np. dół, biodra) wciąż charakteryzują się nieprawidłowym rozmiarem, co obnażyło fakt, że problem "zawracania Canny Edge" i samej perspektywy kalibracyjnej jest drastyczniejszy i nie został usunięty.

## Decyzja
Należy całkowicie wycofać wdrożone rozwiązanie klasteryzacji krawędzi dla `measureWidthAtY` zawarte w commitcie `fa436d1` oraz przemyśleć i zaimplementować nowy, matematycznie odporny mechanizm segmentacji ubrania na podstawie prostych lub hybrydowych narzędzi segmentacji (np. binarna detekcja kolorów Flood Fill / maskowanie progowe), by odciąć szum tła bez tracenia detekcji na skośnych krawędziach.

## Konsekwencje
System z uszkodzonym `measureWidthAtY` oraz zmodyfikowanymi punktami próbkowania `measurement.ts` pozostał uszkodzony w kodzie. Proces musi zostać wycofany (Revert) przez przyszłego agenta, po czym problem obrysów i skalowania musi być zdiagnozowany z nowego, czystego ujęcia architektonicznego.
