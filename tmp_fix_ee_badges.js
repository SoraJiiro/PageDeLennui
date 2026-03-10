const { FileService } = require("./Server/util");
if (!FileService.data.chatBadges || typeof FileService.data.chatBadges !== "object") {
  FileService.data.chatBadges = { catalog: {}, users: {} };
}
const badges = FileService.data.chatBadges;
if (!badges.catalog || typeof badges.catalog !== "object") badges.catalog = {};

const defs = {
  EE_S1: { name: "EE [S1]", emoji: "\uD83E\uDD5A" },
  EE_S2: { name: "EE [S2]", emoji: "\uD83D\uDC23" },
};

let changed = false;
for (const [id, def] of Object.entries(defs)) {
  const cur = badges.catalog[id];
  if (!cur || typeof cur !== "object") {
    badges.catalog[id] = { name: def.name, emoji: def.emoji };
    changed = true;
    continue;
  }
  if (!cur.name) {
    cur.name = def.name;
    changed = true;
  }
  if (!cur.emoji) {
    cur.emoji = def.emoji;
    changed = true;
  }
}

if (changed) FileService.save("chatBadges", badges);
console.log(JSON.stringify({ ok: true, changed }));
