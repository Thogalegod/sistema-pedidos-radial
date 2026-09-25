-- Authenticated deletion flow for Manutencao Preventiva cleanup.
-- Local migration draft only. Do not apply before review.

GRANT DELETE ON public.manutencoes_preventivas TO authenticated;
GRANT DELETE ON public.cabines_primarias TO authenticated;

CREATE POLICY "manutencoes_preventivas delete by organization admins"
ON public.manutencoes_preventivas
FOR DELETE TO authenticated
USING (
  public.is_organization_member(organization_id)
  AND public.is_organization_admin(organization_id)
);

CREATE POLICY "cabines_primarias delete by organization admins"
ON public.cabines_primarias
FOR DELETE TO authenticated
USING (
  public.is_organization_member(organization_id)
  AND public.is_organization_admin(organization_id)
);
