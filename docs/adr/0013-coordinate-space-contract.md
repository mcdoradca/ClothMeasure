# ADR 0013: Kontrakt jednolitej przestrzeni współrzędnych (Coordinate Space Contract)

> [!CAUTION]
> Niniejszy dokument opisuje BEZWZGLĘDNY kontrakt geometryczny obowiązujący w `app/result.tsx` i wszystkich plikach z nim współpracujących. Złamanie tego kontraktu (nawet w jednej linii, nawet "tymczasowo") odtwarza dokładnie te same błędy pomiarowe (10-13% odchylenia), które zostały rozwiązane w czerwcu 2026 po wielogodzinnej diagnostyce opisanej w historii konwersacji projektowej. Każdy agent RAG/LLM wprowadzający zmiany w logice geometrycznej `result.tsx` MUSI przeczytać ten dokument PRZED edycją i zweryfikować zgodność PO edycji.

## Kontekst

Aplikacja przeszła dwie kolejne migracje architektoniczne ekranu wyników:
1. `<Image resizeMode="contain">` + ręczne liczenie letterboxingu w JS (`offsetX`, `offsetY`, `scaleToOriginal`) — porzucone, bo generowało rozbieżność między tym co JS sądził o pozycji obrazka a tym co faktycznie renderował silnik `Image`.
2. `<Svg><SvgImage></Svg>` z viewBox w wymiarach realnego zdjęcia — obecny, docelowy model.

W trakcie pierwszej migracji wykryto błąd systematyczny (+10-13% na każdym wymiarze: ramiona, klatka, długość), którego źródłem był dokładnie jeden hardcoded fallback (`IMAGE_HEIGHT = SCREEN_W * 1.33`) używany zamiast rzeczywistego layoutu komponentu. Naprawa kosztowała wiele rund diagnostyki z logami i zrzutami ekranu, ponieważ błąd był **niewidoczny w kodzie na pierwszy rzut oka** — wymagał porównania logów matematycznych z rzeczywistymi pomiarami fizycznymi miarką krawiecką.

## Decyzja — kontrakt jednej przestrzeni współrzędnych

Od tej pory w `app/result.tsx` obowiązuje TYLKO JEDNA przestrzeń współrzędnych dla wszystkich danych geometrycznych poza samym gestem dotykowym:

**PRZESTRZEŃ OBRAZU** (image space) — jednostką jest piksel realnego, pełnowymiarowego zdjęcia (`imageWidth` × `imageHeight` z `currentResult`, np. `1200 × 1226px`). W TEJ przestrzeni żyją:
- `pts` (wszystkie punkty pomiarowe: `sl`, `sr`, `cl`, `cr`, `wl`, `wr`, `lt`, `lb` i ich odpowiedniki dla rękawów/nogawek)
- `arucoCorners` (rogi wykrytego markera — pochodzą z detekcji na pełnowymiarowym zdjęciu, nigdy nie były w innej przestrzeni)
- `homographyMatrix` i wynik `applyHomography(...)`
- każdy argument przekazywany do `getTrueDistance(p1, p2)`
- viewBox głównego `<Svg>` i ukrytego `<Svg ref={exportSvgRef}>` — oba ustawione na `0 0 ${imageWidth} ${imageHeight}`
- wszystkie `<Line>`, `<Circle>`, `<Polygon>`, `<SvgText>` wewnątrz obu tych `<Svg>` — rysowane GOŁYMI współrzędnymi z `pts`/`arucoCorners`, bez żadnej konwersji

**PRZESTRZEŃ EKRANU** (screen space) — jednostką jest piksel fizycznego ekranu telefonu (`SCREEN_W`, `containerSize.width/height`). W TEJ przestrzeni żyją WYŁĄCZNIE:
- surowe wartości `gesture.dx`/`gesture.dy`/`gesture.moveX`/`gesture.moveY` z `PanResponder` (React Native zawsze podaje gesty w pikselach ekranu — to jest fakt platformy, nie wybór projektowy)
- `containerSize` (wynik `onLayout` kontenera)
- pozycjonowanie wizualnego znacznika `<View style={styles.draggablePoint}>` w `DraggablePoint` (bo to zwykły `View`, nie element SVG — żyje w layoutcie RN, nie w viewBox)
- `activePoint.x > SCREEN_W / 2` w logice pozycjonowania lupy (`magnifierWrap`) — to jest decyzja UI o tym, po której stronie ekranu pokazać lupę, nie pomiar

**JEDYNE dozwolone miejsce konwersji między przestrzeniami:**
- `screenToImageSpace(screenX, screenY)` — konwertuje gest ekranowy na współrzędne obrazu (używane teoretycznie, choć w obecnej implementacji `DraggablePoint` realizuje to przez `scale` prop bezpośrednio na delcie gestu, co jest matematycznie równoważne)
- `currentScale` (= `imgW / renderedW`) — używane w `DraggablePoint` do przeskalowania `gesture.dx`/`gesture.dy` (przestrzeń ekranu) na przyrost w przestrzeni obrazu, oraz odwrotnie do przeliczenia `initialX`/`initialY` (przestrzeń obrazu) na `displayX`/`displayY` (przestrzeń ekranu) do wizualnego pozycjonowania znacznika

