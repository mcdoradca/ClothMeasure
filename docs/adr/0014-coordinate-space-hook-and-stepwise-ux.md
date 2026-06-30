# ADR 0014: Jedno źródło prawdy o przestrzeni współrzędnych (`useImageCoordinateSpace`) i redesign przepływu pomiaru

> [!CAUTION]
> Ten dokument rozszerza ADR 0013. ADR 0013 zdefiniował KTÓRA przestrzeń współrzędnych obowiązuje gdzie. Ten dokument definiuje JAK to jest wyliczane — w jednym miejscu, raz, i konsumowane wszędzie indziej. Powód: po wdrożeniu ADR 0013 trzy niezależne miejsca w `result.tsx` (hit-area `DraggablePoint`, transformacja lupy, grubość linii/tekstu SVG) zostały pominięte, bo każde z nich osobno liczyło skalę po swojemu zamiast czytać ją z jednego miejsca. Skutek: aplikacja stała się bezużyteczna (brak reakcji na dotyk, czarny ekran lupy, niewidoczne linie). Ten ADR istnieje żeby to się nie powtórzyło.

## Kontekst

Po migracji na viewBox (ADR 0013) odkryto, że "przestrzeń obrazu" jako pojęcie nie wystarczy — potrzebny jest jeden, scentralizowany **mechanizm wyliczający** wszystkie pochodne tej przestrzeni (skalę, offsety, przeliczenia w obie strony), żeby żaden komponent nie mógł "wynaleźć" własnej, niespójnej wersji tej matematyki.

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

3. **Nawigacja — swobodna, przez zakładki, nie liniowa.** Nad zdjęciem (lub pod nim — decyzja wizualna do Agenta w ramach instrukcji wykonawczej, byle czytelnie) renderowany jest poziomy pasek zakładek, jedna na każdy pomiar z `GARMENT_CONFIG[garmentType]`, plus jedna dodatkowa zakładka "+ Dowolny pomiar" (patrz niżej). Każda zakładka jest klikalna w dowolnym momencie — użytkowniczka może przeskoczyć z "Długości" prosto na "Talię" pomijając "Ramiona" i "Klatkę", bez przymusu przechodzenia przez wszystkie po kolei. Zakładka aktywna jest wizualnie wyróżniona (np. `bg-accent`/`border-accent` z palety projektu); zakładki już zmierzone (mają zapisaną wartość różną od stanu początkowego) dostają subtelny znacznik (np. ptaszek) żeby było widać postęp bez liczenia w głowie.

   **Tryb "Dowolny pomiar"** — dodatkowa, zawsze dostępna opcja pozwalająca zmierzyć dowolny odcinek na zdjęciu, niezdefiniowany w `LINE_DEFS`/`GARMENT_CONFIG` (np. odległość między guzikami, długość zamka, szerokość kieszeni). Użytkowniczka stawia dwa punkty w dowolnym miejscu zdjęcia, dostaje wynik w cm tym samym mechanizmem (`getTrueDistance`), i opcjonalnie może nadać temu pomiarowi własną etykietę tekstową zanim trafi do podsumowania i eksportu. To nie jest zamiennik dla `GARMENT_CONFIG` — to dodatkowa, równoległa możliwość, bo z góry zdefiniowany zestaw pomiarów nigdy nie pokryje wszystkich przypadków które sprzedawczyni może chcieć udokumentować kupującej.

4. **Podsumowanie** — lista wszystkich zmierzonych wartości (zarówno ze standardowych `LINE_DEFS` jak i dowolnych pomiarów dodanych ręcznie) z możliwością dotknięcia dowolnej pozycji żeby wrócić i poprawić tylko tę jedną linię.
5. **Zapis/eksport** — bez zmian względem obecnej logiki `handleSave`/`handleShare`, poza tym że eksportowany obraz pokazuje wszystkie linie na raz (tak jak teraz, plus ewentualne dowolne pomiary) — redesign dotyczy WPROWADZANIA pomiarów, nie końcowego artefaktu.

**Uzasadnienie redukcji do jednej linii naraz:** to jest **redukcja powierzchni błędu**, nie tylko kosmetyka. Przy jednej widocznej linii na raz: hit-area nie konkuruje z 7 innymi punktami w bliskim sąsiedztwie, lupa nie musi dzielić uwagi między wieloma jednoczesnymi gestami, a błąd "złapałam nie ten punkt" staje się strukturalnie niemożliwy.

**Uzasadnienie nawigacji swobodnej zamiast liniowej:** użytkowniczki tej aplikacji (sprzedawczynie na Vinted) mają różne potrzeby zależnie od konkretnego ubrania i oczekiwań kupującej — wymuszanie sztywnej kolejności byłoby karą, nie pomocą. Swoboda wyboru i możliwość zmierzenia czegokolwiek, nie tylko z góry przewidzianej listy, jest częścią dobrego doświadczenia, nie odstępstwem od niego.

## Decyzja C — duże uchwyty dotykowe

