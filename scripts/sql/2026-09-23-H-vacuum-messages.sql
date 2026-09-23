-- STEP H: run ALONE. Twelve WhatsApp connector restarts overnight re-synced
-- history into wholesale.messages and left dead rows at the top of its time
-- index, so "newest message" (used by the watchdog, ingest and Health tab)
-- takes 10 seconds while "newest by id" takes 1. Vacuum clears them.
vacuum analyze wholesale.messages;
