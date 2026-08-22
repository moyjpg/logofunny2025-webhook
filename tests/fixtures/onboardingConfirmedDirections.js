function makeConfirmed({
  id,
  brand,
  business,
  roughFeeling = "",
  audience = null,
  desired = [],
  undesired = [],
  ideas = [],
  style = null,
  main = null,
  hard = [],
  soft = [],
  avoid = [],
  voluntary = "",
  answers = [],
  advanced = {},
  inferences = [],
  edits = [],
  conflicts = [],
}) {
  return {
    contract_version: "confirmed_direction.v1",
    request_id: id,
    facts: {
      brand_name: brand,
      business_context: business,
      audience,
      desired_feelings: desired,
      undesired_feelings: undesired,
      existing_visual_ideas: ideas,
      visual_style_leaning: style,
      main_direction: main,
    },
    constraints: { hard, soft, things_to_avoid: avoid },
    advanced_choices: {
      visual_style: "let_logofunny_decide",
      color_preference: "let_logofunny_decide",
      color_description: "",
      existing_visual_idea_preference: "let_logofunny_decide",
      logo_structure: "auto",
      icon_direction: "auto",
      detail_level: "auto",
      typography: "auto",
      ...advanced,
    },
    provenance: {
      raw_user_input: {
        brand_name: brand,
        business_description: business,
        rough_feeling: roughFeeling,
      },
      voluntary_extra_context: voluntary,
      adaptive_answers: answers,
      ai_inferences: inferences,
      user_summary_edits: edits,
      resolved_conflicts: conflicts,
    },
    confirmed_at: "2026-08-20T08:00:00.000Z",
  };
}

const phork = makeConfirmed({
  id: "fixture_phork",
  brand: "PHORK",
  business: "A neighborhood restaurant serving playful comfort food.",
  roughFeeling: "bold, playful, a little irreverent",
  audience: "Local diners who enjoy casual, memorable restaurants.",
  desired: ["bold", "playful", "a little irreverent"],
  undesired: ["childish"],
  style: "hand-drawn, organic",
  main: "A bold, playful restaurant identity that feels witty without becoming childish.",
  hard: ["No mascots."],
  soft: ["Keep it approachable."],
  avoid: ["No mascots.", "Not childish."],
  voluntary: "Keep it approachable. Definitely no mascots. It should be playful, not childish.",
  answers: [{
    id: "audience",
    question: "Who is this mainly for?",
    answer: "Local diners who enjoy casual, memorable restaurants.",
  }],
  inferences: [
    { id: "style_phork", field: "styleHint", value: "hand-drawn, organic", confidence: 0.78, status: "active" },
    { id: "main_phork", field: "mainDirection", value: "A bold, playful restaurant identity that feels witty without becoming childish.", confidence: 0.82, status: "active" },
  ],
});

const luma = makeConfirmed({
  id: "fixture_luma",
  brand: "LUMA",
  business: "A platform for creators to organize and present their work.",
  voluntary: "I don't really know what style I want.",
});

const northline = makeConfirmed({
  id: "fixture_northline",
  brand: "Northline",
  business: "Independent financial planning for young families.",
  roughFeeling: "premium and luxurious",
  audience: "Young families looking for clear, independent financial guidance.",
  desired: ["calm", "capable", "slightly premium"],
  undesired: ["luxury", "cold", "corporate"],
  style: "clean, geometric",
  main: "A calm, capable financial identity that feels polished but never luxurious or corporate.",
  hard: ["Do not make it feel like a luxury bank."],
  avoid: ["Do not make it feel like a luxury bank.", "Avoid cold corporate styling."],
  voluntary: "It should feel clear and human, not like a cold corporate bank.",
  answers: [{
    id: "audience",
    question: "Who is this mainly for?",
    answer: "Young families looking for clear, independent financial guidance.",
  }],
  inferences: [
    { id: "old_luxury", field: "howItShouldFeel", value: "premium and luxurious", confidence: 0.72, status: "invalidated" },
    { id: "northline_main", field: "mainDirection", value: "A calm, capable financial identity that feels polished but never luxurious or corporate.", confidence: 0.9, status: "active" },
  ],
  edits: [{
    field: "howItShouldFeel",
    previous_value: "premium and luxurious",
    previous_source: "ai_inferred",
    new_value: "calm, capable, slightly premium, but definitely not luxury",
    edited_at: "2026-08-20T07:58:00.000Z",
    invalidated_inference_ids: ["old_luxury"],
  }],
});

const mossAndTail = makeConfirmed({
  id: "fixture_moss_and_tail",
  brand: "Moss & Tail",
  business: "Sustainable everyday accessories for dogs and their owners.",
  roughFeeling: "warm, natural, playful but not cutesy",
  audience: "Design-conscious dog owners who care about durable materials.",
  desired: ["warm", "natural", "playful but not cutesy"],
  undesired: ["cutesy", "plastic-looking"],
  ideas: ["A simple tail shape woven into a leaf."],
  style: "hand-drawn, organic",
  main: "A warm, natural identity with a subtle sense of play and durable craft.",
  soft: ["Keep the visual idea simple enough to work at small sizes."],
  avoid: ["Not cutesy.", "Avoid anything plastic-looking."],
  voluntary: "The products are made from recycled climbing rope. A simple tail shape woven into a leaf could be interesting. Not cutesy.",
  answers: [{
    id: "audience",
    question: "Who is this mainly for?",
    answer: "Design-conscious dog owners who care about durable materials.",
  }],
  advanced: {
    color_preference: "i_have_a_color_in_mind",
    color_description: "moss green and warm cream",
    existing_visual_idea_preference: "use_my_notes",
  },
});

module.exports = { phork, luma, northline, mossAndTail };
