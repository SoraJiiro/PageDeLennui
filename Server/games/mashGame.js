const { FileService } = require("../util");
const { applyDailyProfitCap } = require("../services/economy");

class MashGame {
  constructor(broadcastSystemMsg) {
    this.broadcastSystemMsgCallback = broadcastSystemMsg;

    this.players = [];
    this.spectators = [];
    this.bets = [];

    this.gameState = "waiting";
    this.scores = { red: 0, blue: 0 };
    this.MAX_SCORE = 100;
    this.phaseEndTime = 0;

    this.bettingTimeout = null;

    this.emitState = null;
    this.onPayout = null;
  }

  setEmitter(fn) {
    this.emitState = fn;
  }

  setPayoutCallback(fn) {
    this.onPayout = fn;
  }

  setSystemMsgCallback(fn) {
    this.broadcastSystemMsgCallback = fn;
  }

  broadcastState() {
    if (this.emitState) this.emitState(this.getState());
  }

  broadcastSystem(msg) {
    if (this.broadcastSystemMsgCallback) this.broadcastSystemMsgCallback(msg);
  }

  join(socket, pseudo) {
    const socketId = socket.id;

    let existingPlayer = this.players.find((p) => p.pseudo === pseudo);
    if (existingPlayer) {
      existingPlayer.socketId = socketId;
      this.broadcastState();
      return;
    }

    let existingSpecIndex = this.spectators.findIndex(
      (s) => s.pseudo === pseudo
    );
    if (existingSpecIndex !== -1) {
      if (this.players.length < 2 && this.gameState === "waiting") {
        this.spectators.splice(existingSpecIndex, 1);
        this.addPlayer(socketId, pseudo);
      } else {
        this.spectators[existingSpecIndex].socketId = socketId;
        this.broadcastState();
      }
      return;
    }

    if (this.players.length < 2 && this.gameState === "waiting") {
      this.addPlayer(socketId, pseudo);
    } else {
      this.addSpectator(socketId, pseudo);
    }
  }

  addPlayer(socketId, pseudo) {
    let team = "red";
    if (this.players.length > 0) {
      if (this.players[0].team === "red") team = "blue";
    }

    this.players.push({
      socketId,
      pseudo,
      score: 0,
      team,
      mashKey: "k",
    });

    this.broadcastState();

    if (this.players.length === 2) {
      this.startBettingPhase();
    }
  }

  addSpectator(socketId, pseudo) {
    this.spectators.push({ socketId, pseudo });
    this.broadcastState();
  }

  removePlayerBySocket(socketId) {
    const p = this.players.find((p) => p.socketId === socketId);
    if (p) {
      this.leaveLogic(socketId, p.pseudo);
      return;
    }
    const s = this.spectators.find((s) => s.socketId === socketId);
    if (s) {
      this.leaveLogic(socketId, s.pseudo);
    }
  }

  leave(socket, pseudo) {
    this.leaveLogic(socket.id, pseudo, socket);
  }

  leaveLogic(socketId, pseudo, socketObj = null) {
    const pIndex = this.players.findIndex((p) => p.pseudo === pseudo);
    if (pIndex !== -1) {
      const leaver = this.players[pIndex];
      this.players.splice(pIndex, 1);

      if (this.gameState !== "waiting") {
        this.terminateGame("player_disconnect", leaver.pseudo);
      } else {
        this.broadcastState();
      }

      if (socketObj) {
        try {
          socketObj.emit("mash:state", this.getState());
        } catch (e) {}
      }
      return;
    }

    const sIndex = this.spectators.findIndex((s) => s.pseudo === pseudo);
    if (sIndex !== -1) {
      this.spectators.splice(sIndex, 1);
      this.broadcastState();
      if (socketObj) {
        try {
          socketObj.emit("mash:state", this.getState());
        } catch (e) {}
      }
    }
  }

  setMashKey(pseudo, key) {
    const p = this.players.find((p) => p.pseudo === pseudo);
    if (p) {
      p.mashKey = key.toLowerCase();
    }
  }

  placeBet(pseudo, betOn, amount) {
    if (this.gameState !== "betting") return false;

    // 1 pari max par joueur et par manche
    if (this.bets.some((b) => b.pseudo === pseudo)) return false;

    if (!amount || amount <= 0) return false;

    const userClicks = FileService.data.clicks[pseudo] || 0;
    if (userClicks < amount) return false;

    const maxBet = Math.floor(userClicks * 0.25);
    if (amount > maxBet) return false;

    const target = this.players.find((p) => p.pseudo === betOn);
    if (!target) return false;

    FileService.data.clicks[pseudo] = userClicks - amount;
    FileService.save("clicks", FileService.data.clicks);

    this.bets.push({ pseudo, betOn, amount });
    return true;
  }

