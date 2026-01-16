# SibelPlanner v0.4 (MVP+) – Sicherheitsbeleuchtung mit Stromkreisen

## Neu
- Rettungszeichen mit Pfeilen: ← → ↑ ↓ ↖ ↗ ↙ ↘ + ohne Pfeil
- Würfel-Pfeile links/rechts (Platzhalter – erweiterbar)
- Stromkreise anlegen & Symbolen zuweisen
- Auto-Label pro Seite (z.B. RZL-01, NL-01 je Stromkreis)
- Legende setzen (Textblock)
- Export CSV (Seite)

## Start
```bash
npm install
npm start
```

## Symbole erweitern
- SVGs in `assets/symbols/`
- In `renderer.js` die `symbolDefs` erweitern (id/name/base/overlay/kind)

**Hinweis:** Hersteller-Icons/Produktbilder sind oft geschützt. Neutrale Symbole sind sicher; Hersteller-SVGs bitte nur mit Nutzungsrechten einbinden.


## v0.4
- Rettungszeichen in ISO-ähnlicher Darstellung (eigene SVGs)
- Lampensymbole: Decke/Wand + RZL-Box
