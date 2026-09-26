import { BASE_STATEMENTS } from '../backend/schema.js';
import { migrateV2 } from '../backend/migrations-v2.js';

// Synchronous SQL interface for the unchanged v1/v2 services. Persistence is owned by
// the D1 compare-and-swap boundary in sites-game.js, never by an isolate-local file.
export class SqlJsStore {
  constructor(SQL, image) {
    this.db = image ? new SQL.Database(image) : new SQL.Database();
    const version = this.db.exec('PRAGMA user_version')[0]?.values[0][0] ?? 0;
    if (version > 2) throw new Error('Unsupported schema version: ' + version);
    this.db.exec('PRAGMA foreign_keys=ON');
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS runtime_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)'
    );
    if (version === 0) this.db.exec([...BASE_STATEMENTS, 'PRAGMA user_version=1'].join(';'));
    if (version < 2) this.transaction(() => migrateV2(this.db));
  }
  all(sql, ...args) {
    const statement = this.db.prepare(sql);
    try {
      statement.bind(args);
      const rows = [];
      while (statement.step()) rows.push(statement.getAsObject());
      return rows;
    } finally {
      statement.free();
    }
  }
  get(sql, ...args) {
    return this.all(sql, ...args)[0];
  }
  run(sql, ...args) {
    this.db.run(sql, args);
    return { changes: this.db.getRowsModified() };
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  publish(scenarios, now) {
    this.transaction(() => {
      for (const scenario of scenarios) {
        const text = JSON.stringify(scenario);
        const old = this.get(
          'SELECT document FROM scenarios WHERE id=? AND version=?',
          scenario.id,
          scenario.version
        );
        if (old && old.document !== text)
          throw new Error(
            'Сценарий ' + scenario.id + ' изменён: увеличьте version перед публикацией.'
          );
        this.run(
          'INSERT OR IGNORE INTO scenarios VALUES(?,?,?,?)',
          scenario.id,
          scenario.version,
          text,
          now
        );
      }
    });
  }
  scenario(id, version) {
    return JSON.parse(
      this.get('SELECT document FROM scenarios WHERE id=? AND version=?', id, version).document
    );
  }
  hasChanges() {
    return (this.db.exec('SELECT total_changes()')[0]?.values[0][0] || 0) > 0;
  }
  export() {
    return this.db.export();
  }
  close() {
    this.db.close();
  }
}
