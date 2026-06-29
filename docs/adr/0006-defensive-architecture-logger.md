# ADR 0006: Wdrożenie Defensive Architecture i Auto-Nadzoru

## Kontekst
System pomijał ciche zgłaszanie błędów (ukrywając je poprzez `.catch(console.error)`) i posiadał zapisane na sztywno sztuczne zdarzenia (jak `setTimeout` w module ładowania wyników), zwane potocznie "Placebo". Ze względu na rygorystyczne wymagania Red Lines, wymagane było wdrożenie operacyjnego logowania "działa / nie działa".

## Decyzja
Zdecydowano się wdrożyć w pełni defensywną architekturę ("Sentinel Logger"). Utworzono moduł w `src/utils/logger.ts`, który otacza każdą asynchroniczną i wrażliwą funkcję w aplikacji trybami `[START]`, `[SUCCESS]` oraz `[ERROR]`. Zlikwidowano sztuczne holdery (jak fake-loading). Usunięto zapisane "na sztywno" atrybuty (jak wstrzyknięty na sztywno typ ubioru 'unknown' zastąpiony został interaktywnym wyborem `GarmentPicker` w `result.tsx`).
Dodatkowo odkodowano funkcje wymiarowe tak by eksport do bazy zapisywał realne wektory odległości Euklidesowej z ekranu.

## Status
Zaakceptowane. Wdrożone w całej domenie aplikacji.
