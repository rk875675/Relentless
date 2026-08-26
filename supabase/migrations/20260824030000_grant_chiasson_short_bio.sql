-- Update Grant's short bio from the old V1 placeholder to current copy.
update public.coaches
   set bio = 'Former D1 QB turned Mental Performance Coach. Certified by Brian Cain & Ben Newman.'
 where coach_key = 'grant-chiasson';