Punkty pomiarowe (`DraggablePoint`) zwiększają hit-area z obecnych `44×44px` do **minimum `64×64px`** wizualnego rozmiaru uchwytu, z dodatkowym niewidocznym marginesem dotyku do `72×72px` (`hitSlop` w React Native, nie powiększanie samego widocznego kółka — różnica między tym co widać a tym co reaguje na dotyk musi być rozróżniona w kodzie). Kolor i kontrast uchwytu muszą spełniać WCAG AA na każdym tle zdjęcia (stąd dwuwarstwowy obrys: jasna obwódka + ciemny cień, niezależnie od koloru tła pod spodem).

## Decyzja D — wizualna detekcja markera ArUco pozostaje zawsze widoczna

Istniejący mechanizm zielonego `<Polygon>` rysowanego na `arucoCorners` (obrys wykrytego markera, widoczny na zdjęciu — patrz `result.tsx`, zarówno w głównym widoku jak i w `exportSvgRef`) jest jedynym sposobem, w jaki użytkowniczka może natychmiast zweryfikować "aplikacja poprawnie znalazła mój marker, mogę ufać skali pomiaru" zanim w ogóle zacznie przeciągać punkty. To jest sygnał zaufania do całego mechanizmu pomiarowego, nie kosmetyka.

**Zasada bezwzględna:** w KAŻDYM kroku nowego przepływu (1. wybór typu ubrania, 2. pojedynczy pomiar, 3. dowolny pomiar, 4. podsumowanie) — wszędzie gdzie zdjęcie jest widoczne na ekranie — obrys markera ArUco musi pozostać narysowany, jeśli `currentResult.arucoCorners` istnieje. Nie chowamy go za przełącznikiem, nie usuwamy go z kroku 2 "żeby nie zaśmiecać ekranu jedną linią pomiaru" — wręcz przeciwnie, w kroku 2 (gdzie tylko jedna linia pomiarowa konkuruje o uwagę) obrys markera ma jeszcze WIĘCEJ przestrzeni wizualnej żeby być czytelnym niż w obecnym, zatłoczonym widoku z ośmioma liniami naraz.

Istniejący badge `Skala: ArUco 10cm` / `Szacowanie` (oparty na `markerFound`) towarzyszy temu wizualnemu obrysowi i też zostaje — to dwa uzupełniające się sygnały (tekstowy i wizualny), nie nadmiarowe powtórzenie.

## Co NIE wchodzi w zakres tego ADR

- Zmiana logiki `getTrueDistance`, `applyHomography`, `getPerspectiveTransform` — ta matematyka jest już poprawna i przetestowana (patrz `__tests__/geometry.test.ts`), nie jest ruszana.
- Zmiana formatu eksportu (`exportSvgRef`) poza naprawą grubości linii/tekstu do proporcji zgodnej z nową rozdzielczością (dług z Aneksu C, ADR 0013) — naprawiana przy okazji tej migracji, bo i tak dotykamy tych samych linii kodu.
- Zmiana `GARMENT_CONFIG`, listy typów ubrań, ani definicji `LINE_DEFS` — struktura danych zostaje, zmienia się tylko SPOSÓB prezentacji i interakcji (plus dodanie trybu dowolnego pomiaru z Decyzji B punkt 3, który żyje OBOK tej struktury, nie zastępuje jej).

## Status

Zaakceptowane. Obowiązuje od 2026-06-30. Implementacja w kolejnym kroku poprzez szczegółową instrukcję wykonawczą dla Agenta, zgodną z formatem ustalonym w poprzednich iteracjach (zasady bezwzględne, numerowane kroki, krok weryfikacyjny, zakaz zgadywania przy niejednoznaczności).

## Notatka post-implementacyjna (2026-06-30) — regresja znaleziona po Etapie 4 i jej przyczyna

Po wdrożeniu Etapów 1-3 i pierwszym teście na fizycznym telefonie (Etap 4) wykryto regresję NIEZWIĄZANĄ z matematyką przestrzeni współrzędnych (ADR 0013/0014 Decyzja A nie została naruszona — `coordSpace` działał poprawnie), tylko z cyklem życia komponentów React. Grep z Kroku 3.9 instrukcji wykonawczej (sprawdzający literały typu `strokeWidth`, `currentScale`) nie wykrył tego, bo przyczyna była behawioralna, nie tekstowa.

**Przyczyna:** `<MeasurementPoint>` renderowany w kroku `measuring` nie miał propu `key` powiązanego z tożsamością aktywnej linii pomiarowej (`activeLineId`). React, widząc ten sam typ komponentu w tym samym miejscu drzewa przy zmianie zakładki, aktualizował propsy (w tym `initialX`/`initialY`) zamiast odmontować i zamontować komponent na nowo. Ponieważ `PanResponder` wewnątrz `MeasurementPoint` był tworzony raz przez `useRef`, zamykał w swoim domknięciu (closure) funkcję `onMove` z PIERWSZEGO renderowania — czyli zawsze zapisywał ruch pod kluczami pierwszej aktywnej linii ("Ramiona": `sl`/`sr`), niezależnie od tego, którą zakładkę użytkowniczka faktycznie miała otwartą. Skutek: wszystkie linie poza pierwszą wizualnie nie reagowały (bo `pts` dla nich nigdy się nie aktualizowało), a "Ramiona" po cichu nadpisywały się błędnymi wartościami z innych zakładek.