> [!NOTE]
> **Stan po ADR 0014:** Powyższe dwa mechanizmy (`screenToImageSpace`, `currentScale`) zostały od czasu wdrożenia ADR 0014 zastąpione jednym, scentralizowanym hookiem `useImageCoordinateSpace()` (`src/hooks/useImageCoordinateSpace.ts`), który eksponuje `imageToScreen`/`screenToImage` jako jedyne dozwolone miejsce konwersji. Logika matematyczna jest identyczna — zmieniła się tylko jej lokalizacja (scentralizowana zamiast rozproszona po komponencie). Punkty 1-3 sekcji "Twarda zasada" poniżej należy dziś czytać z tym zastrzeżeniem: zamiast szukać `screenToImageSpace`/`currentScale` jako nazw zmiennych, szukaj wywołań `coordSpace.imageToScreen`/`coordSpace.screenToImage` jako jedynego poprawnego wzorca. Szczegóły w ADR 0014.

## Twarda zasada do weryfikacji przy każdej zmianie

Przed zatwierdzeniem JAKIEJKOLWIEK zmiany w `app/result.tsx` dotykającej geometrii, agent MUSI sprawdzić (grep lub ręczny przegląd):

1. Czy `SCREEN_W` lub `IMAGE_HEIGHT` (stała) pojawia się w jakimkolwiek równaniu razem ze zmienną pochodzącą z `pts`, `arucoCorners`, lub argumentem `getTrueDistance`? — JEŚLI TAK, to jest błąd identyczny z tym z czerwca 2026 (patrz: bug `next[siblingKey] = { x: SCREEN_W - x, y }` w `handleMove`, naprawiony na `imageWidth - x`). Mieszanie stałej ekranowej z wartością w przestrzeni obrazu jest ZAWSZE błędem, niezależnie od kontekstu.
2. Czy nowy kod dodaje funkcję konwertującą współrzędne poza `useImageCoordinateSpace()` (patrz notatka wyżej)? — jeśli tak, prawdopodobnie ktoś na nowo wprowadza ręczne liczenie letterboxingu, które już raz zostało wyeliminowane jako źródło błędów. Zatrzymać się i zapytać człowieka.
3. Czy `viewBox` na obu `<Svg>` (główny ekran i `exportSvgRef`) nadal wskazuje na `imageWidth`/`imageHeight`, a nie na `SCREEN_W`/`IMAGE_HEIGHT` lub inną stałą? Te dwa `<Svg>` muszą pozostać matematycznie identyczne w traktowaniu współrzędnych — różnią się tylko tym, że jeden ma dodatkowy `<Rect>` i tabelkę tekstową pod spodem.
4. Czy `pts` (initial state) nadal skaluje się względem realnych wymiarów zdjęcia, a nie sztywnych stałych typu `1200`/`1600`? (Stan na 2026-06-29: `pts` initial state ma hardcoded `1200`/`1600` jako wartości startowe zamiast `imageWidth`/`imageHeight` z `currentResult` — jest to ZNANY DEBT, niekrytyczny bo user i tak przesuwa punkty ręcznie, ale do naprawienia przy najbliższej okazji żeby nie pozostawiać hardcoded liczb mylących przyszłych agentów).
5. Czy każdy komponent renderowany dynamicznie na podstawie zmiennego identyfikatora (np. aktywnej zakładki pomiaru) ma `key` jednoznacznie powiązany z tym identyfikatorem, jeśli przechowuje jakikolwiek stan lokalny przez `useRef`/`useState`? — to nie jest błąd przestrzeni współrzędnych sensu stricto, ale błąd tej samej kategorii dotkliwości: cichy, niewykrywalny przez grep tekstowy, psujący dane bez wyjątku w runtime. Patrz ADR 0014, notatka post-implementacyjna z 2026-06-30, dla pełnego opisu mechanizmu (stale closure w `PanResponder` tworzonym przez `useRef`).

## Dlaczego to jest krytyczne dla komercjalizacji

Aplikacja ma zastąpić miarkę krawiecką dla użytkowników serwisów typu Vinted. Błąd 10-13% (zaobserwowany i naprawiony w tej iteracji) oznacza, że T-shirt zmierzony jako "klatka 58.5cm" miał faktycznie 52cm — różnica wystarczająca żeby kupująca dostała ubranie o niewłaściwym rozmiarze i zażądała zwrotu. Każda przyszła migracja architektury renderowania (zmiana biblioteki SVG, zmiana formatu eksportu, dodanie nowej funkcji do `result.tsx`) musi przejść przez testy jednostkowe opisane w towarzyszącym pliku testowym ZANIM trafi do testów na fizycznym urządzeniu — ręczna weryfikacja przez zdjęcia i logi jest kosztowna czasowo i nie skaluje się przy częstych zmianach.

## Status

Zaakceptowane. Obowiązuje od 2026-06-29. Powiązane z testami jednostkowymi w `__tests__/geometry.test.ts` oraz `__tests__/useImageCoordinateSpace.test.ts`, które automatyzują weryfikację punktów 1-3 z sekcji powyżej dla znanych przypadków testowych (marker referencyjny + dwa punkty pomiarowe → oczekiwana wartość w cm). Rozszerzone przez ADR 0014 (centralizacja w `useImageCoordinateSpace()` + redesign UX przepływu pomiaru).
