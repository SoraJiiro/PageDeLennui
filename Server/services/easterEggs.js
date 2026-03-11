function getFileService() {
  try {
    const util = require("../util");
    return util && util.FileService ? util.FileService : null;
  } catch (e) {
    return null;
  }
}

const EGG_DEFS = [
  {
    id: "S1",
    label: "EasterEgg [S1]",
    steps: [{ id: "rainbow", label: "Etape 1", optional: false }],
  },
  {
    id: "S2",
    label: "EasterEgg [S2]",
    steps: [
      { id: "login_x", label: "Etape 1", optional: true },
      { id: "index_x", label: "Etape 2", optional: false },
      { id: "ann_link", label: "Etape 3", optional: false },
      { id: "search_x", label: "Etape 4", optional: true },
      { id: "suggestions_code", label: "Etape 5", optional: false },
    ],
  },
];

const STEP_CODES = {
  r1: { eggId: "S1", stepId: "rainbow" },
  l1: { eggId: "S2", stepId: "login_x" },
  i1: { eggId: "S2", stepId: "index_x" },
  a1: { eggId: "S2", stepId: "ann_link" },
  s1: { eggId: "S2", stepId: "search_x" },
  g1: { eggId: "S2", stepId: "suggestions_code" },
};

const EASTER_EGG_BADGES = {
  S1: { id: "EE_S1", name: "EE [S1]", emoji: "🌈​" },
  S2: { id: "EE_S2", name: "EE [S2]", emoji: "📨" },
};

function ensureChatBadgesStore(FileService) {
  if (!FileService || !FileService.data) return null;
  if (
    !FileService.data.chatBadges ||
    typeof FileService.data.chatBadges !== "object"
  ) {
    FileService.data.chatBadges = { catalog: {}, users: {} };
  }
  if (
    !FileService.data.chatBadges.catalog ||
    typeof FileService.data.chatBadges.catalog !== "object"
  ) {
    FileService.data.chatBadges.catalog = {};
  }
  if (
    !FileService.data.chatBadges.users ||
    typeof FileService.data.chatBadges.users !== "object"
  ) {
    FileService.data.chatBadges.users = {};
  }
  return FileService.data.chatBadges;
}

function grantEasterEggBadge(pseudo, eggId, FileService) {
  const badgeDef = EASTER_EGG_BADGES[String(eggId || "").trim()];
  if (!badgeDef || !pseudo || !FileService || !FileService.data) return false;

  const badgesStore = ensureChatBadgesStore(FileService);
  if (!badgesStore) return false;

  let changed = false;

  if (!badgesStore.catalog[badgeDef.id]) {
    badgesStore.catalog[badgeDef.id] = {
      emoji: badgeDef.emoji,
      name: badgeDef.name,
    };
    changed = true;
  } else {
    const existing = badgesStore.catalog[badgeDef.id];
    if (!existing || typeof existing !== "object") {
      badgesStore.catalog[badgeDef.id] = {
        emoji: badgeDef.emoji,
        name: badgeDef.name,
      };
      changed = true;
    } else {
      if (!existing.name) {
        existing.name = badgeDef.name;
        changed = true;
      }
      if (!existing.emoji) {
        existing.emoji = badgeDef.emoji;
        changed = true;
      }
    }
  }

  if (!badgesStore.users[pseudo]) {
    badgesStore.users[pseudo] = { assigned: [], selected: [] };
    changed = true;
  }

  const userBucket = badgesStore.users[pseudo];
  if (!Array.isArray(userBucket.assigned)) userBucket.assigned = [];
  if (!Array.isArray(userBucket.selected)) userBucket.selected = [];

  if (!userBucket.assigned.includes(badgeDef.id)) {
    userBucket.assigned.push(badgeDef.id);
    changed = true;
  }

  if (changed) {
    FileService.save("chatBadges", badgesStore);
  }

  return changed;
}

function ensureStore(fileServiceOverride) {
  const FileService = fileServiceOverride || getFileService();
  if (!FileService || !FileService.data) return { users: {} };
  if (
    !FileService.data.easterEggs ||
    typeof FileService.data.easterEggs !== "object"
  ) {
    FileService.data.easterEggs = { users: {} };
    FileService.save("easterEggs", FileService.data.easterEggs);
  }
  if (
    !FileService.data.easterEggs.users ||
    typeof FileService.data.easterEggs.users !== "object"
  ) {
    FileService.data.easterEggs.users = {};
  }
  return FileService.data.easterEggs;
}

function getEggDef(eggId) {
  return EGG_DEFS.find((e) => e.id === eggId) || null;
}

