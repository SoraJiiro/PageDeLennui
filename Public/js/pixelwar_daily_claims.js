const CLAIM_BUTTONS = [
  {
    id: "daily-claim-clicks",
    type: "clicks",
  },
  {
    id: "daily-claim-pixels",
    type: "pixels",
  },
  {
    id: "daily-claim-tokens",
    type: "tokens",
  },
];

function normalizeClaims(claims) {
  return {
    clicks: !!claims?.clicks,
    pixels: !!claims?.pixels,
    tokens: !!claims?.tokens,
  };
}

export function createPixelWarDailyClaimsController(socket) {
  const state = {
    claims: normalizeClaims({}),
  };

  function getButton(def) {
    return document.getElementById(def.id);
  }

  function ensureBaseHtml(btn) {
    if (!btn) return;
    if (!btn.dataset.claimBaseHtml) {
      btn.dataset.claimBaseHtml = btn.innerHTML;
    }
  }

  function renderButton(def) {
    const btn = getButton(def);
    if (!btn) return;

    ensureBaseHtml(btn);

    const claimed = !!state.claims[def.type];
    const nextDisabled = claimed;
    const baseHtml = btn.dataset.claimBaseHtml || btn.innerHTML;
    const nextHtml = claimed
      ? `${baseHtml} <span class="claim-status">(récupéré)</span>`
      : baseHtml;

    if (btn.disabled !== nextDisabled) {
      btn.disabled = nextDisabled;
    }

    if (btn.innerHTML !== nextHtml) {
      btn.innerHTML = nextHtml;
    }
  }

  function refresh() {
    CLAIM_BUTTONS.forEach((def) => renderButton(def));
  }

  function bind() {
    CLAIM_BUTTONS.forEach((def) => {
      const btn = getButton(def);
      if (!btn) return;
      ensureBaseHtml(btn);
      btn.onclick = () => socket.emit("pixelwar:daily_claim", def.type);
    });
  }

  function setClaims(claims) {
    state.claims = normalizeClaims(claims);
    refresh();
  }

  return {
    bind,
    refresh,
    setClaims,
  };
}
