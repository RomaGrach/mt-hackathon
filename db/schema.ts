// Production schema is applied from drizzle/0001_game_snapshot.sql.
export const gameSnapshot = {
  table: 'game_snapshot',
  primaryKey: 'id',
} as const;
