# ADR 0014: Jedno źródło prawdy o przestrzeni współrzędnych (`useImageCoordinateSpace`) i redesign przepływu pomiaru

> [!CAUTION]
> Ten dokument rozszerza ADR 0010. ADR 0010 zdefiniował KTÓRA przestrzeń współrzędnych obowiązuje gdzie. Ten dokument definiuje JAK to jest wyliczane — w jednym miejscu, raz, i konsumowane wszędzie indziej. Powód: po wdrożeniu ADR 0010 trzy niezależne miejsca w `result.tsx` (hit-area `DraggablePoint`, transformacja lupy, grubość linii/tekstu SVG) zostały pominięte, bo każde z nich osobno liczyło skalę po swojemu zamiast czytać ją z jednego miejsca. Skutek: aplikacja stała się bezużyteczna (brak reakcji na dotyk, czarny ekran lupy, niewidoczne linie). Ten ADR istnieje żeby to się nie powtórzyło.

## Kontekst

Po migracji na viewBox (ADR 0010) odkryto, że "przestrzeń obrazu" jako pojęcie nie wystarczy — potrzebny jest jeden, scentralizowany **mechanizm wyliczający** wszystkie pochodne tej przestrzeni (skalę, offsety, przeliczenia w obie strony), żeby żaden komponent nie mógł "wynaleźć" własnej, niespójnej wersji tej matematyki.

Dodatkowo: obecny UX pokazuje 8-16 punktów pomiarowych naraz na małym ekranie telefonu (patrz zrzut z 2026-06-30 — gęstwina nakładających się linii, kropek 8px, nieczytelnych etykiet). To utrudnia precyzyjne chwycenie właściwego punktu nawet gdy hit-area działa poprawnie. Grupa docelowa aplikacji (kobiety korzystające z telefonu jedną ręką, zastępujące ręczną miarkę krawiecką przy sprzedaży na Vinted) wymaga przepływu który jest prowadzony krok po kroku, nie wymaga precyzji chirurgicznej, i nie karze za pomyłkę.

## Decyzja A — `useImageCoordinateSpace()` jako jedyne źródło prawdy

Tworzymy hook w `src/hooks/useImageCoordinateSpace.ts`:

```typescript
interface CoordinateSpace {
  imageWidth: number;
  imageHeight: number;
  containerWidth: number;
  containerHeight: number;
  scale: number; // imageWidth / renderedWidth — mnożnik image-space -> screen-space i odwrotnie
  renderedWidth: number;
  renderedHeight: number;
  offsetX: number; // letterbox offset w przestrzeni kontenera
  offsetY: number;
  imageToScreen: (p: { x: number; y: number }) => { x: number; y: number };
  screenToImage: (p: { x: number; y: number }) => { x: number; y: number };
}

function useImageCoordinateSpace(
  imageWidth: number,
  imageHeight: number,
  containerSize: { width: number; height: number }
): CoordinateSpace
```

**Zasada bezwzględna:** żaden komponent w `result.tsx` (ani jego następcy po redesignie z Decyzji B) nie liczy `scale`, `offsetX`, `offsetY`, ani żadnej pochodnej letterboxingu samodzielnie. Każde miejsce które potrzebuje przeliczenia między przestrzenią obrazu a przestrzenią ekranu (hit-area uchwytu, transformacja lupy, pozycjonowanie znacznika wizualnego) wywołuje `imageToScreen`/`screenToImage` z tego hooka.

**Test akceptacyjny dla każdej przyszłej zmiany dotykającej geometrii:** czy nowy/zmieniony kod komponentu zawiera literał `containerSize.width / containerSize.height` lub podobne wyliczenie aspektu poza plikiem `useImageCoordinateSpace.ts`? Jeśli tak — to jest dokładnie błąd z 2026-06-30 odtwarzający się ponownie. Zatrzymać się i przenieść logikę do hooka.

## Decyzja B — przepływ pomiaru krok po kroku zamiast wszystkich punktów naraz

Obecny ekran `result.tsx` (jeden widok z 8-16 nakładającymi się punktami) zostaje zastąpiony sekwencją:

1. **Wybór typu ubrania** — duże kafelki z ikoną (już istnieje w obecnym UI jako pasek ikon, do powiększenia i wyniesienia na osobny, pierwszy krok zamiast paska nad tabelką).
2. **Pojedynczy pomiar, pełny ekran** — w danym momencie widoczna jest TYLKO jedna linia pomiarowa (np. tylko "Ramiona"), z dwoma dużymi uchwytami (patrz Decyzja C) i nazwą pomiaru wyświetloną czytelnie nad zdjęciem ("Przeciągnij oba punkty do krawędzi ramion"). Lupa aktywuje się automatycznie przy chwyceniu punktu.

   **Wartość w cm na środku linii pozostaje bez zmian względem obecnej implementacji** — to jest istniejący, działający mechanizm (`SvgText` z czarnym obrysem dla czytelności na każdym tle, aktualizowany w czasie rzeczywistym przy przeciąganiu punktu) i NIE jest usuwany ani zastępowany niczym innym. W trybie jednej-linii-na-raz ta wartość staje się jedynym elementem tekstowym na ekranie poza nazwą pomiaru, więc może być powiększona względem obecnego `fontSize="19"` dla jeszcze lepszej czytelności — ale musi pozostać w tym samym miejscu (środek linii) i w tej samej formie (cyfra + "cm", żywa aktualizacja). Brak tej wartości podczas przeciągania pozbawia użytkowniczkę natychmiastowego potwierdzenia czy ruch punktu daje sensowny wynik.
