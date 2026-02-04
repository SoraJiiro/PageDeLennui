(function () {
  if (typeof io === "undefined") return;
  const socket = io();
  window.adminSocket = socket;

  function humanSize(bytes) {
    if (!bytes) return "0 B";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }

  function sanitize(text) {
    const d = document.createElement("div");
    d.textContent = text || "";
    return d.innerHTML;
  }

  let sf_state = { page: 1, pageSize: 50, filter: "", total: 0 };

  function renderList(list) {
    const tbody = document.getElementById("shared-files-list");
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!Array.isArray(list) || list.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML =
        '<td colspan="7" style="color:#888; text-align:center">Aucun fichier partagé.</td>';
      tbody.appendChild(tr);
      return;
    }

    list.forEach((f) => {
      const tr = document.createElement("tr");
      tr.dataset.fileId = f.id;
      tr.innerHTML = `
        <td class="preview-cell"><button class="btn small preview-btn">Aperçu</button></td>
        <td class="name-cell">${sanitize(f.name)}</td>
        <td class="type-cell">${sanitize(f.type || "")}</td>
        <td class="size-cell">${humanSize(f.size)}</td>
        <td class="uploader-cell">${sanitize(f.uploader || "")}</td>
        <td class="date-cell">${sanitize(f.uploadedAt || "")}</td>
        <td class="actions-cell">
          <button class="btn small download-btn"><i class="fa-solid fa-download"></i></button>
          <button class="btn small btn-red delete-btn"><i class="fa-solid fa-trash"></i></button>
        </td>
      `;

      const previewBtn = tr.querySelector(".preview-btn");
      const downloadBtn = tr.querySelector(".download-btn");
      const deleteBtn = tr.querySelector(".delete-btn");

      previewBtn.addEventListener("click", () => {
        // If server provides a direct URL, preview directly; otherwise request base64 via socket
        if (f.url) {
          showPreviewForFileUrl(f.url, f.name, f.type);
        } else {
          socket.emit("chat:downloadFile", { fileId: f.id });
          // show loading state
          previewBtn.disabled = true;
          previewBtn.textContent = "Chargement...";
          setTimeout(() => {
            previewBtn.disabled = false;
            previewBtn.textContent = "Aperçu";
          }, 10000);
        }
      });

      downloadBtn.addEventListener("click", () => {
        if (f.url) {
          const a = document.createElement("a");
          a.href = f.url;
          a.download = (f.name || "file").split(/[\\/\\\\]/).pop();
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else {
          socket.emit("chat:downloadFile", { fileId: f.id });
        }
      });

      deleteBtn.addEventListener("click", () => {
        if (!confirm("Supprimer définitivement ce fichier ?")) return;
        socket.emit("chat:deleteFile", { fileId: f.id });
      });

      tbody.appendChild(tr);
    });
    // update page info
    const info = document.getElementById("shared-files-page-info");
    if (info) {
      const start = (sf_state.page - 1) * sf_state.pageSize + 1;
      const end = Math.min(
        sf_state.page * sf_state.pageSize,
        sf_state.total || 0,
      );
      info.textContent = `${start}-${end} / ${sf_state.total || 0} `;
    }
  }

  function showPreviewForFileData(obj) {
    // obj: { id, name, type, data }
    const modal = document.getElementById("file-preview-modal");
    const container = document.getElementById("file-preview-content");
    if (!modal || !container) return;
    container.innerHTML = "";

    const type = obj.type || "";
    const name = obj.name || "file";
    const byteCharacters = atob(obj.data || "");
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++)
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    const byteArray = new Uint8Array(byteNumbers);
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
    const url = URL.createObjectURL(blob);

    if (type.startsWith("image/")) {
      const img = document.createElement("img");
      img.src = url;
      img.style.maxWidth = "100%";
      img.style.maxHeight = "60vh";
      container.appendChild(img);
    } else if (type.startsWith("video/")) {
      const video = document.createElement("video");
      video.src = url;
      video.controls = true;
      video.style.maxWidth = "100%";
      video.style.maxHeight = "60vh";
      container.appendChild(video);
    } else if (
      type.startsWith("text/") ||
      ["application/javascript", "application/json"].includes(type)
    ) {
      const textDecoder = new TextDecoder();
      let text = "";
      try {
        text = textDecoder.decode(byteArray);
      } catch (e) {
        text = "(Impossible de décoder le texte)";
      }
      const pre = document.createElement("pre");
      pre.textContent = text.slice(0, 2000);
      container.appendChild(pre);
    } else {
      const p = document.createElement("p");
      p.textContent = "Aperçu non disponible pour ce type de fichier.";
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.textContent = "Télécharger le fichier";
      a.className = "btn";
      container.appendChild(p);
      container.appendChild(a);
    }

    const info = document.createElement("div");
    info.style.marginTop = "8px";
    info.style.fontSize = "0.9em";
    info.style.color = "#ccc";
    info.innerHTML = `<strong>${sanitize(name)}</strong> — ${sanitize(type || "")}`;
    container.appendChild(info);

    modal.style.display = "flex";

    // cleanup URL when modal closed
    modal.dataset.currentUrl = url;
  }

  // Preview using a public URL (no base64 transfer)
  function showPreviewForFileUrl(url, name, type) {
    const modal = document.getElementById("file-preview-modal");
    const container = document.getElementById("file-preview-content");
    if (!modal || !container) return;
    container.innerHTML = "";

    const t = type || "";
    const n = name || "file";

    if (t.startsWith("image/")) {
      const img = document.createElement("img");
      img.src = url;
      img.style.maxWidth = "100%";
      img.style.maxHeight = "60vh";
      container.appendChild(img);
    } else if (t.startsWith("video/")) {
      const video = document.createElement("video");
      video.src = url;
      video.controls = true;
      video.style.maxWidth = "100%";
      video.style.maxHeight = "60vh";
      container.appendChild(video);
    } else if (t.startsWith("audio/")) {
      const audio = document.createElement("audio");
      audio.src = url;
      audio.controls = true;
      container.appendChild(audio);
    } else {
      const p = document.createElement("p");
      p.textContent = "Aperçu non disponible pour ce type de fichier.";
      const a = document.createElement("a");
      a.href = url;
      a.download = n;
      a.textContent = "Télécharger le fichier";
      a.className = "btn";
      container.appendChild(p);
      container.appendChild(a);
    }

    const info = document.createElement("div");
    info.style.marginTop = "8px";
    info.style.fontSize = "0.9em";
    info.style.color = "#ccc";
    info.innerHTML = `<strong>${sanitize(n)}</strong> — ${sanitize(t || "")}`;
    container.appendChild(info);

    modal.style.display = "flex";
    modal.dataset.currentUrl = url;
  }

  function hidePreview() {
    const modal = document.getElementById("file-preview-modal");
    if (!modal) return;
    const url = modal.dataset.currentUrl;
    if (url) URL.revokeObjectURL(url);
    modal.dataset.currentUrl = "";
    document.getElementById("file-preview-content").innerHTML = "";
    modal.style.display = "none";
  }

  // listen server responses
  socket.on("admin:sharedFiles", (payload) => {
    // payload: { items, total, page, pageSize }
    if (!payload) return;
    const { items = [], total = 0, page = 1, pageSize = 50 } = payload;
    sf_state.page = page;
    sf_state.pageSize = pageSize;
    sf_state.total = total;
    renderList(items);
  });
  socket.on("chat:fileData", (obj) => {
    if (!obj || !obj.id) return;
    // show preview only if admin modal exists
    showPreviewForFileData(obj);
    // refresh list
    socket.emit("admin:getSharedFiles");
  });

  socket.on("chat:fileDeleted", ({ fileId }) => {
    const row = document.querySelector(
      `#shared-files-list tr[data-file-id='${fileId}']`,
    );
    if (row) row.remove();
  });

  socket.on("admin:fileLogs", (payload) => {
    if (!payload) return;
    const { items = [], total = 0, page = 1, pageSize = 50 } = payload;
    logs_state.page = page;
    logs_state.pageSize = pageSize;
    logs_state.total = total;
    renderLogs(items);
  });

  // helpers to fetch
  function fetchSharedFiles() {
    socket.emit("admin:getSharedFiles", {
      page: sf_state.page,
      pageSize: sf_state.pageSize,
      filter: sf_state.filter,
    });
  }

  // FILE LOGS state
  let logs_state = { page: 1, pageSize: 50, total: 0 };

  function renderLogs(list) {
    const tbody = document.getElementById("file-logs-list");
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!Array.isArray(list) || list.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML =
        '<td colspan="5" style="color:#888; text-align:center">Aucun log.</td>';
      tbody.appendChild(tr);
      return;
    }
    list.forEach((item) => {
      const tr = document.createElement("tr");
      const when = sanitize(item.at || item.uploadedAt || "");
      const action = sanitize(item.action || "");
      const name = sanitize(item.name || item.fileName || "");
      const user = sanitize(
        item.uploader || item.deletedBy || item.downloader || "",
      );
      tr.innerHTML = `<td>${when}</td><td>${action}</td><td>${name}</td><td>${user}</td><td>${sanitize(JSON.stringify(item))}</td>`;
      tbody.appendChild(tr);
    });
    const info = document.getElementById("file-logs-page-info");
    if (info)
      info.textContent = `Page ${logs_state.page} — ${logs_state.total} entrées`;
  }

  function fetchFileLogs() {
    socket.emit("admin:getFileLogs", {
      page: logs_state.page,
      pageSize: logs_state.pageSize,
    });
  }

  // initial load
  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("refresh-shared-files-btn");
    if (btn)
      btn.addEventListener("click", () => {
        sf_state.page = 1;
        fetchSharedFiles();
      });
    const modal = document.getElementById("file-preview-modal");
    if (modal)
      modal.addEventListener("click", (e) => {
        if (
          e.target.id === "file-preview-modal" ||
          e.target.id === "file-preview-close"
        )
          hidePreview();
      });

    // filter controls
    const applyBtn = document.getElementById("apply-filter-shared-files");
    const filterInput = document.getElementById("filter-shared-files");
    const pageSizeSel = document.getElementById("shared-files-page-size");
    if (applyBtn && filterInput)
      applyBtn.addEventListener("click", () => {
        sf_state.filter = filterInput.value || "";
        sf_state.page = 1;
        fetchSharedFiles();
      });
    if (pageSizeSel)
      pageSizeSel.addEventListener("change", () => {
        sf_state.pageSize = parseInt(pageSizeSel.value, 10) || 50;
        sf_state.page = 1;
        fetchSharedFiles();
      });

    // pagination buttons
    document
      .getElementById("first-page-shared-files")
      .addEventListener("click", () => {
        sf_state.page = 1;
        fetchSharedFiles();
      });
    document
      .getElementById("prev-page-shared-files")
      .addEventListener("click", () => {
        if (sf_state.page > 1) sf_state.page--;
        fetchSharedFiles();
      });
    document
      .getElementById("next-page-shared-files")
      .addEventListener("click", () => {
        const max = Math.ceil((sf_state.total || 0) / sf_state.pageSize) || 1;
        if (sf_state.page < max) sf_state.page++;
        fetchSharedFiles();
      });
    document
      .getElementById("last-page-shared-files")
      .addEventListener("click", () => {
        sf_state.page =
          Math.ceil((sf_state.total || 0) / sf_state.pageSize) || 1;
        fetchSharedFiles();
      });

    // file logs controls
    const refreshLogsBtn = document.getElementById("refresh-file-logs-btn");
    const logsPageSize = document.getElementById("file-logs-page-size");
    if (refreshLogsBtn)
      refreshLogsBtn.addEventListener("click", () => {
        logs_state.page = 1;
        fetchFileLogs();
      });
    if (logsPageSize)
      logsPageSize.addEventListener("change", () => {
        logs_state.pageSize = parseInt(logsPageSize.value, 10) || 50;
        logs_state.page = 1;
        fetchFileLogs();
      });
    document.getElementById("prev-file-logs").addEventListener("click", () => {
      if (logs_state.page > 1) {
        logs_state.page--;
        fetchFileLogs();
      }
    });
    document.getElementById("next-file-logs").addEventListener("click", () => {
      const max = Math.ceil((logs_state.total || 0) / logs_state.pageSize) || 1;
      if (logs_state.page < max) {
        logs_state.page++;
        fetchFileLogs();
      }
    });

    // initial fetch
    fetchSharedFiles();
    fetchFileLogs();
  });
})();
