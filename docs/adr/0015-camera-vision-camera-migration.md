# ADR 0015: Migracja warstwy kamery z `expo-camera` na `react-native-vision-camera`

> [!CAUTION]
> Ten ADR opisuje ZMIANĘ ARCHITEKTONICZNĄ dotykającą warstwy natywnej projektu. Wdrożenie wymaga wyjścia z Expo Go i przejścia na development build (prebuild / EAS Build). Jest to zmiana o wyższym ryzyku niż dotychczasowe edycje JS/TS, ponieważ może wpłynąć na buildowalność całego projektu. Przed wdrożeniem MUSZĄ być spełnione zabezpieczenia z sekcji "Zabezpieczenia przed uszkodzeniem projektu". Agent wykonujący tę migrację NIE MOŻE pominąć żadnego punktu zabezpieczeń.

## Status

Zaakceptowane. Data: 2026-07-01. Wdrożenie przez instrukcję wykonawczą po spełnieniu zabezpieczeń.

## Kontekst

Aplikacja ClothMeasure jest produktem komercyjnym — ma zastąpić miarkę krawiecką dla sprzedających odzież (np. na Vinted) i generować przychód. Warstwa robienia zdjęcia jest fundamentem całego pomiaru: bez dobrego, szerokiego, wiernego kadru cała matematyka pomiaru pracuje na złych danych wejściowych.

### Problem, który wymusił tę decyzję

Dotychczasowa warstwa kamery oparta na `expo-camera (~17.0.10)` ujawniła twarde, udowodnione ograniczenia:

1. **Pole widzenia zależne od proporcji kontenera podglądu (udowodnione dowodowo).** W tym API efektywne pole widzenia zmienia się wraz z proporcją kontenera `<CameraView>`. Kontener zbliżony do proporcji sensora (4:3) zawęża pole (efekt "cyfrowego zoomu"), a kontener wydłużony (`absoluteFill`) daje szersze pole, ale kosztem wierności podglądu (przycięcie cover). Nie da się jednocześnie uzyskać: szerokiego pola, wiernego podglądu 1:1 i pełnego wykorzystania ekranu. Potwierdzone logami: `photo 2448×3264` identyczne, `zoom 0`, a mimo to zmiana proporcji kontenera z 0.448 (absoluteFill) na 0.75 (contain) zawęziła obraz.

2. **Brak wyboru fizycznego obiektywu na Androidzie.** `expo-camera` udostępnia `selectedLens`/`getAvailableLensesAsync` wyłącznie na iOS. Na Androidzie NIE MA możliwości programowego wyboru obiektywu ultra-wide (0.5x). Dla aplikacji, która ma dać najszersze możliwe ujęcie na każdym telefonie, jest to ograniczenie dyskwalifikujące.

3. **Brak dostępu do parametrów kamery (intrinsics, dystorsja).** Uniemożliwia to jakąkolwiek przyszłą korektę dystorsji soczewki — a to może być potrzebne dla dokładności pomiaru przy brzegach kadru.

### Decyzja właściciela produktu

Właściciel jednoznacznie odrzucił podejście "zaakceptuj ograniczenie narzędzia". Wymaganie: aplikacja ma dać NAJSZERSZE możliwe ujęcie na KAŻDYM telefonie, wykorzystując fizyczny obiektyw szerokokątny/ultraszerokokątny lub pełną matrycę, bez ograniczeń narzuconych przez framework. Narzędzie ma służyć produktowi, nie odwrotnie.

## Decyzja

Migrujemy warstwę kamery z `expo-camera` na **`react-native-vision-camera`**.

Uzasadnienie wyboru (potwierdzone w dokumentacji biblioteki):
- Obsługuje wybór fizycznego obiektywu `ultra-wide-angle-camera` (0.5x, najszersze pole) oraz `wide-angle-camera` na Androidzie ORAZ iOS — nie jest to funkcja iOS-only.
- Raportuje dla każdego urządzenia jego fizyczne obiektywy, zakresy zoomu, dostępne rozdzielczości i metadane — pełna kontrola nad matrycą.
- Umożliwia wybór formatu o najwyższej rozdzielczości i najszerszym polu.
- Daje dostęp do parametrów kamery, co OTWIERA (na przyszłość) drogę do korekty dystorsji — niedostępnej w `expo-camera`.
- Jest standardem branżowym dla poważnych aplikacji kamerowych w React Native.

## Zakres

**Wymianie podlega WYŁĄCZNIE warstwa kamery** — ekran robienia zdjęcia (`app/camera.tsx`) oraz konfiguracja natywna projektu.

**NIE podlega zmianie (zostaje nietknięte):**
- Logika pomiaru (`getTrueDistance`, `applyHomography`, `getPerspectiveTransform`).
- Detekcja markera ArUco (`src/algorithms/arucoDetector.ts`).
- Ekran wyników, stepper, hook `useImageCoordinateSpace` (ADR 0014).
- Kontrakt przestrzeni współrzędnych (ADR 0013).
- Eksport, crop, store, typy.
- Wybór zdjęcia z galerii (`expo-image-picker`).

Kontrakt wyjścia zostaje zachowany: po zrobieniu zdjęcia aplikacja przekazuje `uri` do `/crop` przez `setCapturedImageUri`, tak jak dotychczas — reszta aplikacji nie zauważa zmiany.

## Konsekwencje

