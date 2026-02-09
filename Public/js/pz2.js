const statusEl = document.getElementById("ee-status");
const listEl = document.getElementById("ee-list");

function setStatus(text, type) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = `ee-status${type ? " ee-status--" + type : ""}`;
}

function renderEgg(egg) {
  const card = document.createElement("div");
  card.className = "ee-card";

  const title = document.createElement("div");
  title.className = "ee-card__title";
  title.textContent = String(egg.label || "");

  const flow = document.createElement("div");
  flow.className = "ee-flow";

  function makeNode({ label, status, statusClass }) {
    const node = document.createElement("div");
    node.className = `ee-node ${statusClass}`;

    const lbl = document.createElement("div");
    lbl.className = "ee-node__title";
    lbl.textContent = label;

    const st = document.createElement("div");
    st.className = "ee-node__status";
    st.textContent = status;

    node.appendChild(lbl);
    node.appendChild(st);
    return node;
  }

  function addConnector() {
    const c = document.createElement("div");
    c.className = "ee-connector";
    flow.appendChild(c);
  }

  egg.steps.forEach((step, idx) => {
    const done = !!step.done;
    const label = step.optional ? `${step.label} (optionnelle)` : step.label;
    const status = done ? "Effectuee" : "Pas fait";
    const node = makeNode({
      label,
      status,
      statusClass: `${done ? "ee-node--done" : "ee-node--pending"}${
        step.optional ? " ee-facultatif" : ""
      }`,
    });
    flow.appendChild(node);
    if (idx < egg.steps.length - 1) addConnector();
  });

  if (egg.steps.length) addConnector();

  const finalNode = makeNode({
    label: "Statut",
    status: egg.completed ? "TROUVE" : "NON TROUVE",
    statusClass: egg.completed ? "ee-node--final-ok" : "ee-node--final-ko",
  });
  flow.appendChild(finalNode);

  card.appendChild(title);
  card.appendChild(flow);
  return card;
}

async function loadStatus() {
  try {
    const res = await fetch("/api/x9/status", { cache: "no-store" });
    if (!res.ok) {
      setStatus("Impossible de charger le tracker.", "error");
      return;
    }

    const data = await res.json();
    const eggs = Array.isArray(data.eggs) ? data.eggs : [];

    listEl.innerHTML = "";
    eggs.forEach((egg) => listEl.appendChild(renderEgg(egg)));

    setStatus(eggs.length ? "" : "Aucun Easter Egg disponible.");
  } catch (e) {
    setStatus("Erreur de connexion au serveur.", "error");
  }
}

loadStatus();
