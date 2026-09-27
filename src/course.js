// Prepared combinations of the published scenario, not new scenario content.
export function courseLessons(catalog) {
  if (catalog?.engineVersion === 'shift-4') {
    const plan = [
      ['standard', 'orientation'],
      ['standard', 'service'],
      ['comfort', 'attention'],
      ['comfort', 'full'],
      ['business', 'attention'],
      ['business', 'full'],
      ['first', 'attention'],
      ['first', 'full'],
    ];
    return plan.map(([serviceClass, variantId], i) => ({
      id: serviceClass + '-' + variantId,
      number: i + 1,
      serviceClass,
      variantId,
      classLabel: catalog.classes.find((c) => c.id === serviceClass).label,
      title: catalog.trainingVariants.find((v) => v.id === variantId).label,
      turns: catalog.trainingVariants.find((v) => v.id === variantId).turns,
      mode: i < 6 ? 'training' : 'assessment',
      timingPolicyId: i === 0 ? 'untimed' : i < 4 ? 'extended' : 'standard',
    }));
  }
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
