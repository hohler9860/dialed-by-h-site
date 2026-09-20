-- STEP D: requeue every failed job. Deleting the failed row is how the jobs
-- architecture requeues (same thing the admin "Requeue all failed" button does):
-- the worker re-claims any listing in an entry status that has no job row.
delete from wholesale.jobs where status = 'failed';
select status, count(*) from wholesale.jobs group by 1;
