# MELON MADNESS 67 – Projektkontext für Claude

## Was ist das?
Retro Arcade-Basketballspiel im Stil einer osteuropäischen Cartoon-Komödie.
Wolf wirft Melonen in einen Korb, Hase stört und verhöhnt.
Reine HTML5 Canvas + Vanilla JS App, keine externen Abhängigkeiten.

## Dateien
```
index.html   – HTML-Gerüst, Canvas, Portrait-Hinweis-Overlay
style.css    – Responsive Scaling, Retro-Look, Portrait-Warnung
script.js    – Komplettes Spiel (~1600 Zeilen)
README.md    – GitHub-Beschreibung
```

## GitHub & Live-URL
- Repo:  https://github.com/davidnikischin0601/WaterMelonGame67
- Live:  https://davidnikischin0601.github.io/WaterMelonGame67/

## Steuerung (aktuell)
| Aktion       | Handy              | PC               |
|--------------|--------------------|------------------|
| Wolf bewegen | ◀ ▶ Buttons unten  | ← → / A D        |
| Werfen       | Einmal antippen    | Klick / Leertaste|

Ziellinie schwingt automatisch hin und her (kein Drag mehr nötig).
Linie wird grün wenn sie auf den Korb zeigt → dann tippen.

## Punkte-Zonen
- Wolf weit vom Korb (grüne Zone): **+3 Punkte**
- Wolf normal (gelbe Zone):        **+2 Punkte**
- Wolf nah am Korb (rote Zone):    **+1 Punkt**
- Combo ab 3× Treffer: Bonus-Punkte

## Der 67-Move (Spezial-Animation)
Wird ausgelöst wenn der aktuelle Score:
- die Ziffer **6** enthält  (z.B. 6, 16, 26, 36, 60–69, 86 …)
- die Ziffer **7** enthält  (z.B. 7, 17, 27, 37, 70–79, 87 …)
- eine **Quersumme von 13** hat (weil 6+7=13 → z.B. 49, 58, 85, 94 …)

Der Hase wächst auf 3× Größe und tanzt wild.
Text zeigt den Auslösegrund: „DER 67 MOVE!", „QUERSUMME 13 MOVE!" usw.
Dauer: 4,7s (für 67/76), 3,2s (Quersumme 13), 2,6s (nur 6 oder nur 7).
Warteschlange: mehrere Auslöser hintereinander werden nacheinander abgespielt.

## Technische Kernentscheidungen
- Canvas intern immer **800×500 px** – Skalierung via `transform: scale()` in JS
- `resizeCanvas()` läuft bei `resize` + `orientationchange` (250ms Delay)
- Portrait-Warnung: CSS Media Query `orientation: portrait` + `max-width: 500px`
- Audio: Web Audio API (Synthese, keine Audio-Dateien)
- Highscore: `localStorage` Key `mm67_hs`
- Spielzeit: 90 Sekunden

## Charakter-Zeichnung (Canvas-Primitives)
Alle Charaktere werden mit Canvas-API gezeichnet (keine Sprite-Sheets).
- **Wolf**: grauer Körper, bernsteinfarbene Augen, Schweif, 4 Zustände
  (idle / throwing / celebrating / disappointed)
- **Hase**: cremefarbener Körper, lange Ohren, rote Augen, 4 Zustände
  (idle / moving / taunting / giant_dance)
- **Melone**: grüne Kugel mit Streifen, Schweif-Trail, physikalische Rotation

## Wichtige Funktionen in script.js
| Funktion          | Was sie tut                                      |
|-------------------|--------------------------------------------------|
| `isSpecialScore(n)` | Prüft ob Score 6/7 enthält oder Quersumme=13  |
| `getSpecialInfo(n)` | Liefert Text + Dauer für Special-Animation    |
| `resizeCanvas()`  | Skaliert Canvas per CSS transform ans Fenster    |
| `fireMelon()`     | Wirft Melone mit aktuellem AIM-Winkel            |
| `AIM.getVelocity()` | Physikformel: berechnet exakten Impuls für Korb|
| `drawMobileButtons()` | Zeichnet ◀ WERFEN ▶ Buttons am unteren Rand |
| `triggerSpecial(sc)` | Startet Special-Animation (mit Warteschlange) |

## Update auf GitHub pushen
```bash
cd "C:\Users\david\OneDrive\Desktop\67"
git add -A
git commit -m "Beschreibung der Änderung"
git push
```
GitHub Pages aktualisiert sich automatisch nach ~1 Minute.
