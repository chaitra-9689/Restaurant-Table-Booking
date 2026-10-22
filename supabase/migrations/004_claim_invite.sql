-- Lets an existing (already signed-up) user pick up an invite added later.
create or replace function claim_staff_invite() returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_role  staff_role;
begin
  if auth.uid() is null then
    return false;
  end if;
  select email into v_email from auth.users where id = auth.uid();
  select role into v_role from staff_invites where lower(email) = lower(v_email);
  if v_role is null then
    return false;
  end if;
  insert into staff (user_id, email, full_name, role)
  select u.id, u.email, coalesce(u.raw_user_meta_data->>'full_name', ''), v_role
  from auth.users u where u.id = auth.uid()
  on conflict (user_id) do nothing;
  delete from staff_invites where lower(email) = lower(v_email);
  return true;
end $$;

revoke execute on function claim_staff_invite() from public, anon;
grant  execute on function claim_staff_invite() to authenticated;
