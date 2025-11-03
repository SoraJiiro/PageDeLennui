import { showNotif } from "./util.js";

export function initChat(socket) {
  const meSpan = document.getElementById("me");
  const usersCount = document.getElementById("usersCount");
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");
  const messages = document.getElementById("chat-messages");
  const submit = document.querySelector(".submit");

  function addMessage({ auteur, text, at, type = "user" }) {
    const el = document.createElement("div");
    el.className = `msg ${type}`;
    const time = at
      ? new Date(at).toLocaleString("fr-FR", {
          dateStyle: "short",
          timeStyle: "medium",
        })
      : "";
    el.innerHTML = `
      <div class="meta">
        <span class="auteur">[${auteur}]</span>
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
      addMessage({ auteur: msg.name, text: msg.text, at: msg.at })
    );
  });

  socket.on("system:info", (text) =>
    addMessage({ auteur: "Système", text, type: "system" })
  );

  socket.on("users:list", (l) => {
    if (usersCount)
      usersCount.textContent = `Utilisateurs en ligne: ${l.length}`;
  });

  socket.on("chat:message", (payload) => {
    addMessage({
      auteur: payload.name,
      text: payload.text,
      at: payload.at,
    });

    if (
      payload.name !== meSpan.textContent.replace("Connecté en tant que : ", "")
    ) {
      showNotif(`💬 Nouveau message de ${payload.name} dans le Chat`);
    }
  });

  if (form) {
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
