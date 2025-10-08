// === chat.js ===
export function initChat(socket) {
  const meSpan = document.getElementById("me");
  const usersCount = document.getElementById("usersCount");
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");
  const messages = document.getElementById("chat-messages");
  const submit = document.querySelector(".submit");

  function addMessage({ author, text, at, type = "user" }) {
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
        <span class="author">[${author}]</span>
        <span class="time"><i>${time}</i></span>
      </div>
      <div class="text"></div>`;
    el.querySelector(".text").textContent = text;
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
  }

  socket.on("you:name", (name) => {
    if (meSpan) meSpan.textContent = `Connecté en tant que : ${name} `;
  });

  // 🔹 Historique propre (on le remplace intégralement à chaque fois)
  socket.on("chat:history", (history) => {
    if (!Array.isArray(history)) return;
    messages.innerHTML = ""; // vider avant d'ajouter
    history.forEach((msg) =>
      addMessage({ author: msg.name, text: msg.text, at: msg.at })
    );
  });

  socket.on("system:info", (text) =>
    addMessage({ author: "Système", text, type: "system" })
  );

  socket.on("users:list", (list) => {
    if (usersCount)
      usersCount.textContent = `Utilisateurs en ligne: ${list.length}`;
  });

  socket.on("chat:message", (payload) =>
    addMessage({
      author: payload.name,
      text: payload.text,
      at: payload.at,
    })
  );

  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      socket.emit("chat:message", { text });
      input.value = "";
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
