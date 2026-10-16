// Same definition of "past class" the admin add-member and assign-trainer
// routes already use (and Express used): a ONE-OFF class whose start time
// has passed. A recurring class keeps having new sessions, so its original
// start date being in the past does not mean there is nothing left to join.
export function isPastOneOffClass(
  cls: { recurrence?: string | null; schedule: Date | string },
  now: Date = new Date(),
): boolean {
  const oneOff = !cls.recurrence || cls.recurrence === 'none';
  return oneOff && new Date(cls.schedule).getTime() < now.getTime();
}
