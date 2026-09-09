-- Safe migration for projects that already ran the initial RIFTFOUND schema.

drop policy if exists "authenticated users refresh cards" on public.cards;
create policy "authenticated users refresh cards"
on public.cards for update to authenticated
using (true)
with check (true);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_username text;
begin
  requested_username := coalesce(nullif(new.raw_user_meta_data->>'username', ''), 'player_' || substr(new.id::text, 1, 8));
  if exists (select 1 from public.profiles where username = requested_username) then
    requested_username := left(requested_username, 15) || '_' || substr(new.id::text, 1, 8);
  end if;
  insert into public.profiles (id, username, display_name)
  values (new.id, requested_username, coalesce(new.raw_user_meta_data->>'display_name', 'Novo jogador'));
  return new;
end;
$$;
