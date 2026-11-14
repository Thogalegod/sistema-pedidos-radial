-- Authorized by Thomás on 2026-11-14. Run only on IURQ after identity preflight.
DO $$
DECLARE v_org uuid; v_user uuid;
BEGIN
  SELECT o.id INTO STRICT v_org FROM public.organizations o WHERE o.slug = 'radial';
  SELECT u.id INTO STRICT v_user FROM auth.users u
    JOIN public.organization_members m ON m.user_id = u.id AND m.organization_id = v_org
    WHERE lower(u.email) = 'thomas@radialenergia.com.br';
  IF EXISTS (SELECT 1 FROM private.rental_financial_owners WHERE organization_id = v_org AND user_id <> v_user) THEN
    RAISE EXCEPTION 'unexpected existing financial owner';
  END IF;
  INSERT INTO private.rental_financial_owners (organization_id, user_id) VALUES (v_org, v_user)
    ON CONFLICT (organization_id) DO NOTHING;
  -- Legacy boleto workflows also require this capability. No administrator promotion.
  UPDATE public.organization_members SET can_manage_billing = true
    WHERE organization_id = v_org AND user_id = v_user;
END;
$$;
SELECT o.slug, u.email, m.role, m.can_manage_billing
FROM private.rental_financial_owners f
JOIN public.organizations o ON o.id = f.organization_id
JOIN auth.users u ON u.id = f.user_id
JOIN public.organization_members m ON m.organization_id = f.organization_id AND m.user_id = f.user_id;
