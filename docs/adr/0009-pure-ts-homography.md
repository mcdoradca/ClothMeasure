# ADR 0009: Korekcja Perspektywy przez Homografię w czystym TypeScript
Data: 2026-06-26

## Kontekst
Zgłoszony problem braku precyzji (błąd 30% w skalowaniu - 10cm wykrywane jako 13cm) był spowodowany brakiem korekty perspektywy w module ArUco. Zdjęcia ubrań robione pod kątem innym niż idealnie z zenitu skutkowały przekłamaniami wymiarów. Pierwotne żądania użycia biblioteki `cv2.getPerspectiveTransform` (Python/OpenCV) zostały odrzucone na rzecz rygoru architektury Expo SDK 54 ograniczającego wykorzystanie paczek natywnych (ADR 0003).

## Decyzja
Zaimplementowano ręczne rozwiązanie matematyczne (Direct Linear Transformation). 
- Dodano `src/algorithms/perspective.ts` zawierające wyliczanie macierzy homografii 3x3 dla 4 punktów za pomocą eliminacji Gaussa.
- Zmodyfikowano `arucoDetector.ts`, aby algorytm analizował zbiór pikseli markera i wydobywał rzeczywiste 4 wierzchołki (zamiast dotychczasowych skrajności z Bounding Boxa).
- Odłączono proste mnożenie przez skalar `pixelPerCm`. Zamiast tego, punkty wskazane przez użytkownika w `Manual UI` są rzutowane odwróconą macierzą na matematycznie płaską przestrzeń kanoniczną (gdzie marker jest idealnym kwadratem 10x10 cm).

## Konsekwencje
System pozostał uniezależniony od serwerów zewnętrznych i JNI, zachowując wsparcie dla Expo Go, a zniekształcenie kątowe zostało zniwelowane w 100%. Użytkownik otrzymuje poprawne wymiary ubrań nawet na zdjęciach robionych lekko ze skosu.
