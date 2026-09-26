import { DatabaseSync } from 'node:sqlite';
import { migrateV2 } from './migrations-v2.js';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** SQLite adapter. Domain code lives in engine/progress/service, not in HTTP handlers. */
export class Store {
  constructor(filename = 'data/reis400.sqlite') {
    if (filename !== ':memory:')
      mkdirSync(dirname(resolve(filename)), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(filename);
    const version = this.db.prepare('PRAGMA user_version').get().user_version;
    if (version > 2) {
      this.db.close();
      throw new Error('Unsupported schema version: ' + version);
    }
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    this.db.exec(
      [
        'CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, alias TEXT NOT NULL, crew TEXT NOT NULL, depot TEXT NOT NULL, company TEXT NOT NULL, created_at INTEGER NOT NULL)',
        'CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL)',
        'CREATE TABLE IF NOT EXISTS scenarios (id TEXT NOT NULL, version TEXT NOT NULL, document TEXT NOT NULL, published_at INTEGER NOT NULL, PRIMARY KEY(id,version))',
        'CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, scenario_id TEXT NOT NULL, scenario_version TEXT NOT NULL, state TEXT NOT NULL, phase TEXT NOT NULL, deadline INTEGER, revision INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(scenario_id,scenario_version) REFERENCES scenarios(id,version))',
        'CREATE TABLE IF NOT EXISTS results (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT UNIQUE NOT NULL REFERENCES runs(id) ON DELETE CASCADE, profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, scenario_id TEXT NOT NULL, scenario_version TEXT NOT NULL, points INTEGER NOT NULL, passed INTEGER NOT NULL, practice INTEGER NOT NULL, completed_at INTEGER NOT NULL, document TEXT NOT NULL)',
        'CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, kind TEXT NOT NULL, node_id TEXT, choice_id TEXT, at INTEGER NOT NULL, data TEXT NOT NULL)',
        'CREATE TABLE IF NOT EXISTS notices (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, at INTEGER NOT NULL, read_at INTEGER, target TEXT)',
        'CREATE TABLE IF NOT EXISTS bonuses (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, amount INTEGER NOT NULL, reason TEXT NOT NULL, expires_at INTEGER NOT NULL, at INTEGER NOT NULL)',
        'CREATE TABLE IF NOT EXISTS requests (profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, request_id TEXT NOT NULL, signature TEXT NOT NULL, response TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(profile_id, request_id))',
        'CREATE INDEX IF NOT EXISTS runs_due ON runs(phase,deadline)',
        'CREATE INDEX IF NOT EXISTS runs_owner ON runs(profile_id,updated_at)',
        'CREATE INDEX IF NOT EXISTS results_owner ON results(profile_id,completed_at)',
        'CREATE INDEX IF NOT EXISTS events_owner ON events(profile_id,id)',
        'CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at)',
        ...(version === 0 ? ['PRAGMA user_version=1'] : []),
      ].join(';')
    );
    if (version < 2) this.transaction(() => migrateV2(this.db));
    if (filename !== ':memory:' && process.platform !== 'win32') chmodSync(filename, 0o600);
  }
  get(sql, ...args) {
    return this.db.prepare(sql).get(...args);
  }
  all(sql, ...args) {
    return this.db.prepare(sql).all(...args);
  }
  run(sql, ...args) {
    return this.db.prepare(sql).run(...args);
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      this.db.exec('COMMIT');
      return value;
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
  close() {
    this.db.close();
  }
}
