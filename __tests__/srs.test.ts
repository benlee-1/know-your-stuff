import { describe, it, expect } from "vitest";
import { DEFAULT_EASE, ratingToQuality, scheduleCard, isDue } from "@/lib/srs";

const DAY = 86_400_000;

describe("ratingToQuality", () => {
  it("maps the four ratings", () => {
    expect(ratingToQuality("again")).toBe(2);
    expect(ratingToQuality("hard")).toBe(3);
    expect(ratingToQuality("good")).toBe(4);
    expect(ratingToQuality("easy")).toBe(5);
  });
});

describe("scheduleCard — successful reviews advance the interval", () => {
  it("fresh good: interval 1, reps 1, ease unchanged at q4, due in 1 day", () => {
    const r = scheduleCard({ ease: 2.5, intervalDays: 0, reps: 0 }, 4, 1000);
    expect(r.intervalDays).toBe(1);
    expect(r.reps).toBe(1);
    expect(r.ease).toBeCloseTo(2.5, 5);
    expect(r.dueAt).toBe(1000 + 1 * DAY);
  });
  it("second good: interval 6, reps 2", () => {
    const r = scheduleCard({ ease: 2.5, intervalDays: 1, reps: 1 }, 4, 0);
    expect(r.intervalDays).toBe(6);
    expect(r.reps).toBe(2);
    expect(r.dueAt).toBe(6 * DAY);
  });
  it("third good: round(interval*ease), reps 3", () => {
    const r = scheduleCard({ ease: 2.5, intervalDays: 6, reps: 2 }, 4, 0);
    expect(r.intervalDays).toBe(15); // round(6 * 2.5)
    expect(r.reps).toBe(3);
    expect(r.dueAt).toBe(15 * DAY);
  });
});

describe("scheduleCard — ease updates", () => {
  it("easy (q5) raises ease by 0.1", () => {
    const r = scheduleCard({ ease: 2.5, intervalDays: 0, reps: 0 }, 5, 0);
    expect(r.ease).toBeCloseTo(2.6, 5);
  });
  it("hard (q3) lowers ease by 0.14 but still advances interval", () => {
    const r = scheduleCard({ ease: 2.5, intervalDays: 6, reps: 2 }, 3, 0);
    expect(r.ease).toBeCloseTo(2.36, 5);
    expect(r.intervalDays).toBe(15);
    expect(r.reps).toBe(3);
  });
});

describe("scheduleCard — lapse (q<3)", () => {
  it("resets reps to 0 and interval to 1, drops ease", () => {
    const r = scheduleCard({ ease: 2.5, intervalDays: 15, reps: 3 }, 2, 0);
    expect(r.reps).toBe(0);
    expect(r.intervalDays).toBe(1);
    expect(r.ease).toBeCloseTo(2.18, 5); // 2.5 - 0.32
    expect(r.dueAt).toBe(1 * DAY);
  });
  it("clamps ease at the 1.3 floor", () => {
    const r = scheduleCard({ ease: 1.3, intervalDays: 1, reps: 0 }, 2, 0);
    expect(r.ease).toBe(1.3);
  });
});

describe("isDue", () => {
  it("true when dueAt <= now", () => {
    expect(isDue({ dueAt: 100 }, 100)).toBe(true);
    expect(isDue({ dueAt: 99 }, 100)).toBe(true);
    expect(isDue({ dueAt: 101 }, 100)).toBe(false);
  });
});

describe("DEFAULT_EASE", () => {
  it("is 2.5", () => expect(DEFAULT_EASE).toBe(2.5));
});
