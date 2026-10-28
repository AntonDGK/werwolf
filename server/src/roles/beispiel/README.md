# Rollenvorlage

Diese Rolle ist **nicht registriert** und verändert das Spiel nicht.

## Neue Rolle anlegen

1. `beispiel/` kopieren und umbenennen, z. B. `hexe/`.
2. In `config.ts` die Rollen-ID, den Namen, die Phasen und Buttons ändern.
3. In `actions.ts` die benötigten Hooks umsetzen; ungenutzte entfernen.
4. In `server/src/roles/RoleRegistry.ts` die Config und Actions importieren und **einen** Eintrag ergänzen.

## Kurzreferenz

- `config.ts`: `night`, `day`, `buttons`, `selection`, `targeting`; `cameraLayout` optional.
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

**Kamerasystem:** Keine bestehenden Kameradateien ändern.
