# ADR 0011: Dynamiczny rozmiar widoku obrazu (onLayout) i eliminacja hardkodowanego Aspect Ratio
Data: 2026-06-29

## Kontekst
Mnożnik przestrzeni izometrycznej w pliku `result.tsx` zakładał matematyczny rzut zdjęcia w formacie 4:3 (`IMAGE_HEIGHT = SCREEN_W * 1.33`). Ponieważ komponent z obrazkiem renderuje się w trybie `resizeMode="contain"`, faktyczny wymiar wyrenderowanego obrazka (`renderedH`) często ulegał letterboxingowi i wynosił np. 377px w pionie, mimo że kontener zarezerwował 479px. Skutkowało to stałym błędem systematycznym w wyliczaniu `scaleToOriginal`, gdzie nakładka SVG z punktami mierniczymi pracowała w innym aspekcie rozmiarowym niż podkład (różnica ~25% na skali).

## Decyzja
Usunięto sztywne założenie mnożnika 1.33. Wprowadzono dynamiczny nasłuch React State (`imageLayoutSize`) podpięty bezpośrednio pod zdarzenie `onLayout` komponentu `<Image>`. Matematyka w `getTrueDistance` bazuje teraz na wczytanym z natywnego widoku kontenera rozmiarze.

## Konsekwencje
Pomiary na ekranie po przesunięciu celownika odpowiadają precyzyjnie fizycznym pikselom obrazu. Nakładka wektorowa rzutuje się 1:1, bez względu na proporcje aparatu telefonu lub wstawionego zdjęcia (np. 16:9 czy 4:3), co rozwiązuje problem systematycznie zawyżonych/zaniżonych długości ubrań pomimo świetnie skalibrowanego markera referencyjnego.
