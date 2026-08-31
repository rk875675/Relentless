-- ============================================================================
-- 20260831040000_brock_short_offer_label.sql
-- Brock's self-written CTA ("Book a free mental coaching intro session!")
-- overflows the two-button coach card row. Shorten it to fit beside About Me.
-- ============================================================================

begin;

update public.coaches
   set offer_label = 'Book a free intro'
 where coach_key = 'brock-mccormack';

commit;
