const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    DO $migration$
    DECLARE
      canonical_constraint RECORD;
      duplicate_constraint RECORD;
      index_pair RECORD;
    BEGIN
      SELECT
        constraint_row.oid AS constraint_oid,
        constraint_row.conindid AS index_oid,
        index_row.*
      INTO canonical_constraint
      FROM pg_constraint constraint_row
      JOIN pg_index index_row ON index_row.indexrelid = constraint_row.conindid
      WHERE constraint_row.conrelid = 'videos'::regclass
        AND constraint_row.conname = 'videos_platform_video_id_key'
        AND constraint_row.contype = 'u'
        AND constraint_row.conkey = ARRAY[
          (SELECT attnum FROM pg_attribute
           WHERE attrelid = 'videos'::regclass AND attname = 'platform_video_id')
        ]::smallint[]
        AND index_row.indisunique
        AND index_row.indisvalid
        AND index_row.indisready;

      IF canonical_constraint.constraint_oid IS NULL THEN
        RAISE EXCEPTION
          'Cannot clean videos indexes: canonical unique constraint videos_platform_video_id_key is missing or invalid';
      END IF;

      FOR duplicate_constraint IN
        SELECT
          constraint_row.conname,
          constraint_row.conindid AS index_oid
        FROM pg_constraint constraint_row
        JOIN pg_index candidate_index
          ON candidate_index.indexrelid = constraint_row.conindid
        WHERE constraint_row.conrelid = 'videos'::regclass
          AND constraint_row.contype = 'u'
          AND constraint_row.oid <> canonical_constraint.constraint_oid
          AND candidate_index.indisunique
          AND candidate_index.indisvalid
          AND candidate_index.indisready
          AND candidate_index.indkey = canonical_constraint.indkey
          AND candidate_index.indclass = canonical_constraint.indclass
          AND candidate_index.indcollation = canonical_constraint.indcollation
          AND candidate_index.indoption = canonical_constraint.indoption
          AND candidate_index.indexprs IS NOT DISTINCT FROM canonical_constraint.indexprs
          AND candidate_index.indpred IS NOT DISTINCT FROM canonical_constraint.indpred
      LOOP
        IF duplicate_constraint.conname !~ '^videos_platform_video_id_key[0-9]+$' THEN
          RAISE EXCEPTION
            'Cannot clean videos indexes: equivalent constraint % has an unexpected name',
            duplicate_constraint.conname;
        END IF;

        IF EXISTS (
          SELECT 1
          FROM pg_constraint dependency
          WHERE dependency.contype = 'f'
            AND dependency.conindid = duplicate_constraint.index_oid
        ) THEN
          RAISE EXCEPTION
            'Cannot drop videos constraint % because a foreign key depends on it',
            duplicate_constraint.conname;
        END IF;

        EXECUTE format(
          'ALTER TABLE %I DROP CONSTRAINT %I',
          'videos',
          duplicate_constraint.conname
        );
      END LOOP;

      FOR index_pair IN
        SELECT *
        FROM (VALUES
          ('videos_published_at', 'videos_published_at_idx'),
          ('videos_channel_id', 'videos_channel_id_idx')
        ) AS pairs(duplicate_name, canonical_name)
      LOOP
        IF to_regclass(index_pair.duplicate_name) IS NULL THEN
          CONTINUE;
        END IF;

        IF to_regclass(index_pair.canonical_name) IS NULL THEN
          RAISE EXCEPTION
            'Cannot drop duplicate index % because canonical index % is missing',
            index_pair.duplicate_name,
            index_pair.canonical_name;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_index duplicate_index
          JOIN pg_index canonical_index
            ON canonical_index.indexrelid = to_regclass(index_pair.canonical_name)
          WHERE duplicate_index.indexrelid = to_regclass(index_pair.duplicate_name)
            AND duplicate_index.indrelid = 'videos'::regclass
            AND canonical_index.indrelid = duplicate_index.indrelid
            AND NOT duplicate_index.indisunique
            AND NOT canonical_index.indisunique
            AND duplicate_index.indisvalid
            AND canonical_index.indisvalid
            AND duplicate_index.indkey = canonical_index.indkey
            AND duplicate_index.indclass = canonical_index.indclass
            AND duplicate_index.indcollation = canonical_index.indcollation
            AND duplicate_index.indoption = canonical_index.indoption
            AND duplicate_index.indexprs IS NOT DISTINCT FROM canonical_index.indexprs
            AND duplicate_index.indpred IS NOT DISTINCT FROM canonical_index.indpred
        ) THEN
          RAISE EXCEPTION
            'Cannot drop index % because it is not structurally identical to %',
            index_pair.duplicate_name,
            index_pair.canonical_name;
        END IF;

        IF EXISTS (
          SELECT 1
          FROM pg_constraint dependency
          WHERE dependency.conindid = to_regclass(index_pair.duplicate_name)
        ) THEN
          RAISE EXCEPTION
            'Cannot drop index % because a constraint depends on it',
            index_pair.duplicate_name;
        END IF;

        EXECUTE format('DROP INDEX %I', index_pair.duplicate_name);
      END LOOP;
    END
    $migration$;
  `, { transaction });
};

// This migration removes physically redundant objects without changing the
// uniqueness contract. Recreating an arbitrary number of duplicates on
// rollback would restore the performance defect, so rollback is intentionally
// a semantic no-op.
const down = async () => {};

module.exports = { name: '051_cleanup_duplicate_video_indexes', up, down };
