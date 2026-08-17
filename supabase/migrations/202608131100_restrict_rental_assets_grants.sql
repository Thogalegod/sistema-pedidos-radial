-- Restrict rental_assets grants to the minimum required for authenticated users.

REVOKE ALL ON TABLE public.rental_assets FROM PUBLIC;
REVOKE ALL ON TABLE public.rental_assets FROM anon;
REVOKE ALL ON TABLE public.rental_assets FROM authenticated;

GRANT SELECT, INSERT, UPDATE
ON TABLE public.rental_assets
TO authenticated;
