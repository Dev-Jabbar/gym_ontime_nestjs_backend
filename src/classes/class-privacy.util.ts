// Trainer contact details are shown to logged-in users only. The class list
// and class detail routes are public (so the schedule can load and the
// frontend can check that the backend is up), so for an anonymous caller the
// trainer's phone number is blanked. A logged-in caller sees it unchanged.
export function redactTrainerPhone<T extends { trainer?: any }>(cls: T): T {
  if (!cls?.trainer || cls.trainer.phone == null) return cls;
  return { ...cls, trainer: { ...cls.trainer, phone: null } };
}

export function redactTrainerPhones<T extends { trainer?: any }>(
  classes: T[],
): T[] {
  return classes.map(redactTrainerPhone);
}
