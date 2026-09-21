-- STEP E1: run ALONE (VACUUM cannot share a batch). Today's backfill rewrote
-- every listing twice, leaving dead rows that make every full scan slower.
vacuum analyze wholesale.listings;
