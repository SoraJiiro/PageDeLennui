export function initPictionary(socket) {
  const lobby = document.querySelector(".pictionary-lobby");
  const gameWrap = document.querySelector(".pictionary-game");
  const joinBtn = document.querySelector(".pic-join");
  const leaveBtn = document.querySelector(".pic-leave");
  const startBtn = document.querySelector(".pic-start");
  const joueursList = document.querySelector(".pictionary-joueurs");
  const specsList = document.querySelector(".pictionary-spectators");
  const statusEl = document.querySelector(".pictionary-status");
  const modeSpec = document.querySelector(".pictionary-mode-spec");
  const infoEl = document.querySelector(".pictionary-info");
  const canvas = document.querySelector(".pictionary-canvas");
  const guessInput = document.querySelector(".pic-guess-input");
  const guessBtn = document.querySelector(".pic-guess-btn");
  const clearBtn = document.querySelector(".pic-clear-btn");
  const playersEl = document.querySelector(".pictionary-players");

  const ctx = canvas?.getContext("2d");
  let drawing = false;
  let estDessinateur = false;
  let estSpectateur = false;
  let monPseudo = null;

  socket.emit("pictionary:getState");

  // Observer pour récupérer l'état quand visible
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) socket.emit("pictionary:getState");
      });
    },
    { threshold: 0.5 }
  );

  const stage7 = document.getElementById("stage7");
  if (stage7) observer.observe(stage7);

  // === Boutons lobby ===
  joinBtn?.addEventListener("click", () => socket.emit("pictionary:join"));
  leaveBtn?.addEventListener("click", () => socket.emit("pictionary:leave"));
  startBtn?.addEventListener("click", () => socket.emit("pictionary:start"));
  clearBtn?.addEventListener("click", () => {
    if (estDessinateur) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      socket.emit("pictionary:clear");
    }
  });
  guessBtn?.addEventListener("click", () => {
    const text = guessInput.value.trim();
    if (text) {
      socket.emit("pictionary:guess", { text });
      guessInput.value = "";
    }
  });

  // === Dessin ===
  // drawing state
  let strokeColor = "#fff";
  let strokeSize = 3;
  let eraser = false;

  function sendStroke(x, y, type) {
    socket.emit("pictionary:draw", {
      x,
      y,
      type,
      color: strokeColor,
      size: strokeSize,
      eraser,
    });
  }

  // Resize canvas to match display size and devicePixelRatio to avoid coord mismatch
  function resizeCanvas() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    // prefer clientWidth/clientHeight (layout size). If those are zero (parent has no height),
    // fall back to canvas attributes or defaults to avoid tiny 2x2 results.
    const clientW = Math.round(
      canvas.clientWidth ||
        rect.width ||
        Number(canvas.getAttribute("width")) ||
        700
    );
    const clientH = Math.round(
      canvas.clientHeight ||
        rect.height ||
        Number(canvas.getAttribute("height")) ||
        450
    );
    const displayWidth = Math.max(1, clientW);
    const displayHeight = Math.max(1, clientH);

    // only change size if different
    if (
      canvas.width !== displayWidth * dpr ||
      canvas.height !== displayHeight * dpr
    ) {
      canvas.width = displayWidth * dpr;
      canvas.height = displayHeight * dpr;
      // ensure CSS size equals layout size
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;
      const ctxLocal = canvas.getContext("2d");
      // set transform so drawing uses CSS pixels
      ctxLocal.setTransform(dpr, 0, 0, dpr, 0, 0);
      // request server to resend strokes so the drawing is replayed at new size
      try {
        socket.emit("pictionary:getState");
      } catch (e) {}
    }
  }

  window.addEventListener("resize", () => {
    resizeCanvas();
  });

  if (canvas) {
    // initialize canvas size
    resizeCanvas();

    // create tool UI (palette, brush size, color picker, eraser) if missing
    const controls = document.querySelector(".pictionary-controls");
    if (controls && !controls.querySelector(".pictionary-palette")) {
      const palette = document.createElement("div");
      palette.className = "pictionary-palette";
      ["#fff", "#f00", "#0f0", "#00f", "#ff0", "#f0f"].forEach((c) => {
        const btn = document.createElement("button");
        btn.style.background = c;
        btn.title = c;
        btn.addEventListener("click", () => {
          strokeColor = c;
          eraser = false;
          // visual feedback
          Array.from(palette.children).forEach((b) => (b.style.outline = ""));
          btn.style.outline = "2px solid #fff";
        });
        palette.appendChild(btn);
      });

      const colorpicker = document.createElement("input");
      colorpicker.type = "color";
      colorpicker.className = "pictionary-colorpicker";
      colorpicker.addEventListener("input", (e) => {
        strokeColor = e.target.value;
        eraser = false;
      });

      const brush = document.createElement("input");
      brush.type = "range";
      brush.min = 1;
      brush.max = 40;
      brush.value = strokeSize;
      brush.className = "pictionary-brushsize";
      brush.addEventListener("input", (e) => {
        strokeSize = Number(e.target.value) || 3;
      });

      const eraserBtn = document.createElement("button");
      eraserBtn.className = "pictionary-eraser";
      eraserBtn.textContent = "Gomme";
      eraserBtn.addEventListener("click", () => {
        eraser = !eraser;
        eraserBtn.style.opacity = eraser ? "1" : "0.7";
      });

      const leftGroup = document.createElement("div");
      leftGroup.style.display = "flex";
      leftGroup.style.alignItems = "center";
      leftGroup.appendChild(palette);
      leftGroup.appendChild(colorpicker);
      leftGroup.appendChild(brush);
      leftGroup.appendChild(eraserBtn);

      controls.insertBefore(leftGroup, controls.firstChild);
    }

    // Wire up palette/colorpicker/brush/eraser from static or dynamic markup
    (function wireTools() {
      const palette = controls.querySelector(".pictionary-palette");
      const colorpicker = controls.querySelector(".pictionary-colorpicker");
      const brush = controls.querySelector(".pictionary-brushsize");
      const eraserBtn = controls.querySelector(".pictionary-eraser");

      function clearOutlines() {
        if (palette)
          Array.from(palette.children).forEach((b) => (b.style.outline = ""));
        if (colorpicker) colorpicker.style.outline = "";
      }

      function markSelected(elem) {
        clearOutlines();
        if (!elem) return;
        elem.style.outline = "2px solid #fff";
        elem.style.outlineOffset = "2px";
      }

      if (palette) {
        Array.from(palette.children).forEach((btn) => {
          // ensure cursor
          btn.style.cursor = "pointer";
          btn.addEventListener("click", () => {
            strokeColor = btn.title || btn.style.background;
            eraser = false;
            markSelected(btn);
          });
        });
      }

      if (colorpicker) {
        colorpicker.addEventListener("input", (e) => {
          strokeColor = e.target.value;
          eraser = false;
          markSelected(colorpicker);
        });
      }

      if (brush) {
        brush.addEventListener("input", (e) => {
          strokeSize = Number(e.target.value) || 3;
        });
      }

      if (eraserBtn) {
        eraserBtn.addEventListener("click", () => {
          eraser = !eraser;
          // visual state for eraser
          eraserBtn.style.opacity = eraser ? "1" : "0.7";
          if (eraser) {
            clearOutlines();
            eraserBtn.style.boxShadow = "inset 0 0 0 2px rgba(255,255,255,0.2)";
          } else {
            eraserBtn.style.boxShadow = "";
          }
        });
      }

      // initial selection: try to match colorpicker value to a palette button
      (function initialSelect() {
        const initial = colorpicker ? colorpicker.value : strokeColor;
        if (palette) {
          const match = Array.from(palette.children).find((b) => {
            const bg = (b.style.background || "").toLowerCase();
            return bg === (initial || "").toLowerCase();
          });
          if (match) return markSelected(match);
        }
        if (colorpicker) markSelected(colorpicker);
      })();
    })();
    canvas.addEventListener("mousedown", (e) => {
      if (!estDessinateur) return;
      drawing = true;
      const rect = canvas.getBoundingClientRect();
      // since ctx has setTransform(dpr,..) we can use CSS pixels directly
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      ctx.beginPath();
      ctx.moveTo(x, y);
      sendStroke(x, y, "start");
    });

    canvas.addEventListener("mousemove", (e) => {
      if (!drawing || !estDessinateur) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      ctx.lineTo(x, y);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeSize;
      ctx.globalCompositeOperation = eraser ? "destination-out" : "source-over";
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      sendStroke(x, y, "move");
    });

    canvas.addEventListener("mouseup", () => {
      if (!estDessinateur) return;
      drawing = false;
      sendStroke(0, 0, "end");
    });

    canvas.addEventListener("mouseleave", () => {
      if (!estDessinateur) return;
      drawing = false;
      sendStroke(0, 0, "end");
    });
  }

  // === Événements Socket ===
  socket.on("pictionary:lobby", (data) => {
    monPseudo = data.myUsername;
    estSpectateur = !data.estAuLobby && data.gameStarted;

    joueursList.innerHTML = `
      <p>Joueurs (${data.joueurs.length}) :</p>
      ${
        data.joueurs.length > 0
          ? data.joueurs.map((p) => `<div>${p}</div>`).join("")
          : "<div style='color:#fff;'>Aucun joueur</div>"
      }
    `;

    specsList.innerHTML =
      data.spectators?.length > 0
        ? `<p>Spectateurs (${data.spectators.length}) : ${data.spectators.join(
            ", "
          )}</p>`
        : "";

    if (data.estAuLobby) {
      joinBtn.style.display = "none";
      leaveBtn.style.display = "inline-block";
      startBtn.style.display = "inline-block";

      if (data.canStart && data.joueurs.length >= 1) {
        startBtn.disabled = false;
        startBtn.textContent = "Démarrer la partie";
      } else {
        startBtn.disabled = true;
        startBtn.textContent = `En attente (${data.joueurs.length}/3 min)`;
      }
    } else {
      joinBtn.style.display = "inline-block";
      leaveBtn.style.display = "none";
      startBtn.style.display = "none";

      if (data.gameStarted) {
        joinBtn.textContent = "Partie en cours...";
        joinBtn.disabled = true;
      } else {
        joinBtn.textContent = "Rejoindre le lobby";
        joinBtn.disabled = false;
      }
    }
  });

  socket.on("pictionary:gameStart", (state) => {
    lobby.style.display = "none";
    gameWrap.classList.add("active");
    updateGame(state);
  });

  socket.on("pictionary:update", (state) => {
    lobby.style.display = "none";
    gameWrap.classList.add("active");
    updateGame(state);
  });

  socket.on("pictionary:clear", () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  });

  socket.on("pictionary:stroke", (data) => {
    if (!ctx) return;
    const color = data.color || "#fff";
    const size = data.size || 3;
    const isEraser = data.eraser;
    if (data.type === "start") {
      ctx.beginPath();
      ctx.moveTo(data.x, data.y);
    } else if (data.type === "move") {
      ctx.lineTo(data.x, data.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.globalCompositeOperation = isEraser
        ? "destination-out"
        : "source-over";
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    } else if (data.type === "end") {
      ctx.closePath();
    }
  });

  socket.on("pictionary:gameEnd", (data) => {
    alert(`🎉 ${data.winner || "Partie terminée"} !`);
    gameWrap.classList.remove("active");
    lobby.style.display = "block";
    socket.emit("pictionary:getState");
  });

  socket.on("pictionary:backToLobby", () => {
    gameWrap.classList.remove("active");
    lobby.style.display = "block";
    socket.emit("pictionary:getState");
  });

  // === Mise à jour de la partie ===
  function updateGame(state) {
    if (!state) return;
    estDessinateur = state.estDessinateur;
    estSpectateur = state.estSpec;

    if (modeSpec) {
      if (estSpectateur) {
        modeSpec.style.display = "block";
        modeSpec.textContent =
          "👁️ Mode spectateur - Tu regardes la partie (CTRL + R si problème)";
      } else {
        modeSpec.style.display = "none";
      }
    }

    if (statusEl) {
      if (estDessinateur) statusEl.textContent = "🎨 Tu dessines !";
      else if (estSpectateur) statusEl.textContent = "👁️ Tu es spectateur";
      else statusEl.textContent = "🧠 Devine le mot !";
    }

    if (infoEl) {
      const rawMot = state.motVisible || state.wordProgress || "???";

      // escape HTML to avoid injection
      function esc(s) {
        return String(s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      // For non-drawers, insert spaces between characters so underscores are easier to read
      let displayMot;
      if (estDessinateur) {
        displayMot = `<span class="pictionary-word drawer">${esc(
          rawMot
        )}</span>`;
      } else {
        const parts = Array.from(String(rawMot)).map((ch) => {
          if (ch === " ") return "&nbsp;&nbsp;&nbsp;"; // wider gap for spaces
          return esc(ch);
        });
        displayMot = `<span class="pictionary-word">${parts.join(" ")}</span>`;
      }

      infoEl.innerHTML = `
        <p>Mot actuel : ${displayMot}</p>
        <p>Temps restant : ${state.timeLeft || 0}s</p>
        ${state.message ? `<p>${esc(state.message)}</p>` : ""}
      `;
    }

    if (playersEl) {
      playersEl.innerHTML = state.joueurs
        .map(
          (p) =>
            `<div ${
              p.pseudo === state.currentDrawer ? 'style="color:#0f0"' : ""
            }>${p.pseudo} (${p.score})</div>`
        )
        .join("");
    }

    // Afficher/masquer la barre d'outils et la barre de proposition selon le rôle
    try {
      const controls = document.querySelector(".pictionary-controls");
      if (controls) {
        const palette = controls.querySelector(".pictionary-palette");
        const colorpicker = controls.querySelector(".pictionary-colorpicker");
        const brush = controls.querySelector(".pictionary-brushsize");
        const eraserBtn = controls.querySelector(".pictionary-eraser");
        const guessInputEl = controls.querySelector(".pic-guess-input");
        const guessBtnEl = controls.querySelector(".pic-guess-btn");
        const clearBtnEl = controls.querySelector(".pic-clear-btn");

        if (estSpectateur) {
          // spectateur : rien (ni outils ni barre de proposition)
          if (palette) palette.style.display = "none";
          if (colorpicker) colorpicker.style.display = "none";
          if (brush) brush.style.display = "none";
          if (eraserBtn) eraserBtn.style.display = "none";
          if (guessInputEl) guessInputEl.style.display = "none";
          if (guessBtnEl) guessBtnEl.style.display = "none";
          if (clearBtnEl) clearBtnEl.style.display = "none";
        } else if (estDessinateur) {
          // dessinateur : outils visibles, barre de proposition cachée, clear visible
          if (palette) palette.style.display = "flex";
          if (colorpicker) colorpicker.style.display = "inline-block";
          if (brush) brush.style.display = "inline-block";
          if (eraserBtn) eraserBtn.style.display = "inline-block";
          if (guessInputEl) guessInputEl.style.display = "none";
          if (guessBtnEl) guessBtnEl.style.display = "none";
          if (clearBtnEl) clearBtnEl.style.display = "inline-block";
        } else {
          // joueur normal : outils cachés, barre de proposition visible, clear caché
          if (palette) palette.style.display = "none";
          if (colorpicker) colorpicker.style.display = "none";
          if (brush) brush.style.display = "none";
          if (eraserBtn) eraserBtn.style.display = "none";
          if (guessInputEl) guessInputEl.style.display = "inline-block";
          if (guessBtnEl) guessBtnEl.style.display = "inline-block";
          if (clearBtnEl) clearBtnEl.style.display = "none";
        }
      }
    } catch (e) {
      // noop
    }
  }
}
