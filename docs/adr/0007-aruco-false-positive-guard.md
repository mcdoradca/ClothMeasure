# ADR 0007: Wdrożenie ArUco False Positive Guard (Wariancja Wewnętrzna)

## Kontekst
Algorytm detekcji markera (Otsu Threshold + znajdowanie komponentów w tablicy połączonej) cierpiał na zjawisko False Positive, tj. przyjmował gładkie obszary jednolitego koloru (np. skrawek logotypu w świetle, cienie lub szwy koszuli) za obrys markera. Gdy taki fałszywy marker został wykryty, aplikacja wystawiała zawyżony współczynnik Pixel Per Centimeter (np. koszulka o długości 65 cm była opisywana jako 150 cm) oraz zatwierdzała wykrycie na zielono (zielony status markera).

## Decyzja
Zdecydowano dodać wyspecjalizowanego Strażnika Algorytmicznego tuż przed ostateczną selekcją kandydatów na marker. 
Funkcja `checkInnerVariance` mierzy wewnętrzny środek kandydata (margines 25% w głąb pola), badając rozkład białych/czarnych pikseli. Klasyczny 10-centymetrowy kod ArUco posiada w środku przeplatane, zakodowane moduły (białe i czarne kwadraty).
Jeżeli wynik wykazuje mniej niż 10% wymieszania barw lub więcej niż 90% wymieszania (co świadczy o prawie gładkiej strukturze/szumie bez wzorów bitowych), dany kandydat jest rygorystycznie odrzucany przez Strażnika. 
Dodatkowo odrzucone logi zostały objęte przez `SentinelLogger` by dokumentować procesy weryfikacji.

## Status
Zaakceptowane i Zaimplementowane w `arucoDetector.ts`.