3. **Automatyczne przejście** — po puszczeniu obu punktów danej linii (lub po naciśnięciu "Dalej"), przepływ przechodzi do kolejnego pomiaru z listy `GARMENT_CONFIG[garmentType]`. Możliwość cofnięcia do poprzedniego pomiaru.
4. **Podsumowanie** — lista wszystkich zmierzonych wartości z możliwością dotknięcia dowolnej pozycji żeby wrócić i poprawić tylko tę jedną linię (nie cały przepływ od nowa).
5. **Zapis/eksport** — bez zmian względem obecnej logiki `handleSave`/`handleShare`, poza tym że eksportowany obraz pokazuje wszystkie linie na raz (tak jak teraz) — redesign dotyczy WPROWADZANIA pomiarów, nie końcowego artefaktu.

**Uzasadnienie:** to jest **redukcja powierzchni błędu**, nie tylko kosmetyka. Przy jednej widocznej linii na raz: hit-area nie konkuruje z 7 innymi punktami w bliskim sąsiedztwie, lupa nie musi dzielić uwagi między wieloma jednoczesnymi gestami, a błąd "złapałam nie ten punkt" staje się strukturalnie niemożliwy.

## Decyzja C — duże uchwyty dotykowe

Punkty pomiarowe (`DraggablePoint`) zwiększają hit-area z obecnych `44×44px` do **minimum `64×64px`** wizualnego rozmiaru uchwytu, z dodatkowym niewidocznym marginesem dotyku do `72×72px` (`hitSlop` w React Native, nie powiększanie samego widocznego kółka — różnica między tym co widać a tym co reaguje na dotyk musi być rozróżniona w kodzie). Kolor i kontrast uchwytu muszą spełniać WCAG AA na każdym tle zdjęcia (stąd dwuwarstwowy obrys: jasna obwódka + ciemny cień, niezależnie od koloru tła pod spodem).

## Decyzja D — wizualna detekcja markera ArUco pozostaje zawsze widoczna

Istniejący mechanizm zielonego `<Polygon>` rysowanego na `arucoCorners` (obrys wykrytego markera, widoczny na zdjęciu — patrz `result.tsx`, zarówno w głównym widoku jak i w `exportSvgRef`) jest jedynym sposobem, w jaki użytkowniczka może natychmiast zweryfikować "aplikacja poprawnie znalazła mój marker, mogę ufać skali pomiaru" zanim w ogóle zacznie przeciągać punkty. To jest sygnał zaufania do całego mechanizmu pomiarowego, nie kosmetyka.

**Zasada bezwzględna:** w KAŻDYM kroku nowego przepływu (1. wybór typu ubrania, 2. pojedynczy pomiar, 3. podsumowanie) — wszędzie gdzie zdjęcie jest widoczne na ekranie — obrys markera ArUco musi pozostać narysowany, jeśli `currentResult.arucoCorners` istnieje. Nie chowamy go za przełącznikiem, nie usuwamy go z kroku 2 "żeby nie zaśmiecać ekranu jedną linią pomiaru" — wręcz przeciwnie, w kroku 2 (gdzie tylko jedna linia pomiarowa konkuruje o uwagę) obrys markera ma jeszcze WIĘCEJ przestrzeni wizualnej żeby być czytelnym niż w obecnym, zatłoczonym widoku z ośmioma liniami naraz.

Istniejący badge `Skala: ArUco 10cm` / `Szacowanie` (oparty na `markerFound`) towarzyszy temu wizualnemu obrysowi i też zostaje — to dwa uzupełniające się sygnały (tekstowy i wizualny), nie nadmiarowe powtórzenie.



- Zmiana logiki `getTrueDistance`, `applyHomography`, `getPerspectiveTransform` — ta matematyka jest już poprawna i przetestowana (patrz `__tests__/geometry.test.ts`), nie jest ruszana.
- Zmiana formatu eksportu (`exportSvgRef`) poza naprawą grubości linii/tekstu do proporcji zgodnej z nową rozdzielczością (dług z Aneksu C, ADR 0010) — naprawiana przy okazji tej migracji, bo i tak dotykamy tych samych linii kodu.
- Zmiana `GARMENT_CONFIG`, listy typów ubrań, ani definicji `LINE_DEFS` — struktura danych zostaje, zmienia się tylko SPOSÓB prezentacji i interakcji.

## Status

Zaakceptowane. Obowiązuje od 2026-06-30. Implementacja w kolejnym kroku poprzez szczegółową instrukcję wykonawczą dla Agenta, zgodną z formatem ustalonym w poprzednich iteracjach (zasady bezwzględne, numerowane kroki, krok weryfikacyjny, zakaz zgadywania przy niejednoznaczności).
