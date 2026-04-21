-- Day 7 (Focus Anchor) is a commitment exercise; correct lesson_categories from mindfulness.

begin;

delete from public.lesson_categories
where lesson_id = 'd0000000-0000-0000-0000-000000000007'
  and category = 'mindfulness';

insert into public.lesson_categories (lesson_id, category)
values ('d0000000-0000-0000-0000-000000000007', 'commitment')
on conflict (lesson_id, category) do nothing;

commit;
