-- Run AFTER you created the user in Supabase > Authentication > Users.
insert into admins (user_id, role)
select id, 'super_admin' from auth.users where email = 'radnuscreativemedia@gmail.com'
on conflict (user_id) do update set role = 'super_admin';
-- Check: should return 1 row
select u.email, a.role from admins a join auth.users u on u.id = a.user_id;
