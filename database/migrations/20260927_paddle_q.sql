-- Paddle Q database installation for an existing Tagum Pickleball Finder database.
-- Requires the existing courts table, uuid-ossp extension, and Supabase roles.
-- This is a one-time installation; all created tables, functions, and triggers
-- are Paddle Q-owned. No existing court objects or policies are altered.

BEGIN;

-- â”€â”€â”€ Paddle Q â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- These tables extend the existing venue directory. They do not store or
-- alter scraped booking availability. Apply this schema through the normal
-- database setup process; this file is not executed by the application.

CREATE TABLE paddle_sessions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id     UUID NOT NULL REFERENCES courts(id) ON DELETE RESTRICT,
  organizer_secret_hash TEXT NOT NULL CHECK (length(organizer_secret_hash) > 0),
  session_date DATE NOT NULL,
  start_time   TIME NOT NULL,
  end_time     TIME,
  court_count  INTEGER NOT NULL CHECK (court_count > 0),
  status       TEXT NOT NULL DEFAULT 'scheduled'
               CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, venue_id)
);

CREATE INDEX IF NOT EXISTS idx_paddle_sessions_venue_date
  ON paddle_sessions (venue_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_paddle_sessions_status_date
  ON paddle_sessions (status, session_date DESC);

CREATE TABLE paddle_session_players (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id     UUID NOT NULL REFERENCES paddle_sessions(id) ON DELETE CASCADE,
  display_name   TEXT NOT NULL CHECK (length(btrim(display_name)) > 0),
  player_credential_hash TEXT NOT NULL CHECK (length(player_credential_hash) > 0),
  state          TEXT NOT NULL DEFAULT 'waiting'
                 CHECK (state IN ('waiting', 'playing', 'inactive')),
  queue_position BIGINT CHECK (queue_position IS NULL OR queue_position > 0),
  joined_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  inactive_at    TIMESTAMPTZ,
  removed_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, session_id),
  CHECK (
    (state = 'waiting' AND queue_position IS NOT NULL)
    OR (state IN ('playing', 'inactive') AND queue_position IS NULL)
  ),
  CHECK (removed_at IS NULL OR state = 'inactive'),
  -- Deferred so queue positions can be safely rearranged in one transaction.
  CONSTRAINT uq_paddle_session_player_queue
    UNIQUE (session_id, queue_position) DEFERRABLE INITIALLY DEFERRED
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_paddle_session_player_name
  ON paddle_session_players (session_id, lower(btrim(display_name)));
CREATE INDEX IF NOT EXISTS idx_paddle_session_players_queue
  ON paddle_session_players (session_id, state, queue_position);

CREATE TABLE paddle_games (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id   UUID NOT NULL REFERENCES paddle_sessions(id) ON DELETE CASCADE,
  game_number  INTEGER NOT NULL CHECK (game_number > 0),
  court_number INTEGER NOT NULL CHECK (court_number > 0),
  team_1_score INTEGER CHECK (team_1_score >= 0),
  team_2_score INTEGER CHECK (team_2_score >= 0),
  winner_team  SMALLINT CHECK (winner_team IN (1, 2)),
  status       TEXT NOT NULL DEFAULT 'in_progress'
               CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, game_number),
  UNIQUE (id, session_id),
  CHECK (finished_at IS NULL OR finished_at >= started_at),
  CHECK (
    (status = 'completed' AND team_1_score IS NOT NULL AND team_2_score IS NOT NULL
      AND team_1_score <> team_2_score AND winner_team IS NOT NULL AND finished_at IS NOT NULL
      AND ((winner_team = 1 AND team_1_score > team_2_score)
        OR (winner_team = 2 AND team_2_score > team_1_score)))
    OR (status <> 'completed' AND winner_team IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_paddle_games_session_number
  ON paddle_games (session_id, game_number);

CREATE TABLE paddle_game_players (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id        UUID NOT NULL,
  game_id           UUID NOT NULL,
  session_player_id UUID NOT NULL,
  team_number       SMALLINT NOT NULL CHECK (team_number IN (1, 2)),
  FOREIGN KEY (game_id, session_id)
    REFERENCES paddle_games(id, session_id) ON DELETE CASCADE,
  FOREIGN KEY (session_player_id, session_id)
    REFERENCES paddle_session_players(id, session_id) ON DELETE RESTRICT,
  UNIQUE (game_id, session_player_id)
);

CREATE INDEX IF NOT EXISTS idx_paddle_game_players_game
  ON paddle_game_players (game_id, team_number);
CREATE INDEX IF NOT EXISTS idx_paddle_game_players_session_player
  ON paddle_game_players (session_id, session_player_id);

-- A live or completed doubles game must have exactly two participants per
-- team (four distinct participants total). Deferred validation allows the
-- game and its four participant rows to be inserted in one transaction.
CREATE FUNCTION validate_paddle_game_roster()
RETURNS TRIGGER AS $$
DECLARE
  target_game_id UUID;
  target_status TEXT;
  target_court_number INTEGER;
  session_court_count INTEGER;
  participant_count INTEGER;
  team_1_count INTEGER;
  team_2_count INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'paddle_games' THEN
    target_game_id := COALESCE(NEW.id, OLD.id);
  ELSE
    target_game_id := COALESCE(NEW.game_id, OLD.game_id);
  END IF;

  SELECT games.status, games.court_number, sessions.court_count
    INTO target_status, target_court_number, session_court_count
  FROM paddle_games AS games
  JOIN paddle_sessions AS sessions ON sessions.id = games.session_id
  WHERE games.id = target_game_id;

  IF NOT FOUND OR target_status = 'cancelled' THEN
    RETURN NULL;
  END IF;

  IF target_court_number > session_court_count THEN
    RAISE EXCEPTION 'Paddle Q game % court number exceeds the session court count', target_game_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE team_number = 1),
         COUNT(*) FILTER (WHERE team_number = 2)
    INTO participant_count, team_1_count, team_2_count
  FROM paddle_game_players
  WHERE game_id = target_game_id;

  IF participant_count <> 4 OR team_1_count <> 2 OR team_2_count <> 2 THEN
    RAISE EXCEPTION 'Paddle Q game % must have exactly two players on each team', target_game_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER paddle_game_roster_valid_on_players
  AFTER INSERT OR UPDATE OR DELETE ON paddle_game_players
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION validate_paddle_game_roster();

CREATE CONSTRAINT TRIGGER paddle_game_roster_valid_on_games
  AFTER INSERT OR UPDATE ON paddle_games
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION validate_paddle_game_roster();

CREATE FUNCTION update_paddle_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_paddle_sessions_updated_at
  BEFORE UPDATE ON paddle_sessions
  FOR EACH ROW EXECUTE FUNCTION update_paddle_updated_at_column();

CREATE TRIGGER update_paddle_session_players_updated_at
  BEFORE UPDATE ON paddle_session_players
  FOR EACH ROW EXECUTE FUNCTION update_paddle_updated_at_column();

-- Paddle Q data is managed through the backend. Keep direct client access
-- closed until a backend authorization policy is added with the API phase.
ALTER TABLE paddle_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE paddle_session_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE paddle_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE paddle_game_players ENABLE ROW LEVEL SECURITY;

-- â”€â”€â”€ Paddle Q transactional service RPCs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- These invoker functions are called only by the backend service-role client.
-- Session row locks serialize queue and game mutations across API workers.

CREATE FUNCTION paddleq_assert_organizer(p_session_id UUID, p_expected_hash TEXT)
RETURNS VOID AS $$
DECLARE
  locked_session paddle_sessions;
BEGIN
  SELECT * INTO locked_session
  FROM paddle_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paddle Q session not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_expected_hash IS NULL OR locked_session.organizer_secret_hash <> p_expected_hash THEN
    RAISE EXCEPTION 'Organizer capability is invalid' USING ERRCODE = '42501';
  END IF;
  RETURN;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION paddleq_create_session(
  p_venue_id UUID,
  p_session_date DATE,
  p_start_time TIME,
  p_end_time TIME,
  p_court_count INTEGER,
  p_organizer_secret_hash TEXT
)
RETURNS JSONB AS $$
DECLARE
  created_session paddle_sessions;
BEGIN
  IF p_court_count IS NULL OR p_court_count < 1 OR p_organizer_secret_hash IS NULL OR length(p_organizer_secret_hash) = 0 THEN
    RAISE EXCEPTION 'Invalid Paddle Q session details' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM courts WHERE id = p_venue_id AND active = true) THEN
    RAISE EXCEPTION 'Active venue not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO paddle_sessions (venue_id, session_date, start_time, end_time, court_count, organizer_secret_hash)
  VALUES (p_venue_id, p_session_date, p_start_time, p_end_time, p_court_count, p_organizer_secret_hash)
  RETURNING * INTO created_session;
  RETURN to_jsonb(created_session) - 'organizer_secret_hash';
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION paddleq_update_session(p_session_id UUID, p_expected_hash TEXT, p_patch JSONB)
RETURNS JSONB AS $$
DECLARE
  current_session paddle_sessions;
  next_status TEXT;
BEGIN
  PERFORM paddleq_assert_organizer(p_session_id, p_expected_hash);
  SELECT * INTO current_session FROM paddle_sessions WHERE id = p_session_id;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'Invalid session update' USING ERRCODE = '22023';
  END IF;
  IF p_patch ? 'status' THEN
    next_status := p_patch->>'status';
    IF NOT (
      (current_session.status = 'scheduled' AND next_status IN ('scheduled', 'active', 'cancelled')) OR
      (current_session.status = 'active' AND next_status IN ('active', 'completed', 'cancelled')) OR
      (current_session.status IN ('completed', 'cancelled') AND next_status = current_session.status)
    ) THEN
      RAISE EXCEPTION 'Invalid Paddle Q session lifecycle transition' USING ERRCODE = '22023';
    END IF;
    IF next_status IN ('completed', 'cancelled') AND EXISTS (
      SELECT 1 FROM paddle_games WHERE session_id = p_session_id AND status = 'in_progress'
    ) THEN
      RAISE EXCEPTION 'Finish or cancel active games before closing the session' USING ERRCODE = '22023';
    END IF;
    IF next_status = 'completed' AND NOT (p_patch ? 'end_time' AND p_patch->>'end_time' IS NOT NULL) AND current_session.end_time IS NULL THEN
      RAISE EXCEPTION 'Session end time is required when completing a session' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF p_patch ? 'court_count' AND ((p_patch->>'court_count')::INTEGER < 1 OR
      (p_patch->>'court_count')::INTEGER < COALESCE((SELECT MAX(court_number) FROM paddle_games WHERE session_id = p_session_id), 0)) THEN
    RAISE EXCEPTION 'Court count cannot be less than a recorded game court number' USING ERRCODE = '22023';
  END IF;

  UPDATE paddle_sessions SET
    session_date = CASE WHEN p_patch ? 'session_date' THEN (p_patch->>'session_date')::DATE ELSE session_date END,
    start_time = CASE WHEN p_patch ? 'start_time' THEN (p_patch->>'start_time')::TIME ELSE start_time END,
    end_time = CASE WHEN p_patch ? 'end_time' THEN (p_patch->>'end_time')::TIME ELSE end_time END,
    court_count = CASE WHEN p_patch ? 'court_count' THEN (p_patch->>'court_count')::INTEGER ELSE court_count END,
    status = CASE WHEN p_patch ? 'status' THEN p_patch->>'status' ELSE status END
  WHERE id = p_session_id
  RETURNING * INTO current_session;
  RETURN to_jsonb(current_session) - 'organizer_secret_hash';
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION paddleq_replace_organizer_hash(
  p_session_id UUID,
  p_expected_hash TEXT,
  p_next_hash TEXT
)
RETURNS VOID AS $$
BEGIN
  PERFORM paddleq_assert_organizer(p_session_id, p_expected_hash);
  IF p_next_hash IS NULL OR length(p_next_hash) = 0 THEN
    RAISE EXCEPTION 'Organizer capability hash is required' USING ERRCODE = '22023';
  END IF;
  UPDATE paddle_sessions SET organizer_secret_hash = p_next_hash WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION paddleq_add_or_rejoin_player(
  p_session_id UUID,
  p_expected_hash TEXT,
  p_display_name TEXT,
  p_player_credential_hash TEXT
)
RETURNS JSONB AS $$
DECLARE
  locked_session paddle_sessions;
  existing_player paddle_session_players;
  next_position BIGINT;
BEGIN
  PERFORM paddleq_assert_organizer(p_session_id, p_expected_hash);
  SELECT * INTO locked_session FROM paddle_sessions WHERE id = p_session_id;
  IF locked_session.status NOT IN ('scheduled', 'active') THEN
    RAISE EXCEPTION 'Players cannot join a closed session' USING ERRCODE = '22023';
  END IF;
  IF p_display_name IS NULL OR length(btrim(p_display_name)) = 0 THEN
    RAISE EXCEPTION 'Player display name is required' USING ERRCODE = '22023';
  END IF;
  IF p_player_credential_hash IS NULL OR length(p_player_credential_hash) = 0 THEN
    RAISE EXCEPTION 'Player credential hash is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO existing_player FROM paddle_session_players
    WHERE session_id = p_session_id AND lower(btrim(display_name)) = lower(btrim(p_display_name))
    FOR UPDATE;
  SELECT COALESCE(MAX(queue_position), 0) + 1 INTO next_position
    FROM paddle_session_players WHERE session_id = p_session_id AND state = 'waiting';

  IF FOUND AND existing_player.id IS NOT NULL THEN
    IF existing_player.state <> 'inactive' THEN
      RAISE EXCEPTION 'Player is already active in this session' USING ERRCODE = '23505';
    END IF;
    UPDATE paddle_session_players SET state = 'waiting', queue_position = next_position,
      player_credential_hash = p_player_credential_hash,
      inactive_at = NULL, removed_at = NULL
    WHERE id = existing_player.id RETURNING * INTO existing_player;
    RETURN to_jsonb(existing_player) - 'player_credential_hash';
  END IF;

  INSERT INTO paddle_session_players (session_id, display_name, player_credential_hash, state, queue_position)
  VALUES (p_session_id, btrim(p_display_name), p_player_credential_hash, 'waiting', next_position)
  RETURNING * INTO existing_player;
  RETURN to_jsonb(existing_player) - 'player_credential_hash';
END;
$$ LANGUAGE plpgsql;

-- Public API joins call this backend-only RPC. It is insert-only: a matching
-- display name produces a unique violation and cannot reactivate an old row.
CREATE FUNCTION paddleq_join_player(
  p_session_id UUID,
  p_display_name TEXT,
  p_player_credential_hash TEXT
)
RETURNS JSONB AS $$
DECLARE
  locked_session paddle_sessions;
  next_position BIGINT;
  inserted_player paddle_session_players;
BEGIN
  SELECT * INTO locked_session FROM paddle_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paddle Q session not found' USING ERRCODE = 'P0002'; END IF;
  IF locked_session.status NOT IN ('scheduled', 'active') THEN
    RAISE EXCEPTION 'Players cannot join a closed session' USING ERRCODE = '22023';
  END IF;
  IF p_display_name IS NULL OR length(btrim(p_display_name)) = 0 THEN
    RAISE EXCEPTION 'Player display name is required' USING ERRCODE = '22023';
  END IF;
  IF p_player_credential_hash IS NULL OR length(p_player_credential_hash) = 0 THEN
    RAISE EXCEPTION 'Player credential hash is required' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(MAX(queue_position), 0) + 1 INTO next_position
    FROM paddle_session_players WHERE session_id = p_session_id AND state = 'waiting';
  INSERT INTO paddle_session_players (
    session_id, display_name, player_credential_hash, state, queue_position
  ) VALUES (
    p_session_id, btrim(p_display_name), p_player_credential_hash, 'waiting', next_position
  ) RETURNING * INTO inserted_player;
  RETURN to_jsonb(inserted_player) - 'player_credential_hash';
END;
$$ LANGUAGE plpgsql;

-- Rejoin validates the hash again under the session/player locks, then reuses
-- the same row and assigns the back of the current waiting queue.
CREATE FUNCTION paddleq_rejoin_player(
  p_session_id UUID,
  p_player_id UUID,
  p_expected_player_credential_hash TEXT
)
RETURNS JSONB AS $$
DECLARE
  locked_session paddle_sessions;
  target_player paddle_session_players;
  next_position BIGINT;
BEGIN
  SELECT * INTO locked_session FROM paddle_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paddle Q session not found' USING ERRCODE = 'P0002'; END IF;
  IF locked_session.status NOT IN ('scheduled', 'active') THEN
    RAISE EXCEPTION 'Players cannot rejoin a closed session' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO target_player FROM paddle_session_players
    WHERE id = p_player_id AND session_id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paddle Q player not found' USING ERRCODE = 'P0002'; END IF;
  IF p_expected_player_credential_hash IS NULL
    OR target_player.player_credential_hash <> p_expected_player_credential_hash THEN
    RAISE EXCEPTION 'Player credential is invalid' USING ERRCODE = '42501';
  END IF;
  IF target_player.state <> 'inactive' THEN
    RAISE EXCEPTION 'Player is not inactive' USING ERRCODE = '23505';
  END IF;
  SELECT COALESCE(MAX(queue_position), 0) + 1 INTO next_position
    FROM paddle_session_players WHERE session_id = p_session_id AND state = 'waiting';
  UPDATE paddle_session_players SET state = 'waiting', queue_position = next_position,
    inactive_at = NULL, removed_at = NULL
    WHERE id = p_player_id RETURNING * INTO target_player;
  RETURN to_jsonb(target_player) - 'player_credential_hash';
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION paddleq_set_player_inactive(
  p_session_id UUID,
  p_expected_hash TEXT,
  p_player_id UUID,
  p_removed BOOLEAN
)
RETURNS JSONB AS $$
DECLARE
  locked_session paddle_sessions;
  target_player paddle_session_players;
BEGIN
  PERFORM paddleq_assert_organizer(p_session_id, p_expected_hash);
  SELECT * INTO locked_session FROM paddle_sessions WHERE id = p_session_id;
  IF locked_session.status NOT IN ('scheduled', 'active') THEN
    RAISE EXCEPTION 'Players cannot be changed in a closed session' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO target_player FROM paddle_session_players
    WHERE id = p_player_id AND session_id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session player not found' USING ERRCODE = 'P0002'; END IF;
  IF target_player.state = 'playing' THEN
    RAISE EXCEPTION 'A player assigned to an active game cannot be deactivated' USING ERRCODE = '22023';
  END IF;
  UPDATE paddle_session_players SET state = 'inactive', queue_position = NULL,
    inactive_at = COALESCE(inactive_at, NOW()),
    removed_at = CASE WHEN p_removed THEN NOW() ELSE removed_at END
  WHERE id = p_player_id RETURNING * INTO target_player;
  RETURN to_jsonb(target_player) - 'player_credential_hash';
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION paddleq_move_player(
  p_session_id UUID,
  p_expected_hash TEXT,
  p_player_id UUID,
  p_position INTEGER
)
RETURNS SETOF JSONB AS $$
DECLARE
  locked_session paddle_sessions;
  queue_ids UUID[];
  reordered_ids UUID[];
  queue_count INTEGER;
  offset_value BIGINT;
  idx INTEGER;
BEGIN
  PERFORM paddleq_assert_organizer(p_session_id, p_expected_hash);
  SELECT * INTO locked_session FROM paddle_sessions WHERE id = p_session_id;
  IF locked_session.status NOT IN ('scheduled', 'active') THEN
    RAISE EXCEPTION 'Queue cannot be changed in a closed session' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM paddle_session_players WHERE id = p_player_id AND session_id = p_session_id AND state = 'waiting') THEN
    RAISE EXCEPTION 'Waiting player not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT array_agg(id ORDER BY queue_position), COUNT(*), COALESCE(MAX(queue_position), 0) + COUNT(*) + 1
    INTO queue_ids, queue_count, offset_value
    FROM paddle_session_players WHERE session_id = p_session_id AND state = 'waiting';
  IF p_position < 1 OR p_position > queue_count THEN
    RAISE EXCEPTION 'Queue position is outside the waiting queue' USING ERRCODE = '22023';
  END IF;
  queue_ids := array_remove(queue_ids, p_player_id);
  reordered_ids := array_cat(queue_ids[1:p_position - 1], ARRAY[p_player_id]::UUID[]);
  reordered_ids := array_cat(reordered_ids, queue_ids[p_position:array_length(queue_ids, 1)]);
  UPDATE paddle_session_players SET queue_position = queue_position + offset_value
    WHERE session_id = p_session_id AND state = 'waiting';
  FOR idx IN 1..array_length(reordered_ids, 1) LOOP
    UPDATE paddle_session_players SET queue_position = idx WHERE id = reordered_ids[idx];
  END LOOP;
  RETURN QUERY SELECT to_jsonb(players) - 'player_credential_hash'
    FROM paddle_session_players AS players
    WHERE players.session_id = p_session_id AND players.state = 'waiting'
    ORDER BY players.queue_position;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION paddleq_skip_player(
  p_session_id UUID,
  p_expected_hash TEXT,
  p_player_id UUID
)
RETURNS SETOF JSONB AS $$
DECLARE
  locked_session paddle_sessions;
  queue_size INTEGER;
