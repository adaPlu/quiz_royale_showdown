import type WebSocket from "ws";
import { v4 as uuid } from "uuid";
import type { Mode, PowerUp, ServerEvent } from "./types";
import { SAMPLE_QUESTIONS, type Question } from "./questions";

type PlayerState = {
  playerId: string;
  ws: WebSocket;
  alive: boolean;
  shield: boolean;
};

type MatchState = {
  matchId: string;
  mode: Mode;
  players: PlayerState[];
  round: number;
  running: boolean;
  questionOrder: Question[];
  answersThisRound: Map<string, string>;
};

export class MatchEngine {
  private queue: Record<Mode, PlayerState[]> = { QUICK: [], TOURNAMENT: [] };
  private matches = new Map<string, MatchState>();

  private THRESHOLD = Number(process.env.MATCH_THRESHOLD ?? "2"); // set 100 later
  private ROUND_TIME_MS = Number(process.env.ROUND_TIME_MS ?? "12000");
  private BETWEEN_ROUNDS_MS = Number(process.env.BETWEEN_ROUNDS_MS ?? "2000");

  enqueue(mode: Mode, player: PlayerState) {
    this.queue[mode].push(player);
    this.send(player.ws, { type: "LOBBY_UPDATE", payload: { playersInQueue: this.queue[mode].length } });

    if (this.queue[mode].length >= this.THRESHOLD) {
      const players = this.queue[mode].splice(0, this.THRESHOLD);
      const matchId = uuid();
      const startAtMs = Date.now() + 2000;

      const match: MatchState = {
        matchId,
        mode,
        players: players.map(p => ({ ...p, alive: true, shield: false })),
        round: 0,
        running: false,
        questionOrder: this.shuffle([...SAMPLE_QUESTIONS]),
        answersThisRound: new Map()
      };

      this.matches.set(matchId, match);

      for (const p of match.players) {
        this.send(p.ws, { type: "MATCH_FOUND", payload: { matchId, startAtMs, players: match.players.length } });
      }

      setTimeout(() => this.startMatch(matchId), Math.max(0, startAtMs - Date.now()));
    }
  }

  submitAnswer(matchId: string, playerId: string, round: number, choiceId: string) {
    const match = this.matches.get(matchId);
    if (!match || !match.running) return;
    if (match.round !== round) return;

    const p = match.players.find(x => x.playerId === playerId);
    if (!p || !p.alive) return;

    if (!match.answersThisRound.has(playerId)) match.answersThisRound.set(playerId, choiceId);
  }

  usePowerUp(matchId: string, playerId: string, round: number, powerup: PowerUp) {
    const match = this.matches.get(matchId);
    if (!match || !match.running) return;
    if (match.round !== round) return;

    const p = match.players.find(x => x.playerId === playerId);
    if (!p || !p.alive) return;

    if (powerup === "SHIELD") p.shield = true;
  }

  removePlayer(playerId: string) {
    for (const mode of Object.keys(this.queue) as Mode[]) {
      this.queue[mode] = this.queue[mode].filter(p => p.playerId !== playerId);
    }
    for (const match of this.matches.values()) {
      const p = match.players.find(x => x.playerId === playerId);
      if (p) p.alive = false;
    }
  }

  private async startMatch(matchId: string) {
    const match = this.matches.get(matchId);
    if (!match) return;
    match.running = true;

    while (this.countAlive(match) > 1 && match.round < match.questionOrder.length) {
      match.round += 1;
      match.answersThisRound.clear();

      const q = match.questionOrder[match.round - 1];
      const endsAtMs = Date.now() + this.ROUND_TIME_MS;

      for (const p of match.players) {
        if (!p.alive) continue;
        this.send(p.ws, {
          type: "ROUND_START",
          payload: { matchId, round: match.round, endsAtMs, question: { id: q.id, text: q.text, choices: q.choices } }
        });
      }

      await this.sleep(this.ROUND_TIME_MS);

      const correct = q.correctChoiceId;

      for (const p of match.players) {
        if (!p.alive) continue;
        const choice = match.answersThisRound.get(p.playerId);
        const isCorrect = choice === correct;

        let shieldConsumed = false;
        if (!isCorrect) {
          if (p.shield) { p.shield = false; shieldConsumed = true; }
          else p.alive = false;
        }

        this.send(p.ws, {
          type: "ROUND_RESULT",
          payload: { matchId, round: match.round, correctChoiceId: correct, you: { alive: p.alive, shieldConsumed }, playersAlive: this.countAlive(match) }
        });
      }

      await this.sleep(this.BETWEEN_ROUNDS_MS);
    }

    for (const p of match.players) {
      const finalRank = p.alive ? 1 : 2;
      this.send(p.ws, { type: "MATCH_END", payload: { matchId, finalRank, rewards: { xp: 50, coins: 10 } } });
    }

    match.running = false;
    this.matches.delete(matchId);
  }

  private countAlive(match: MatchState) { return match.players.filter(p => p.alive).length; }

  private send(ws: WebSocket, msg: ServerEvent) {
    // @ts-ignore
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }

  private sleep(ms: number) { return new Promise<void>(res => setTimeout(res, ms)); }

  private shuffle<T>(arr: T[]) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