function getUserEggProgress(store, pseudo, eggId) {
  if (!store.users[pseudo]) store.users[pseudo] = {};
  if (!store.users[pseudo][eggId]) {
    store.users[pseudo][eggId] = {
      steps: {},
      completed: false,
      completedAt: null,
      updatedAt: null,
    };
  }
  if (
    !store.users[pseudo][eggId].steps ||
    typeof store.users[pseudo][eggId].steps !== "object"
  ) {
    store.users[pseudo][eggId].steps = {};
  }
  return store.users[pseudo][eggId];
}

function isEggComplete(eggDef, stepState) {
  const required = eggDef.steps.filter((s) => !s.optional);
  return required.every((s) => stepState[s.id]);
}

function canMarkStep(eggDef, stepId, stepState) {
  const idx = eggDef.steps.findIndex((s) => s.id === stepId);
  if (idx === -1) return false;
  for (let i = 0; i < idx; i++) {
    const prev = eggDef.steps[i];
    if (!prev.optional && !stepState[prev.id]) return false;
  }
  return true;
}

function nextRequiredStepId(eggDef, stepState) {
  const next = eggDef.steps.find((s) => !s.optional && !stepState[s.id]);
  return next ? next.id : null;
}

function markStep(pseudo, eggId, stepId, fileServiceOverride) {
  if (!pseudo || !eggId || !stepId) return null;
  const FileService = fileServiceOverride || getFileService();
  if (!FileService || !FileService.data) return null;
  const eggDef = getEggDef(eggId);
  if (!eggDef) return null;

  const store = ensureStore(FileService);
  const progress = getUserEggProgress(store, pseudo, eggId);
  const stepState = progress.steps;
  const wasCompleted = !!progress.completed;

  if (stepState[stepId]) {
    const nowCompleted = isEggComplete(eggDef, stepState);
    if (nowCompleted) {
      let changed = false;
      if (!progress.completed) {
        progress.completed = true;
        changed = true;
      }
      if (!progress.completedAt) {
        progress.completedAt = new Date().toISOString();
        changed = true;
      }
      if (!progress.updatedAt) {
        progress.updatedAt = new Date().toISOString();
        changed = true;
      }
      if (changed) {
        FileService.save("easterEggs", store);
      }
      grantEasterEggBadge(pseudo, eggId, FileService);
    }
    return progress;
  }

  if (!canMarkStep(eggDef, stepId, stepState)) {
    return null;
  }

  const targetStep = eggDef.steps.find((s) => s.id === stepId);
  const nextRequiredId = nextRequiredStepId(eggDef, stepState);
  if (
    targetStep &&
    !targetStep.optional &&
    nextRequiredId &&
    stepId !== nextRequiredId
  ) {
    return null;
  }

  stepState[stepId] = true;
  progress.completed = isEggComplete(eggDef, stepState);
  if (progress.completed && !progress.completedAt) {
    progress.completedAt = new Date().toISOString();
  }
  progress.updatedAt = new Date().toISOString();

  FileService.save("easterEggs", store);

  if (progress.completed && !wasCompleted) {
    grantEasterEggBadge(pseudo, eggId, FileService);
  }

  return progress;
}

function markStepByCode(pseudo, code, fileServiceOverride) {
  const info = STEP_CODES[String(code || "").trim()];
  if (!info) return null;
  return markStep(pseudo, info.eggId, info.stepId, fileServiceOverride);
}

function recordPreloginStep(req) {
  if (!req || !req.session) return false;
  if (!req.session.eePending) req.session.eePending = {};
  req.session.eePending.loginSelected = true;
  req.session.eePending.at = new Date().toISOString();
  req.session.save(() => {});
  return true;
}

function applyPendingForUser(req, pseudo) {
  if (!req || !req.session || !pseudo) return;
  const pending = req.session.eePending;
  if (!pending || !pending.loginSelected) return;
  const progress = markStep(pseudo, "S2", "login_x");
  if (progress) {
    req.session.eePending = null;
    req.session.save(() => {});
  }
}

function getStatusForUser(pseudo) {
  const store = ensureStore();
  const userData = (store.users && store.users[pseudo]) || {};

  const eggs = EGG_DEFS.map((egg) => {
    const progress = userData[egg.id] || {
      steps: {},
      completed: false,
      completedAt: null,
    };
    const stepState = progress.steps || {};
    const steps = egg.steps.map((step) => ({
      id: step.id,
      label: step.label,
      optional: !!step.optional,
      done: !!stepState[step.id],
    }));

    const completed = isEggComplete(egg, stepState);

    return {
      id: egg.id,
      label: egg.label,
      completed,
      completedAt: progress.completedAt || null,
      steps,
    };
  });

  return { eggs };
}

module.exports = {
  EGG_DEFS,
  STEP_CODES,
  markStep,
  markStepByCode,
  recordPreloginStep,
  applyPendingForUser,
  getStatusForUser,
};
