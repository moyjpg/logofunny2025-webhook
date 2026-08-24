-- AI Studio generation modes: a focused two-concept start and an explicit
-- four-direction exploration. The server selects these action keys; clients
-- never submit their own price or output count.
INSERT INTO public.credit_action_catalog (
  action_key, user_label, credits_cost, required_entitlement, output_count,
  output_type, included_policy, refund_on_failure, confirmation_mode,
  enabled, rule_version, effective_at, metadata
) VALUES
  ('logo_concepts_standard_2', 'Generate 2 Logo Concepts', 5, 'core', 2,
   'logo_concept', 'none', true, 'inline', true, 'credits-rules-v3', now(),
   '{"generation_mode":"two_concepts","creative_routes":2}'::jsonb),
  ('logo_concepts_image_guided_2', 'Generate 2 image-guided Logo Concepts', 5, 'core', 2,
   'logo_concept', 'none', true, 'inline', true, 'credits-rules-v3', now(),
   '{"generation_mode":"two_concepts","creative_routes":2,"image_guided":true}'::jsonb),
  ('logo_directions_standard_4', 'Explore 4 Logo Directions', 10, 'core', 4,
   'logo_concept', 'none', true, 'inline', true, 'credits-rules-v3', now(),
   '{"generation_mode":"four_directions","creative_routes":4}'::jsonb),
  ('logo_directions_image_guided_4', 'Explore 4 image-guided Logo Directions', 10, 'core', 4,
   'logo_concept', 'none', true, 'inline', true, 'credits-rules-v3', now(),
   '{"generation_mode":"four_directions","creative_routes":4,"image_guided":true}'::jsonb)
ON CONFLICT (action_key) DO UPDATE SET
  user_label = EXCLUDED.user_label,
  credits_cost = EXCLUDED.credits_cost,
  output_count = EXCLUDED.output_count,
  output_type = EXCLUDED.output_type,
  included_policy = EXCLUDED.included_policy,
  refund_on_failure = EXCLUDED.refund_on_failure,
  confirmation_mode = EXCLUDED.confirmation_mode,
  enabled = EXCLUDED.enabled,
  rule_version = EXCLUDED.rule_version,
  effective_at = EXCLUDED.effective_at,
  metadata = EXCLUDED.metadata,
  updated_at = now();
