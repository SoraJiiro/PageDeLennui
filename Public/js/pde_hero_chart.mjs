export function parsePdeHeroChart(text) {
  if (typeof text !== "string") throw new Error("Fichier .chart invalide.");

  const sections = new Map(
    [...text.matchAll(/^\s*\[([^\]]+)\]\s*\{\s*([\s\S]*?)^\s*\}/gm)].map(
      ([, name, body]) => [name.toLowerCase(), body],
    ),
  );
  const song = sections.get("song");
  const sync = sections.get("synctrack");
  if (!song || !sync)
    throw new Error("Sections Song ou SyncTrack introuvables.");

  const resolutionMatch = song.match(/^\s*Resolution\s*=\s*(\d+)/im);
  const resolution = resolutionMatch ? Number(resolutionMatch[1]) : 192;
  if (!Number.isSafeInteger(resolution) || resolution < 1)
    throw new Error("Résolution .chart invalide.");

  const tempos = [...sync.matchAll(/^\s*(\d+)\s*=\s*B\s+(\d+)\s*$/gm)].map(
    ([, tick, bpm]) => ({
      tick: Number(tick),
      bpm: Number(bpm) / 1000,
    }),
  );
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
      note.sustain = Math.max(
        0,
        timeAtTick(note.tick + note.length) - note.time,
      );
      if (note.lane === 7) note.lane = 0;
    }
    tracks[difficulty] = {
      name: match[2] ? `${match[1]}Single` : match[1],
      notes,
      duration: Math.max(...notes.map((note) => note.time + note.sustain)),
    };
  }

  if (!Object.keys(tracks).length)
    throw new Error(
      "Aucune difficulté jouable trouvée dans le fichier .chart.",
    );

  const lyrics = [
    ...(sections.get("events") || "").matchAll(
      /^\s*(\d+)\s*=\s*E\s+"lyric\s+((?:\\.|[^"])*)"\s*$/gim,
    ),
  ]
    .map(([, tick, text]) => ({
      tick: Number(tick),
      time: timeAtTick(Number(tick)),
      text: text.replace(/\\"/g, '"').trim(),
    }))
    .filter(({ text }) => text);
  return { tracks, lyrics };
}