BEGIN
  PERFORM paddleq_assert_organizer(p_session_id, p_expected_hash);
  SELECT COUNT(*) INTO queue_size FROM paddle_session_players
    WHERE session_id = p_session_id AND state = 'waiting';
  RETURN QUERY SELECT moved_player
    FROM paddleq_move_player(p_session_id, p_expected_hash, p_player_id, queue_size) AS moved_player;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION paddleq_start_games(
  p_session_id UUID,
  p_expected_hash TEXT,
  p_games JSONB
)
RETURNS UUID[] AS $$
DECLARE
  locked_session paddle_sessions;
  game_spec JSONB;
  team1 UUID[];
  team2 UUID[];
  all_players UUID[];
  seen_players UUID[] := ARRAY[]::UUID[];
  seen_courts INTEGER[] := ARRAY[]::INTEGER[];
  created_ids UUID[] := ARRAY[]::UUID[];
  next_game_number INTEGER;
  game_row paddle_games;
  player_id UUID;
  requested_court_number INTEGER;
BEGIN
  PERFORM paddleq_assert_organizer(p_session_id, p_expected_hash);
  SELECT * INTO locked_session FROM paddle_sessions WHERE id = p_session_id;
  IF locked_session.status <> 'active' THEN RAISE EXCEPTION 'Session is not active' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(p_games) <> 'array' OR jsonb_array_length(p_games) = 0 THEN
    RAISE EXCEPTION 'At least one game is required' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(MAX(game_number), 0) + 1 INTO next_game_number FROM paddle_games WHERE session_id = p_session_id;

  FOR game_spec IN SELECT value FROM jsonb_array_elements(p_games) LOOP
    requested_court_number := (game_spec->>'court_number')::INTEGER;
    team1 := ARRAY(SELECT jsonb_array_elements_text(game_spec->'team1_player_ids')::UUID);
    team2 := ARRAY(SELECT jsonb_array_elements_text(game_spec->'team2_player_ids')::UUID);
    all_players := team1 || team2;
    IF requested_court_number < 1 OR requested_court_number > locked_session.court_count THEN RAISE EXCEPTION 'Invalid game court number' USING ERRCODE = '22023'; END IF;
    IF requested_court_number = ANY(seen_courts) THEN RAISE EXCEPTION 'A court can only have one game in a round' USING ERRCODE = '22023'; END IF;
    IF EXISTS (SELECT 1 FROM paddle_games AS occupied WHERE occupied.session_id = p_session_id AND occupied.court_number = requested_court_number AND occupied.status = 'in_progress') THEN
      RAISE EXCEPTION 'Court already has an in-progress game' USING ERRCODE = '22023';
    END IF;
    IF cardinality(team1) <> 2 OR cardinality(team2) <> 2 OR cardinality(all_players) <> 4 OR
       (SELECT COUNT(DISTINCT u.player_id) FROM unnest(all_players) AS u(player_id)) <> 4 THEN
      RAISE EXCEPTION 'Each game requires four distinct players, two per team' USING ERRCODE = '22023';
    END IF;
    IF (SELECT COUNT(DISTINCT u.player_id) FROM unnest(all_players) AS u(player_id) WHERE u.player_id = ANY(seen_players)) > 0 THEN
      RAISE EXCEPTION 'A player cannot be assigned to two courts in one round' USING ERRCODE = '22023';
    END IF;
    FOREACH player_id IN ARRAY all_players LOOP
      IF NOT EXISTS (SELECT 1 FROM paddle_session_players WHERE id = player_id AND session_id = p_session_id AND state = 'waiting') THEN
        RAISE EXCEPTION 'Every game participant must be waiting in this session' USING ERRCODE = '22023';
      END IF;
    END LOOP;
    INSERT INTO paddle_games (session_id, game_number, court_number, status)
      VALUES (p_session_id, next_game_number, requested_court_number, 'in_progress') RETURNING * INTO game_row;
    INSERT INTO paddle_game_players (session_id, game_id, session_player_id, team_number)
      SELECT p_session_id, game_row.id, u.player_id, 1 FROM unnest(team1) AS u(player_id);
    INSERT INTO paddle_game_players (session_id, game_id, session_player_id, team_number)
      SELECT p_session_id, game_row.id, u.player_id, 2 FROM unnest(team2) AS u(player_id);
    UPDATE paddle_session_players SET state = 'playing', queue_position = NULL WHERE id = ANY(all_players);
    seen_players := seen_players || all_players;
    seen_courts := array_append(seen_courts, requested_court_number);
    created_ids := array_append(created_ids, game_row.id);
    next_game_number := next_game_number + 1;
  END LOOP;
  RETURN created_ids;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION paddleq_complete_game(
  p_session_id UUID,
  p_expected_hash TEXT,
  p_game_id UUID,
  p_team_1_score INTEGER,
  p_team_2_score INTEGER
)
RETURNS UUID AS $$
DECLARE
  locked_session paddle_sessions;
  game_row paddle_games;
  player_row RECORD;
  next_position BIGINT;
  winning_team SMALLINT;
  participant_count INTEGER;
  team1_count INTEGER;
  team2_count INTEGER;
