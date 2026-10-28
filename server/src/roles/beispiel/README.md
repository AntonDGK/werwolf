# Rollenvorlage

Diese Rolle ist **nicht registriert** und verändert das Spiel nicht.

## Neue Rolle anlegen

1. `beispiel/` kopieren und umbenennen, z. B. `hexe/`.
2. In `config.ts` die Rollen-ID, den Namen, die Phasen und Buttons ändern.
3. In `actions.ts` die benötigten Hooks umsetzen; ungenutzte entfernen.
4. In `server/src/roles/RoleRegistry.ts` die Config und Actions importieren und **einen** Eintrag ergänzen.

## Kurzreferenz

- `config.ts`: `night`, `day`, `buttons`, `selection`, `targeting`; `cameraLayout` optional.
- `notebook.description`: **fett**, ++unterstrichen++, Leerzeilen.
- `frame`: PNG-Dateiname unter `client/src/assets/frames/`.
- `frameVisibility.sameRole`: gleiche Rolle darf Rahmen sehen.
- `frameVisibility.visibleToRoles`: Rollen-IDs mit Sichtrecht.
- `frameVisibility.publicOnReveal`: nach `reveal`-Effekt öffentlich.
- Eigenen Rahmen sieht die Rolle immer; tote Spieler zeigen den Totenrahmen.
- `onNightAction` / `onDayAction`: Button-Klick; Ergebnis `{ ok, effects? }`.
- `onNightStepEnd`: Ende der eigenen Nachtphase; Aktionen im Nachtzustand vormerken.
- `onNightStart` / `onNightEnd`: Beginn / Ende der Nacht.
- `onDayStart` / `onDayEnd`: Beginn / Ende des Tages.
- `select` / `getSelection`: Zielwahl; `reset`: neue Nacht.
- `getDayVoteWeight`: Tagesstimme; `onDeath`: Tod; `onGameReset`: neue Partie.
- `RoleEffect`: `eliminate`, `protect`, `reveal`.
- `night?.werewolfTargetId`: nur bei `night.canSeeWerewolfTarget: true`.
- `buttons[].once`: nur nach **erfolgreicher** Aktion verbraucht.
- Alle Aktionen serverseitig prüfen; nur Teilnehmer der aktiven Rolle werden ausgeführt.

**Kamerastreams:** Unverändert; nur Rahmenanzeige konfigurieren.
