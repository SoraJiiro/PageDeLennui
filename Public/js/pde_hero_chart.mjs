export function parsePdeHeroChart(text) {
  if (typeof text !== "string") throw new Error("Fichier .chart invalide.");

  const sections = new Map(
    [...text.matchAll(/^\s*\[([^\]]+)\]\s*\{\s*([\s\S]*?)^\s*\}/gm)].map(
      ([, name, body]) => [name.toLowerCase(), body],
    ),
  );
  const song = sections.get("song");
  const sync = sections.get("synctrack");
  if (!song || !sync) throw new Error("Sections Song ou SyncTrack introuvables.");

  const resolutionMatch = song.match(/^\s*Resolution\s*=\s*(\d+)/im);
  const resolution = resolutionMatch ? Number(resolutionMatch[1]) : 192;
  if (!Number.isSafeInteger(resolution) || resolution < 1)
    throw new Error("Résolution .chart invalide.");

  const tempos = [
    ...sync.matchAll(/^\s*(\d+)\s*=\s*B\s+(\d+)\s*$/gm),
  ].map(([, tick, bpm]) => ({
    tick: Number(tick),
    bpm: Number(bpm) / 1000,
  }));
  if (tempos.some(({ bpm }) => !Number.isFinite(bpm) || bpm <= 0))
    throw new Error("Tempo .chart invalide.");
  tempos.sort((a, b) => a.tick - b.tick);
  if (!tempos.length || tempos[0].tick > 0)
    tempos.unshift({ tick: 0, bpm: 120 });
  tempos.forEach((tempo, index) => {
    tempo.time =
      index === 0
        ? 0
        : tempos[index - 1].time +
          ((tempo.tick - tempos[index - 1].tick) * 60) /
            (resolution * tempos[index - 1].bpm);
  });
  const timeAtTick = (tick) => {
    let index = tempos.length - 1;
    while (index > 0 && tempos[index].tick > tick) index--;
    const tempo = tempos[index];
    return tempo.time + ((tick - tempo.tick) * 60) / (resolution * tempo.bpm);
  };

  const tracks = {};
  for (const [name, body] of sections) {
    const match = name.match(/^(easy|medium|hard|expert)(single)?$/);
    if (!match) continue;
    const difficulty = match[1];
    const notes = [...body.matchAll(/^\s*(\d+)\s*=\s*N\s+([0-7])\s+(\d+)/gm)]
      .map(([, tick, lane, length]) => ({
        tick: Number(tick),
        lane: Number(lane),
        length: Number(length),
      }))
      .filter(({ lane }) => lane <= 4 || lane === 7)
      .sort((a, b) => a.tick - b.tick || a.lane - b.lane);
    if (!notes.length || (tracks[difficulty] && !match[2])) continue;

    for (const note of notes) {
      note.time = timeAtTick(note.tick);
      note.sustain = Math.max(0, timeAtTick(note.tick + note.length) - note.time);
      if (note.lane === 7) note.lane = 0;
    }
    tracks[difficulty] = {
      name: match[2] ? `${match[1]}Single` : match[1],
      notes,
      duration: notes.at(-1).time,
    };
  }

  if (!Object.keys(tracks).length)
    throw new Error("Aucune difficulté jouable trouvée dans le fichier .chart.");
  return { tracks };
}

export function schedulePdeHeroTrack(track, startAt, travelTime, chartSpeed) {
  return {
    startAt,
    duration: track.duration / chartSpeed,
    notes: track.notes.map((note) => ({
      lane: note.lane,
      spawnAt: startAt + (note.time / chartSpeed) * 1000 - travelTime,
      travelTime,
      sustain: note.sustain / chartSpeed,
    })),
  };
}

export function getPdeHeroScoreMultiplier(difficulty, chartSpeed, hyperspeed) {
  const difficultyMultiplier = {
    easy: 0.25,
    medium: 0.5,
    hard: 1,
    expert: 1.75,
  }[difficulty];
  return difficultyMultiplier * chartSpeed * hyperspeed;
}

export function getPdeHeroMultiplier(combo) {
  return Math.min(4, 1 + Math.floor(combo / 10));
}

export function adjustPdeHeroStagePresence(presence, hit) {
  return Math.max(0, Math.min(100, presence + (hit ? 1 : -10)));
}