### Pozytywne
- Najszersze możliwe pole widzenia na każdym telefonie (obiektyw ultra-wide / pełna matryca).
- Pełna kontrola nad sprzętem kamery — fundament pod produkt komercyjny.
- Otwarta droga do przyszłej korekty dystorsji (dostęp do parametrów kamery).
- Prawdopodobne rozwiązanie przy okazji starego buga orientacji EXIF (vision-camera obsługuje orientację natywnie).

### Negatywne / koszty (zaakceptowane)
- **Wyjście z Expo Go.** Wymaga development buildu (prebuild lokalny lub EAS Build). To jednorazowa, konieczna zmiana dla aplikacji komercyjnej — i tak nieunikniona przed publikacją w sklepie.
- **Wyższe ryzyko buildu.** Zmiana natywna może wpłynąć na buildowalność. Stąd bezwzględne zabezpieczenia poniżej.
- **Ultra-wide ma większą dystorsję soczewki** niż standardowy obiektyw. Ponieważ pomiar działa przez homografię z markera, dystorsja MOŻE wpłynąć na dokładność przy brzegach kadru. Priorytetem właściciela jest teraz najszersze ujęcie; dokładność pomiaru z ultra-wide jest osobnym, późniejszym frontem (dostęp do parametrów kamery w vision-camera daje narzędzia do ewentualnej korekty).

## Zabezpieczenia przed uszkodzeniem projektu (BEZWZGLĘDNE — Agent nie może pominąć)

Ponieważ ta migracja dotyka warstwy natywnej i może uszkodzić buildowalność, PRZED jakąkolwiek zmianą:

1. **Punkt odwrotu w gałęzi git.** Utworzyć osobną gałąź (np. `feature/vision-camera-migration`). Cała migracja dzieje się na tej gałęzi. Gałąź główna (działająca wersja) pozostaje nietknięta jako punkt powrotu. NIE migrować bezpośrednio na głównej gałęzi.

2. **Commit stanu wyjściowego.** Przed instalacją czegokolwiek — commit obecnego, działającego stanu z jasnym opisem ("stan przed migracją vision-camera, działający na expo-camera"), żeby istniał jednoznaczny punkt do którego można wrócić przez `git reset`/`git checkout`.

3. **Kopia zapasowa `camera.tsx`.** Zachować kopię obecnego, działającego `app/camera.tsx` (np. `app/camera.expo-camera.backup.tsx` poza drzewem buildu lub w osobnym miejscu), żeby w razie potrzeby móc natychmiast przywrócić starą implementację bez odtwarzania z pamięci.

4. **NIE odinstalowywać `expo-camera` dopóki nowa warstwa nie jest potwierdzona jako działająca na telefonie.** Obie biblioteki mogą współistnieć podczas migracji. Usunięcie `expo-camera` następuje DOPIERO po potwierdzeniu przez człowieka że vision-camera działa end-to-end (zdjęcie → crop → pomiar). To zapobiega sytuacji bez powrotu.

5. **Kryteria rollbacku zdefiniowane z góry.** Jeśli po Etapie buildu (development build) aplikacja się NIE uruchamia, LUB jeśli po przepisaniu `camera.tsx` zdjęcie nie trafia poprawnie do cropu — wracamy na gałąź główną (`git checkout main`), analizujemy przyczynę, i NIE brniemy dalej "na siłę". Zepsuty build zatrzymuje migrację, nie eskaluje jej.

6. **Etapowość z punktami zatrzymania.** Migracja wykonywana etapami (0: rozpoznanie środowiska, 1: instalacja+build, 2: przepisanie camera.tsx, 3: test). Po KAŻDYM etapie Agent zatrzymuje się i czeka na potwierdzenie człowieka. Żaden etap nie startuje bez potwierdzenia poprzedniego. W szczególności Etap 2 (przepisanie kodu) NIE startuje, dopóki człowiek nie potwierdzi że development build z Etapu 1 uruchamia się poprawnie.

## Środowisko uruchomieniowe (Reguła dla Agentów)

Środowisko uruchomieniowe: Aplikacja działa na własnym Dev Client (EAS build), NIE na Expo Go. Każdy nowy agent musi to założyć domyślnie. Pytanie „czy budujemy Dev Client" ma sens WYŁĄCZNIE gdy: (a) doszedł nowy moduł natywny od ostatniego buildu, (b) zmienił się app.json w sekcji natywnej (plugins, permissions, minSdk, package). W innych przypadkach expo start --dev-client wystarczy.

## Powiązania

- ADR 0013 (kontrakt przestrzeni współrzędnych) — NIENARUSZONY, pomiar dostaje `uri` w tej samej przestrzeni co dotychczas.
- ADR 0014 (stepper + hook) — NIENARUSZONY.
- Instrukcja wykonawcza migracji: `INSTRUKCJA_MIGRACJA_VISION_CAMERA.md` — realizuje tę decyzję etapami PO spełnieniu zabezpieczeń z tego ADR.

## Otwarte następne fronty (poza zakresem tego ADR)

1. Regresja detektora markera (PILNE): detektor wybiera false-positive (śmieć `41px`) zamiast prawdziwego markera (`115px`), raportując fałszywy sukces. Osobny front, do naprawy po ustabilizowaniu kadru.
2. Weryfikacja dokładności pomiaru z obiektywem ultra-wide (dystorsja) — po migracji.
3. Ewentualna korekta dystorsji z wykorzystaniem parametrów kamery udostępnianych przez vision-camera.
