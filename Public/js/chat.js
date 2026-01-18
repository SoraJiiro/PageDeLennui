import { showNotif } from "./util.js";

export function initChat(socket) {
  const usersCount = document.getElementById("usersCount");
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");
  const messages = document.getElementById("chat-messages");
  const submit = document.querySelector(".submit");
  let myPseudo = null;
  let onlineUsers = [];
  const pfpModal = document.createElement("div");
  pfpModal.className = "pfp-modal";
  pfpModal.innerHTML = `
    <div class="pfp-modal__overlay" aria-hidden="true"></div>
    <div class="pfp-modal__content" role="dialog" aria-modal="true">
      <button type="button" class="pfp-modal__close" aria-label="Fermer la photo"><i class="fa-solid fa-xmark"></i></button>
      <img class="pfp-modal__image" alt="">
      <p class="pfp-modal__caption" aria-live="polite"></p>
    </div>
  `;
  document.body.appendChild(pfpModal);
  const modalImage = pfpModal.querySelector(".pfp-modal__image");
  const modalCaption = pfpModal.querySelector(".pfp-modal__caption");
  const modalClose = pfpModal.querySelector(".pfp-modal__close");
  const modalOverlay = pfpModal.querySelector(".pfp-modal__overlay");
  const hidePfpModal = () => {
    pfpModal.classList.remove("pfp-modal--visible");
    modalImage.src = "";
  };
  const showPfpModal = (src, label) => {
    if (!src) return;
    modalImage.src = src;
    modalCaption.textContent = label ? `PFP de ${label}` : "Photo de profil";
    modalImage.alt = label ? `Avatar de ${label}` : "Photo de profil";
    pfpModal.classList.add("pfp-modal--visible");
  };
  modalClose.addEventListener("click", hidePfpModal);
  modalOverlay.addEventListener("click", hidePfpModal);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hidePfpModal();
    }
  });

  function addMessage({
    id,
    auteur,
    text,
    at,
    type = "user",
    tag = null,
    pfp = null,
    badges = null,
  }) {
    const lastMsg = messages.lastElementChild;
    const currentTimestamp = at ? new Date(at).getTime() : Date.now();
    let isContinuation = false;

    if (
      lastMsg &&
      lastMsg.dataset.author === auteur &&
      lastMsg.dataset.type === type
    ) {
      const lastTimestamp = parseInt(lastMsg.dataset.timestamp || "0");
      // 5 minutes = 5 * 60 * 1000 = 300000 ms
      if (currentTimestamp - lastTimestamp < 300000) {
        isContinuation = true;
      }
    }

    const el = document.createElement("div");
    el.className = `msg ${type}`;
    if (isContinuation) el.classList.add("continuation");
    if (id) el.dataset.id = id;

    el.dataset.author = auteur;
    el.dataset.timestamp = currentTimestamp;
    el.dataset.type = type;

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
          if (tag.colors && Array.isArray(tag.colors)) {
            const words = tag.text.split(/\s+/);
            const coloredWords = words.map((word, i) => {
              const color = tag.colors[i] || tag.colors[0] || "#ffffff";
              return `<span style="color:${color}">${word}</span>`;
            });
            tagHtml = ` [<span class="user-tag">${coloredWords.join(
              " ",
            )}</span>]`;
          } else {
            const style = tag.color ? `style="color:${tag.color}"` : "";
            tagHtml = ` [<span class="user-tag" ${style}>${tag.text}</span>]`;
          }
        }
      }

      let badgesHtml = "";
      if (Array.isArray(badges) && badges.length) {
        const safe = badges.slice(0, 3);
        badgesHtml = ` <span class="chat-badges">${safe
          .map(
            (b) =>
              `<span class="chat-badge" title="${String(
                b.name || b.id || "",
              ).replaceAll('"', "&quot;")}">${b.emoji || "🏷️"}</span>`,
          )
          .join("")}</span>`;
      }

      const safeAuthor = auteur.replaceAll('"', "&quot;");
      const pseudoLink = `/profil.html?pseudo=${encodeURIComponent(auteur)}`;
      const avatarTitle = `Avatar de ${safeAuthor}`;
      const avatarHtml = pfp
        ? `<img class="chat-avatar" src="${pfp}" alt="${avatarTitle}" title="${avatarTitle}" loading="lazy">`
        : `<div class="chat-avatar placeholder" aria-hidden="true"></div>`;

      el.innerHTML = `
      <div class="meta">
        <span class="meta-left">${avatarHtml}<a class="auteur auteur-link" href="${pseudoLink}">${auteur}</a>${tagHtml}${badgesHtml}</span>
        <span class="time"><i>${time}</i></span>
      </div>
      <div class="text"></div>`;
      el.querySelector(".text").textContent = text;

      const avatarImage = el.querySelector(".chat-avatar");
      if (avatarImage && avatarImage.tagName === "IMG" && pfp) {
        avatarImage.addEventListener("click", () => showPfpModal(pfp, auteur));
      }

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
        pfp: msg.pfp,
        badges: msg.badges,
        type: msg.name === "Système" ? "system" : "user",
      }),
    );
  });

  socket.on("system:info", (text) =>
    addMessage({ auteur: "Système", text, type: "system" }),
  );

  socket.on("users:list", (l) => {
    onlineUsers = l || [];
    if (usersCount) {
      usersCount.innerHTML = `En ligne: <b>${l.length}</b>`;
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
      pfp: payload.pfp,
      badges: payload.badges,
    });

    if (
      payload.text.toLowerCase().includes(`@${myPseudo.toLowerCase()}`) &&
      payload.name !== myPseudo
    ) {
      showNotif(`💬 Vous avez été mentionné par ${payload.name} dans le Chat`);
    }
  });

  socket.on("chat:delete", ({ id }) => {
    const el = messages.querySelector(`.msg[data-id="${id}"]`);
    if (el) {
      const next = el.nextElementSibling;
      if (next && next.classList.contains("continuation")) {
        next.classList.remove("continuation");
      }
      el.remove();
    }
  });

  if (form) {
    if (input) {
      const autoResize = () => {
        input.style.height = "auto";
        input.style.height = input.scrollHeight + "px";
      };
      const suggestMentions = (text) => {
        const removeBox = () => {
          const box = document.getElementById("mention-suggestions");
          if (box) box.remove();
        };

        if (!text.includes("@")) {
          removeBox();
          return;
        }

        const words = text.split(/\s+/);
        const lastWord = words[words.length - 1];

        if (!lastWord.startsWith("@")) {
          removeBox();
          return;
        }

        const mention = lastWord.slice(1).toLowerCase();
        const onlineUsersMinusSelf = onlineUsers.filter((u) => u !== myPseudo);
        const matches = onlineUsersMinusSelf.filter((u) =>
          u.toLowerCase().startsWith(mention),
        );

        // Ajouter une boîte de suggestion à la suite de l'input
        let suggestionBox = document.getElementById("mention-suggestions");
        if (!suggestionBox) {
          suggestionBox = document.createElement("div");
          suggestionBox.id = "mention-suggestions";
          suggestionBox.style.position = "absolute";
          suggestionBox.style.bottom = "100%";
          suggestionBox.style.left = "15px"; // Aligner avec le padding
          suggestionBox.style.background = "var(--bg-color)";
          suggestionBox.style.border = "1px solid var(--primary-color)";
          suggestionBox.style.zIndex = "1000";
          suggestionBox.style.maxHeight = "150px";
          suggestionBox.style.overflowY = "auto";
          suggestionBox.style.padding = "5px";
          suggestionBox.style.borderRadius = "5px";
          suggestionBox.style.minWidth = "150px";

          // S'assurer que le parent est relatif pour le positionnement
          if (getComputedStyle(input.parentNode).position === "static") {
            input.parentNode.style.position = "relative";
          }
          input.parentNode.appendChild(suggestionBox);
        }
        suggestionBox.innerHTML = "";

        if (matches.length === 0) {
          const item = document.createElement("div");
          item.textContent = "Aucune suggestion";
          item.style.padding = "2px 5px";
          item.style.opacity = "0.7";
          suggestionBox.appendChild(item);
        } else {
          matches.slice(0, 5).forEach((match) => {
            const item = document.createElement("div");
            item.textContent = match;
            item.style.padding = "4px 8px";
            item.style.cursor = "pointer";
            item.style.transition = "background 0.2s";

            item.onmouseover = () =>
              (item.style.background = "rgba(255,255,255,0.1)");
            item.onmouseout = () => (item.style.background = "#000");

            item.onclick = () => {
              const newWords = words.slice(0, -1);
              newWords.push("@" + match);
              input.value = newWords.join(" ") + " ";
              suggestionBox.remove();
              input.focus();
              autoResize();
            };
            suggestionBox.appendChild(item);
          });
        }
      };

      input.addEventListener("input", () => {
        autoResize();
        suggestMentions(input.value);
      });
      autoResize();
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return;

      if (text.toLowerCase() === "/rainbow") {
        if (window.toggleRainbowMode) {
          window.toggleRainbowMode();
        }
        input.value = "";
        input.style.height = "auto";
        input.focus();
        return;
      }

      socket.emit("chat:message", { text });
      input.value = "";
      input.style.height = "auto";
      input.focus();
    });

    window.addEventListener("keydown", (event) => {
      if (document.activeElement === input) {
        const suggestionBox = document.getElementById("mention-suggestions");
        if (suggestionBox && event.key === "Enter" && !event.shiftKey) {
          const firstItem = suggestionBox.querySelector("div");
          if (firstItem && firstItem.textContent !== "Aucune suggestion") {
            event.preventDefault();
            firstItem.click();
            return;
          }
        }

        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          submit.click();
        }
      }
    });
  }
}
