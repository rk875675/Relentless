-- Publish Iaia Colella's "THE 8 MENTAL DIMENSIONS OF PERFORMANCE" pack.
-- Program + all 9 lessons were loaded with production_ready = false (preview
-- gate). Content has been reviewed; flip the gate so non–is_dev users can see
-- the pack in catalog / enroll / play.

begin;

update public.programs
   set production_ready = true
 where id = '31fa5ef4-e606-4949-9685-25c2ed06a325'
   and program_key = 'the-8-mental-dimensions-of-performance';

update public.lessons
   set production_ready = true
 where program_id = '31fa5ef4-e606-4949-9685-25c2ed06a325';

commit;
