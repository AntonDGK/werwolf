export const gameState = {
  // Bereits gespielte Fragen
  usedQuestionIds: new Set<string>(),

  // Aktuelle Frage
  currentQuestionId: null as string | null,

  // Wurde die aktuelle Antwort freigegeben?
  answerRevealed: false,

  // Aktuelles Team
  currentTeam: null as string | null,

  // Wer hat gebuzzert?
  buzzerPlayerId: null as string | null,

  revealedPictureCount: 0,
  // Gemeinsamer Audiostatus
  audio: {
    extraIndex: null as number | null,
    isPlaying: false,
    positionSeconds: 0,
    startedAt: null as number | null,
  },

  cookies: 0,
};