document.addEventListener("DOMContentLoaded", () => {
  const grid = document.getElementById("shop-grid");
  if (!grid) return;

  const searchInput = document.getElementById("shop-search");
  const countEl = document.getElementById("shop-count");
  const balanceEl = document.getElementById("shop-balance");
  const shopEmpty = document.getElementById("shop-empty");

  const cartList = document.getElementById("cart-list");
  const cartEmpty = document.getElementById("cart-empty");
  const cartTotal = document.getElementById("cart-total");
  const cartCount = document.getElementById("cart-count");
  const checkoutBtn = document.getElementById("checkout-btn");
  const cartNote = document.getElementById("cart-note");
  const cartNoteDefault = cartNote ? cartNote.textContent : "";
  const catalog = document.querySelector(".shop-catalog");
  const personalizationModal = document.querySelector(".personalization-modal");
  const badgeNameInput = document.getElementById("user-badge-name");
  const badgeEmojiInput = document.getElementById("user-badge-emoji");
  const modalCancelBtn = document.getElementById("modal-cancel-btn");
  const modalConfirmBtn = document.getElementById("modal-confirm-btn");
  const badgeStatusEl = document.getElementById("custom-badge-status");

  let cards = [];
  const cart = new Map();
  let balance = 0;
  let ownedIds = new Set();
  let personalizeBtn = null;
  let pendingCustomRequest = null;
  let lastCustomDecision = null;
  let socket = null;
  let customStatusTimer = null;
  const CART_STORAGE_KEY = "pde_shop_cart_v1";
  let cartStorageKey = CART_STORAGE_KEY;
  let catalogMap = new Map();

  function toNumber(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function formatPrice(value) {
    return `${value.toLocaleString("fr-FR")} C`;
  }

  function isRepeatableItem(item) {
    if (!item) return false;
    return item.type === "pixelwar" || item.type === "revive_life";
  }

  function canUseStorage() {
    try {
      return typeof window !== "undefined" && !!window.localStorage;
    } catch (e) {
      return false;
    }
  }

  function buildCartStorageKey(pseudo) {
    const p = String(pseudo || "")
      .trim()
      .toLowerCase();
    return p ? `${CART_STORAGE_KEY}:${p}` : CART_STORAGE_KEY;
  }

  function updateCartStorageKey(pseudo) {
    const nextKey = buildCartStorageKey(pseudo);
    if (nextKey === cartStorageKey) return;
    if (canUseStorage()) {
      const existing = window.localStorage.getItem(nextKey);
      if (!existing && cartStorageKey) {
        const prev = window.localStorage.getItem(cartStorageKey);
        if (prev) {
          window.localStorage.setItem(nextKey, prev);
          if (cartStorageKey !== CART_STORAGE_KEY) {
            window.localStorage.removeItem(cartStorageKey);
          }
        }
      }
    }
    cartStorageKey = nextKey;
    saveCartToStorage();
  }

  function saveCartToStorage() {
    if (!canUseStorage()) return;
    const items = Array.from(cart.values()).map((entry) => {
      const qty = Math.max(1, Math.floor(Number(entry.qty) || 1));
      return { id: entry.id, qty: entry.repeatable ? qty : 1 };
    });
    if (!items.length) {
      window.localStorage.removeItem(cartStorageKey);
      return;
    }
    const payload = { items, savedAt: Date.now() };
    window.localStorage.setItem(cartStorageKey, JSON.stringify(payload));
  }

  function restoreCartFromStorage(catalogMap, { force = false } = {}) {
    if (!canUseStorage()) return;
    if (!force && cart.size > 0) return;
    if (force) cart.clear();
    const raw = window.localStorage.getItem(cartStorageKey);
    if (!raw) return;

    try {
      const payload = JSON.parse(raw);
      const items = Array.isArray(payload?.items) ? payload.items : [];
      items.forEach((entry) => {
        const id = String(entry?.id || "").trim();
        if (!id) return;
        const item = catalogMap.get(id);
        if (!item || item.available === false) return;

        const repeatable = isRepeatableItem(item);
        const qty = repeatable
          ? Math.max(1, Math.floor(Number(entry.qty) || 1))
          : 1;

        cart.set(id, {
          id,
          name: item.name || "Badge",
          emoji: item.emoji || "🏷️",
          price: toNumber(item.price),
          type: item.type || "",
          amount: item.amount != null ? String(item.amount) : "",
          upgrade: item.upgrade || "",
          repeatable,
          qty,
        });
      });
    } catch (e) {
      window.localStorage.removeItem(cartStorageKey);
    }
  }

  function setBalance(value) {
    balance = Math.max(0, Number.isFinite(value) ? value : 0);
    if (balanceEl) balanceEl.textContent = formatPrice(balance);
  }

  function initSocket() {
    if (typeof window === "undefined" || typeof window.io !== "function") {
      return;
    }
    socket = window.io();

    socket.on("connect", () => {
      socket.emit("clicker:sync");
    });

    socket.on("clicker:you", (payload) => {
      const next = Number(payload && payload.score);
      if (Number.isFinite(next)) {
        setBalance(next);
        syncCardStates();
        updateCartUI();
      }
    });

    socket.on("system:info", (message) => {
      if (typeof message === "string" && message.trim()) {
        showNotice(message, "info");
      }
    });

    socket.on("customBadge:status", (payload) => {
      if (!payload || typeof payload.status !== "string") return;
      pendingCustomRequest = null;
      lastCustomDecision = {
        status: payload.status,
        badgeId: payload.badgeId || null,
        reason: payload.reason || null,
        processedAt: payload.processedAt || null,
      };
      if (Number.isFinite(payload.balance)) {
        setBalance(payload.balance);
      }
      syncPersonalizeButton();
      renderCustomBadgeStatus();
    });
  }

  function showNotice(message, type = "info") {
    if (window.showStatusNotification) {
      window.showStatusNotification(message, type);
      return;
    }
    alert(message);
  }

  function setAvailability(card, text, className) {
    const label = card.querySelector(".availability");
    if (!label) return;
    label.textContent = text;
    label.classList.remove("state-owned", "state-locked", "state-unavailable");
    if (className) label.classList.add(className);
  }

  function setCartButton(card, { text, added, disabled }) {
    const button = card.querySelector(".add-to-cart");
    if (!button) return;
    button.textContent = text;
    button.classList.toggle("is-added", !!added);
    button.disabled = !!disabled;
  }

  function syncCardStates() {
    let cartChanged = false;

    cards.forEach((card) => {
      const id = card.dataset.badgeId;
      const price = toNumber(card.dataset.price);
      const isAvailable = card.dataset.available !== "false";
      const inCart = cart.has(id);
      const repeatable = card.dataset.repeatable === "true";

      card.classList.remove("is-owned", "is-locked", "is-unavailable");

      if (!repeatable && ownedIds.has(id)) {
        card.classList.add("is-owned");
        setAvailability(card, "Possede", "state-owned");
        setCartButton(card, { text: "Possede", added: false, disabled: true });
        if (inCart) {
          cart.delete(id);
          cartChanged = true;
        }
        return;
      }

      if (!isAvailable) {
        card.classList.add("is-unavailable");
        setAvailability(card, "Indisponible", "state-unavailable");
        setCartButton(card, {
          text: "Indisponible",
          added: false,
          disabled: true,
        });
        if (inCart && !repeatable) {
          cart.delete(id);
          cartChanged = true;
        }
        return;
      }

      if (price > balance) {
        card.classList.add("is-locked");
        setAvailability(card, "Trop cher", "state-locked");
        setCartButton(card, {
          text: "Trop cher",
          added: false,
          disabled: true,
        });
        if (inCart && !repeatable) {
          cart.delete(id);
          cartChanged = true;
        }
        return;
      }

      setAvailability(card, "Disponible", null);
      if (repeatable) {
        setCartButton(card, {
          text: "Ajouter +",
          added: false,
          disabled: false,
        });
      } else {
        setCartButton(card, {
          text: inCart ? "Retirer" : "Ajouter",
          added: inCart,
          disabled: false,
        });
      }
    });

    if (cartChanged) updateCartUI();
  }

  function applyFilters() {
    const query = (searchInput ? searchInput.value : "").trim().toLowerCase();
    let visibleCount = 0;

    cards.forEach((card) => {
      const name = (card.dataset.name || "").toLowerCase();
      const desc = (card.dataset.desc || "").toLowerCase();

      const matchesQuery =
        !query || name.includes(query) || desc.includes(query);

      const shouldShow = matchesQuery;

      card.classList.toggle("is-hidden", !shouldShow);
      if (shouldShow) visibleCount += 1;
    });

    if (countEl)
      countEl.textContent =
        String(visibleCount) + (visibleCount > 1 ? " articles" : " article");
    if (shopEmpty) {
      shopEmpty.style.display = visibleCount === 0 ? "block" : "none";
    }
  }

  function buildCard(item) {
    const article = document.createElement("article");
    article.className = "badge-card";
    article.dataset.badgeId = item.id;
    article.dataset.name = item.name;
    article.dataset.price = String(item.price);
    article.dataset.available = String(Boolean(item.available));
    article.dataset.emoji = item.emoji;
    article.dataset.desc = item.desc || "Badge cosmetique exclusif.";
    article.dataset.type = item.type || "";
    article.dataset.amount = item.amount != null ? String(item.amount) : "";
    article.dataset.upgrade = item.upgrade || "";
    article.dataset.repeatable = String(isRepeatableItem(item));

    const availability = item.available ? "Disponible" : "Indisponible";

    article.innerHTML = `
      <div class="badge-top">
        <span class="badge-emoji">${item.emoji || "🏷️"}</span>
      </div>
      <h3>${item.name}</h3>
      <p>${item.desc || "Badge cosmetique exclusif."}</p>
      <div class="badge-price">
        <span>${formatPrice(item.price)}</span>
        <span class="availability">${availability}</span>
      </div>
      <div class="card-actions">
        <button class="add-to-cart">Ajouter</button>
      </div>
    `;

    return article;
  }

  function bindCardEvents() {
    cards.forEach((card) => {
      const cartBtn = card.querySelector(".add-to-cart");
      if (cartBtn && !cartBtn.disabled) {
        cartBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          toggleCart(card);
        });
      }
    });
  }

  function renderCatalog(items) {
    const list = Array.isArray(items) ? items : [];
    const valid = list.filter((item) => item && item.id);
    catalogMap = new Map(valid.map((item) => [item.id, item]));

    grid.innerHTML = "";
    valid.forEach((item) => grid.appendChild(buildCard(item)));
    cards = Array.from(grid.querySelectorAll(".badge-card"));

    const validIds = new Set(valid.map((item) => item.id));
    Array.from(cart.keys()).forEach((id) => {
      if (!validIds.has(id)) cart.delete(id);
    });

    if (shopEmpty) {
      shopEmpty.style.display = valid.length === 0 ? "block" : "none";
    }

    restoreCartFromStorage(catalogMap);
    bindCardEvents();
    syncCardStates();
    applyFilters();
    updateCartUI();

    if (catalog && !catalog.querySelector(".badge-personalizer-container")) {
      const personalizerInner = `
                    <button id="personalize-badge-btn" class="btn">
                        <i class="fa-solid fa-pen"></i> Personnaliser
                        un badge
                    </button>`;
      const personalizerDiv = document.createElement("div");
      personalizerDiv.className = "badge-personalizer-container";
      personalizerDiv.innerHTML = personalizerInner;

      catalog.insertBefore(personalizerDiv, catalog.firstChild);
    }

    personalizeBtn = document.getElementById("personalize-badge-btn");
    if (personalizeBtn) {
      personalizeBtn.addEventListener("click", openPersonalizationModal);
      syncPersonalizeButton();
    }
  }

  function updateCartUI() {
    if (!cartList || !cartTotal || !cartCount || !cartEmpty) {
      saveCartToStorage();
      return;
    }
    cartList.innerHTML = "";

    let total = 0;
    let totalQty = 0;

    cart.forEach((item) => {
      const qty = Math.max(1, Math.floor(Number(item.qty) || 1));
      total += item.price * qty;
      totalQty += qty;
      const li = document.createElement("li");
      li.className = "cart-item";
      if (item.repeatable) {
        li.innerHTML = `
          <span>${item.name} x${qty}</span>
          <div class="cart-qty">
            <button type="button" data-action="dec" data-id="${item.id}">-</button>
            <span>${qty}</span>
            <button type="button" data-action="inc" data-id="${item.id}">+</button>
          </div>
        `;
      } else {
        li.innerHTML = `
          <span>${item.name}</span>
          <button type="button" data-remove="${item.id}">Retirer</button>
        `;
      }
      cartList.appendChild(li);
    });

    const overBudget = total > balance;

    cartTotal.textContent = formatPrice(total);
    cartCount.textContent = String(totalQty);
    cartEmpty.style.display = cart.size ? "none" : "block";

    if (checkoutBtn) checkoutBtn.disabled = cart.size === 0 || overBudget;
    if (cartNote) {
      cartNote.textContent = overBudget
        ? "Solde insuffisant pour valider l'achat."
        : cartNoteDefault;
      cartNote.classList.toggle("is-warning", overBudget);
    }
    saveCartToStorage();
  }

  function toggleCart(card) {
    const id = card.dataset.badgeId;
    if (!id) return;
    const repeatable = card.dataset.repeatable === "true";

    const button = card.querySelector(".add-to-cart");
    if (repeatable) {
      const entry = cart.get(id);
      if (entry) {
        entry.qty = Math.max(1, Math.floor(Number(entry.qty) || 1)) + 1;
      } else {
        cart.set(id, {
          id,
          name: card.dataset.name || "Badge",
          emoji: card.dataset.emoji || "🏷️",
          price: toNumber(card.dataset.price),
          type: card.dataset.type || "",
          amount: card.dataset.amount || "",
          upgrade: card.dataset.upgrade || "",
          repeatable: true,
          qty: 1,
        });
      }
    } else if (cart.has(id)) {
      cart.delete(id);
      if (button) {
        button.classList.remove("is-added");
        button.textContent = "Ajouter";
      }
    } else {
      cart.set(id, {
        id,
        name: card.dataset.name || "Badge",
        emoji: card.dataset.emoji || "🏷️",
        price: toNumber(card.dataset.price),
        type: card.dataset.type || "",
        amount: card.dataset.amount || "",
        upgrade: card.dataset.upgrade || "",
        repeatable: false,
        qty: 1,
      });
      if (button) {
        button.classList.add("is-added");
        button.textContent = "Retirer";
      }
    }

    updateCartUI();
    syncCardStates();
  }

  async function handleCheckout() {
    if (cart.size === 0) {
      showNotice("Ajoute au moins un article avant de valider.", "error");
      return;
    }

    if (checkoutBtn) checkoutBtn.disabled = true;

    try {
      const items = Array.from(cart.values()).map((item) => {
        const qty = Math.max(1, Math.floor(Number(item.qty) || 1));
        if (item.repeatable && qty > 1) {
          return { id: item.id, qty };
        }
        return item.id;
      });

      const res = await fetch("/api/profile/shop/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        showNotice(data.message || "Achat impossible.", "error");
        if (Number.isFinite(data.balance)) setBalance(data.balance);
        syncCardStates();
        updateCartUI();
        return;
      }

      if (Number.isFinite(data.balance)) setBalance(data.balance);
      if (Array.isArray(data.assignedIds)) {
        ownedIds = new Set(data.assignedIds);
      } else if (Array.isArray(data.purchasedIds)) {
        data.purchasedIds.forEach((id) => ownedIds.add(id));
      }

      cart.clear();
      saveCartToStorage();
      showNotice("Achat confirme.", "success");
      syncCardStates();
      updateCartUI();
    } catch (e) {
      showNotice("Erreur reseau. Reessaie plus tard.", "error");
      updateCartUI();
    }
  }

  function syncPersonalizeButton() {
    if (!personalizeBtn) return;
    if (pendingCustomRequest) {
      personalizeBtn.disabled = true;
      personalizeBtn.textContent = "Demande en cours";
      startCustomStatusPolling();
      return;
    }
    personalizeBtn.disabled = false;
    personalizeBtn.innerHTML =
      '<i class="fa-solid fa-pen"></i> Personnaliser un badge';
    stopCustomStatusPolling();
  }

  function startCustomStatusPolling() {
    if (customStatusTimer) return;
    customStatusTimer = window.setInterval(() => {
      loadCustomBadgeStatus();
    }, 2000);
  }

  function stopCustomStatusPolling() {
    if (!customStatusTimer) return;
    window.clearInterval(customStatusTimer);
    customStatusTimer = null;
  }

  function renderCustomBadgeStatus() {
    if (!badgeStatusEl) return;
    badgeStatusEl.classList.remove("is-approved", "is-rejected");

    if (pendingCustomRequest) {
      badgeStatusEl.textContent = "Demande en attente de validation.";
      return;
    }

    if (lastCustomDecision && lastCustomDecision.status === "approved") {
      badgeStatusEl.textContent = "Derniere demande acceptee par un admin.";
      badgeStatusEl.classList.add("is-approved");
      return;
    }

    if (lastCustomDecision && lastCustomDecision.status === "rejected") {
      badgeStatusEl.textContent = "Derniere demande refusee par un admin.";
      badgeStatusEl.classList.add("is-rejected");
      return;
    }

    badgeStatusEl.textContent = "";
  }

  function openPersonalizationModal() {
    if (!personalizationModal) return;
    renderCustomBadgeStatus();
    personalizationModal.classList.add("is-open");
    if (badgeNameInput) badgeNameInput.focus();
  }

  function closePersonalizationModal() {
    if (!personalizationModal) return;
    personalizationModal.classList.remove("is-open");
  }

  async function submitCustomBadgeRequest() {
    const name = (badgeNameInput ? badgeNameInput.value : "").trim();
    const emoji = (badgeEmojiInput ? badgeEmojiInput.value : "").trim();

    if (!name || name.length > 32) {
      showNotice("Nom invalide (1-32 caracteres).", "error");
      return;
    }
    if (!emoji || emoji.length > 10) {
      showNotice("Emoji invalide.", "error");
      return;
    }

    if (modalConfirmBtn) modalConfirmBtn.disabled = true;

    try {
      const res = await fetch("/api/profile/badges/custom/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, emoji }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        showNotice(data.message || "Demande impossible.", "error");
        if (Number.isFinite(data.balance)) setBalance(data.balance);
        return;
      }

      pendingCustomRequest = data.request || { name, emoji };
      if (Number.isFinite(data.balance)) setBalance(data.balance);
      showNotice("Demande envoyee. Validation admin requise.", "success");
      renderCustomBadgeStatus();
      if (badgeNameInput) badgeNameInput.value = "";
      if (badgeEmojiInput) badgeEmojiInput.value = "";
      closePersonalizationModal();
      syncPersonalizeButton();
    } catch (e) {
      showNotice("Erreur reseau. Reessaie plus tard.", "error");
    } finally {
      if (modalConfirmBtn) modalConfirmBtn.disabled = false;
    }
  }

  async function loadProfile() {
    try {
      const res = await fetch("/api/profile/me", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const clicks = Number(data?.stats?.clicks || 0);
      setBalance(clicks);

      if (data?.pseudo) {
        updateCartStorageKey(data.pseudo);
        if (catalogMap.size) {
          restoreCartFromStorage(catalogMap, { force: true });
        }
      }

      const assignedIds = data?.badges?.assignedIds || [];
      if (Array.isArray(assignedIds)) {
        ownedIds = new Set(assignedIds.map((id) => String(id || "")));
      }
    } catch (e) {
      showNotice("Impossible de charger ton solde.", "error");
    } finally {
      syncCardStates();
      updateCartUI();
    }
  }

  async function loadCustomBadgeStatus() {
    try {
      const res = await fetch("/api/profile/badges/custom/status", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      pendingCustomRequest = data && data.hasPending ? data.request : null;
      lastCustomDecision = data && data.lastDecision ? data.lastDecision : null;
      syncPersonalizeButton();
      renderCustomBadgeStatus();
    } catch (e) {
      syncPersonalizeButton();
      renderCustomBadgeStatus();
    }
  }

  async function loadCatalog() {
    try {
      const res = await fetch("/api/shop/catalog", { cache: "no-store" });
      if (!res.ok) throw new Error("catalog");
      const data = await res.json();
      renderCatalog(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      showNotice("Impossible de charger le shop.", "error");
      renderCatalog([]);
    }
  }

  if (cartList) {
    cartList.addEventListener("click", (event) => {
      const actionBtn = event.target.closest("button[data-action]");
      if (actionBtn) {
        const id = actionBtn.dataset.id;
        const entry = id ? cart.get(id) : null;
        if (!entry) return;
        const action = actionBtn.dataset.action;
        if (action === "inc") {
          entry.qty = Math.max(1, Math.floor(Number(entry.qty) || 1)) + 1;
          updateCartUI();
          syncCardStates();
          return;
        }
        if (action === "dec") {
          const nextQty = Math.max(1, Math.floor(Number(entry.qty) || 1)) - 1;
          if (nextQty <= 0) {
            cart.delete(id);
          } else {
            entry.qty = nextQty;
          }
          updateCartUI();
          syncCardStates();
          return;
        }
        return;
      }

      const button = event.target.closest("button[data-remove]");
      if (!button) return;
      const id = button.dataset.remove;
      const entry = id ? cart.get(id) : null;
      if (entry && entry.repeatable) {
        cart.delete(id);
        updateCartUI();
        syncCardStates();
        return;
      }
      const card = cards.find((item) => item.dataset.badgeId === id);
      if (card) toggleCart(card);
    });
  }

  if (checkoutBtn) {
    checkoutBtn.addEventListener("click", handleCheckout);
  }

  if (modalCancelBtn) {
    modalCancelBtn.addEventListener("click", closePersonalizationModal);
  }

  if (modalConfirmBtn) {
    modalConfirmBtn.addEventListener("click", submitCustomBadgeRequest);
  }

  if (personalizationModal) {
    personalizationModal.addEventListener("click", (event) => {
      if (event.target === personalizationModal) {
        closePersonalizationModal();
      }
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", applyFilters);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && pendingCustomRequest) {
      loadCustomBadgeStatus();
    }
  });

  async function initPage() {
    initSocket();
    await loadCatalog();
    await loadProfile();
    await loadCustomBadgeStatus();
  }

  initPage();
});
