-- Prevent two active bookings from holding the same table at overlapping times,
-- regardless of whether the change came from the website RPC or a staff edit.

create or replace function check_table_overlap() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.table_id is not null and new.status in ('pending','confirmed','seated') then
    if exists (
      select 1 from bookings b
      where b.table_id = new.table_id
        and b.id <> new.id
        and b.booking_date = new.booking_date
        and b.status in ('pending','confirmed','seated')
        and b.start_time < new.end_time
        and b.end_time > new.start_time
    ) then
      raise exception 'Table is already booked for an overlapping time' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_bookings_overlap on bookings;
create trigger trg_bookings_overlap before insert or update of table_id, booking_date, start_time, end_time, status
  on bookings for each row execute function check_table_overlap();

revoke execute on function check_table_overlap() from public, anon, authenticated;
