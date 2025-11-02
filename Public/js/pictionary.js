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

  // --------- Events Bouton/Input ---------
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

  if (guessInput) {
    guessInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const text = guessInput.value.trim();
        if (text) {
          socket.emit("pictionary:guess", { text });
          guessInput.value = "";
        }
      }
    });
  }

  // --------- Dessin ---------
  let strokeColor = "#fff";
  let strokeSize = 3;
  let eraser = false;
  let currentTool = "brush";

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
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const px = Math.floor(x * dpr);
    const py = Math.floor(y * dpr);
    const w = canvas.width;
    const h = canvas.height;
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
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
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

    if (
      canvas.width !== displayWidth * dpr ||
      canvas.height !== displayHeight * dpr
    ) {
      canvas.width = displayWidth * dpr;
      canvas.height = displayHeight * dpr;
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;
      const ctxLocal = canvas.getContext("2d");
      ctxLocal.setTransform(dpr, 0, 0, dpr, 0, 0);
      try {
        socket.emit("pictionary:getState");
      } catch (e) {
        console.error("Erreur interne : ", e.toString());
      }
    }
  }

  window.addEventListener("resize", resizeCanvas);

  if (canvas) {
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
          if (!estDessinateur) return;
          if (confirm("Effacer le canevas pour tous les joueurs ?")) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
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

    canvas.addEventListener("mousedown", (e) => {
      if (!estDessinateur) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (currentTool === "fill") {
        fillAt(x, y, strokeColor);
        sendFill(x, y, strokeColor);
        return;
      }
      drawing = true;
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

  // --------- Events Socket ---------
  socket.on("pictionary:lobby", (data) => {
    monPseudo = data.myUsername;
    estSpectateur = !data.estAuLobby && data.gameStarted;

    joueursList.innerHTML = `
      <p>Joueurs dans le lobby (${data.joueurs.length}/6) :</p>
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

  socket.on("pictionary:fill", (data) => {
    try {
      if (!ctx) return;
      fillAt(data.x, data.y, data.color);
    } catch (e) {
      console.error("Erreur interne : ", e.toString());
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

  function updateGame(state) {
    if (!state) return;
    estDessinateur = state.estDessinateur;
    estSpectateur = state.estSpec;

    try {
      const curEl = document.querySelector(".pictionary-current-player");
      if (curEl) {
        curEl.textContent = state.currentDrawer || "—";
      }
    } catch (e) {
      console.error("Erreur interne : ", e.toString());
    }

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

      function esc(s) {
        return String(s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      let displayMot;
      if (estDessinateur) {
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

      infoEl.innerHTML = `
        <p>Mot actuel : ${displayMot}</p>
        <p>Temps restant : ${state.timeLeft || 0}s</p>
        ${state.message ? `<p>${esc(state.message)}</p>` : ""}
      `;
    }

    if (playersEl) {
      playersEl.innerHTML = state.joueurs
        .map((p) => {
          const cls = p.pseudo === state.currentDrawer ? ' class="drawer"' : "";
          return `<div${cls}>${p.pseudo} (${p.score})</div>`;
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

        if (estSpectateur) {
          if (toolbar) toolbar.style.display = "none";
          if (guessGroup) guessGroup.style.display = "none";
          if (clearBtnEl) clearBtnEl.style.display = "none";
        } else if (estDessinateur) {
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
