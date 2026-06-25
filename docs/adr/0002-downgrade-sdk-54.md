# Architektura: Downgrade do SDK 54
Data: 2026-06-25

## Problem
Ze względu na ograniczenia fizycznego klienta Expo Go (v54.0.8) używanego na urządzeniu docelowym, najnowsze SDK 56 było odrzucane, powodując Blue Screen przy uruchamianiu, a kompilacja chmurowa EAS upadła przez konflikt peer-dependency w `npm ci` i 55-minutową kolejkę free-tier.

## Decyzja
Zdecydowano na przeprowadzenie lokalnego downgrade'u platformy do Expo v54. 
- Wymuszono `legacy-peer-deps=true` w pliku `.npmrc`.
- Oczyszczono i zainstalowano rdzeń: `npm install expo@~54.0.0`.
- Wywołano `npx expo install --fix` w celu dostrojenia wtyczek (`react-native`, `expo-router`, `expo-camera`).
- Zrefaktoryzowano importy - usunięto `/legacy` z `expo-file-system`.

## Konsekwencje
Aplikacja kompiluje kod poprawnie. Umożliwia to błyskawiczne, testowanie w Expo Go bez oczekiwania na usługi chmurowe.