export function parsePdeHeroMidi(input) {
  const bytes =
    input instanceof ArrayBuffer
      ? new Uint8Array(input)
      : ArrayBuffer.isView(input)
        ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
        : null;
  if (!bytes || bytes.length < 14) throw new Error("Fichier MIDI invalide.");

  const readString = (offset, length) =>
    String.fromCharCode(...bytes.subarray(offset, offset + length));
  const readUint32 = (offset) =>
    bytes[offset] * 0x1000000 +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3];
  if (readString(0, 4) !== "MThd" || readUint32(4) < 6)
    throw new Error("En-tête MIDI invalide.");
  const headerLength = readUint32(4);
  if (8 + headerLength > bytes.length) throw new Error("En-tête MIDI tronqué.");
  const format = (bytes[8] << 8) | bytes[9];
  const trackCount = (bytes[10] << 8) | bytes[11];
  const division = (bytes[12] << 8) | bytes[13];
  if (format > 1 || !trackCount || division & 0x8000 || !division)
    throw new Error(
      "Format MIDI non pris en charge (utilisez un MIDI PPQ type 0 ou 1).",
    );

  const tempos = [];
  const lyrics = [];
  const tracks = [];
  let offset = 8 + headerLength;
  let maxTick = 0;
  let eventOrder = 0;
  for (let trackIndex = 0; trackIndex < trackCount; trackIndex++) {
    if (offset + 8 > bytes.length || readString(offset, 4) !== "MTrk")
      throw new Error("Piste MIDI invalide.");
    const trackLength = readUint32(offset + 4);
    const start = offset + 8;
    const end = start + trackLength;
    if (end > bytes.length) throw new Error("Piste MIDI tronquée.");
    offset = start;
    let tick = 0;
    let runningStatus = 0;
    let name = "";
    const notes = [];
    const openNotes = new Map();
    const readVlq = () => {
      let value = 0;
      for (let count = 0; count < 4; count++) {
        if (offset >= end) throw new Error("Événement MIDI tronqué.");
        const byte = bytes[offset++];
        value = (value << 7) | (byte & 0x7f);
        if (!(byte & 0x80)) return value;
      }
      throw new Error("Valeur MIDI invalide.");
    };
    const readMetaText = (length) =>
      new TextDecoder().decode(bytes.subarray(offset, offset + length));

    while (offset < end) {
      tick += readVlq();
      maxTick = Math.max(maxTick, tick);
      let status = bytes[offset++];
      if (status === 0xff) {
        if (offset >= end) throw new Error("Événement MIDI invalide.");
        const type = bytes[offset++];
        const length = readVlq();
        if (offset + length > end)
          throw new Error("Méta-événement MIDI tronqué.");
        if (type === 0x03) name = readMetaText(length);
        else if (type === 0x51 && length === 3) {
          const microseconds =
            (bytes[offset] << 16) |
            (bytes[offset + 1] << 8) |
            bytes[offset + 2];
          if (!microseconds) throw new Error("Tempo MIDI invalide.");
          tempos.push({ tick, order: eventOrder++, microseconds });
        } else if (type === 0x05) {
          const text = readMetaText(length).trim();
          if (text) lyrics.push({ tick, text, order: eventOrder++ });
        }
        offset += length;
        runningStatus = 0;
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {
        const length = readVlq();
        offset += length;
        if (offset > end) throw new Error("Événement SysEx MIDI tronqué.");
        runningStatus = 0;
        continue;
      }
      if (status < 0x80) {
        offset--;
        status = runningStatus;
      } else if (status < 0xf0) {
        runningStatus = status;
      } else {
        throw new Error("Événement système MIDI non pris en charge.");
      }
      if (!status) throw new Error("Événement MIDI sans statut.");
      const command = status & 0xf0;
      const channel = status & 0x0f;
      const dataLength = command === 0xc0 || command === 0xd0 ? 1 : 2;
      if (offset + dataLength > end) throw new Error("Événement MIDI tronqué.");
      const pitch = bytes[offset++];
      const velocity = dataLength === 2 ? bytes[offset++] : 0;
      if (command !== 0x80 && command !== 0x90) continue;
      const key = `${channel}:${pitch}`;
      if (command === 0x90 && velocity > 0) {
        const starts = openNotes.get(key) || [];
        starts.push(tick);
        openNotes.set(key, starts);
      } else {
        const starts = openNotes.get(key);
        if (!starts?.length) continue;
        notes.push({ pitch, start: starts.shift(), end: tick });
      }
    }
    tracks.push({ name, notes });
    offset = end;
  }

  const tempoMap = tempos.length
    ? tempos.sort((a, b) => a.tick - b.tick || a.order - b.order)
    : [{ tick: 0, microseconds: 500000 }];
  if (tempoMap[0].tick > 0) tempoMap.unshift({ tick: 0, microseconds: 500000 });
  const effectiveTempos = tempoMap.filter(
    (tempo, index) =>
      index === tempoMap.length - 1 || tempo.tick !== tempoMap[index + 1].tick,
  );
  effectiveTempos.forEach((tempo, index) => {
    tempo.time =
      index === 0
        ? 0
        : effectiveTempos[index - 1].time +
          ((tempo.tick - effectiveTempos[index - 1].tick) *
            effectiveTempos[index - 1].microseconds) /
            (division * 1_000_000);
  });
  const timeAtTick = (target) => {
    let index = effectiveTempos.length - 1;
    while (index > 0 && effectiveTempos[index].tick > target) index--;
    const tempo = effectiveTempos[index];
    return (
      tempo.time +
      ((target - tempo.tick) * tempo.microseconds) / (division * 1_000_000)
    );
  };

  const difficultyBases = [
    ["easy", 60],
    ["medium", 72],
    ["hard", 84],
    ["expert", 96],
  ];
  const instrumentTracks = tracks
    .filter(({ notes }) =>
      notes.some(({ pitch }) =>
        difficultyBases.some(([, base]) => pitch >= base && pitch <= base + 4),
      ),
    )
    .sort(
      (a, b) =>
        Number(!/PART GUITAR/i.test(a.name)) -
        Number(!/PART GUITAR/i.test(b.name)),
    );
  const instrument = instrumentTracks[0];
  if (!instrument)
    throw new Error(
      "Aucune piste Guitar Hero à cinq lanes trouvée dans le MIDI.",
    );

  const playableTracks = {};
  for (const [difficulty, base] of difficultyBases) {
    const chartNotes = [];
    for (const note of instrument.notes) {
      const lane = note.pitch - base;
      if (lane < 0 || lane > 4) continue;
      const time = timeAtTick(note.start);
      chartNotes.push({
        lane,
        time,
        sustain: Math.max(0, timeAtTick(note.end) - time),
      });
    }
    if (chartNotes.length) {
      chartNotes.sort((a, b) => a.time - b.time || a.lane - b.lane);
      playableTracks[difficulty] = {
        name: difficulty,
        notes: chartNotes,
        duration: timeAtTick(maxTick),
      };
    }
  }
  if (!Object.keys(playableTracks).length)
    throw new Error("Le MIDI ne contient aucune note jouable Guitar Hero.");
  return {
    tracks: playableTracks,
    lyrics: lyrics
      .sort((a, b) => a.tick - b.tick || a.order - b.order)
      .map(({ tick, text }) => ({ time: timeAtTick(tick), text })),
  };
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

export function schedulePdeHeroLongPauses(
  track,
  startAt,
  chartSpeed,
  threshold = 5,
  hitWindow = 0.28,
) {
  const notes = track.notes.slice().sort((a, b) => a.time - b.time);
  const pauses = [];
  let previousEnd = 0;
  for (const note of notes) {
    if (
      note.time > previousEnd &&
      (note.time - previousEnd) / chartSpeed > threshold
    ) {
      const nextNoteAt = startAt + (note.time / chartSpeed) * 1000;
      const pauseStart = startAt + (previousEnd / chartSpeed) * 1000;
      const controlsResumeAt = nextNoteAt - hitWindow * 1000;
      if (controlsResumeAt > pauseStart) {
        pauses.push({
          startAt: pauseStart,
          endAt: controlsResumeAt,
          nextNoteAt,
        });
      }
    }
    previousEnd = Math.max(previousEnd, note.time + note.sustain);
  }
  return pauses;
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

export function schedulePdeHeroLyrics(lyrics, startAt, chartSpeed) {
  return lyrics.map(({ time, text }) => ({
    at: startAt + (time / chartSpeed) * 1000,
    text,
  }));
}

export function groupPdeHeroLyrics(lyrics) {
  const phrases = [];
  let phrase;
  for (const [index, lyric] of lyrics.entries()) {
    const previous = lyrics[index - 1];
    if (
      !phrase ||
      lyric.at - previous.at > 1_250 ||
      /[.!?,;:]$/.test(previous.text)
    ) {
      phrase = {
        startIndex: index,
        syllables: [],
      };
      phrases.push(phrase);
    }
    const previousSyllable = phrase.syllables.at(-1);
    phrase.syllables.push({
      at: lyric.at,
      text: lyric.text.replace(/-$/, ""),
      separatorBefore:
        previousSyllable && !previous.text.endsWith("-") ? " " : "",
    });
  }
  phrases.forEach((item) => {
    item.endIndex = item.startIndex + item.syllables.length;
  });
  return phrases;
}

export function getPdeHeroSustainBonus(
  heldSeconds,
  multiplier,
  scoreMultiplier,
) {
  return Math.round(
    Math.max(0, heldSeconds) * 100 * multiplier * scoreMultiplier,
  );
}
