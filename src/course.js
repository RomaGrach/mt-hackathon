// Prepared combinations of the published scenario, not new scenario content.
export function courseLessons(catalog) {
  const classes = ['standard', 'comfort', 'business', 'first'];
  const variants = catalog?.trainingVariants || [];
  return classes.flatMap((serviceClass, level) =>
    variants.map((variant, form) => ({
      id: `${serviceClass}-${variant.id}`,
      number: level * variants.length + form + 1,
      serviceClass,
      classLabel: catalog.classes.find((c) => c.id === serviceClass)?.label || serviceClass,
      variantId: variant.id,
      title: variant.label,
      mode: level === 3 ? 'assessment' : 'training',
      timingPolicyId: level === 0 ? 'untimed' : level === 1 ? 'extended' : 'standard',
    }))
  );
}
export function lessonPassed(lesson, history = []) {
  return history.some(
    (r) =>
      r.passed &&
      !r.origin &&
      r.variantId === lesson.variantId &&
      r.serviceClass === lesson.serviceClass &&
      r.mode === lesson.mode &&
      r.timingPolicyId === lesson.timingPolicyId
  );
}
