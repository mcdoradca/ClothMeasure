# ADR 0003: ClothMeasure - RAG Knowledge Base (System Matrix)
Data: 2026-06-25

> [!CAUTION]
> Niniejszy dokument stanowi bezwzględną instrukcję dla systemów AI (LLM / RAG) wznawiających pracę nad projektem. Zignorowanie opisanych tu restrykcji środowiskowych skutkować będzie przerwaniem ciągłości działania aplikacji i nieodwracalnymi konfliktami w drzewie zależności.

## 1. Architektura Środowiska (Krytyczne)
Aplikacja została sztucznie zablokowana i sformatowana na poziomie **Expo SDK 54** (React Native 0.76).
- **Powód:** Kompatybilność wsteczna z fizycznym urządzeniem docelowym (klient Expo Go v54.0.8).
- **Restrykcja:** **ZABRANIA SIĘ** wywoływania komend `npm install expo@latest`, `npx expo upgrade` oraz używania nowoczesnych sub-ścieżek SDK 56 (np. `expo-file-system/legacy`). Wszystkie nowo dodawane pakiety muszą zostać zainstalowane, a po nich natychmiast wywołana komenda `npx expo install --fix` celem rekalibracji drzewa do SDK 54.
- `legacy-peer-deps=true` w `.npmrc` zapobiega wysypywaniu się instancji chmurowych przez `ERESOLVE` Reacta 19.

## 2. Mapa Struktury (Single Source of Truth)
Aplikacja oparta na architekturze `expo-router` i logice stanowej `zustand`.
```text
/app
 ├── index.tsx          - Ekran startowy
 ├── guide.tsx          - Ekran instrukcji i kalibracji
 ├── camera.tsx         - Logika `expo-camera` i uchwycenie zdjęcia z ArUco
 ├── processing.tsx     - Pusty ekran ładowania podczas asynchronicznego AI
 ├── result.tsx         - Rysowanie (react-native-svg) zmierzonego ubrania i opcja zapisu
 └── history.tsx        - Wyświetlanie `expo-media-library` (album ClothMeasure)
/src/algorithms
 ├── arucoDetector.ts   - Wykrywanie markera Aruco (10x10cm) w tablicy RGBA
 ├── edgeDetection.ts   - Implementacja filtra Canny'ego (sobel, nms, hysteresis) w TypeScript
 ├── imageProcessor.ts  - Analiza zdjęcia w locie (expo-image-manipulator), konwersja pikseli i łączenie algorytmów
 ├── measurement.ts     - Obliczanie milimetrów i konwersja obrysów pikseli (Bounding Box) na skalę referencyjną z Aruco
 └── annotation.ts      - Nakładanie obrysów SVG (linie brzegowe i wymiary w "cm") na zdjęcie
/src/stores
 └── measurementStore.ts - Stan globalny (zustand), trzyma ścieżki zdjęć przed usunięciem w cache
/assets
 └── aruco_marker_10cm.svg - Szablon referencyjny do druku
```

## 3. Moduł C++ i Algorytmy (Mechanika)
Aplikacja nie posiada backendu ani obróbki serwerowej. Cały ciężar operacji wizyjnych leży na procesorze urządzenia.
- **Odczyt pikseli:** Moduł konwertuje zdjęcie do przestrzeni RGBA używając `expo-image-manipulator` ze zmianą skali do ustandaryzowanych 800px szerokości, by uniknąć wyrzucenia błędu pamięci "Out of Memory" na słabszych telefonach.
- **Detekcja Markera:** Moduł szuka prostokątów z unikalnym kontrastem i traktuje ich dłuższą krawędź jako referencyjne 10 cm. Wzorcem drukowanym przez użytkownika jest `aruco_marker_10cm.svg`.
- **Canny Edge Emulation:** Ze względu na blokadę kompilacji natywnych binarek OpenCV wewnątrz środowiska Expo Go, silnik Canny'ego został odwzorowany całkowicie abstrakcyjnie na macierzach matematycznych Typescriptu (Gaussian blur -> Sobel operator -> Non-maximum suppression -> Hysteresis thresholding). Zapewnia to 100% wsparcia dla Expo Go bez ingerowania w warstwę prebuild/Android JNI.

## 4. Odtwarzanie i Kontynuacja Prac (Setup)
Każdy nowy agent RAG wczytujący to repozytorium **musi rozpocząć pracę** od:
1. Pobrania tej dokumentacji by poznać ramy działania algorytmów bez zmyślania bibliotek OpenCV.
2. Zrozumienia obniżonego `package.json` i zachowania kompatybilności API (np. używanie `expo-file-system` zamiast `expo-file-system/legacy`).
3. Przed jakimikolwiek modyfikacjami polecania komendy `npx expo start -c` do odpalenia paczki.

## 5. Kluczowe Rozwiązania Architektoniczne (Wiedza Specjalistyczna)
- **Normalizacja EXIF:** Kamery smartfonów z Androidem (szczególnie OEM takie jak Realme) zapisują surowe bufory matrycy poziomo (Landscape) z dodaniem tagu EXIF Orientation. ZABRANIA SIĘ przesyłania takiego obrazu do `ImageManipulator.crop` przed normalizacją, ponieważ wyliczone poprawnie na ekranie współrzędne kadrowania zostaną nałożone na nieobrócony bufor, tnąc go wzdłuż całkowicie losowych osi. W `app/camera.tsx` po uchwyceniu z kamery lub wybraniu z galerii, obraz MUSI przejść proces "pustej" manipulacji, która wypala obrót i usuwa EXIF.
- **Kadrowanie a resizeMode ("contain"):** Ekran kadrowania (`app/crop.tsx`) stosuje autorską korektę letterboxingu (pustych czarnych pasów) wyliczoną na bazie proporcji ekranu vs oryginalnego zdjęcia. **ZABRANIA SIĘ** bezpośredniego mapowania współrzędnych z ekranu telefonu na surowe zdjęcie bez uprzedniego odjęcia `offsetX` i `offsetY`, gdyż skutkuje to ucinaniem losowych kwadratów tła (całkowita utrata ubrań z kadru i brak markera w pipeline).
- **ArUco Threshold:** Wykrywanie markera Aruco (`src/algorithms/arucoDetector.ts`) **NIE MOŻE** korzystać z filtru bazującego na `adaptiveThreshold`. AdaptiveThreshold "wypłukuje" jednolitą czerń wewnątrz markera, zostawiając jedynie kontury, przez co marker nie jest rozpoznawany jako spójny obiekt (Connected Component). Prawidłowy filtr to autorski `globalThreshold`.
- **PanResponder Stale Closures:** Rejestrowane gesty dla elementów przesuwalnych nie mogą używać standardowego stanu Reacta `useState` w swoich listenerach, ponieważ zapamiętują stan z momentu montażu (zwykle same zera). Używane są do tego mutowalne, dynamiczne struktury `useRef` (np. `latestCropBox`), które gwarantują brak wyścigu pętli.