Powiązany, niezależny błąd tej samej rundy: ukryte `<Svg ref={exportSvgRef}>` zostało w Etapie 3 przeniesione pod warunek `flowStep === 'summary'`, przez co montowało się dopiero przy wejściu w podsumowanie — `toDataURL()` było wywoływane zanim natywny silnik zdążył asynchronicznie zdekodować `<SvgImage>`, dając pusty eksport.

**Zasada na przyszłość, analogiczna do reguł z ADR 0013:** każdy komponent renderowany dynamicznie w pętli lub warunkowo na podstawie zmiennego identyfikatora (tu: `activeLineId`) MUSI mieć `key` jednoznacznie powiązany z tym identyfikatorem, jeśli komponent przechowuje jakikolwiek stan lokalny (przez `useRef`, `useState`) który nie jest w pełni kontrolowany przez propsy z rodzica przy każdym renderze. Brak takiego klucza jest tej samej kategorii błędu co mieszanie `SCREEN_W` z `imageWidth` z ADR 0013 — coś co wygląda na drobny szczegół składniowy, a w praktyce cicho psuje dane bez rzucania wyjątku.

Dodatkowo: elementy istniejące wyłącznie do efektu ubocznego poza ekranem (tu: ukryte SVG eksportu, `opacity: 0, top: -9999`) nie powinny być warunkowane przez `flowStep` ani żaden inny stan UI — powinny być renderowane bezwarunkowo przez cały czas życia ekranu, dokładnie tak jak były przed Etapem 3, niezależnie od tego, który krok przepływu jest aktualnie widoczny.

## Uzupełnienie (2026-06-30) — Diagnostyka i rozwiązanie problemu "pustego" eksportu PNG

Po pierwotnej naprawie polegającej na bezwarunkowym renderowaniu `<Svg ref={exportSvgRef}>` (zamiast powiązania z `flowStep === 'summary'`), testy na fizycznym telefonie wykazały, że wynikowy plik PNG nadal był całkowicie pusty wizualnie (biały ekran), chociaż posiadał poprawną wielkość (ok. 65 KB) i był technicznym, właściwym obrazem PNG w formacie base64. 

Zamiast modyfikowania kodu na ślepo, przeprowadzono 5-rundową, ścisłą i dowodową diagnozę opartą na logach generowanych prosto z fizycznego telefonu:
1. Potwierdzono, że warunek został usunięty na stałe.
2. Dodano rygorystyczne przechwytywanie zdarzeń `toDataURL` i `FileSystem.writeAsStringAsync`, co obaliło hipotezę o "niedostatecznym czasie na asynchroniczne zdekodowanie `<SvgImage>`". Generowany obraz za każdym razem zrzucał strumień tekstowy base64 o długości niemal 90,000 znaków.
3. Wykorzystano `FileSystem.getInfoAsync` dla potwierdzenia pomyślnego spisanego fizycznego rozmiaru (65,394 bajty).
4. Przeniesiono punkt ciężkości poszukiwań z "błędu po stronie zapisywania" na "stan wizualny eksportowanego widoku".

**Potwierdzona przyczyna błędu:** `<Svg ref={exportSvgRef}>` miało przypisany atrybut `style={{ position: 'absolute', opacity: 0 }}`. Było również owinięte tagiem nadrzędnym `<View style={{ position: 'absolute', top: -9999, left: -9999, zIndex: -10, opacity: 0 }}>`. Redundantne `opacity: 0` nadane bezpośrednio warstwie uchwyconej jako źródło dla obiektu natywnego w funkcji `.toDataURL()` powodowało renderowanie grafiki z zerową kanałową przepuszczalnością, która nakładała się na domyślnie białe ekrany podglądowe w aplikacjach-galeriach, dając iluzję zupełnie pustego, utraconego eksportu.

**Wdrożone rozwiązanie i weryfikacja zasady:** Usunięto deklarację `opacity: 0` ze stylów inline na poziomie `<Svg>`, pozostawiając ciężar ukrycia widoku przed użytkownikiem WYŁĄCZNIE na głównym bloku kontenera `<View>`. Doprowadziło to do uwieczniania bezbłędnej grafiki z pełną paletą kolorów (wraz z ramką czarną i pełnym formatowaniem tabelarycznym) na 100% stopniu alfa. Udowadnia to absolutną regułę, żeby **najpierw zawężać objawy dowodami przez console.log (lub dedykowaną klasę typu SentinelLogger), a dopiero w dalszej kolejności testować celowane modyfikacje, nawet jeśli te modyfikacje wydają się logiczne na pierwszy rzut oka**.
