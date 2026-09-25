import { scenarios } from '../backend/catalog.js';
import { validateScenario } from '../backend/engine.js';
for (const scenario of scenarios) {
  validateScenario(scenario);
  const nodes = Object.values(scenario.nodes);
  console.log(
    scenario.id +
      '@' +
      scenario.version +
      ': ' +
      nodes.filter((n) => n.kind === 'decision').length +
      ' decisions, ' +
      nodes.filter((n) => n.kind === 'ending').length +
      ' endings'
  );
}