  startBettingPhase() {
    this.gameState = "betting";
    this.scores = { red: 0, blue: 0 };
    this.bets = [];
    this.phaseEndTime = Date.now() + 10000;

    this.broadcastState();
    this.broadcastSystem("Les paris sont ouverts ! (10 secondes)");

    if (this.bettingTimeout) clearTimeout(this.bettingTimeout);

    this.bettingTimeout = setTimeout(() => {
      this.bettingTimeout = null;
      if (this.players.length < 2) {
        if (this.gameState === "betting") {
          this.terminateGame("player_disconnect");
        }
        return;
      }
      this.startPlayingPhase();
    }, 10000);
  }

  startPlayingPhase() {
    this.gameState = "playing";
    this.phaseEndTime = 0;
    this.broadcastState();
    this.broadcastSystem("MASH START ! SPAMMEZ VOTRE TOUCHE !");
  }

  handleMash(pseudo, key) {
    if (this.gameState !== "playing") return;

    const p = this.players.find((p) => p.pseudo === pseudo);
    if (!p) return;

    if (key.toLowerCase() === p.mashKey) {
      this.scores[p.team]++;

      if (this.scores[p.team] >= this.MAX_SCORE) {
        this.endGame(p);
      } else {
        this.broadcastState();
      }
    }
  }

  endGame(winner) {
    this.gameState = "finished";
    this.scores[winner.team] = this.MAX_SCORE;

    FileService.data.mashWins[winner.pseudo] =
      (FileService.data.mashWins[winner.pseudo] || 0) + 1;
    FileService.save("mashWins", FileService.data.mashWins);

    this.broadcastSystem(`VICTOIRE DE ${winner.pseudo.toUpperCase()} !`);

    const winningPseudo = winner.pseudo;
    const winningTeam = winner.team;

    const winnersMsg = [];
    this.bets.forEach((bet) => {
      // betOn est normalement un pseudo (client), mais on accepte aussi l'ancien format (team)
      let betTargetTeam = null;
      if (bet.betOn === "red" || bet.betOn === "blue") {
        betTargetTeam = bet.betOn;
      } else {
        const target = this.players.find((p) => p.pseudo === bet.betOn);
        betTargetTeam = target ? target.team : null;
      }

      const isWinningBet =
        bet.betOn === winningPseudo || betTargetTeam === winningTeam;

      if (isWinningBet) {
        const currentClicks = FileService.data.clicks[bet.pseudo] || 0;
        const capInfo = applyDailyProfitCap({
          FileService,
          pseudo: bet.pseudo,
          profit: bet.amount,
          currentClicks,
        });

        const credit = bet.amount + capInfo.allowedProfit; // stake + profit (cap)
        FileService.data.clicks[bet.pseudo] = currentClicks + credit;
        winnersMsg.push(`${bet.pseudo} (+${capInfo.allowedProfit})`);
        if (this.onPayout)
          this.onPayout(bet.pseudo, FileService.data.clicks[bet.pseudo]);
      }
    });

    if (winnersMsg.length > 0) {
      FileService.save("clicks", FileService.data.clicks);
      this.broadcastSystem(`Gagnants paris : ${winnersMsg.join(", ")}`);
    }

    this.broadcastState();

    setTimeout(() => {
      this.resetGame();
    }, 3000);
  }

  terminateGame(reason, culprit) {
    if (this.bettingTimeout) {
      clearTimeout(this.bettingTimeout);
      this.bettingTimeout = null;
    }

    this.bets.forEach((bet) => {
      FileService.data.clicks[bet.pseudo] =
        (FileService.data.clicks[bet.pseudo] || 0) + bet.amount;

      if (this.onPayout)
        this.onPayout(bet.pseudo, FileService.data.clicks[bet.pseudo]);
    });
    if (this.bets.length > 0)
      FileService.save("clicks", FileService.data.clicks);

    this.gameState = "waiting";
    this.scores = { red: 0, blue: 0 };
    this.bets = [];

    if (reason === "player_disconnect") {
      this.broadcastSystem("Partie annulée (Joueur déconnecté).");
    }

    if (culprit) {
      const survivor = this.players.find((p) => p.pseudo !== culprit);
      if (survivor) {
        this.spectators.push({
          socketId: survivor.socketId,
          pseudo: survivor.pseudo,
        });
      }
    } else {
      this.players.forEach((p) => {
        this.spectators.push({ socketId: p.socketId, pseudo: p.pseudo });
      });
    }
    this.players = [];

    if (this.bettingTimeout) {
      clearTimeout(this.bettingTimeout);
      this.bettingTimeout = null;
    }
    this.broadcastState();
  }

  resetGame() {
    this.gameState = "waiting";
    this.scores = { red: 0, blue: 0 };
    this.bets = [];

    this.players.forEach((p) => {
      this.spectators.push({ socketId: p.socketId, pseudo: p.pseudo });
    });
    this.players = [];

    this.broadcastState();
  }

  getState() {
    return {
      gameState: this.gameState,
      players: this.players.map((p) => ({
        pseudo: p.pseudo,
        team: p.team,
        score: p.score,
        mashKey: p.mashKey,
      })),
      scores: this.scores,
      spectatorCount: this.spectators.length,
      phaseEndTime: this.phaseEndTime,
    };
  }
}

module.exports = MashGame;
