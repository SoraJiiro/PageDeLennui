const { FileService } = require("./util");

class MashGame {
  constructor(broadcastSystemMsg) {
    this.broadcastSystemMsgCallback = broadcastSystemMsg;

    this.players = []; // { socketId, pseudo, score, team ('red'|'blue'), mashKey }
    this.spectators = []; // { socketId, pseudo }
    this.bets = []; // { pseudo, betOn, amount }

    this.gameState = "waiting"; // waiting, betting, playing
    this.scores = { red: 0, blue: 0 };
    this.MAX_SCORE = 100;
    this.phaseEndTime = 0;

    this.bettingTimeout = null;

    this.emitState = null; // Callback to broadcast state
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

    // 1. Check if user is already a player
    let existingPlayer = this.players.find((p) => p.pseudo === pseudo);
    if (existingPlayer) {
      existingPlayer.socketId = socketId;
      this.broadcastState();
      return;
    }

    // 2. Check if user is spectator
    let existingSpecIndex = this.spectators.findIndex(
      (s) => s.pseudo === pseudo
    );
    if (existingSpecIndex !== -1) {
      // If user tries to join and there is space, move to players
      if (this.players.length < 2 && this.gameState === "waiting") {
        this.spectators.splice(existingSpecIndex, 1);
        this.addPlayer(socketId, pseudo);
      } else {
        // Just update socketId
        this.spectators[existingSpecIndex].socketId = socketId;
        this.broadcastState();
      }
      return;
    }

    // 3. New User
    if (this.players.length < 2 && this.gameState === "waiting") {
      this.addPlayer(socketId, pseudo);
    } else {
      this.addSpectator(socketId, pseudo);
    }
  }

  addPlayer(socketId, pseudo) {
    // Determine team
    // If empty, Red. If 1 player, check which team is taken
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

    // this.broadcastSystem(`${pseudo} a rejoint le duel (Équipe ${team === 'red' ? 'Rouge' : 'Bleue'})`);
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
    // Used on disconnect
    // Find pseudo
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
    // Player leaving
    const pIndex = this.players.findIndex((p) => p.pseudo === pseudo);
    if (pIndex !== -1) {
      const leaver = this.players[pIndex];
      this.players.splice(pIndex, 1);

      // this.broadcastSystem(`${leaver.pseudo} a quitté le duel.`);

      // If game active, terminate
      if (this.gameState !== "waiting") {
        this.terminateGame("player_disconnect", leaver.pseudo);
      } else {
        this.broadcastState();
      }

      // If socketObj provided (active leave), notify them
      if (socketObj) {
        try {
          socketObj.emit("mash:state", this.getState());
        } catch (e) {}
      }
      return;
    }

    // Spectator leaving
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

    // Validate amount
    if (!amount || amount <= 0) return false;

    // Check funds
    const userClicks = FileService.data.clicks[pseudo] || 0;
    if (userClicks < amount) return false;

    // 25% Limit check
    const maxBet = Math.floor(userClicks * 0.25);
    if (amount > maxBet) return false;

    // Check if target player exists (betOn is pseudo)
    const target = this.players.find((p) => p.pseudo === betOn);
    if (!target) return false;

    // Deduct
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
      // Check if still valid (players might have left)
      if (this.players.length < 2) {
        if (this.gameState === "betting") {
          // Already handled by leave(), but just in case
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
        // Send lightweight update if possible, or just broadcast
        // Using broadcast for consistency
        this.broadcastState();
      }
    }
  }

  endGame(winner) {
    this.gameState = "finished"; // brief finished duration?
    this.scores[winner.team] = this.MAX_SCORE;

    FileService.data.mashWins[winner.pseudo] =
      (FileService.data.mashWins[winner.pseudo] || 0) + 1;
    FileService.save("mashWins", FileService.data.mashWins);

    this.broadcastSystem(`VICTOIRE DE ${winner.pseudo.toUpperCase()} !`);

    // Process betspseudo
    const winnersMsg = [];
    this.bets.forEach((bet) => {
      if (bet.betOn === winner.team) {
        const win = bet.amount * 2;
        FileService.data.clicks[bet.pseudo] =
          (FileService.data.clicks[bet.pseudo] || 0) + win;
        winnersMsg.push(`${bet.pseudo} (+${bet.amount})`);
        if (this.onPayout)
          this.onPayout(bet.pseudo, FileService.data.clicks[bet.pseudo]);
      }
    });

    if (winnersMsg.length > 0) {
      FileService.save("clicks", FileService.data.clicks);
      this.broadcastSystem(`Gagnants paris : ${winnersMsg.join(", ")}`);
    }

    this.broadcastState();

    // Reset after delay
    setTimeout(() => {
      this.resetGame();
    }, 3000);
  }

  terminateGame(reason, culprit) {
    if (this.bettingTimeout) {
      clearTimeout(this.bettingTimeout);
      this.bettingTimeout = null;
    }
    // Refund bets
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

    // Move remaining player to spectators
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

    // Move players to spectators
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
