-- MVP review 1: remove QA Apple test account and all app data (profiles cascades from auth.users).
-- Safe if the user does not exist (no-op).

begin;

delete from auth.users
where lower(email) = lower('testforapple@gmail.com');

commit;
