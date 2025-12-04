import { showNotif } from "./util.js";

export function initChat(socket) {
  const meSpan = document.getElementById("me");
  const usersCount = document.getElementById("usersCount");
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");
  const messages = document.getElementById("chat-messages");
  const submit = document.querySelector(".submit");
  let myPseudo = null;

  function addMessage({ id, auteur, text, at, type = "user", tag = null }) {
    const el = document.createElement("div");
    el.className = `msg ${type}`;
    if (id) el.dataset.id = id;

    const time = at
      ? new Date(at).toLocaleString("fr-FR", {
          dateStyle: "short",
          timeStyle: "medium",
        })
      : "";

    if (auteur === "Système") {
      el.innerHTML = `
      <div class="meta">
        <span class="auteur">${auteur}</span>
        <span class="time"><i>${time}</i></span>
      </div>
      <div class="text"></div>`;
      el.querySelector(".text").textContent = text;
      messages.appendChild(el);
      messages.scrollTop = messages.scrollHeight;
    } else {
      let tagHtml = "";
      if (tag) {
        if (typeof tag === "string") {
          tagHtml = ` [<span class="user-tag">${tag}</span>]`;
        } else if (typeof tag === "object" && tag.text) {
          const style = tag.color ? `style="color:${tag.color}"` : "";
          tagHtml = ` [<span class="user-tag" ${style}>${tag.text}</span>]`;
        }
      }

      el.innerHTML = `
      <div class="meta">
        <span class="auteur">${auteur}${tagHtml}</span>
        <span class="time"><i>${time}</i></span>
      </div>
      <div class="text"></div>`;
      el.querySelector(".text").textContent = text;

      if (myPseudo === "Admin" && id) {
        const btn = document.createElement("button");
        btn.className = "msg-delete-btn";
        btn.innerHTML = '<i class="fa-solid fa-trash"></i>';
        btn.title = "Supprimer ce message";
        btn.onclick = () => {
          if (confirm("Supprimer ce message ?")) {
            socket.emit("chat:delete", { id });
          }
        };
        el.appendChild(btn);
      }

      messages.appendChild(el);
      messages.scrollTop = messages.scrollHeight;
    }
  }

  socket.on("you:name", (name) => {
    myPseudo = name;
    if (meSpan) meSpan.innerHTML += `<span id="pseudo">${name}</span>`;
  });

  socket.on("chat:history", (history) => {
    if (!Array.isArray(history)) return;
    messages.innerHTML = "";
    history.forEach((msg) =>
      addMessage({
        id: msg.id,
        auteur: msg.name,
        text: msg.text,
        at: msg.at,
        tag: msg.tag,
      })
    );
  });

  socket.on("system:info", (text) =>
    addMessage({ auteur: "Système", text, type: "system" })
  );

  socket.on("users:list", (l) => {
    if (usersCount) {
      usersCount.innerHTML = `Utilisateurs en ligne: <b>${l.length}</b>`;
      usersCount.title = `‣ ${l.join("\n‣ ")}`;
    }
  });

  socket.on("chat:message", (payload) => {
    addMessage({
      id: payload.id,
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

  socket.on("chat:delete", ({ id }) => {
    const el = messages.querySelector(`.msg[data-id="${id}"]`);
    if (el) el.remove();
  });

  if (form) {
    if (input) {
      const autoResize = () => {
        input.style.height = "auto";
        input.style.height = input.scrollHeight + "px";
      };
      input.addEventListener("input", autoResize);
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
