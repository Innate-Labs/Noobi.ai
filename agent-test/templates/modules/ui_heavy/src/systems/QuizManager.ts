/**
 * ============================================================================
 * QUIZ MANAGER - Question bank & validation system
 * ============================================================================
 *
 * Manages quiz/question functionality for educational games:
 * - Load questions from JSON or inline data
 * - Random question selection (with optional subject/difficulty filters)
 * - Answer validation
 * - Usage tracking (avoid repeats)
 * - Statistics (correct/wrong counts, accuracy)
 *
 * USAGE:
 *   const qm = new QuizManager();
 *   qm.loadQuestions(questionsArray);
 *   // or: qm.loadFromJSON(scene, 'questions');  // from cache
 *
 *   const q = qm.getRandomQuestion({ subject: 'math', difficulty: 2 });
 *   const correct = qm.checkAnswer(q, selectedIndex);
 *   const stats = qm.getStats();
 */

import Phaser from 'phaser';
import { type QuizQuestion } from '../scenes/BaseBattleScene';

export interface QuizFilter {
  /** Filter by subject */
  subject?: string;
  /** Filter by difficulty (exact) */
  difficulty?: number;
  /** Filter by max difficulty */
  maxDifficulty?: number;
  /** Exclude already-used questions */
  excludeUsed?: boolean;
}

export interface QuizStats {
  totalAsked: number;
  totalCorrect: number;
  totalWrong: number;
  accuracy: number;
  streakCurrent: number;
  streakBest: number;
}

export class QuizManager {
  private questions: QuizQuestion[] = [];
  private usedIndices: Set<number> = new Set();
  private stats: QuizStats = {
    totalAsked: 0,
    totalCorrect: 0,
    totalWrong: 0,
    accuracy: 0,
    streakCurrent: 0,
    streakBest: 0,
  };

  // -- Loading --

  /** Load questions from an array. */
  loadQuestions(questions: QuizQuestion[]): void {
    this.questions = questions;
  }

  /** Load questions from a cached JSON key. */
  loadFromJSON(scene: Phaser.Scene, cacheKey: string): void {
    const data = scene.cache.json.get(cacheKey);
    if (data?.questions) {
      this.questions = data.questions;
    }
  }

  // -- Selection --

  /** Get a random question matching optional filters. */
  getRandomQuestion(filter?: QuizFilter): QuizQuestion | undefined {
    if (this.questions.length === 0) return undefined;

    // Build candidate list applying filters
    let candidates = this.questions.map((q, i) => ({ q, i }));

    if (filter) {
      if (filter.subject) {
        candidates = candidates.filter((c) => c.q.subject === filter.subject);
      }
      if (filter.difficulty !== undefined) {
        candidates = candidates.filter(
          (c) => c.q.difficulty === filter.difficulty,
        );
      }
      if (filter.maxDifficulty !== undefined) {
        candidates = candidates.filter(
          (c) => (c.q.difficulty ?? 1) <= filter.maxDifficulty!,
        );
      }
      if (filter.excludeUsed) {
        candidates = candidates.filter((c) => !this.usedIndices.has(c.i));
      }
    }

    if (candidates.length === 0) {
      // If all questions have been used, reset and try again without the used filter
      if (filter?.excludeUsed && this.usedIndices.size > 0) {
        this.usedIndices.clear();
        return this.getRandomQuestion({ ...filter, excludeUsed: false });
      }
      return undefined;
    }

    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    this.usedIndices.add(pick.i);
    return pick.q;
  }

  /** Get the total number of available questions matching optional filters. */
  getQuestionCount(filter?: QuizFilter): number {
    if (!filter) return this.questions.length;

    return this.questions.filter((q, i) => {
      if (filter.subject && q.subject !== filter.subject) return false;
      if (filter.difficulty !== undefined && q.difficulty !== filter.difficulty)
        return false;
      if (
        filter.maxDifficulty !== undefined &&
        (q.difficulty ?? 1) > filter.maxDifficulty
      )
        return false;
      if (filter.excludeUsed && this.usedIndices.has(i)) return false;
      return true;
    }).length;
  }

  // -- Validation --

  /** Check if the selected answer is correct. Updates stats. */
  checkAnswer(question: QuizQuestion, selectedIndex: number): boolean {
    const correct = selectedIndex === question.correctIndex;
    this.stats.totalAsked++;
    if (correct) {
      this.stats.totalCorrect++;
      this.stats.streakCurrent++;
      this.stats.streakBest = Math.max(
        this.stats.streakBest,
        this.stats.streakCurrent,
      );
    } else {
      this.stats.totalWrong++;
      this.stats.streakCurrent = 0;
    }
    this.stats.accuracy =
      this.stats.totalAsked > 0
        ? this.stats.totalCorrect / this.stats.totalAsked
        : 0;
    return correct;
  }

  // -- Stats --

  /** Get quiz statistics. */
  getStats(): QuizStats {
    return { ...this.stats };
  }

  /** Reset usage tracking (allow questions to repeat). */
  resetUsed(): void {
    this.usedIndices.clear();
  }

  /** Reset all stats. */
  resetStats(): void {
    this.stats = {
      totalAsked: 0,
      totalCorrect: 0,
      totalWrong: 0,
      accuracy: 0,
      streakCurrent: 0,
      streakBest: 0,
    };
  }
}
