export function initPictionary(socket) {
  // ---------- Cache UI ----------
  const ui = {
    lobby: document.querySelector(".pictionary-lobby"),
    gameWrap: document.querySelector(".pictionary-game"),
    joinBtn: document.querySelector(".pic-join"),
    leaveBtn: document.querySelector(".pic-leave"),
    startBtn: document.querySelector(".pic-start"),
    joueursList: document.querySelector(".pictionary-joueurs"),
    specsList: document.querySelector(".pictionary-spectators"),
    statusEl: document.querySelector(".pictionary-status"),
    modeSpec: document.querySelector(".pictionary-mode-spec"),
    infoEl: document.querySelector(".pictionary-info"),
    canvas: document.querySelector(".pictionary-canvas"),
    guessInput: document.querySelector(".pic-guess-input"),
    guessBtn: document.querySelector(".pic-guess-btn"),
    clearBtn: document.querySelector(".pic-clear-btn"),
    playersEl: document.querySelector(".pictionary-players"),
  };

  const ctx = ui.canvas?.getContext("2d");

  function clearCanvasSafe() {
    if (!ctx || !ui.canvas) return;
    try {
      const dpr = window.devicePixelRatio || 1;
      const cssW = Math.round(ui.canvas.width / dpr);
      const cssH = Math.round(ui.canvas.height / dpr);
      ctx.clearRect(0, 0, cssW, cssH);
      return;
    } catch (e) {}
    try {
      ctx.clearRect(0, 0, ui.canvas.width, ui.canvas.height);
    } catch (e) {
      // nothing else to do
    }
  }

  // ---------- Etat local ----------
  const state = {
    drawing: false,
    estDessinateur: false,
    estSpectateur: false,
    monPseudo: null,
    strokeColor: "#fff",
    strokeSize: 3,
    eraser: false,
    currentTool: "brush",
  };

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

  // ---------- Ecouteurs UI ----------
  ui.joinBtn?.addEventListener("click", () => socket.emit("pictionary:join"));
  ui.leaveBtn?.addEventListener("click", () => socket.emit("pictionary:leave"));
  ui.startBtn?.addEventListener("click", () => socket.emit("pictionary:start"));
  ui.clearBtn?.addEventListener("click", () => {
    if (state.estDessinateur) {
      try {
        const dpr = window.devicePixelRatio || 1;
        const cssW = Math.round(ui.canvas.width / dpr);
        const cssH = Math.round(ui.canvas.height / dpr);
        ctx.clearRect(0, 0, cssW, cssH);
      } catch (e) {
        clearCanvasSafe();
      }
      socket.emit("pictionary:clear");
    }
  });
  ui.guessBtn?.addEventListener("click", () => {
    const text = ui.guessInput.value.trim();
    if (text) {
      socket.emit("pictionary:guess", { text });
      ui.guessInput.value = "";
    }
  });

  if (ui.guessInput) {
    ui.guessInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const text = ui.guessInput.value.trim();
        if (text) {
          socket.emit("pictionary:guess", { text });
          ui.guessInput.value = "";
        }
      }
    });
  }

  // ---------- Dessin ----------
  let strokeColor = state.strokeColor;
  let strokeSize = state.strokeSize;
  let eraser = state.eraser;
  let currentTool = state.currentTool;

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

  function sendFill(x, y, color) {
    socket.emit("pictionary:fill", { x, y, color });
  }

  function hexToRgba(hex) {
    if (!hex) return [0, 0, 0, 255];
    const h = hex.replace("#", "");
    const bigint = parseInt(h, 16);
    if (h.length === 3) {
      const r = parseInt(h[0] + h[0], 16);
      const g = parseInt(h[1] + h[1], 16);
      const b = parseInt(h[2] + h[2], 16);
      return [r, g, b, 255];
    }
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return [r, g, b, 255];
  }

  // Remplissage tool
  function fillAt(x, y, fillColor) {
    if (!ui.canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const px = Math.floor(x * dpr);
    const py = Math.floor(y * dpr);
    const w = ui.canvas.width;
    const h = ui.canvas.height;
    let img;
    try {
      img = ctx.getImageData(0, 0, w, h);
    } catch (e) {
      return;
    }
    const data = img.data;
    const targetIndex = (py * w + px) * 4;
    const targetR = data[targetIndex];
    const targetG = data[targetIndex + 1];
    const targetB = data[targetIndex + 2];
    const targetA = data[targetIndex + 3];
    const [fr, fg, fb, fa] = hexToRgba(fillColor);
    if (targetR === fr && targetG === fg && targetB === fb && targetA === fa) {
      return;
    }

    const stack = [[px, py]];
    const visited = new Uint8Array(w * h);

    function matchColor(ix) {
      return (
        data[ix] === targetR &&
        data[ix + 1] === targetG &&
        data[ix + 2] === targetB &&
        data[ix + 3] === targetA
      );
    }

    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
      const idx = cy * w + cx;
      if (visited[idx]) continue;
      const di = idx * 4;
      if (!matchColor(di)) continue;
      data[di] = fr;
      data[di + 1] = fg;
      data[di + 2] = fb;
      data[di + 3] = fa;
      visited[idx] = 1;
      stack.push([cx + 1, cy]);
      stack.push([cx - 1, cy]);
      stack.push([cx, cy + 1]);
      stack.push([cx, cy - 1]);
    }

    ctx.putImageData(img, 0, 0);
  }

  function resizeCanvas() {
    if (!ui.canvas) return;
    const rect = ui.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const clientW = Math.round(ui.canvas.clientWidth || rect.width || 700);
    const clientH = Math.round(ui.canvas.clientHeight || rect.height || 450);

    // Définir le backing buffer avec DPR
    ui.canvas.width = clientW * dpr;
    ui.canvas.height = clientH * dpr;

    // Appliquer le setTransform pour dessiner en CSS pixels
    try {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    } catch (e) {}

    try {
      ui.canvas.style.width = `${clientW}px`;
      ui.canvas.style.height = `${clientH}px`;
    } catch (e) {}

    // Redemander l'état pour redessiner
    try {
      socket.emit("pictionary:getState");
    } catch (e) {}
  }

  window.addEventListener("resize", resizeCanvas);

  if (ui.canvas) {
    resizeCanvas();

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

      const leftGroup = document.createElement("div");
      leftGroup.style.display = "flex";
      leftGroup.style.alignItems = "center";
      leftGroup.appendChild(palette);
      leftGroup.appendChild(colorpicker);
      leftGroup.appendChild(brush);
      leftGroup.appendChild(eraserBtn);

      controls.insertBefore(leftGroup, controls.firstChild);
    }

    (function wireTools() {
      const palette = controls.querySelector(".pictionary-palette");
      const colorpicker = controls.querySelector(".pictionary-colorpicker");
      const brush = controls.querySelector(".pictionary-brushsize");
      const eraserBtn = controls.querySelector(".pictionary-eraser");
      const fillBtn = controls.querySelector(".pictionary-fill");
      const clearBtnEl = controls.querySelector(".pic-clear-btn");

      let selectedTool = "brush";

      function clearSelectionVisuals() {
        if (palette)
          Array.from(palette.children).forEach((b) => {
            b.style.outline = "";
            b.style.boxShadow = "";
          });
        if (colorpicker) colorpicker.style.outline = "";
        if (eraserBtn) {
          eraserBtn.style.outline = "";
          eraserBtn.style.boxShadow = "";
        }
        if (fillBtn) {
          fillBtn.style.outline = "";
          fillBtn.style.boxShadow = "";
        }
      }

      function markSelected(elem) {
        clearSelectionVisuals();
        if (!elem) return;
        elem.style.outline = "2px solid #fff";
        elem.style.outlineOffset = "2px";
      }

      function selectTool(tool, visualElem) {
        selectedTool = tool;
        currentTool =
          tool === "brush" ? "brush" : tool === "fill" ? "fill" : "brush";
        eraser = tool === "eraser";
        if (visualElem) markSelected(visualElem);
      }

      if (palette) {
        Array.from(palette.children).forEach((btn) => {
          btn.style.cursor = "pointer";
          btn.addEventListener("click", () => {
            strokeColor = btn.title || btn.style.background;
            selectTool("brush", btn);
          });
        });
      }

      if (colorpicker) {
        colorpicker.addEventListener("input", (e) => {
          strokeColor = e.target.value;
          selectTool("brush", colorpicker);
        });
      }

      if (brush) {
        brush.addEventListener("input", (e) => {
          strokeSize = Number(e.target.value) || 3;
        });
      }

      if (fillBtn) {
        fillBtn.addEventListener("click", () => {
          selectTool("fill", fillBtn);
        });
      }

      if (eraserBtn) {
        eraserBtn.addEventListener("click", () => {
          selectTool("eraser", eraserBtn);
        });
      }

      if (clearBtnEl) {
        clearBtnEl.addEventListener("click", () => {
          if (!state.estDessinateur) return;
          if (confirm("Effacer le canevas pour tous les joueurs ?")) {
            clearCanvasSafe();
            socket.emit("pictionary:clear");
          }
        });
      }

      (function initialSelect() {
        const initial = colorpicker ? colorpicker.value : strokeColor;
        if (palette) {
          const match = Array.from(palette.children).find((b) => {
            const bg = (b.style.background || "").toLowerCase();
            return bg === (initial || "").toLowerCase();
          });
          if (match) {
            selectTool("brush", match);
            return;
          }
        }
        if (colorpicker) {
          selectTool("brush", colorpicker);
        }
      })();
    })();

    ui.canvas.addEventListener("mousedown", (e) => {
      if (!state.estDessinateur) return;
      const rect = ui.canvas.getBoundingClientRect();
      // Coordonnées CSS pixels (pas DPR)
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (currentTool === "fill") {
        fillAt(x, y, strokeColor);
        sendFill(x, y, strokeColor);
        return;
      }
      state.drawing = true;
      ctx.beginPath();
      ctx.moveTo(x, y);
      sendStroke(x, y, "start");
    });

    ui.canvas.addEventListener("mousemove", (e) => {
      if (!state.drawing || !state.estDessinateur) return;
      const rect = ui.canvas.getBoundingClientRect();
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

    ui.canvas.addEventListener("mouseup", () => {
      if (!state.estDessinateur) return;
      state.drawing = false;
      sendStroke(0, 0, "end");
    });

    ui.canvas.addEventListener("mouseleave", () => {
      if (!state.estDessinateur) return;
      state.drawing = false;
      sendStroke(0, 0, "end");
    });
  }

  // ---------- Events socket ----------
  socket.on("pictionary:lobby", (data) => {
    state.monPseudo = data.myUsername;
    state.estSpectateur = !data.estAuLobby && data.gameStarted;

    ui.joueursList.innerHTML = `
      <p>Joueurs dans le lobby (${data.joueurs.length}/6) :</p>
      ${
        data.joueurs.length > 0
          ? data.joueurs.map((p) => `<div>${p}</div>`).join("")
          : "<div style='color:#fff;'>Aucun joueur</div>"
      }
    `;

    ui.specsList.innerHTML =
      data.spectators?.length > 0
        ? `<p>Spectateurs (${data.spectators.length}) : ${data.spectators.join(
            ", "
          )}</p>`
        : "";

    if (data.estAuLobby) {
      ui.joinBtn.style.display = "none";
      ui.leaveBtn.style.display = "inline-block";
      ui.startBtn.style.display = "inline-block";

      if (data.canStart && data.joueurs.length >= 1) {
        ui.startBtn.disabled = false;
        ui.startBtn.textContent = "Démarrer la partie";
      } else {
        ui.startBtn.disabled = true;
        ui.startBtn.textContent = `En attente (${data.joueurs.length}/3 min)`;
      }
    } else {
      ui.joinBtn.style.display = "inline-block";
      ui.leaveBtn.style.display = "none";
      ui.startBtn.style.display = "none";

      if (data.gameStarted) {
        ui.joinBtn.textContent = "Partie en cours...";
        ui.joinBtn.disabled = true;
      } else {
        ui.joinBtn.textContent = "Rejoindre le lobby";
        ui.joinBtn.disabled = false;
      }
    }
  });

  socket.on("pictionary:gameStart", (gameState) => {
    ui.lobby.style.display = "none";
    ui.gameWrap.classList.add("active");
    updateGame(gameState);
  });

  socket.on("pictionary:update", (gameState) => {
    ui.lobby.style.display = "none";
    ui.gameWrap.classList.add("active");
    updateGame(gameState);
  });

  socket.on("pictionary:clear", () => {
    try {
      const dpr = window.devicePixelRatio || 1;
      const cssW = Math.round(ui.canvas.width / dpr);
      const cssH = Math.round(ui.canvas.height / dpr);
      ctx.clearRect(0, 0, cssW, cssH);
    } catch (e) {
      clearCanvasSafe();
    }
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

  socket.on("pictionary:fill", (data) => {
    try {
      if (!ctx) return;
      fillAt(data.x, data.y, data.color);
    } catch (e) {
      console.error("Erreur interne : ", e.toString());
    }
  });

  socket.on("pictionary:gameEnd", (data) => {
    if (ui.infoEl) {
      const text = data.winner || "Partie terminée";
      ui.infoEl.innerHTML = `<div class="p4-winner-message">🏆 ${text} 🏆</div>`;
    }
    setTimeout(() => {
      ui.gameWrap.classList.remove("active");
      ui.lobby.style.display = "block";
      socket.emit("pictionary:getState");
    }, 3000);
  });

  socket.on("pictionary:backToLobby", () => {
    ui.gameWrap.classList.remove("active");
    ui.lobby.style.display = "block";
    socket.emit("pictionary:getState");
  });

  function updateGame(gameState) {
    if (!gameState) return;
    state.estDessinateur = gameState.estDessinateur;
    state.estSpectateur = gameState.estSpec;

    try {
      const curEl = document.querySelector(".pictionary-current-player");
      if (curEl) {
        curEl.textContent = gameState.currentDrawer || "—";
      }
    } catch (e) {
      console.error("Erreur interne : ", e.toString());
    }

    if (ui.modeSpec) {
      if (state.estSpectateur) {
        ui.modeSpec.style.display = "block";
        ui.modeSpec.textContent =
          "👁️ Mode spectateur - Tu regardes la partie (CTRL + R si problème)";
      } else {
        ui.modeSpec.style.display = "none";
      }
    }

    if (ui.statusEl) {
      if (state.estDessinateur) ui.statusEl.textContent = "🎨 Tu dessines !";
      else if (state.estSpectateur)
        ui.statusEl.textContent = "👁️ Tu es spectateur";
      else ui.statusEl.textContent = "🧠 Devine le mot !";
    }

    if (ui.infoEl) {
      const rawMot = gameState.motVisible || gameState.wordProgress || "???";

      function esc(s) {
        return String(s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      let displayMot;
      if (state.estDessinateur) {
        displayMot = `<span class="pictionary-word drawer">${esc(
          rawMot
        )}</span>`;
      } else {
        const parts = Array.from(String(rawMot)).map((ch) => {
          if (ch === " ") return "&nbsp;&nbsp;&nbsp;";
          return esc(ch);
        });
        displayMot = `<span class="pictionary-word">${parts.join(" ")}</span>`;
      }

      ui.infoEl.innerHTML = `
        <p>Mot actuel : ${displayMot}</p>
        <p>Temps restant : ${gameState.timeLeft || 0}s</p>
        ${gameState.message ? `<p>${esc(gameState.message)}</p>` : ""}
      `;
    }

    if (ui.playersEl) {
      ui.playersEl.innerHTML = gameState.joueurs
        .map((p) => {
          const cls =
            p.pseudo === gameState.currentDrawer ? ' class="drawer"' : "";
          return `<div${cls}>${p.pseudo} (${p.score
            .toLocaleString("fr-FR")
            .replace(/\s/g, "\u00a0")})</div>`;
        })
        .join("");
    }

    // Display des tools selon role
    try {
      const controls = document.querySelector(".pictionary-controls");
      if (controls) {
        const toolbar = controls.querySelector(".pictionary-toolbar");
        const guessGroup = controls.querySelector(".pictionary-guess");
        const clearBtnEl = controls.querySelector(".pic-clear-btn");

        if (state.estSpectateur) {
          if (toolbar) toolbar.style.display = "none";
          if (guessGroup) guessGroup.style.display = "none";
          if (clearBtnEl) clearBtnEl.style.display = "none";
        } else if (state.estDessinateur) {
          if (toolbar) toolbar.style.display = "flex";
          if (guessGroup) guessGroup.style.display = "none";
          if (clearBtnEl) clearBtnEl.style.display = "inline-block";
          try {
            const palette = controls.querySelector(".pictionary-palette");
            const colorpicker = controls.querySelector(
              ".pictionary-colorpicker"
            );
            const desired = (colorpicker && colorpicker.value) || strokeColor;
            if (palette) {
              const match = Array.from(palette.children).find(
                (b) =>
                  (b.style.background || "").toLowerCase() ===
                  (desired || "").toLowerCase()
              );
              if (match) match.click();
              else if (colorpicker)
                colorpicker.dispatchEvent(
                  new Event("input", { bubbles: true })
                );
            } else if (colorpicker) {
              colorpicker.dispatchEvent(new Event("input", { bubbles: true }));
            }
          } catch (e) {
            console.error("Erreur interne : ", e.toString());
          }
        } else {
          if (toolbar) toolbar.style.display = "none";
          if (guessGroup) guessGroup.style.display = "flex";
          if (clearBtnEl) clearBtnEl.style.display = "none";
        }
      }
    } catch (e) {
      console.error("Erreur interne : ", e.toString());
    }
  }
}
