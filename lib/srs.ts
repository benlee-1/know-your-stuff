const DAY_MS = 86_400_000;

export const DEFAULT_EASE = 2.5;

export type Rating = "again" | "hard" | "good" | "easy";

export function ratingToQuality(rating: Rating): number {
  switch (rating) {
    case "again": return 2;
    case "hard": return 3;
    case "good": return 4;
    case "easy": return 5;
  }
}

export interface CardSchedule {
  ease: number;
  intervalDays: number;
  reps: number;
}

export interface ScheduleResult extends CardSchedule {
  dueAt: number;
}

/**
 * SM-2. quality<3 is a lapse (reps reset, review again in 1 day). quality>=3
 * advances the interval (1 → 6 → round(prev*ease)). Ease is updated on every
 * review and floored at 1.3.
 */
export function scheduleCard(prev: CardSchedule, quality: number, now: number): ScheduleResult {
  let { ease, intervalDays, reps } = prev;

  if (quality < 3) {
    reps = 0;
    intervalDays = 1;
  } else {
    if (reps === 0) intervalDays = 1;
    else if (reps === 1) intervalDays = 6;
    else intervalDays = Math.round(intervalDays * ease);
    reps = reps + 1;
  }

  ease = ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (ease < 1.3) ease = 1.3;

  return { ease, intervalDays, reps, dueAt: now + intervalDays * DAY_MS };
}

export function isDue(card: { dueAt: number }, now: number): boolean {
  return card.dueAt <= now;
}
