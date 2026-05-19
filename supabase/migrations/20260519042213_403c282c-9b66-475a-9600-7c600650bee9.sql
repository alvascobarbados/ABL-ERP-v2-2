ALTER TABLE public.customers REPLICA IDENTITY FULL;
ALTER TABLE public.suppliers REPLICA IDENTITY FULL;
ALTER TABLE public.team_members REPLICA IDENTITY FULL;
ALTER TABLE public.products REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.suppliers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;