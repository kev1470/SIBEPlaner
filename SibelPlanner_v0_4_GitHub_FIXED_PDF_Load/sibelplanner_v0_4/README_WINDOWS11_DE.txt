SibelPlanner (Windows 11) – ganz einfach starten

A) Einfach starten (ohne EXE bauen)
1) Node.js (LTS) installieren: https://nodejs.org
2) Doppelklick: START_SibelPlanner_Windows11.bat
3) Im Programm: PDF laden → Symbole setzen → Export PDF

B) Richtige EXE erstellen (Installer/Portable)
1) Node.js (LTS) installieren
2) Doppelklick: EXE_BAUEN_Windows11.bat
3) Ergebnis liegt im Ordner: dist\
   - Installer (.exe) und/oder Portable (.exe)

Hinweis:
- Zum ersten Mal braucht es Internet, weil npm Pakete herunterlädt.


GitHub:
- Dieses Projekt kann 1:1 in ein GitHub-Repository gepusht werden.
- Danach auf jedem Windows 11 PC/Tablet per 'npm install' + 'npm start' starten.
