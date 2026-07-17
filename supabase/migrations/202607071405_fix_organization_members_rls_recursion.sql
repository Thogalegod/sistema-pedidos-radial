-- Helper functions must exist before the policies below because the same migration uses them in policy expressions.

CREATE OR REPLACE FUNCTION public.is_organization_member(target_org uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.organization_members AS membership
      WHERE membership.organization_id = target_org
        AND membership.user_id = auth.uid()
    );
$function$;

REVOKE ALL ON FUNCTION public.is_organization_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_organization_member(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_organization_admin(target_org uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.organization_members AS membership
      WHERE membership.organization_id = target_org
        AND membership.user_id = auth.uid()
        AND membership.role = 'admin'
    );
$function$;

REVOKE ALL ON FUNCTION public.is_organization_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_organization_admin(uuid) TO authenticated;

DROP POLICY IF EXISTS "Users can select membership details within their organizations" ON public.organization_members;
DROP POLICY IF EXISTS "Admins can manage organization members" ON public.organization_members;

CREATE POLICY "Users can select own organization memberships" ON public.organization_members
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can select organization memberships" ON public.organization_members
  FOR SELECT USING (public.is_organization_admin(organization_id));

CREATE POLICY "Admins can insert organization memberships" ON public.organization_members
  FOR INSERT WITH CHECK (public.is_organization_admin(organization_id));

CREATE POLICY "Admins can update organization memberships" ON public.organization_members
  FOR UPDATE USING (public.is_organization_admin(organization_id))
  WITH CHECK (public.is_organization_admin(organization_id));
