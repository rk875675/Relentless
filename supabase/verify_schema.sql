-- Verification script for Relentless schema
-- Run this in Supabase Dashboard → SQL Editor → New Query
-- Combined into one result set so the SQL Editor shows everything.

SELECT section, name, detail
FROM (

  SELECT 'TABLES' AS section, table_name AS name, '' AS detail, 1 AS sort_key, table_name AS sort_sub
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'

  UNION ALL

  SELECT 'FUNCTIONS', routine_name, '', 2, routine_name
  FROM information_schema.routines
  WHERE routine_schema = 'public'

  UNION ALL

  SELECT 'TRIGGERS', trigger_name, event_object_table, 3, trigger_name
  FROM information_schema.triggers
  WHERE trigger_schema = 'public'

  UNION ALL

  SELECT 'RLS_ENABLED', c.relname, c.relrowsecurity::text, 4, c.relname
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'

  UNION ALL

  SELECT 'RLS_POLICIES', policyname, tablename || ' | ' || cmd, 5, policyname
  FROM pg_policies
  WHERE schemaname = 'public'

  UNION ALL

  SELECT 'INDEXES', indexname, tablename, 6, indexname
  FROM pg_indexes
  WHERE schemaname = 'public' AND indexname LIKE 'idx_%'

) AS combined
ORDER BY sort_key, sort_sub;
