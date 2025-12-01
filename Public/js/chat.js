import { showNotif } from "./util.js";

export function initChat(socket) {
  const meSpan = document.getElementById("me");
  const usersCount = document.getElementById("usersCount");
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");
  const messages = document.getElementById("chat-messages");
  const submit = document.querySelector(".submit");

  function addMessage({ auteur, text, at, type = "user", tag = null }) {
    const el = document.createElement("div");
    el.className = `msg ${type}`;
    const time = at
      ? new Date(at).toLocaleString("fr-FR", {
          dateStyle: "short",
          timeStyle: "medium",
        })
      : "";

    const tagHtml = tag ? ` <span class="user-tag">${tag}</span>` : "";

    el.innerHTML = `
      <div class="meta">
        <span class="auteur">${auteur} - [${tagHtml}]</span>
        <span class="time"><i>${time}</i></span>
      </div>
      <div class="text"></div>`;
    el.querySelector(".text").textContent = text;
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
  }

  socket.on("you:name", (name) => {
    if (meSpan) meSpan.innerHTML += `<span id="pseudo">${name}</span>`;
  });

  socket.on("chat:history", (history) => {
    if (!Array.isArray(history)) return;
    messages.innerHTML = "";
    history.forEach((msg) =>
      addMessage({ auteur: msg.name, text: msg.text, at: msg.at, tag: msg.tag })
    );
  });

  socket.on("system:info", (text) =>
    addMessage({ auteur: "Système", text, type: "system" })
  );

  socket.on("users:list", (l) => {
    if (usersCount) {
      usersCount.innerHTML = `Utilisateurs en ligne: <b>${l.length}</b>`;
      l.forEach((u) => {
        if (u === socket.id) return;
        usersCount.title += `\n‣ ${u}`;
      });
      //usersCount.title = `Utilisateurs en ligne:\n${l.join("‣")}`;
    }
  });

  socket.on("chat:message", (payload) => {
    addMessage({
      auteur: payload.name,
      text: payload.text,
      at: payload.at,
      tag: payload.tag,
    });

    if (
      payload.name !== meSpan.textContent.replace("Connecté en tant que : ", "")
    ) {
      showNotif(`💬 Nouveau message de ${payload.name} dans le Chat`);
    }
  });

  if (form) {
    // Auto-resize du textarea à la saisie (évite le script inline dans le HTML)
    if (input) {
      const autoResize = () => {
        input.style.height = "auto";
        input.style.height = input.scrollHeight + "px";
      };
      input.addEventListener("input", autoResize);
      // Ajuste une première fois (au cas où il y a du contenu pré-rempli)
      autoResize();
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      socket.emit("chat:message", { text });
      input.value = "";
      input.style.height = "auto";
      input.focus();
    });

    window.addEventListener("keydown", (event) => {
      if (document.activeElement === input) {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          submit.click();
        }
      }
    });
  }
}