BEGIN
  PERFORM paddleq_assert_organizer(p_session_id, p_expected_hash);
  SELECT * INTO locked_session FROM paddle_sessions WHERE id = p_session_id;
  IF locked_session.status <> 'active' THEN RAISE EXCEPTION 'Session is not active' USING ERRCODE = '22023'; END IF;
  SELECT * INTO game_row FROM paddle_games WHERE id = p_game_id AND session_id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paddle Q game not found' USING ERRCODE = 'P0002'; END IF;
  IF game_row.status <> 'in_progress' THEN RAISE EXCEPTION 'Game is not in progress' USING ERRCODE = '22023'; END IF;
  IF p_team_1_score IS NULL OR p_team_2_score IS NULL OR p_team_1_score < 0 OR p_team_2_score < 0 OR p_team_1_score = p_team_2_score THEN
    RAISE EXCEPTION 'Scores must be non-negative integers and produce a winner' USING ERRCODE = '22023';
  END IF;
  SELECT COUNT(*), COUNT(*) FILTER (WHERE team_number = 1), COUNT(*) FILTER (WHERE team_number = 2)
    INTO participant_count, team1_count, team2_count FROM paddle_game_players WHERE game_id = p_game_id;
  IF participant_count <> 4 OR team1_count <> 2 OR team2_count <> 2 THEN
    RAISE EXCEPTION 'Game must contain exactly two players per team' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM paddle_game_players AS gp JOIN paddle_session_players AS sp ON sp.id = gp.session_player_id
    WHERE gp.game_id = p_game_id AND sp.state <> 'playing'
  ) THEN RAISE EXCEPTION 'Game participants are not all marked as playing' USING ERRCODE = '22023'; END IF;

  winning_team := CASE WHEN p_team_1_score > p_team_2_score THEN 1 ELSE 2 END;
  UPDATE paddle_games SET team_1_score = p_team_1_score, team_2_score = p_team_2_score,
    winner_team = winning_team, status = 'completed', finished_at = NOW()
  WHERE id = p_game_id;
  SELECT COALESCE(MAX(queue_position), 0) + 1 INTO next_position
    FROM paddle_session_players WHERE session_id = p_session_id AND state = 'waiting';
  FOR player_row IN SELECT sp.id FROM paddle_game_players AS gp
    JOIN paddle_session_players AS sp ON sp.id = gp.session_player_id
    WHERE gp.game_id = p_game_id ORDER BY gp.team_number, gp.session_player_id
  LOOP
    UPDATE paddle_session_players SET state = 'waiting', queue_position = next_position,
      inactive_at = NULL, removed_at = NULL WHERE id = player_row.id;
    next_position := next_position + 1;
  END LOOP;
  RETURN p_game_id;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION paddleq_cancel_game(p_session_id UUID, p_expected_hash TEXT, p_game_id UUID)
