            let socket = null;
            let currentPseudo = "";
            let currentMyBet = null;

            function fmtDuration(ms) {
                const total = Math.max(0, Math.floor(Number(ms) || 0));
                const sec = Math.floor(total / 1000);
                const h = Math.floor(sec / 3600);
                const m = Math.floor((sec % 3600) / 60);
                const s = sec % 60;
                if (h > 0) {
                    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
                }
                return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
            }

            function fmtElapsedMinutesHM(totalMinutes) {
                const total = Math.max(0, Math.floor(Number(totalMinutes) || 0));
                const h = Math.floor(total / 60);
                const m = total % 60;
                return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
            }

            function fmtMoney(n) {
                return Math.max(0, Math.floor(Number(n) || 0)).toLocaleString("fr-FR");
            }

            function fmtShortDuration(ms) {
                const total = Math.max(0, Math.floor(Number(ms) || 0));
                const sec = Math.floor(total / 1000);
                const m = Math.floor(sec / 60);
                const s = sec % 60;
                return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
            }

            function bindBetForm(activeWar) {
                const submit = async (clan) => {
                    const amountInput = document.getElementById("betAmountInput");
                    const msgEl = document.getElementById("betMessage");
                    if (!amountInput || !msgEl) return;

                    const amount = Math.floor(Number(amountInput.value) || 0);
                    if (amount <= 0) {
                        msgEl.textContent = "Montant invalide.";
                        msgEl.className = "bet-message bet-error";
                        return;
                    }
                    if (amount < 2500) {
                        msgEl.textContent = "Mise minimale: 2500 monnaie.";
                        msgEl.className = "bet-message bet-error";
                        return;
                    }

                    msgEl.textContent = "Pari en cours...";
                    msgEl.className = "bet-message";

                    try {
                        const res = await fetch("/api/guerre-clans/bet", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ clan, amount })
                        });
                        const data = await res.json().catch(() => ({}));

                        if (!res.ok || !data?.ok) {
                            msgEl.textContent = data?.message || "Pari refuse.";
                            msgEl.className = "bet-message bet-error";
                            return;
                        }

                        currentMyBet = data?.myBet || { pseudo: currentPseudo, clan, amount };
                        msgEl.textContent = data?.message || "Pari enregistre.";
                        msgEl.className = "bet-message bet-success";

                        renderActiveWar(data?.activeWar || activeWar);
                    } catch (e) {
                        msgEl.textContent = "Erreur reseau pendant le pari.";
                        msgEl.className = "bet-message bet-error";
                    }
                };

                const slamBtn = document.getElementById("betSlamBtn");
                const sisrBtn = document.getElementById("betSisrBtn");
                if (slamBtn) slamBtn.onclick = () => submit("SLAM");
                if (sisrBtn) sisrBtn.onclick = () => submit("SISR");
            }

            function renderActiveWar(activeWar) {
                const root = document.getElementById("activeWarCard");
                if (!root) return;

                if (!activeWar) {
                    currentMyBet = null;
                    root.innerHTML = '<div class="war-empty">Aucune guerre active.</div>';
                    return;
                }

                const slam = Number(activeWar?.clanScores?.SLAM || 0);
                const sisr = Number(activeWar?.clanScores?.SISR || 0);
                const elapsed = fmtDuration(activeWar?.elapsedMs || 0);
                const contributors = Array.isArray(activeWar?.contributors)
                    ? activeWar.contributors.slice(0, 40)
                    : [];
                const winnerBadgeEmoji = activeWar?.winnerBadgeEmoji || "✪";
                const thisWarRewards = [
                    activeWar?.winnerBadgeName
                        ? `Badge gagnant: ${winnerBadgeEmoji} ${activeWar.winnerBadgeName}`
                        : `Badge gagnant: ${winnerBadgeEmoji}`,
                    "+12 500 monnaie pour chaque joueur du clan vainqueur",
                    "+1 niveau sur toutes les ameliorations clicker"
                ];
                const rewardsHtml = `
                   <b>Les joueurs du clan gagnant recevront :<br><br> <mark>${thisWarRewards.join("</mark><br><mark>")}</mark></b>
                `;
                const rewardsPEl = document.createElement("p");
                rewardsPEl.className = "war-rewards";
                rewardsPEl.innerHTML = rewardsHtml;
                const top3 = contributors.slice(0, 3);
                const slamRows = contributors
                    .filter((row) => row.clan === "SLAM")
                    .sort((a, b) => Number(b.gain || 0) - Number(a.gain || 0));
                const sisrRows = contributors
                    .filter((row) => row.clan === "SISR")
                    .sort((a, b) => Number(b.gain || 0) - Number(a.gain || 0));
                const betting = activeWar?.betting || {};
                const pools = betting?.pools || {};
                const myBet = currentMyBet;
                const canBet = Boolean(betting?.isOpen) && !myBet;

                const top3Html = top3.length
                    ? `
                        <div class="war-top3">
                            ${top3.map((row, idx) => `
                                <div class="war-top3-item">
                                    <div class="war-top3-rank">TOP ${idx + 1}</div>
                                    <div class="war-top3-name">${row.pseudo}</div>
                                    <div>[${row.clan}]</div>
                                    <div class="war-top3-score"><b>+${row.gain}</b></div>
                                </div>
                            `).join("")}
                        </div>
                    `
                    : '<div class="war-empty">Aucun score enregistre pour le moment.</div>';

                const renderClanRows = (rows) => {
                    if (!rows.length) {
                        return '<div class="war-empty">Aucun joueur</div>';
                    }
                    return rows.map((row, idx) => `
                        <div class="war-split-row">
                            <span>${idx + 1}. ${row.pseudo}</span>
                            <b>+${row.gain}</b>
                        </div>
                    `).join("");
                };

                root.innerHTML = `
                    <div class="war-duel">
                        <div class="war-team">
                            <div class="war-team-name">SLAM</div>
                            <div class="war-team-score">${slam}</div>
                        </div>
                        <div class="war-vs">VS</div>
                        <div class="war-team">
                            <div class="war-team-name">SISR</div>
                            <div class="war-team-score">${sisr}</div>
                        </div>
                    </div>
                    <div class="war-meta">
                        <span>Temps ecoule: ${elapsed}</span>
                        <span>Participants: ${Number(activeWar?.participantCount || 0)}</span>
                    </div>
                    <div class="war-bets-card">
                        <div class="war-bets-head">Paris (ouverts 10 minutes)</div>
                        <div class="war-bets-meta">
                            <span>Temps restant: ${betting?.isOpen ? fmtShortDuration(betting?.remainingMs || 0) : "ferme"}</span>
                            <span>Nb paris: ${Number(betting?.totalBets || 0)}</span>
                        </div>
                        <div class="war-bets-pools">
                            <div class="war-bet-pool"><span>Pool SLAM</span><b>${fmtMoney(pools?.SLAM || 0)}</b></div>
                            <div class="war-bet-pool"><span>Pool SISR</span><b>${fmtMoney(pools?.SISR || 0)}</b></div>
                        </div>
                        ${myBet
                            ? `<div class="bet-message bet-success">Ton pari: ${myBet.clan} (${fmtMoney(myBet.amount)} monnaie)</div>`
                            : canBet
                                ? `<div class="war-bet-form">
                                      <input id="betAmountInput" class="bet-amount-input" type="number" min="2500" step="1" placeholder="Montant en monnaie (min 2500)">
                                      <div class="bet-message">Mise min: 2500 • Mise max: 75% de ta monnaie actuelle</div>
                                      <div class="war-bet-actions">
                                          <button id="betSlamBtn" class="vote-btn">Parier SLAM</button>
                                          <button id="betSisrBtn" class="vote-btn">Parier SISR</button>
                                      </div>
                                      <div id="betMessage" class="bet-message"></div>
                                   </div>`
                                : `<div class="bet-message">Les paris sont fermes pour cette guerre.</div>`}
                    </div>
                    ${top3Html}
                    <div class="war-split">
                        <div class="war-split-col">
                            <div class="war-split-head">SLAM</div>
                            ${renderClanRows(slamRows)}
                        </div>
                        <div class="war-split-col">
                            <div class="war-split-head">SISR</div>
                            ${renderClanRows(sisrRows)}
                        </div>
                    </div>
                `;
                root.appendChild(rewardsPEl);
                if (canBet) bindBetForm(activeWar);
            }

            function renderHistory(history) {
                const root = document.getElementById("pastWarsList");
                if (!root) return;

                if (!Array.isArray(history) || history.length === 0) {
                    root.innerHTML = '<div class="empty-msg">Aucune guerre terminee.</div>';
                    return;
                }

                root.innerHTML = history.slice(0, 60).map((item) => {
                    const sSlam = Number(item?.scores?.SLAM || 0);
                    const sSisr = Number(item?.scores?.SISR || 0);
                    const winner = item?.winnerClan === "DRAW"
                        ? "Egalite"
                        : `Gagnant: ${item?.winnerClan || "-"}`;
                    const elapsedMinutes = Number(item?.elapsedMinutes || 0);
                    const elapsedHM = fmtElapsedMinutesHM(elapsedMinutes);

                    return `
                        <article class="survey-card">
                            <div class="survey-question">${winner}</div>
                            <div class="result-row">
                                <div class="result-label">
                                    <span>SLAM</span>
                                    <span>${sSlam}</span>
                                </div>
                                <div class="result-bar-bg">
                                    <div class="result-bar-fill" style="width:${(sSlam + sSisr) > 0 ? Math.round((sSlam / (sSlam + sSisr)) * 100) : 0}%"></div>
                                </div>
                            </div>
                            <div class="result-row">
                                <div class="result-label">
                                    <span>SISR</span>
                                    <span>${sSisr}</span>
                                </div>
                                <div class="result-bar-bg">
                                    <div class="result-bar-fill" style="width:${(sSlam + sSisr) > 0 ? Math.round((sSisr / (sSlam + sSisr)) * 100) : 0}%"></div>
                                </div>
                            </div>
                            <div class="survey-meta">
                                <span>Fin: ${new Date(item.endAt).toLocaleString()}</span>
                                <span>Duree: ${elapsedHM} • Participants: ${Number(item.participantCount || 0)}</span>
                            </div>
                        </article>
                    `;
                }).join("");
            }

            async function loadInitialState() {
                const res = await fetch("/api/guerre-clans/state");
                if (!res.ok) return;
                const data = await res.json();
                currentMyBet = data?.myBet || null;
                renderActiveWar(data?.activeWar || null);
                renderHistory(data?.history || []);
            }

            async function init() {
                const sessionRes = await fetch("/api/session");
                if (!sessionRes.ok) {
                    window.location.href = "/login";
                    return;
                }
                const session = await sessionRes.json();
                currentPseudo = String(session?.pseudo || "");

                socket = io({ query: { username: session.pseudo } });
                if (window.initUiColor) {
                    window.initUiColor(socket);
                }

                socket.on("clanwar:update", (active) => {
                    renderActiveWar(active || null);
                });

                socket.on("clanwar:history", (history) => {
                    renderHistory(history || []);
                });

                socket.on("clanwar:history:new", () => {
                    loadInitialState();
                });

                await loadInitialState();
                socket.emit("clanwar:get_state");
            }

            init().catch((e) => {
                console.error("guerre-clans init error", e);
            });
        

