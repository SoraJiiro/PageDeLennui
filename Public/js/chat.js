// Public/js/chat.js - Ajout du système de partage de fichiers

export function initChat(socket) {
  const usersCount = document.getElementById("usersCount");
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");
  const messages = document.getElementById("chat-messages");
  const submit = document.querySelector(".submit");
  let myPseudo = null;
  let onlineUsers = [];
  let lastDmFrom = null;
  let dmSuggestState = { matches: [], index: -1, needle: "" };

  // Historiques init (public + MPs)
  let initialPublicHistory = null;
  let initialDmHistory = null;
  let gotPublicHistory = false;
  let gotDmHistory = false;
  let initialRendered = false;

  // Bouton d'upload de fichier (HTML statique)
  const fileButton = document.getElementById("file-upload-btn");
  const fileInput = document.getElementById("file-input");

  if (fileButton && fileInput) {
    fileButton.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const MAX_SIZE = 100 * 1024 * 1024; // 100 MB
      if (file.size > MAX_SIZE) {
        alert(
          "Fichier trop volumineux (max " + MAX_SIZE / (1024 * 1024) + " Mo)",
        );
        fileInput.value = "";
        return;
      }
      try {
        // Afficher un indicateur de chargement
        const loadingMsg = addMessage({
          auteur: "Système",
          text: `⏳ Upload de ${file.name} en cours...`,
          type: "system",
        });

        // Convertir en base64
        const reader = new FileReader();
        reader.onload = () => {
          const base64Data = reader.result.split(",")[1];

          socket.emit("chat:uploadFile", {
            fileName: file.name,
            fileData: base64Data,
            fileType: file.type,
            fileSize: file.size,
          });
        };
        reader.readAsDataURL(file);

        fileInput.value = "";
      } catch (err) {
        console.error("Erreur upload:", err);
        alert("Erreur lors de l'upload du fichier");
      }
    });
  }

  // Gestion des événements fichiers
  socket.on("chat:fileUploaded", ({ fileId }) => {
    console.log("Fichier uploadé avec succès:", fileId);
  });

  socket.on("chat:fileError", (error) => {
    alert(error);
  });

  socket.on("chat:fileDeleted", ({ fileId }) => {
    // Mettre à jour l'UI pour indiquer que le fichier n'est plus disponible
    const fileLinks = document.querySelectorAll(
      `.file-download[data-file-id="${fileId}"]`,
    );
    fileLinks.forEach((link) => {
      link.style.opacity = "0.5";
      link.style.pointerEvents = "none";
      link.title = "Fichier expiré ou supprimé";
    });
  });

  socket.on("chat:fileData", ({ id, name, type, data }) => {
    try {
      // Créer un blob et déclencher le téléchargement
      const byteCharacters = atob(data || "");
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);

      // Forcer un type binaire pour les types potentiellement exécutables
      const risky = [
        "text/html",
        "application/javascript",
        "text/javascript",
        "application/x-httpd-php",
        "text/x-php",
      ];
      const blobType = risky.includes(type)
        ? "application/octet-stream"
        : type || "application/octet-stream";

      const blob = new Blob([byteArray], { type: blobType });

      const safeName = (name || "file")
        .split(/[\\/\\\\]/)
        .pop()
        .replace(/\0/g, "")
        .slice(0, 200);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = safeName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Erreur téléchargement:", err);
      alert("Erreur lors du téléchargement");
    }
  });

  // Modal PFP (code existant)
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

  const linkPattern = /(?:https?:\/\/|www\.)[^\s<]+/gi;
  const htmlEscapes = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => htmlEscapes[char]);
  }

  function formatChatText(text) {
    const normalized = String(text || "");
    let lastIndex = 0;
    let formatted = "";

    // URLs (http(s):// ou www.) ou mentions @Pseudo (au début ou après un espace)
    const tokenPattern = new RegExp(
      `${linkPattern.source}|(^|\\s)@([A-Za-z0-9_À-ÖØ-öø-ÿ-]+)`,
      "gi",
    );

    normalized.replace(tokenPattern, (match, prefix, mentionName, offset) => {
      formatted += escapeHtml(normalized.slice(lastIndex, offset));

      // Mention
      if (typeof mentionName === "string" && mentionName.length) {
        const safePrefix = escapeHtml(prefix || "");
        const safeName = escapeHtml(mentionName);
        const href = `/profil.html?pseudo=${encodeURIComponent(mentionName)}`;
        formatted += `${safePrefix}<a class="mention-link" href="${href}">@${safeName}</a>`;
        lastIndex = offset + match.length;
        return match;
      }

      // URL
      const url = match;
      const hasProtocol = /^https?:\/\//i.test(url);
      const href = hasProtocol ? url : `https://${url}`;
      formatted += `<a class="chat-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
      lastIndex = offset + match.length;
      return match;
    });

    formatted += escapeHtml(normalized.slice(lastIndex));
    return formatted.replace(/\n/g, "<br>");
  }

  function addMessage({
    id,
    auteur,
    text,
    at,
    type = "user",
    tag = null,
    pfp = null,
    badges = null,
    file = null,
  }) {
    const lastMsg = messages.lastElementChild;
    const currentTimestamp = at ? new Date(at).getTime() : Date.now();
    let isContinuation = false;

    if (
      lastMsg &&
      lastMsg.dataset.author === auteur &&
      lastMsg.dataset.type === type &&
      !file // Pas de continuation pour les fichiers
    ) {
      const lastTimestamp = parseInt(lastMsg.dataset.timestamp || "0");
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

      const textDiv = el.querySelector(".text");
      textDiv.innerHTML = formatChatText(text);

      if (file) {
        const fileDiv = document.createElement("div");
        fileDiv.className = "file-attachment";

        const fileIcon = getFileIcon(file.type, file.name);
        const fileSize = formatFileSize(file.size || 0);

        fileDiv.innerHTML = `
          <div class="file-info">
            <i class="${fileIcon}"></i>
            <div class="file-details">
              <div class="file-name">${file.name || "Fichier"}</div>
              <div class="file-size">${fileSize}</div>
            </div>
          </div>
          <button class="file-download" data-file-id="${file.id}" title="Télécharger">
            <i class="fa-solid fa-download"></i>
          </button>
        `;

        // Si le serveur expose une URL publique, afficher media inline quand c'est possible
        if (file.url && typeof file.url === "string") {
          // Eviter les requêtes HEAD (problèmes 405/501 et synchro).
          // On assigne directement `src` et on gère l'échec via les événements `error`.

          if (file.type && file.type.startsWith("image/")) {
            const img = document.createElement("img");
            img.alt = file.name || "image";
            img.loading = "lazy";
            img.className = "file-inline file-image";
            fileDiv.insertBefore(img, fileDiv.firstChild);

            // Assigner la source et laisser le navigateur signaler l'erreur si l'image
            // est indisponible (évite les HEAD supplémentaires).
            img.src = file.url;
            img.addEventListener("error", () => {
              console.warn("Image non trouvée. [debug]");
              img.alt = (file.name || "image") + " (indisponible)";
              img.classList.add("file-missing");
            });
          } else if (file.type && file.type.startsWith("video/")) {
            const vid = document.createElement("video");
            vid.controls = true;
            vid.className = "file-inline file-video";
            fileDiv.insertBefore(vid, fileDiv.firstChild);

            // Assign src and fallback on error (no HEAD check).
            vid.src = file.url;
            vid.addEventListener("error", () => {
              const note = document.createElement("div");
              note.className = "file-missing";
              note.textContent = "Vidéo indisponible";
              fileDiv.insertBefore(note, vid);
              vid.remove();
            });
          } else if (
            (file.type && file.type.startsWith("audio/")) ||
            (typeof file.name === "string" &&
              file.name.toLowerCase().endsWith(".opus"))
          ) {
            const player = document.createElement("div");
            player.className = "chat-audio-player";

            const audioEl = document.createElement("audio");
            audioEl.preload = "metadata";
            audioEl.className = "native-audio";
            audioEl.style.display = "none";

            const controls = document.createElement("div");
            controls.className = "cap-controls";

            const playBtn = document.createElement("button");
            playBtn.className = "cap-play";
            playBtn.type = "button";
            playBtn.title = "Lire / Pause";
            playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';

            const time = document.createElement("div");
            time.className = "cap-time";
            time.textContent = "0:00 / 0:00";

            const progressWrap = document.createElement("div");
            progressWrap.className = "cap-progress";
            const progressBar = document.createElement("div");
            progressBar.className = "cap-progress-bar";
            const progressFill = document.createElement("div");
            progressFill.className = "cap-progress-fill";
            progressBar.appendChild(progressFill);
            progressWrap.appendChild(progressBar);

            controls.appendChild(playBtn);
            controls.appendChild(progressWrap);
            controls.appendChild(time);

            player.appendChild(audioEl);
            player.appendChild(controls);

            fileDiv.insertBefore(player, fileDiv.firstChild);

            audioEl.src = file.url;
            audioEl.addEventListener("error", () => {
              const note = document.createElement("div");
              note.className = "file-missing";
              note.textContent = "Audio indisponible";
              fileDiv.insertBefore(note, player);
              player.remove();
              console.warn("Audio non trouvé. [debug]");
            });

            function fmt(t) {
              if (!isFinite(t)) return "0:00";
              const m = Math.floor(t / 60);
              const s = Math.floor(t % 60)
                .toString()
                .padStart(2, "0");
              return `${m}:${s}`;
            }

            playBtn.addEventListener("click", () => {
              if (audioEl.paused) audioEl.play();
              else audioEl.pause();
            });

            audioEl.addEventListener("play", () => {
              playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
              player.classList.add("playing");
            });
            audioEl.addEventListener("pause", () => {
              playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
              player.classList.remove("playing");
            });

            audioEl.addEventListener("loadedmetadata", () => {
              time.textContent = `${fmt(0)} / ${fmt(audioEl.duration)}`;
            });

            audioEl.addEventListener("timeupdate", () => {
              const cur = audioEl.currentTime;
              const dur = audioEl.duration || 0;
              const pct = dur > 0 ? (cur / dur) * 100 : 0;
              progressFill.style.width = pct + "%";
              time.textContent = `${fmt(cur)} / ${fmt(dur)}`;
            });

            progressBar.addEventListener("click", (ev) => {
              const rect = progressBar.getBoundingClientRect();
              const x = ev.clientX - rect.left;
              const pct = Math.max(0, Math.min(1, x / rect.width));
              if (isFinite(audioEl.duration))
                audioEl.currentTime = pct * audioEl.duration;
            });

            progressWrap.addEventListener("click", (ev) => {
              const rect = progressBar.getBoundingClientRect();
              const x = ev.clientX - rect.left;
              const pct = Math.max(0, Math.min(1, x / rect.width));
              if (isFinite(audioEl.duration))
                audioEl.currentTime = pct * audioEl.duration;
            });
          }

          // Téléchargement direct via URL (vérifier existence avant)
          const downloadBtn = fileDiv.querySelector(".file-download");
          downloadBtn.addEventListener("click", async (ev) => {
            ev.preventDefault();
            try {
              // Essayer une petite requête GET avec Range pour valider l'accès sans
              // télécharger tout le fichier. Certains serveurs ne supportent pas
              // HEAD, donc on évite HEAD.
              const res = await fetch(file.url, {
                method: "GET",
                headers: { Range: "bytes=0-0" },
              });
              if (res.ok || res.status === 206) {
                const a = document.createElement("a");
                a.href = file.url;
                a.download = (file.name || "file").split(/[\/\\\\]/).pop();
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                return;
              }
            } catch (e) {
              // ignore et fallback
            }
            // Fallback: demander au serveur le base64 via socket
            socket.emit("chat:downloadFile", { fileId: file.id });
          });
        } else {
          const downloadBtn = fileDiv.querySelector(".file-download");
          downloadBtn.addEventListener("click", () => {
            socket.emit("chat:downloadFile", { fileId: file.id });
          });
        }

        textDiv.appendChild(fileDiv);
      }

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

        // Admin peut aussi supprimer les fichiers
        if (file) {
          const fileDelBtn = document.createElement("button");
          fileDelBtn.className = "msg-delete-btn file-delete-btn";
          fileDelBtn.innerHTML = '<i class="fa-solid fa-file-slash"></i>';
          fileDelBtn.title = "Supprimer ce fichier";
          fileDelBtn.onclick = () => {
            if (confirm("Supprimer ce fichier ?")) {
              socket.emit("chat:deleteFile", { fileId: file.id });
            }
          };
          el.appendChild(fileDelBtn);
        }
      }

      messages.appendChild(el);
      messages.scrollTop = messages.scrollHeight;
    }

    return el;
  }

  function getFileIcon(type, name) {
    if (typeof type === "string") {
      if (type.startsWith("image/")) return "fa-solid fa-image";
      if (type === "application/pdf") return "fa-solid fa-file-pdf";
      if (type === "text/plain") return "fa-solid fa-file-lines";
      if (type === "application/zip") return "fa-solid fa-file-zipper";
      if (type.startsWith("video/")) return "fa-solid fa-file-video";
      if (type.startsWith("audio/")) return "fa-solid fa-file-audio";
    }

    if (typeof name === "string") {
      const lower = name.toLowerCase();
      if (/(\.png|\.jpe?g|\.gif|\.webp|\.bmp|\.svg)$/.test(lower))
        return "fa-solid fa-image";
      if (lower.endsWith(".pdf")) return "fa-solid fa-file-pdf";
      if (/(\.txt|\.md|\.csv|\.log)$/.test(lower))
        return "fa-solid fa-file-lines";
      if (/(\.zip|\.rar|\.7z|\.tar|\.gz)$/.test(lower))
        return "fa-solid fa-file-zipper";
      if (/(\.mp4|\.mov|\.webm|\.avi|\.mkv|\.flv|\.wmv)$/.test(lower))
        return "fa-solid fa-file-video";
      if (/(\.mp3|\.wav|\.ogg|\.flac|\.opus|\.m4a)$/.test(lower))
        return "fa-solid fa-file-audio";

      // Office / documents
      if (/\.docx?$/.test(lower)) return "fa-solid fa-file-word";
      if (/\.xlsx?$/.test(lower)) return "fa-solid fa-file-excel";
      if (/\.pptx?$/.test(lower)) return "fa-solid fa-file-powerpoint";

      // Code / markup / config
      if (/\.(json|xml|yml|yaml|ini|html|xhtml|css|scss|sass)$/.test(lower))
        return "fa-solid fa-file-code";
      if (/\.(py|js|java|cpp|c|cs|go|sh|bat|ps1)$/.test(lower))
        return "fa-solid fa-file-code";

      // Other common types
      if (/\.(epub|mobi|azw3|fb2|cbz|cbr)$/.test(lower))
        return "fa-solid fa-book";
      if (/\.(rtf)$/.test(lower)) return "fa-solid fa-file-lines";
    }

    return "fa-solid fa-file";
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }

  socket.on("you:name", (name) => {
    myPseudo = name;
  });

  const renderDmMessage = (payload, { notify = true } = {}) => {
    if (!payload || typeof payload !== "object") return;

    const from = String(payload.from || "").trim();
    const to = String(payload.to || "").trim();
    const msg = String(payload.text || "");
    if (!from || !to || !msg) return;

    if (payload.id) {
      const existing = messages.querySelector(`.msg[data-id="${payload.id}"]`);
      if (existing) return;
    }

    const isMine = myPseudo && from === myPseudo;
    const directionType = isMine ? "dm-out" : "dm-in";

    // Mettre à jour le /rep sur le dernier MP reçu
    if (!isMine && to === myPseudo) {
      lastDmFrom = from;
    }

    addMessage({
      id: payload.id,
      auteur: from,
      text: msg,
      at: payload.at,
      tag: payload.tag,
      pfp: payload.pfp,
      badges: payload.badges,
      type: directionType,
    });

    if (notify && !isMine && from && from !== myPseudo) {
      showNotif(`📩 Nouveau MP de ${from}`);
    }
  };

  const tryRenderInitialTimeline = () => {
    if (initialRendered) return;
    if (!gotPublicHistory) return;
    if (!gotDmHistory) return;

    initialRendered = true;

    const publicItems = Array.isArray(initialPublicHistory)
      ? initialPublicHistory.map((m) => ({ kind: "public", ...m }))
      : [];
    const dmItems = Array.isArray(initialDmHistory)
      ? initialDmHistory.map((m) => ({ kind: "dm", ...m }))
      : [];

    const merged = publicItems.concat(dmItems);
    merged.sort((a, b) => {
      const ta = Date.parse(a.at || "") || 0;
      const tb = Date.parse(b.at || "") || 0;
      return ta - tb;
    });

    messages.innerHTML = "";
    merged.forEach((item) => {
      if (item.kind === "dm") {
        renderDmMessage(item, { notify: false });
        return;
      }

      addMessage({
        id: item.id,
        auteur: item.name,
        text: item.text,
        at: item.at,
        tag: item.tag,
        pfp: item.pfp,
        badges: item.badges,
        file: item.file,
        type: item.name === "Système" ? "system" : "user",
      });
    });
  };

  socket.on("chat:history", (history) => {
    if (!Array.isArray(history)) return;
    initialPublicHistory = history;
    gotPublicHistory = true;
    // Si le serveur n'envoie pas de MPs, on rend quand même au bout d'un court délai
    setTimeout(() => {
      if (!gotDmHistory) {
        initialDmHistory = [];
        gotDmHistory = true;
      }
      tryRenderInitialTimeline();
    }, 150);
    tryRenderInitialTimeline();
  });

  socket.on("chat:dm:history", (history) => {
    if (!Array.isArray(history)) history = [];
    initialDmHistory = history;
    gotDmHistory = true;
    tryRenderInitialTimeline();
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
    if (payload && payload.id) {
      const existing = messages.querySelector(`.msg[data-id="${payload.id}"]`);
      if (existing) return;
    }
    addMessage({
      id: payload.id,
      auteur: payload.name,
      text: payload.text,
      at: payload.at,
      tag: payload.tag,
      pfp: payload.pfp,
      badges: payload.badges,
      file: payload.file,
    });

    if (
      payload.text.toLowerCase().includes(`@${myPseudo.toLowerCase()}`) &&
      payload.name !== myPseudo
    ) {
      showNotif(`💬 Vous avez été mentionné par ${payload.name} dans le Chat`);
    }
  });

  // --- MPs ---
  socket.on("chat:dm", (payload) => {
    renderDmMessage(payload, { notify: true });
  });

  socket.on("chat:dm:error", (text) => {
    addMessage({
      auteur: "Système",
      text: String(text || "Erreur MP"),
      type: "system",
    });
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

      const removeDmBox = () => {
        const box = document.getElementById("dm-suggestions");
        if (box) box.remove();
        dmSuggestState = { matches: [], index: -1, needle: "" };
      };

      const renderDmBox = (matches, activeIndex) => {
        let suggestionBox = document.getElementById("dm-suggestions");
        if (!suggestionBox) {
          suggestionBox = document.createElement("div");
          suggestionBox.id = "dm-suggestions";
          suggestionBox.style.position = "absolute";
          suggestionBox.style.bottom = "100%";
          suggestionBox.style.left = "15px";
          suggestionBox.style.background = "var(--bg-color)";
          suggestionBox.style.border = "1px solid var(--primary-color)";
          suggestionBox.style.zIndex = "1000";
          suggestionBox.style.maxHeight = "140px";
          suggestionBox.style.overflowY = "auto";
          suggestionBox.style.padding = "4px";
          suggestionBox.style.borderRadius = "5px";
          suggestionBox.style.minWidth = "160px";
          suggestionBox.style.fontSize = "12px";
          suggestionBox.style.pointerEvents = "auto";

          if (getComputedStyle(input.parentNode).position === "static") {
            input.parentNode.style.position = "relative";
          }
          input.parentNode.appendChild(suggestionBox);
        }

        suggestionBox.innerHTML = "";

        const applyActiveStyle = (idx) => {
          const children = Array.from(suggestionBox.children);
          children.forEach((child, i) => {
            if (!(child instanceof HTMLElement)) return;
            child.style.background =
              i === idx ? "rgba(255,255,255,0.12)" : "transparent";
          });
        };

        if (!matches.length) {
          const item = document.createElement("div");
          item.textContent = "Aucune suggestion";
          item.style.padding = "2px 6px";
          item.style.opacity = "0.7";
          suggestionBox.appendChild(item);
          return;
        }

        matches.slice(0, 6).forEach((name, i) => {
          const item = document.createElement("div");
          item.textContent = name;
          item.style.padding = "4px 8px";
          item.style.cursor = "pointer";
          item.style.borderRadius = "4px";
          item.style.background =
            i === activeIndex ? "rgba(255,255,255,0.12)" : "transparent";

          item.onmouseover = () => {
            dmSuggestState.index = i;
            applyActiveStyle(i);
          };
          item.onmouseout = () => {};

          const accept = (ev) => {
            try {
              ev?.preventDefault?.();
              ev?.stopPropagation?.();
            } catch {}
            input.value = `/msg ${name} `;
            input.focus();
            autoResize();
            removeDmBox();
          };

          // mousedown plutôt que click: évite de perdre le focus
          item.onmousedown = accept;
          // fallback click (certains navigateurs / devices)
          item.onclick = accept;

          suggestionBox.appendChild(item);
        });

        applyActiveStyle(activeIndex);
      };

      const getDmNeedle = (text) => {
        const raw = String(text || "");
        const m = raw.match(/^\/msg\s+(\S*)$/i);
        if (!m) return null;
        return String(m[1] || "");
      };

      const updateDmSuggestions = (text) => {
        const needle = getDmNeedle(text);
        if (needle === null) {
          removeDmBox();
          return;
        }

        const pool = onlineUsers.filter((u) => u && u !== myPseudo);
        const lowerNeedle = needle.toLowerCase();
        const matches = pool.filter((u) =>
          u.toLowerCase().startsWith(lowerNeedle),
        );

        if (needle !== dmSuggestState.needle) {
          dmSuggestState.index = -1;
          dmSuggestState.needle = needle;
        }

        dmSuggestState.matches = matches;

        if (!matches.length) {
          renderDmBox([], -1);
          return;
        }

        // Sélection par défaut: première suggestion
        if (dmSuggestState.index < 0) dmSuggestState.index = 0;
        if (dmSuggestState.index >= matches.length) dmSuggestState.index = 0;

        renderDmBox(matches, dmSuggestState.index);
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

        let suggestionBox = document.getElementById("mention-suggestions");
        if (!suggestionBox) {
          suggestionBox = document.createElement("div");
          suggestionBox.id = "mention-suggestions";
          suggestionBox.style.position = "absolute";
          suggestionBox.style.bottom = "100%";
          suggestionBox.style.left = "15px";
          suggestionBox.style.background = "var(--bg-color)";
          suggestionBox.style.border = "1px solid var(--primary-color)";
          suggestionBox.style.zIndex = "1000";
          suggestionBox.style.maxHeight = "150px";
          suggestionBox.style.overflowY = "auto";
          suggestionBox.style.padding = "5px";
          suggestionBox.style.borderRadius = "5px";
          suggestionBox.style.minWidth = "150px";

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
        updateDmSuggestions(input.value);
      });
      autoResize();

      window.addEventListener("keydown", (event) => {
        if (document.activeElement === input) {
          // Suggestion /msg : flèches pour naviguer, Tab pour valider
          const dmNeedle = getDmNeedle(input.value);
          const dmMatches = Array.isArray(dmSuggestState.matches)
            ? dmSuggestState.matches
            : [];

          if (dmNeedle !== null && dmMatches.length) {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              dmSuggestState.index =
                dmSuggestState.index < 0
                  ? 0
                  : (dmSuggestState.index + 1) % dmMatches.length;
              renderDmBox(dmMatches, dmSuggestState.index);
              return;
            }

            if (event.key === "ArrowUp") {
              event.preventDefault();
              if (dmSuggestState.index < 0) dmSuggestState.index = 0;
              dmSuggestState.index =
                (dmSuggestState.index - 1 + dmMatches.length) %
                dmMatches.length;
              renderDmBox(dmMatches, dmSuggestState.index);
              return;
            }

            if (event.key === "Tab" && !event.shiftKey) {
              event.preventDefault();
              const idx = dmSuggestState.index >= 0 ? dmSuggestState.index : 0;
              const chosen = dmMatches[idx] || dmMatches[0];
              if (!chosen) return;
              input.value = `/msg ${chosen} `;
              autoResize();
              removeDmBox();
              return;
            }
          }

          const suggestionBox = document.getElementById("mention-suggestions");
          if (suggestionBox && event.key === "Enter" && !event.shiftKey) {
            const firstItem = suggestionBox.querySelector("div");
            if (firstItem && firstItem.textContent !== "Aucune suggestion") {
              event.preventDefault();
              firstItem.click();
              return;
            }
          }

          if (suggestionBox && event.key === "Tab" && !event.shiftKey) {
            const items = Array.from(suggestionBox.querySelectorAll("div"));
            if (
              items.length === 1 &&
              items[0].textContent !== "Aucune suggestion"
            ) {
              event.preventDefault();
              items[0].click();
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

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return;

      if (text.toLowerCase() === "/rainbow") {
        if (window.toggleRainbowMode) {
          window.toggleRainbowMode();
        }

        fetch("/api/x9/step", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: "r1" }),
        }).catch(() => {});
        input.value = "";
        input.style.height = "auto";
        input.focus();
        return;
      }

      // Commande réponse MP: /rep message...
      const repMatch = text.match(/^\/rep\s+([\s\S]+)$/i);
      if (repMatch) {
        const msg = String(repMatch[1] || "").trim();
        if (!lastDmFrom) {
          addMessage({
            auteur: "Système",
            text: "Aucun MP récent à qui répondre.",
            type: "system",
          });
        } else if (!msg) {
          addMessage({
            auteur: "Système",
            text: "Usage: /rep [message...]",
            type: "system",
          });
        } else {
          socket.emit("chat:dm:send", { to: lastDmFrom, text: msg });
        }

        input.value = "";
        input.style.height = "auto";
        input.focus();
        return;
      }

      if (/^\/rep\b/i.test(text)) {
        addMessage({
          auteur: "Système",
          text: "Usage: /rep [message...]",
          type: "system",
        });
        input.value = "";
        input.style.height = "auto";
        input.focus();
        return;
      }

      // Commande MP: /msg Pseudo message...
      const dmMatch = text.match(/^\/msg\s+(\S+)\s+([\s\S]+)$/i);
      if (dmMatch) {
        const to = String(dmMatch[1] || "").trim();
        const msg = String(dmMatch[2] || "").trim();

        if (!to || !msg) {
          addMessage({
            auteur: "Système",
            text: "Usage: /msg [pseudoUser] [message...]",
            type: "system",
          });
        } else {
          socket.emit("chat:dm:send", { to, text: msg });
        }

        input.value = "";
        input.style.height = "auto";
        input.focus();
        return;
      }

      if (/^\/msg\b/i.test(text)) {
        addMessage({
          auteur: "Système",
          text: "Usage: /msg [pseudoUser] [message...]",
          type: "system",
        });
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
  }
}

function showNotif(message) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(message);
  }
}