RETURNS UUID AS $$
DECLARE
  locked_session paddle_sessions;
  game_row paddle_games;
  player_row RECORD;
  next_position BIGINT;
BEGIN
  PERFORM paddleq_assert_organizer(p_session_id, p_expected_hash);
  SELECT * INTO locked_session FROM paddle_sessions WHERE id = p_session_id;
  SELECT * INTO game_row FROM paddle_games WHERE id = p_game_id AND session_id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paddle Q game not found' USING ERRCODE = 'P0002'; END IF;
  IF game_row.status <> 'in_progress' THEN RAISE EXCEPTION 'Only an in-progress game can be cancelled' USING ERRCODE = '22023'; END IF;
  UPDATE paddle_games SET status = 'cancelled', finished_at = NOW() WHERE id = p_game_id;
  SELECT COALESCE(MAX(queue_position), 0) + 1 INTO next_position
    FROM paddle_session_players WHERE session_id = p_session_id AND state = 'waiting';
  FOR player_row IN SELECT sp.id FROM paddle_game_players AS gp
    JOIN paddle_session_players AS sp ON sp.id = gp.session_player_id
    WHERE gp.game_id = p_game_id ORDER BY gp.team_number, gp.session_player_id
  LOOP
    UPDATE paddle_session_players SET state = 'waiting', queue_position = next_position
      WHERE id = player_row.id;
    next_position := next_position + 1;
  END LOOP;
  RETURN p_game_id;
END;
$$ LANGUAGE plpgsql;

-- RPC access is restricted to the backend's service-role key. Direct anon and
-- authenticated clients cannot call Paddle Q mutation functions.
REVOKE ALL ON FUNCTION paddleq_assert_organizer(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION paddleq_create_session(UUID, DATE, TIME, TIME, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION paddleq_update_session(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION paddleq_replace_organizer_hash(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION paddleq_add_or_rejoin_player(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION paddleq_join_player(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION paddleq_rejoin_player(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION paddleq_set_player_inactive(UUID, TEXT, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION paddleq_move_player(UUID, TEXT, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION paddleq_skip_player(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION paddleq_start_games(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION paddleq_complete_game(UUID, TEXT, UUID, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION paddleq_cancel_game(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION paddleq_assert_organizer(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION paddleq_create_session(UUID, DATE, TIME, TIME, INTEGER, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION paddleq_update_session(UUID, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION paddleq_replace_organizer_hash(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION paddleq_add_or_rejoin_player(UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION paddleq_join_player(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION paddleq_rejoin_player(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION paddleq_set_player_inactive(UUID, TEXT, UUID, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION paddleq_move_player(UUID, TEXT, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION paddleq_skip_player(UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION paddleq_start_games(UUID, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION paddleq_complete_game(UUID, TEXT, UUID, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION paddleq_cancel_game(UUID, TEXT, UUID) TO service_role;

COMMIT;
