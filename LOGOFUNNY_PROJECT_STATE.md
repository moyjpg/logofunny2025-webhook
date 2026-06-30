# LOGOFUNNY_PROJECT_STATE

1. Project Overview

1.1 Product

LogoFunny is an AI logo generation product designed to help non-designers quickly create usable logo concepts.

Primary target users:

* Small brands
* Startup founders
* Amazon sellers
* Etsy sellers
* Coffee shops
* Pet brands
* Handmade brands
* Wedding parties
* Commercial event / party theme design users

Current product goal:

LogoFunny should generate multiple logo directions that are commercially usable, clean, and understandable for real users. The product should not feel like a template library that only rearranges pre-made logo layouts. The long-term differentiation is AI-generated multi-direction concepts, not template recombination.

The current focus is not feature stacking. The current focus is generation quality.

1.2 Current Quality Goal

The current generation goal is:

* Commercially usable logo outputs
* Clean brand names
* Fewer fake small texts
* Fewer presentation-board layouts
* Fewer trademark-like symbols
* Fewer dirty marks, watermarks, or mockup-copy artifacts
* Enough creativity to avoid boring, generic SaaS / AI icons
* Not over-constrained prompts that suppress AI creativity

Core quality principle:

Suppress dirty output, not imagination.

In Chinese working language:

压制脏输出，不压制 AI 创意。

1.3 Current Technical Stack

Known stack from current project context:

* Frontend: Next.js 14
* Frontend hosting: Vercel
* Backend: Node / Express-style backend
* Backend hosting: Render
* Storage: Cloudflare R2
* Public asset domain: https://assets.logofunny.com/logos/...
* Auth / database: Supabase
* Email: Resend
* Payment: Dodo Payments
* Image generation:
    * Ideogram V2 Turbo as the main production generator
    * OpenAI image generation currently added for internal test / hybrid evaluation
* AI quality judge:
    * Existing services/openaiJudge.js
    * Known functions include judgeLogo() and isCommercialLogoPass()

1.4 Repo Paths

Frontend path:

/Volumes/MOY WorkSSD/AI_WORK/v0-logo-funny-landing-page

Backend path:

/Volumes/MOY WorkSSD/AI_WORK/logofunny-backend

Backend GitHub remote:

moyjpg/logofunny2025-webhook.git

Backend Render service:

logofunny-backend

Exact Render dashboard URL:

Unknown / needs verification

⸻

2. Current Production State

2.1 Live /generate-logo

The live production route /generate-logo exists and is the real user-facing generation route.

Current instruction:

Do not modify live /generate-logo during the current Hybrid v1.4 Step 1 work.

The current Hybrid work is internal only and must not affect the live production generation route.

2.2 Production Features Already Built / Known Completed

Known completed production or product-side functionality from project history:

* Homepage / landing page
* Generate Studio style flow
* Email signup / login flow with Supabase
* Free user generation flow
* Pro status / remaining usage display
* Settings page
* My Creations
* Saved Inspirations
* Upload reference image for Pro
* PNG download
* Brand Advisor / Brand Coach style insight
* 4 concept generation structure
* Cloudflare R2 image persistence for generated images
* Payment-related work using Dodo Payments
* Referral and refund-related backend work previously implemented
* Brand Coach loading state
* Guidance chips / industry idea helpers
* Internal OpenAI test route
* Internal Hybrid test route

Some details may need verification directly from repo before changing.

2.3 Production Risk Areas

Do not casually modify the following production-sensitive areas:

* Live /generate-logo
* Credit charging
* Refund logic
* Referral logic
* Supabase user/profile usage limits
* Dodo payment flow
* Auth / account state
* Production image storage behavior
* Production response shape used by frontend
* Existing frontend display assumptions

Current Hybrid work must remain isolated to internal test routes unless explicitly approved.

2.4 Current Production Rule

The current Hybrid route must not be connected to live /generate-logo.

Reason:

Hybrid generation quality is not yet stable enough for real users. The internal route is still being used to compare Ideogram + OpenAI behavior, quality metadata, model roles, and safe lead-selection strategy.

⸻

3. Current Hybrid Test State

3.1 Route

Internal route:

POST /generate-logo-hybrid-test

This is an internal test route only.

It does not affect:

/generate-logo

It must remain behind internal test controls and must not be exposed as the real production generation path unless explicitly approved later.

3.2 Internal Flags / Environment

Known required flags / variables from current context:

LOGOFUNNY_HYBRID_TEST_ENABLED=true
LOGOFUNNY_OPENAI_IMAGE_ENABLED=true
LOGOFUNNY_INTERNAL_TEST_SECRET=<secret>
OPENAI_API_KEY=<present>

Do not reveal or screenshot secret values.

3.3 Latest Completed Hybrid Version

Current completed version before active uncommitted Step 1:

Hybrid v1.3

Latest pushed and deployed backend commit:

aa529f9 Adjust hybrid OpenAI creative slots

Known status:

* Commit aa529f9 was pushed to origin/main
* Render deploy for aa529f9 was confirmed successful by user
* Hybrid v1.3 route works
* All 4 slots returned assets.logofunny.com R2 persistent URLs in testing

3.4 Current Hybrid v1.3 Slot Assignment

Current /generate-logo-hybrid-test v1.3 model assignment:

slot 0 = Ideogram Lead concept
slot 1 = Ideogram Custom wordmark
slot 2 = OpenAI symbol_mark
slot 3 = OpenAI wordmark

Important previous change:

* Slot 3 was changed from OpenAI recommended to OpenAI wordmark
* Purpose: avoid generic OpenAI recommended icon outputs and test whether OpenAI can produce cleaner wordmark alternatives

3.5 R2 Persistence Status

Before R2 persistence fix, Ideogram slots returned ephemeral Ideogram URLs while OpenAI slots returned R2 public URLs.

This has been fixed.

All 4 slots now return persistent links under:

https://assets.logofunny.com/logos/...

Known related commit before aa529f9:

f04573e Persist Ideogram hybrid test slots to R2

3.6 Recent Hybrid v1.3 Test Conclusion

Test brand:

Brand: Nexora
Industry: SaaS / Tech
Subtitle: AI Workflow Studio
Color: Blue
Style: Symbol + Wordmark, Minimal & Modern, Geometric & Simple
Icon: Abstract Symbol, Simple Icon
Detail: Balanced

Recent visual evaluation, in order:

Slot 0 — Ideogram Lead concept

Conclusion:

Commercial feeling is acceptable, but it contains fake small text / presentation-board copy.
It should not be used as recommended Lead.

Observed issue:

* Looks like a logo presentation board
* Includes extra small unreadable copy / fake text
* Commercial direction may be okay, but output is dirty

Current implication:

* Ideogram can produce better commercial logo composition
* But it can also generate artifacts that should prevent Lead recommendation

Slot 1 — Ideogram Custom wordmark

Conclusion:

Cleanest and safest result, but conservative.

Observed strengths:

* Brand name is clean
* No obvious fake small text
* More usable than Slot 0
* Commercially safer

Observed weakness:

* Creative impact is limited
* Looks like a relatively standard SaaS wordmark

Slot 2 — OpenAI symbol_mark

Conclusion:

Clean, but the parenthesis / sparkle direction is too generic.

Observed strengths:

* Cleaner than dirty Ideogram outputs
* No fake microcopy observed

Observed weakness:

* Too generic
* Parenthesis + spark / star direction does not feel brand-specific enough
* Not strongly tied to Nexora / AI workflow

Slot 3 — OpenAI wordmark

Conclusion:

v1.3 works. Slot 3 is now OpenAI wordmark.
It is clean, but creatively weak.
It adds sparkle rather than truly redesigning letter construction.

Observed strengths:

* Clean
* Confirms slot 3 changed successfully from recommended to wordmark

Observed weakness:

* Does not significantly redesign the typography
* Too decorative
* Needs future prompt improvement focused on custom letter construction

3.7 Strategic Hybrid Conclusion

Current model judgment:

Ideogram has stronger commercial logo composition.
OpenAI is cleaner but often too generic or weak in typography.
Hybrid should combine Ideogram commercial strength with OpenAI cleanliness and creative alternatives.

Do not connect Hybrid to production yet.

3.8 Hybrid v1.4 Step 1 — Deployment and Test Result

Commit be1e4fa "Add hybrid quality metadata and project state doc" was pushed to origin/main.

Render deploy for be1e4fa confirmed live.

/generate-logo-hybrid-test was tested with brand Nexora after deploy.

Test input:

* Brand: Nexora
* Industry: SaaS / Tech
* Subtitle: AI Workflow Studio
* Color: Blue
* Style: Symbol + Wordmark, Minimal & Modern, Geometric & Simple
* Icon: Abstract Symbol, Simple Icon
* Detail: Balanced

Test result — all 4 slots returned hasImageUrl: true and include qualityStatus, qualityWarnings, and isSafeForLead:

slot 0 — Ideogram Lead concept
  qualityStatus: pass
  qualityWarnings: []
  isSafeForLead: true

slot 1 — Ideogram Custom wordmark
  qualityStatus: needs_review
  qualityWarnings: ["May include trademark-like symbols"]
  isSafeForLead: false

slot 2 — OpenAI symbol_mark
  qualityStatus: pass
  qualityWarnings: []
  isSafeForLead: true

slot 3 — OpenAI wordmark
  qualityStatus: pass
  qualityWarnings: []
  isSafeForLead: true

Conclusion:

Hybrid v1.4 Step 1 is verified successful.

Important:

This test only verified metadata behavior. It did not change production /generate-logo and did not start Step 2 prompt work.

⸻

4. Current Task / Active Work

4.1 Current Active Work Name

Current active work:

Hybrid v1.4 Step 1 only — quality metadata for /generate-logo-hybrid-test

This is not a production launch feature.

This is an internal test-route enhancement to annotate each generated slot with quality metadata.

4.2 Step 1 Goal

Add quality metadata to each result item in /generate-logo-hybrid-test.

Allowed metadata fields:

qualityStatus: "pass" | "needs_review" | "unchecked"
qualityWarnings: string[]
isSafeForLead: boolean

4.3 Step 1 Rules

Current Step 1 must obey all of these rules:

* Do not hide results
* Do not drop results
* Do not reorder results
* Do not regenerate results
* Do not block results
* Do not change Lead logic
* Do not change slot numbers
* Do not change concept labels
* Do not change model assignment
* Do not change the response shape except adding metadata fields to each results item
* Do not affect live /generate-logo
* Do not affect /generate-logo-openai-test
* Do not modify prompt logic
* Do not modify OpenAI image service
* Do not modify judge service

4.4 Current Claude-Edited State

Claude has already edited the backend, but the edit is currently not committed and not pushed.

Current modified file:

routes/logoApiRoutes.js

Current git status:

M routes/logoApiRoutes.js

No other modified files are expected.

4.5 Current Uncommitted Code Changes

Claude has made these changes:

Import change

Before:

const { judgeLogo } = require('../services/openaiJudge');

After:

const { judgeLogo, isCommercialLogoPass } = require('../services/openaiJudge');

Hybrid route quality annotation

Inside POST /generate-logo-hybrid-test, after the 4 slot results are assembled and each imageUrl is available, Claude inserted a quality annotation pass.

Current behavior added:

* Runs judgeLogo() on all slots with imageUrl
* Uses Promise.allSettled
* Skips judge call for slots without imageUrl
* Keeps original result items
* Adds metadata to each result item

Expected fields added per result item:

qualityStatus: "pass" | "needs_review" | "unchecked"
qualityWarnings: string[]
isSafeForLead: boolean

Known warning mapping added:

const HYBRID_VIOLATION_WARNINGS = {
  hasTrademarkSymbol: 'May include trademark-like symbols',
  hasFakeText: 'May include small unreadable or extra text',
  hasPresentationLayout: 'May look like a presentation board rather than a single logo',
};

Current judge failure behavior:

qualityStatus: "unchecked"
qualityWarnings: ["Quality check unavailable"]
isSafeForLead: false

Current no-image behavior:

qualityStatus: "unchecked"
qualityWarnings: []
isSafeForLead: false

Current successful judge behavior:

* Uses judgeResult.violations
* Builds warnings from known violation flags
* Sets:

qualityStatus = warnings.length > 0 ? "needs_review" : "pass"
isSafeForLead = isCommercialLogoPass(judgeResult)

4.6 Current Verification Already Run

Claude ran syntax check:

node -c "/Volumes/MOY WorkSSD/AI_WORK/logofunny-backend/routes/logoApiRoutes.js"

Result:

No output, syntax passes.

Claude ran:

cd "/Volumes/MOY WorkSSD/AI_WORK/logofunny-backend" && git status --short

Result:

M routes/logoApiRoutes.js

4.7 Current Terminal State

The terminal is currently stopped at a Claude prompt suggesting commit:

Commit only routes/logoApiRoutes.js — message: "Add quality gate to hybrid test route"

Important:

Do not confirm commit yet.

Reason:

The user requested a project state handoff document first. The diff should be manually reviewed before commit.

4.8 Current Pending Commit Message

Claude suggested:

Add quality gate to hybrid test route

The user later requested suggested next steps with this commit message:

Add quality metadata to hybrid test route

Preferred commit message:

git commit -m "Add quality metadata to hybrid test route"

This better describes Step 1 as metadata-only and avoids implying production gating.

⸻

5. Strict No-Touch Areas

During the current active work, do not modify the following unless the user explicitly approves a new scope.

5.1 Files Not to Touch

Do not modify:

services/openaiImageService.js
services/openaiJudge.js
services/ideogramService.js
services/r2Upload.js

Do not modify frontend:

/Volumes/MOY WorkSSD/AI_WORK/v0-logo-funny-landing-page

Do not modify any production payment / data / account logic.

5.2 Routes Not to Touch

Do not modify:

live /generate-logo route
/generate-logo-openai-test

Do not connect:

/generate-logo-hybrid-test

to:

/generate-logo

5.3 Business Logic Not to Touch

Do not touch:

* Payments
* Dodo
* Credits
* Refund
* Referral
* Supabase
* Auth
* User profile limits
* Production generation quota logic

5.4 Prompt Work Not to Do Yet

Do not continue modifying OpenAI prompt yet.

Specifically, do not modify:

services/openaiImageService.js

Reason:

Hybrid v1.4 Step 1 is quality metadata only. Prompt improvement is Step 2 and must be done separately after Step 1 is verified.

5.5 Git Rules

Do not commit unless the user explicitly agrees.

Do not push unless the user explicitly agrees.

Do not let Claude or Codex auto-expand the scope.

⸻

6. Quality Strategy

6.1 Core Principle

Current quality strategy:

Suppress dirty output, not creativity.

Chinese working version:

压制脏输出，不压制 AI 创意。

Meaning:

* Do not add long negative prompt lists that make the model boring or confused
* Do not over-constrain the model
* Do not reduce all logos to safe generic icons
* Instead, identify dirty outputs after generation and mark them safely

6.2 Step 1 Quality Metadata Strategy

Current Step 1 should only annotate outputs.

Metadata fields:

qualityStatus: "pass" | "needs_review" | "unchecked"
qualityWarnings: string[]
isSafeForLead: boolean

Intended usage:

* Help internal testing understand which slots are clean
* Help identify fake text / presentation layouts / trademark-like symbols
* Prepare for future lead-selection logic
* Keep all images visible during testing

6.3 What Step 1 Must Not Do

Step 1 must not:

* Hide images
* Reorder images
* Drop images
* Regenerate images
* Automatically select a different Lead
* Change user-facing production behavior
* Change prompt behavior
* Change production response shape

6.4 Future Quality Direction

After Step 1 is stable, future stages may consider:

* Preventing dirty images from becoming Lead
* Displaying internal quality warnings
* Demoting images with fake text or presentation layout
* Using isSafeForLead to choose Lead
* Adding UI hints for needs-review outputs
* Improving prompt roles for OpenAI creative slots

But none of the above is current Step 1.

6.5 User Quality Preference

User prioritizes:

* Commercially usable results
* Clean outputs
* Correct brand names
* Fewer fake small texts
* Less presentation-board style
* Less generic AI/SaaS icon behavior
* But also wants creativity and variety

User does not want the product to become overly safe, boring, or template-like.

⸻

7. Prompt / Model Strategy Notes

7.1 Ideogram

Current observed strengths:

* Stronger commercial logo composition
* Better main logo system feeling
* Better at brand-name logo layout

Current observed weaknesses:

* Can produce fake small text
* Can generate presentation-board / mockup-style layouts
* Can add dirty symbols or extra copy
* Can produce subtitle-like or display-board artifacts

Current strategy:

* Keep Ideogram as important commercial logo generator
* Do not overload it with long negative prompt lists
* Use post-generation quality metadata to identify dirty outputs

7.2 OpenAI Image Generation

Current observed strengths:

* Cleaner images
* Less fake microcopy in recent tests
* Useful as a creative complement

Current observed weaknesses:

* Can be too generic
* Symbol marks may become generic arrows / nodes / sparkles / brackets
* Wordmark outputs may add decoration instead of changing letter construction
* Typography creativity is not yet strong enough

7.3 Hybrid Goal

Hybrid goal:

Use Ideogram for commercial logo strength.
Use OpenAI for cleaner creative alternatives.
Use quality metadata to prevent dirty outputs from becoming trusted Lead candidates later.

7.4 Current Prompt Rule

Do not continue OpenAI prompt changes yet.

Current focus:

First validate Hybrid v1.4 Step 1 quality metadata.
Then separately decide Step 2 prompt improvements.

7.5 Future Step 2 Prompt Direction

After Step 1 is stable, consider OpenAI prompt improvements:

For symbol_mark:

* More brand-specific metaphor
* Avoid generic parenthesis / sparkle / arrow / node outputs
* Stronger silhouette
* More abstract N/X fusion
* More unique visual structure tied to brand concept

For wordmark:

* Focus on letter construction
* Ligatures
* Cuts
* Joins
* Rhythm
* Custom typography
* Integrated symbol-letter relationships
* Avoid simply adding sparkles or decorative marks

Step 2 must be separate from Step 1.

⸻

8. Business / Product Notes

8.1 Differentiation

LogoFunny should not compete as a simple template library.

Differentiation:

AI-generated multi-direction logo concepts, not template recombination.

Many competitors rely heavily on template libraries and rearranged logo layouts. This can be an advantage for LogoFunny if output quality becomes commercially usable.

8.2 Target Use Cases

LogoFunny should remain understandable and useful for:

* Small brands
* Amazon sellers
* Etsy shops
* Coffee shops
* Pet brands
* Handmade brands
* Wedding parties
* Commercial activities
* Party themes
* Startup founders
* Personal projects

8.3 Language / UX Style

User prefers Apple-like language:

* Simple
* Direct
* Friendly
* Non-technical
* Easy for non-designers
* Avoid designer-only jargon
* Explain what to do next clearly
* Reduce learning time

8.4 Product Priority

Current priority:

Quality before feature stacking.

The product should feel trustworthy before driving more users into generation.

8.5 Free Usage Perception

A real user previously asked why the free allowance only gives very few clicks / generations.

This is a product perception issue to revisit later.

Do not change credits or pricing during the current Hybrid quality work.

Known earlier pricing / credit ideas exist, but they are not current scope.

⸻

9. Operational Rules for Future Chats

9.1 First Step in Any Future Chat

Before continuing work, read this document.

Confirm:

* Current task
* Current branch / repo
* Current modified files
* Current no-touch areas
* Whether there is an uncommitted change
* Whether commit or push is allowed

Do not rely on memory alone.

Do not guess project state.

9.2 Scope Control

Only work within the explicitly approved scope.

For current task, the scope is:

routes/logoApiRoutes.js only
/generate-logo-hybrid-test only
quality metadata only

No cross-scope edits.

No “while I’m here” improvements.

No production route changes.

No payment / credit / database changes.

9.3 Terminal Confirmation Rules

When terminal shows confirmation:

* If it is read-only, such as git diff, git status, grep, rg, sed, cat, node -c, it is usually safe to approve once.
* If it edits code, confirm the file path and scope first.
* If it commits, only approve after user explicitly agrees.
* If it pushes, only approve after user explicitly agrees.
* Never choose broad session-wide approval unless the user explicitly wants it.
* Prefer one-time approval: 1 Yes.

9.4 Required Checks Before Commit

Before commit:

git diff routes/logoApiRoutes.js
node -c routes/logoApiRoutes.js
git status --short

Confirm only intended file is modified.

9.5 Commit / Push Rules

Commit requires explicit user approval.

Push requires explicit user approval.

After push, wait for Render deploy confirmation before testing live backend endpoint.

9.6 Production Caution

Production route and payment-related areas are high risk.

Do not modify:

* /generate-logo
* Dodo
* credits
* refunds
* referral
* Supabase
* auth

without a separate plan and explicit approval.

9.7 Claude / Codex Coordination

When using Claude or Codex:

* Ask for analysis first when risk is unclear
* Do not allow broad edits
* Give exact files allowed
* Give exact files not allowed
* Require diff
* Require syntax checks
* Require git status
* Do not allow commit or push unless explicitly approved

⸻

10. Suggested Next Steps

A. Manually inspect current diff

Run or review:

cd "/Volumes/MOY WorkSSD/AI_WORK/logofunny-backend"
git diff routes/logoApiRoutes.js

Confirm:

* Only /generate-logo-hybrid-test logic changed
* Only metadata added to result items
* No slot order changed
* No model assignment changed
* No concept labels changed
* No production /generate-logo touched
* No OpenAI prompt touched

B. If diff is satisfactory, commit only this file

Preferred commit:

cd "/Volumes/MOY WorkSSD/AI_WORK/logofunny-backend"
git add routes/logoApiRoutes.js
git commit -m "Add quality metadata to hybrid test route"

Do not use a broader commit message if the change remains metadata-only.

C. Push backend main

Only after commit is approved:

git push origin main

D. Wait for Render deploy

Wait for Render deployment to complete successfully.

Record deployed commit hash.

E. Test /generate-logo-hybrid-test

After deploy, test the internal route.

Confirm each slot returns:

qualityStatus
qualityWarnings
isSafeForLead

Expected slot assignment should remain:

slot 0 = Ideogram Lead concept
slot 1 = Ideogram Custom wordmark
slot 2 = OpenAI symbol_mark
slot 3 = OpenAI wordmark

F. Verify failure behavior

Test or inspect safety behavior:

* Slot with imageUrl should be judged
* Slot without imageUrl should not call judgeLogo
* Judge failure should keep original image and annotate as unchecked
* No image should be hidden
* No result should be reordered
* No Lead logic should change

G. Only after Step 1 is stable, start Step 2

Step 2 should be a separate task:

Hybrid v1.4 Step 2 — OpenAI creative slot prompt improvements

Possible focus:

* Improve OpenAI symbol_mark
* Improve OpenAI wordmark
* Make wordmark prompt focus on letter construction
* Avoid sparkle-only decoration
* Keep prompts open and creative
* Do not add long negative rules

Do not mix Step 2 with Step 1.

⸻

11. Known Recent Commits

Relevant backend commits from recent Hybrid work:

177b64a Add Phase 1.0 OpenAI image service
1715074 Add internal OpenAI image test route
e72cc90 Fix OpenAI image response parameter
556e42c Improve OpenAI logo prompt diversity
bb64ec3 Add OpenAI concept territory prompts
7cffd8b Add internal hybrid generation test route
f04573e Persist Ideogram hybrid test slots to R2
aa529f9 Adjust hybrid OpenAI creative slots
be1e4fa Add hybrid quality metadata and project state doc

Current deployed commit:

be1e4fa Add hybrid quality metadata and project state doc

Current uncommitted local change:

None — working tree is clean.

⸻

12. Last Known State

Last known state updated 2026-06-26:

Project: LogoFunny backend + frontend
Backend path: /Volumes/MOY WorkSSD/AI_WORK/logofunny-backend
Frontend path: /Volumes/MOY WorkSSD/AI_WORK/v0-logo-funny-landing-page
Latest pushed backend commit:
ec35459 Add lead recommendation to hybrid test route
Latest pushed frontend commit:
e8b85d3 Align free plan value copy
Backend deploy:
ec35459 was confirmed deployed successfully on Render.
Hybrid v1.5 status:
VERIFIED COMPLETE — recommendation object and isRecommended per result working.
Frontend pricing/copy cleanup:
COMPLETE — 7 frontend commits pushed and live.
Current local git status (both repos):
Clean — no uncommitted changes.
Current active task:
None. Both backend Hybrid and frontend copy cleanup are complete for this session.
Next recommended steps:
1. Final live UI review of Hero, Pricing, FAQ, My Creations, out-of-credits modal.
2. Decide whether to continue product-quality work or move to Amazon Ads Doctor P0 work.
3. Do not connect /generate-logo-hybrid-test to production /generate-logo yet.
4. Do not continue OpenAI prompt micro-tuning without a focused test plan.
Current no-touch areas:
Do not modify services/openaiJudge.js.
Do not modify services/ideogramService.js.
Do not modify services/r2Upload.js.
Do not modify live /generate-logo.
Do not modify /generate-logo-openai-test.
Do not modify payments / Dodo / credits / refund / referral / Supabase.
Do not connect Hybrid to production.

⸻

12b. Session Update — Hybrid Quality Gate + Pricing/Upgrade Copy Cleanup

12b.1 Backend Hybrid Work Completed

Hybrid v1.4 Step 1 — quality metadata:

* Implemented, pushed, deployed, and verified.
* Commit: be1e4fa Add hybrid quality metadata and project state doc
* /generate-logo-hybrid-test results now include:
    * qualityStatus
    * qualityWarnings
    * isSafeForLead
* The metadata-only quality gate does not hide, reorder, regenerate, or change original slot results.
* It remains internal-only and does not affect live /generate-logo.

Project state doc verification:

* Commit: cfe841d Update project state after hybrid metadata verification
* LOGOFUNNY_PROJECT_STATE.md was added to GitHub after checking that no real secrets were present.
* It should be used for cross-chat / Claude / Codex continuity.

Hybrid v1.4 Step 2 — OpenAI creative prompt replacement:

* Implemented, pushed, deployed, and tested.
* Commit: 5a13e9f Improve OpenAI hybrid creative prompts
* Only services/openaiImageService.js was changed.
* Exactly 4 OpenAI hybrid creative prompt strings were replaced.
* Visual test result:
    * Technical behavior worked.
    * OpenAI results remained clean.
    * Visual improvement was limited.
    * OpenAI still tends to produce generic sparkle / bracket / basic SaaS-style marks.
    * Do not continue OpenAI prompt micro-tuning unless there is a focused test plan.

Hybrid v1.5 — lead recommendation metadata:

* Implemented, pushed, deployed, and verified.
* Commit: ec35459 Add lead recommendation to hybrid test route
* /generate-logo-hybrid-test now returns:
    * top-level recommendation object
    * per-result isRecommended
* Recommendation logic:
    * Selects the first result where isSafeForLead === true
    * If no result is safe, recommendation is null / mode: 'none'
* Verified:
    * recommendation.slot returned correctly
    * Exactly one result has isRecommended: true when a safe result exists
* Still internal-only.
* Hybrid route is not connected to production /generate-logo.

Current backend Hybrid status:

* Backend Hybrid has a working internal chain: generation → quality metadata → internal recommendation.
* Do not connect Hybrid to live /generate-logo yet.
* Do not modify payments / Dodo / credits / refund / referral / Supabase as part of Hybrid work.

12b.2 Frontend Pricing / Credits / Upgrade Copy Cleanup Completed

Purpose:

* LogoFunny is already live for user testing.
* Public-facing Free / Pro / Pricing / Upgrade copy needed to be clearer, more commercial, and less confusing.
* We reduced confusion around "credits", "2 generations", referral rewards, and Pro gating.

Completed frontend commits:

* eb993ef Align free generation copy
* bf88566 Soften referral reward copy
* 1d5bfd7 Replace pro alert with inline upgrade banner
* aaa6b0e Show pro upgrade banner inside preview modal
* 5592150 Clean up FAQ pricing copy
* c789dc6 Improve free usage and referral copy
* e8b85d3 Align free plan value copy

P0 — Free offer copy:

* Previous wording created confusion: "Get 20 free credits" vs "2 free generations"
* Updated public value framing to focus on user benefit: Create up to 8 logo concepts free
* Reason: 20 credits = 2 generations × 4 concepts = up to 8 logo concepts.
  "8 logo concepts" feels more valuable and clearer than "2 generations".
  Credits remain an internal/account mechanic, not the main public CTA framing.

Out-of-credits copy:

* Updated from "You've used your free credits." to "You've used your free logo concepts."
* Goal: Avoid confusing users with credit math. Keep the message clear when free usage is exhausted.

Referral copy:

* Reduced promise risk.
* Current safer wording: "Referral rewards are coming soon."
* Avoid wording that sounds like confirmed reward entitlement for early supporters.

Pricing Free card:

* Updated to align with Hero value framing.
* Current Free card copy:
    * Up to 8 logo concepts, free
    * 2 generations · 4 concepts each
* Leads with value, explains the real limit clearly.

FAQ cleanup:

* Commit: 5592150 Clean up FAQ pricing copy
* FAQ now aligns with: Free preview downloads / Pro commercial-use downloads.
* Removed confusing "higher-resolution PNG tied to paid plans" framing (inaccurate — difference is commercial use, not resolution).
* Changed "Showcase Match this" to user-facing "Match this".

My Creations Pro gate:

* Native window.alert replaced with inline upgrade UI.
* Commit: 1d5bfd7 Replace pro alert with inline upgrade banner
* Preview modal also updated to show Pro upgrade banner inside the modal.
* Commit: aaa6b0e Show pro upgrade banner inside preview modal
* Verified: Free user clicking Make similar from list → upgrade banner visible.
  Free user clicking Make similar inside preview modal → upgrade banner inside modal.
  Upgrade link jumps to /#pricing. Dismiss × closes the banner.
* No checkout, Dodo, credits, Supabase, or backend logic was changed.

Current frontend public copy status:

* Hero / signed-out CTA: Create up to 8 logo concepts free
* Out-of-credits: You've used your free logo concepts.
* Referral: Referral rewards are coming soon.
* Pricing Free: Up to 8 logo concepts, free / 2 generations · 4 concepts each
* FAQ: Free preview / Pro commercial-use wording aligned.
* My Creations: Inline Pro upgrade banners replace browser alerts.

12b.3 Doc Maintenance Rule

LOGOFUNNY_PROJECT_STATE.md is a convenience handoff document, not extra daily work.

* Do not update it after every small step.
* Update it at the end of a work session or after major milestones only.
* Use it to continue across new ChatGPT / Claude / Codex sessions.
* Suggested continuation prompt:
    Bro，读取 /Volumes/MOY WorkSSD/AI_WORK/logofunny-backend/LOGOFUNNY_PROJECT_STATE.md，继续 LogoFunny 项目。

⸻

12c. Session Update — 2026-06-27: Phase 0 Three-Track Test + Phase 2.1 Shadow Credit Ledger Migration

12c.1 Phase 0 — Ideogram Three-Track Local Test

Confirmed that LOGOFUNNY_IDEOGRAM_CREATIVE_TRACKS env flag and all three-track prompt logic already existed in services/ideogramService.js behind the flag. No new code was written.

Local test:

* LOGOFUNNY_IDEOGRAM_CREATIVE_TRACKS=true added to local .env only.
* LOGOFUNNY_DEBUG_PROMPT=true added to local .env only.
* POST /generate-logo-ideogram-test called with conceptPrompts body to force Path A.
* 4 image URLs returned successfully.

Tracks confirmed from server logs:

* conceptIndex=0 → commercial
* conceptIndex=1 → commercial
* conceptIndex=2 → creative
* conceptIndex=3 → symbol_fusion

Track assignment in ideogramService.js (line 1296):

  const TRACK_ASSIGNMENTS = ["commercial", "commercial", "creative", "symbol_fusion"];

This is local-only. Render production env was not touched. Live /generate-logo was not touched.

Generation quality improvement (prompt tuning for creative / symbol_fusion tracks) is deferred. Do not continue quality tuning without a separate scoped decision.

12c.2 Phase 2.1 — Shadow Credit Ledger Migration

Created, committed, and pushed a schema-only Supabase migration for the credit ledger shadow-mode tables.

Commit:

  ffefe48 Add shadow credit ledger migration

Migration file:

  migrations/20260627000000_create_credit_ledger_shadow_tables.sql

Tables created (all CREATE TABLE IF NOT EXISTS — safe to re-run, no existing tables altered):

* credit_grants — every credit allocation per user; grant_type controls expiry and spend order
* generation_charges — every generation attempt (success / failed / refunded)
* generation_charge_allocations — maps each charge across one or more grants
* dodo_webhook_events — idempotent log of inbound Dodo webhook events; deduplicated on event_id
* designer_orders — future designer service tier; schema defined now for clean FK references

credit_grants.grant_type values:

  free_signup              — 20 credits on account creation (2 free generations)
  monthly_pro              — credits on each Dodo subscription renewal; expires at Dodo renewal_date
  one_time_pack            — credits from a Dodo one-time credit pack purchase; does not expire
  referral_bonus           — bonus credits from referral system (referral logic not touched)
  failed_generation_refund — credits returned on generation failure; requires charge row first
  admin_grant              — manual operational adjustment; metadata must record reason

Spend order: monthly_pro (expiring) consumed first; then FIFO on created_at for non-expiring types.

Shadow mode rules (still in effect):

* New tables are written to in parallel with existing billing gate — NOT read for any live billing decision.
* generations_limit / generations_used remain the sole source of truth for access control.
* Any shadow write error is fire-and-forget — must never block generation response.
* Cutover to ledger-as-truth requires a separate migration gated on reconciliation sign-off.

No-touch areas (confirmed unchanged):

* services/ideogramService.js
* services/r2Upload.js
* Dodo payment / webhook logic
* Pricing UI / checkout
* Frontend
* generations_limit / generations_used schema
* Live /generate-logo billing gate
* Referral system

Pre-push safety scan: no API keys, secrets, tokens, passwords, or credential values found in committed file.

12c.3 Next Recommended Steps

Phase 2.2 (not started):

* Design the creditLedger.js shadow-write service (fire-and-forget functions only).
* shadowChargeGeneration() — called after successful generation.
* shadowGrantCredits() — called after Dodo webhook events.
* shadowLogWebhookEvent() — called at start of Dodo webhook handler.
* Do not connect to live billing gate yet.
* Do not touch Dodo, pricing, or frontend.

Phase 0 quality (deferred):

* Evaluate creative / symbol_fusion track output quality vs commercial.
* Tune prompts only after a dedicated quality review session.
* Do not touch prompt logic during Phase 2 work.

⸻

12d. Session Update — 2026-06-28: Shadow Ledger Production Verification + Free Signup Backfill Migration + Four-Card Pricing

12d.1 Shadow Ledger Production Verification

Production Supabase tables manually created from migration file:

  20260627000000_create_credit_ledger_shadow_tables.sql

All 5 tables confirmed present: credit_grants, generation_charges, generation_charge_allocations, dodo_webhook_events, designer_orders.

All required custom indexes verified; pg_indexes returned 16 rows including primary key and unique indexes.

service_role GRANT and RLS settings applied manually via Supabase SQL Editor (captured in migration 20260627000001).

Real generation test (after permission fix):

  * One real generation completed on logofunny.com.
  * generation_charges row confirmed: route = /generate-logo, credits_charged = 10, status = success.
  * Shadow write fired and landed correctly.

Reconciliation query results after real generation:

  Step 4  generation_charges        1 row, status=success, credits_charged=10  PASS
  Step 5  generation_charge_allocations  0 rows                                EXPECTED (no grant backfill yet)
  Step 6  credit_grants             0 rows                                     EXPECTED (old free user, no backfill)
  Step 8  live_used=2, shadow_success=1, shadow_refunded=0                     MISMATCH EXPECTED

Step 8 mismatch reason: test user had one generation before shadow tables existed. That generation was never captured. Cold-start gap is permanent for this user and expected. Shadow writes are correct from the moment permissions were in place.

Shadow mode contract confirmed still in effect:

  * Shadow writes do not block live generation.
  * generations_limit / generations_used remain sole live billing gate.
  * Shadow write failures are silent and fire-and-forget.

12d.2 Backend Migration Commits Pushed

Commit 1509e40 — Add shadow ledger RLS grants migration

  File: migrations/20260627000001_shadow_tables_rls_grants.sql
  Content: GRANT USAGE ON SCHEMA public TO service_role; GRANT SELECT/INSERT/UPDATE/DELETE on all 5 shadow tables; ALTER TABLE ... ENABLE ROW LEVEL SECURITY.
  All statements idempotent.
  Captures the manual Supabase SQL Editor state so it is reproducible on any fresh environment.

Commit 8354cfe — Add free signup shadow grant backfill migration

  File: migrations/20260627000002_backfill_free_signup_shadow_grants.sql
  Content:
    Step 1: CREATE UNIQUE INDEX IF NOT EXISTS credit_grants_user_free_signup_unique ON credit_grants (user_id) WHERE grant_type = 'free_signup'
    Step 2: INSERT INTO credit_grants ... WHERE is_pro = false AND NOT EXISTS (existing free_signup grant) ON CONFLICT DO NOTHING
  Credits: 20 (2 free generations × 10 credits = CREDIT_MULTIPLIER)
  source_id: 'backfill_20260628' — surgical audit/rollback marker
  Preflight results confirmed before writing: 9 users to backfill, 0 duplicate free_signup, 0 credit_grants rows at baseline, unique index not yet present.

IMPORTANT: The backfill migration has NOT been applied to production yet.

  Reason: end-of-session caution. Do not execute while tired.
  Apply in next fresh session after verifying the deployed pricing page.

Rollback if needed:
  DELETE FROM credit_grants WHERE source_id = 'backfill_20260628';
  DROP INDEX IF EXISTS credit_grants_user_free_signup_unique;

12d.3 Frontend Pricing Commit Pushed

Commit 6c91764 — Update pricing to four-card model

Files changed:
  components/pricing-cards.tsx
  components/pricing-section.tsx
  app/pricing/page.tsx

Four-card layout:

  1. Free
     Price: Free
     Features: 20 credits / Generate up to 8 logo concepts / PNG preview downloads / Save 1 generated logo set
     CTA: Start Free → scrolls to #studio-start (existing)

  2. One-time Pack
     Price: $14.90
     Features: 200 credits / One-time purchase / No subscription / Use credits at your own pace / Good for one brand or a small project
     CTA: "Available soon" — button disabled (amber style), intentionally upcoming, NOT wired to Dodo

  3. Pro Monthly
     Price: $9.90/month
     Features: 150 credits monthly / Credits refresh monthly / Best for ongoing projects / Save unlimited creations and inspirations
     CTA: "Upgrade to Pro" — existing Dodo checkout behavior UNCHANGED

  4. Designer Service
     Price: From $49
     Features: Human polish for your chosen logo / Final logo files for brand use / Best when you want a more finished result / Quote before payment
     CTA: "Request a quote" — mailto:hello@logofunny.com?subject=LogoFunny%20Designer%20Service%20inquiry

Grid: sm:grid-cols-2 xl:grid-cols-4 — 2 columns on tablet, 4 on wide screens.
Max-width: max-w-6xl on section and pricing page.
Subtitle: "Start free with 20 credits. Upgrade when you need more credits, saved creations, or human polish."

No live billing logic, Dodo webhook, Supabase, or backend code touched.

12d.4 What Was NOT Done This Session

  * Free signup backfill NOT applied to production — deferred to next session.
  * Dodo one-time pack checkout NOT wired — future work.
  * Designer Service booking/payment flow NOT implemented — future work.
  * Dodo webhook shadow path NOT tested with a real/sandbox event — pending.
  * Generation quality / color-follows-prompt issue NOT addressed — deferred.
  * Hybrid route NOT connected to live /generate-logo — still internal only.

12d.5 Next Recommended Steps

Immediate (next session start):

  1. Verify deployed pricing at logofunny.com/pricing — confirm 4-card layout is live.
  2. Apply the free_signup backfill in Supabase SQL Editor:
       Run migrations/20260627000002_backfill_free_signup_shadow_grants.sql
       Then verify: SELECT count(*) FROM credit_grants WHERE source_id = 'backfill_20260628';
       Expect: 9 rows.
  3. After backfill: run one generation as the test user and confirm allocation row now appears in generation_charge_allocations.

Commercial mainline (in priority order after above):

  a. Dodo one-time pack checkout — wire One-time Pack to a Dodo one-time payment product
  b. Designer Service flow — booking/inquiry/payment system
  c. Generation quality — color not following prompt; investigate and fix prompt or post-processing

No-touch areas (unchanged from before):

  * Do not modify live /generate-logo.
  * Do not modify services/ideogramService.js without a quality test plan.
  * Do not connect /generate-logo-hybrid-test to live /generate-logo.
  * Do not touch referral, Stripe, auth, or existing Supabase billing gate without explicit approval.

Current git state (both repos):

  Backend:  main @ 8354cfe — working tree clean.
  Frontend: main @ 6c91764 — pricing commit pushed. Working tree still has old untracked local preview files not committed or pushed: app/generate-preview/ and components/generate-page-preview.tsx.

⸻

12e. Launch Defect Cleanup — 2026-06-28

Session goal: clear promotion-blocking defects found during post-launch review. No new features.

12e.1 Completed Fixes

Fix 1 — Live color direction prompt (P0)

  Root cause: frontend API route (app/api/generate-logo/route.ts) always sends conceptPrompts
  to backend. Backend detects their presence and takes the buildMinimalConceptPrompt path,
  which bypasses the CD_MAP entirely. The color instruction was raw "Color direction: cool tech."
  — meaningless to Ideogram.

  Frontend fix (commit 8209a01 — Fix live color direction prompt handling):
    Files: app/api/generate-logo/route.ts, components/hero-section.tsx

    Added COLOR_DIRECTION_MAP to route.ts — maps every frontend color enum value to an
    explicit Ideogram-ready instruction:
      cool_tech       → bright saturated tech blue, vivid electric blue required
      classic_mono    → strict black/white/grayscale only, no color
      luxury_black_gold → matte black + warm gold
      soft_natural    → sage/forest/olive green + earth tones
      warm_bright     → warm orange/amber dominant
      bold_vibrant    → bold saturated dominant color

    buildImagePrompt now does: COLOR_DIRECTION_MAP[colorDirection] lookup first,
    then custom palette text if colorDirection === "custom" and customColor is present,
    then raw fallback.

    customColor (user-typed palette description for Custom Color option) was previously
    silently dropped — never included in genFields. Added to genFields in hero-section.tsx
    and threaded through to buildImagePrompt and buildConceptPrompts in route.ts.

  Backend fix (commit 92ad36a — Fix blue color not appearing in generated logo):
    File: services/ideogramService.js

    COOL_TECH_BLUE rewrote to require vivid electric blue explicitly (not dark navy/steel/indigo).
    classic_mono added to CD_MAP.
    Note: this code path (CD_MAP) is only reached when conceptPrompts is NOT sent.
    Currently dead in live flow but preserved as safety fallback.

Fix 2 — Dodo Pro shadow grant credits mismatch (commit a685c9a):
  File: app/api/dodo/webhook/route.ts
  Changed: monthly_pro shadow grant 200 → 150 to match public pricing page (150 credits/month).

Fix 3 — Legacy Stripe routes disabled (commit 1504495):
  Files: app/api/stripe/create-checkout/route.ts,
         app/api/stripe/create-portal/route.ts,
         app/api/stripe/webhook/route.ts
  All three replaced with minimal POST handlers returning 410 Gone.
  No Stripe imports, no env reads, no external calls.
  Production smoke test confirmed: all three return 410/410/410.

12e.2 Verified Non-Issues

  Black & White / classic_mono: already covered by COLOR_DIRECTION_MAP fix. No extra work needed.
  Legacy Stripe user-facing exposure: zero — no component or page called /api/stripe/*.

12e.3 Still Pending (NOT done this session)

  * free_signup backfill NOT applied — migration exists at
    migrations/20260627000002_backfill_free_signup_shadow_grants.sql, pushed to backend repo.
    Apply in Supabase SQL Editor when ready. Verify with:
    SELECT count(*) FROM credit_grants WHERE source_id = 'backfill_20260628'; → expect 9 rows.

  * Online generation test NOT run — intentionally deferred to save credits.
    Test plan: generate one logo with Blue selected, confirm blue is visible in output.

  * Dodo one-time pack checkout NOT wired — future work.
  * Designer Service booking/payment NOT implemented — future work.
  * lib/stripe/ NOT deleted — dead code but harmless. Delete in a future cleanup pass.

12e.4 Current Git State (both repos)

  Backend:  main @ 92ad36a — no tracked changes before this state-file update. All code changes pushed.
  Frontend: main @ 1504495 — no tracked changes; old preview files remain intentionally uncommitted. All code changes pushed.
  Untracked (intentionally uncommitted): app/generate-preview/, components/generate-page-preview.tsx.

12e.5 Next Recommended Steps

  1. Apply free_signup backfill in Supabase SQL Editor (see 12d.5 step 2 above).
  2. After backfill: run one generation as test user to confirm shadow allocation row appears.
  3. Run color online test: generate with Blue selected, verify blue is visible in output.
  4. Dodo one-time pack checkout — wire to Dodo one-time payment product.
  5. Designer Service inquiry/booking flow.

No-touch areas (unchanged):

  * Do not modify live /generate-logo without a quality test plan.
  * Do not connect /generate-logo-hybrid-test to live /generate-logo.
  * Do not touch existing Supabase billing gate (generations_limit / generations_used).
  * Do not delete lib/stripe/ without confirming no package.json import issues.

⸻

12f. Logo Credit Pack Checkout — 2026-06-28

12f.1 Completed

  Frontend commit 91a75be — Wire Logo Credit Pack checkout

  Files changed:
    components/pricing-cards.tsx
    app/api/dodo/create-checkout/route.ts
    app/api/dodo/webhook/route.ts

  Pricing card:
    - "One-time Pack" renamed to "Logo Credit Pack"
    - Description changed from "Credits when you need them." to "Pay once. Use anytime."
    - CTA changed from "Available soon" (disabled) to "Buy Credit Pack" (active)
    - Button wired: POST /api/dodo/create-checkout with { product: "credit_pack" }
    - packLoading / packError states added; amber disabled styling removed

  Checkout route (create-checkout/route.ts):
    - Reads body.product field
    - If product === "credit_pack": uses DODO_CREDIT_PACK_PRODUCT_ID env var
    - Sets Dodo metadata: { userId, product: "logofunny_credit_pack" }
    - Pro Monthly path unchanged (DODO_PRO_MONTHLY_PRODUCT_ID)

  Webhook route (webhook/route.ts):
    - New case "payment.succeeded" added
    - Guards on metadata.product === "logofunny_credit_pack"
    - Shadow-only: shadowGrantCredits(userId, "one_time_pack", 200, sourceId, null, ...)
    - Idempotent via shadowLogWebhookEvent
    - No live user_profiles write — generations_limit / generations_used unchanged

12f.2 Verified

  Deployment confirmed: /pricing shows "Logo Credit Pack" and "Buy Credit Pack" (commit 91a75be live).
  Unauthenticated POST /api/dodo/create-checkout returns 401 — route is live and auth-gated.
  Manual browser test (logged in): Buy Credit Pack opens Dodo checkout with Logo Credit Pack, $14.90, 200 credits copy.
  No payment made.

12f.3 Pending

  * payment.succeeded webhook not yet verified end-to-end.
    Pending: test with a real or sandbox Dodo payment to confirm shadow grant of 200 one_time_pack credits fires.
  * DODO_CREDIT_PACK_PRODUCT_ID is set in Vercel Production. Not stored here (secret).
  * free_signup backfill still NOT applied to production Supabase.
  * Online color generation test still NOT run.
  * Designer Service inquiry/booking flow not implemented.
  * lib/stripe/ not deleted (harmless dead code).

12f.4 Current Git State

  Frontend: main @ 91a75be — no tracked changes; old preview files remain intentionally uncommitted. All code changes pushed.
  Backend:  main @ 8aba4ae — no tracked changes before this state-file update. Last state update pushed; this new state-file update is pending commit.
  Untracked (intentionally uncommitted): app/generate-preview/, components/generate-page-preview.tsx.

12f.5 Next Recommended Steps

  1. Apply free_signup backfill in Supabase SQL Editor.
  2. Run one generation as test user to confirm shadow allocation row appears.
  3. Run color online test: generate with Blue selected, verify blue is visible in output.
  4. Verify payment.succeeded webhook with a real or sandbox purchase.
  5. Designer Service inquiry/booking flow.

⸻

12g. Session Update — 2026-06-29: Frontend Pricing + UX Polish + Director Command

12g.1 Frontend Deployment State

  Frontend commit b3d9e52 — Add LogoFunny director command — confirmed Ready on Vercel.
  This is the current live frontend HEAD.

  Git state (frontend repo):
    main @ b3d9e52 — working tree clean (tracked files only).
    Untracked (intentionally NOT committed): app/generate-preview/, components/generate-page-preview.tsx.
    These two preview files are local-only reference material. Do not commit them until a deliberate decision is made.

12g.2 Pricing Page Changes (already live)

  Pricing cards updated to the current four-card model:

    1. Free               — outline CTA "Start Free"
    2. Logo Credit Pack   — gradient CTA "Buy 200 Credits" (highlighted: true)
                           Badge: "BEST FOR FIRST PROJECT" (teal)
                           Price: $14.90 one-time
                           Note below price: "One-time · No subscription"
    3. Pro Monthly        — solid blue CTA "Upgrade Monthly" (secondary)
                           Badge: "BEST FOR ONGOING" (blue)
                           Price: $9.90/month
    4. Designer Service   — outline CTA "Request a Quote"
                           mailto:hello@logofunny.com

  Logo Credit Pack is the visually dominant primary card (gradient button, teal border glow).
  Headline: "Create your first logo for free."
  Subtitle: "Start with 20 free credits. Upgrade only when you need more ideas, more saves, or a polished final logo."

12g.3 Navbar + Homepage Pricing Sync

  Navbar "Pricing" link now points to /pricing (was /#pricing).
  Homepage pricing section headline synced with /pricing page headline.

12g.4 Generate Page UX — Recommended Guidance Compact by Default

  Recommended Guidance section is now collapsed by default.
  "Need ideas?" chips are visible in the collapsed state.
  Keywords, Color direction, Font style, Special requirements are hidden until "Show guidance fields" is clicked.
  Form state is preserved when toggling.

12g.5 Claude Code Director Command Added

  File: .claude/commands/logofunny-director.md (frontend repo)
  Commit: b3d9e52 Add LogoFunny director command
  Purpose: Project-local Claude Code slash command for auditing logo output quality, prompt quality, generate page UX, and pricing conversion in one structured report.

  Command structure:
    - Hard safety rules near top (no .env read, no generation, no migrations, no payment flows, no commit/push without explicit instruction)
    - Default report: 6 sections (Verdict, What is Good, Critical Issues, Next Action, Prompt/UI Improvements, Safe Implementation Notes)
    - Optional detailed sections: Prompt Quality Audit, Failure Mode Risk, Per-Slot Assessment, Commercial Quality Checklist, UX/Conversion Checklist, Regeneration Decision
    - Argument modes: logo, prompt, ux, pricing, full

  Invoke with /logofunny-director in any Claude Code session inside the frontend repo.

12g.6 Still Pending (carry-forward, NOT done)

  * payment.succeeded webhook — real E2E test not yet run (sandbox or live purchase).
  * free_signup backfill — migration exists (migrations/20260627000002_backfill_free_signup_shadow_grants.sql), NOT applied to production.
    Apply in Supabase SQL Editor. Verify: SELECT count(*) FROM credit_grants WHERE source_id = 'backfill_20260628'; → expect 9 rows.
  * Shadow allocation row generation check — run one generation as test user after backfill to confirm generation_charge_allocations row appears.
  * Blue color online test — generate one logo with Blue selected; confirm blue is visible in output.
  * Designer Service inquiry/booking flow — not implemented.
  * lib/stripe/ dead code — not deleted (harmless, defer to cleanup pass).
  * Hybrid route — still internal only. Do NOT connect /generate-logo-hybrid-test to live /generate-logo.

12g.7 Current Git State (both repos)

  Frontend: main @ b3d9e52 — working tree clean. Untracked preview files intentionally uncommitted.
  Backend:  main @ 8aba4ae (or most recent state-file commit) — working tree should be clean. Verify with git status before starting work.

⸻

12h. Session Update — 2026-07-01: Frontend Auth + Cleanup Batch

12h.1 Frontend Commit Pushed

  Commit 49104d4 — Fix auth event and frontend cleanup
  Branch: main
  Repo: v0-logo-funny-landing-page
  npx tsc --noEmit: passed, zero errors.

12h.2 Fixes Included

  P0 — components/auth-sync.tsx
    Removed invalid SIGNED_UP auth event check.
    Before: (event === "SIGNED_IN" || event === "SIGNED_UP") && session?.access_token
    After:  event === "SIGNED_IN" && session?.access_token
    Reason: Supabase AuthChangeEvent does not include SIGNED_UP. New user sign-up triggers
    SIGNED_IN. The invalid event caused referral claim logic to silently never fire for new users.
    Fix restores correct referral/auth sync for all sign-in and new-signup flows.

  P1 — components/faq-section.tsx
    FAQ "How many directions do I get per generation?" answer updated.
    Before: "Free accounts include 2 generations; Pro includes 20 logo generations per month."
    After:  "Free accounts include 20 credits — enough for 2 generations and 8 logo concepts.
             Pro includes 150 credits every month."
    Reason: FAQ was inconsistent with pricing cards. Users confused by "2 generations" vs
    "8 logo concepts" vs "20 credits". Now unified under credits as the canonical unit.

  P1 — components/pricing-cards.tsx
    Removed unused yearly dead code.
    Deleted: const [yearly] = useState(false)
    Changed: body: JSON.stringify({ interval: yearly ? "yearly" : "monthly" })
          →  body: JSON.stringify({ interval: "monthly" })
    Reason: yearly state had no setter exposed in the UI. The checkout body always sent
    "monthly" in practice. Dead state and dead conditional removed. Monthly Pro and
    Credit Pack checkout behavior unchanged.

  P2 — app/layout.tsx
    themeColor changed from #0B0F19 (dark) to #FFFFFF (white).
    Reason: Site design is light/white. Dark themeColor caused mobile browser chrome
    to show a dark title bar inconsistent with the actual page appearance.

  P2 — components/hero-section.tsx
    Fixed TYPOGRAPHY_VIBE_TO_BACKEND mapping for Handmade / Artisan option.
    Before: handcrafted_expressive: "luxury_minimal"
    After:  handcrafted_expressive: "handcrafted_organic"
    Reason: "luxury_minimal" is semantically opposite to "handmade / artisan".
    The value is injected as free text into the image generation prompt via
    typographyDirection.replace(/_/g, " ") in route.ts — no backend enum validation.
    Fix corrects the prompt direction for this typography option.

12h.3 Untracked Preview Files (intentionally NOT committed)

  app/generate-preview/
  components/generate-page-preview.tsx
  Status: local-only. Do not commit until a deliberate decision is made.

12h.4 Vercel Deployment

  Commit 49104d4 pushed to origin main.
  Vercel deployment status: pending confirmation.
  Check Vercel dashboard to confirm 49104d4 is Ready before treating as live.

12h.5 Pending Items (carry-forward, NOT done)

  * Vercel deployment check — confirm 49104d4 is Ready on Vercel.
  * payment.succeeded webhook — real E2E test not yet run (sandbox or live purchase).
  * free_signup backfill — migration exists at
    migrations/20260627000002_backfill_free_signup_shadow_grants.sql, NOT applied to production.
    Apply in Supabase SQL Editor. Verify: SELECT count(*) FROM credit_grants WHERE source_id = 'backfill_20260628'; → expect 9 rows.
  * Shadow allocation row generation check — run one generation as test user after backfill
    to confirm generation_charge_allocations row appears.
  * Blue color online test — generate one logo with Blue selected; confirm blue is visible in output.
  * Designer Service inquiry/booking flow — not implemented.
  * Dedicated OG/social preview image — current OG image is 6688×3418, recommend 1200×630
    dedicated export later. Not urgent; no code change needed now.
  * lib/stripe/ dead code — not deleted (harmless, defer to cleanup pass).
  * Hybrid route — still internal only. Do NOT connect /generate-logo-hybrid-test to live /generate-logo.

12h.6 Current Git State (both repos)

  Frontend: main @ 49104d4 — working tree clean. Untracked preview files intentionally uncommitted.
  Backend:  main @ 8aba4ae (or most recent state-file commit) — verify with git status before starting work.

⸻

12i. Backend Batch 1 — Security & Quality Alignment (2026-07-01)

12i.1 Summary

  Commit: 5d0fbf2
  Message: Remove legacy generation routes and align quality mapping
  Branch: main (logofunny-backend)
  Files changed: 3 (8 insertions, 182 deletions)
  Syntax check: node --check passed on all three files.
  Payment/webhook/credits: not touched.
  Migrations: not touched.
  No generation or external API calls made.

12i.2 Changes

  P1-A — index.js
    Removed three unauthenticated legacy Replicate routes:
      /generate__legacy  — called replicate.run() with any prompt, no auth
      /generate-svg      — same, also fetched and returned raw SVG
      /generate-png      — same, converted SVG to PNG via sharp
    Risk removed: these routes had no requireInternalKey middleware. Any caller
    knowing the backend URL could trigger paid Replicate API calls indefinitely.

    Also removed route-only dead code (safe because nothing else in index.js used them):
      require("replicate")             — Replicate SDK import
      require("node-fetch")            — fetch import (index.js scope only)
      require("sharp")                 — sharp import (index.js scope only)
      const replicate = new Replicate  — instance initialization
      function buildLogoPrompt()       — 79-line prompt template used only by removed routes

    Not removed (still in use):
      normalizeElementorForm()         — used by /webhook/elementor stub
      buildPrompts require             — deferred to P3 cleanup pass

  P1-B — routes/logoApiRoutes.js
    Expanded VIOLATION_WARNINGS in runDualTrackPipeline from 3 items to 8 items.
    Before (3 items):
      hasTrademarkSymbol, hasFakeText, hasPresentationLayout
    After (8 items — matches isCommercialLogoPass coverage):
      hasTrademarkSymbol, hasFakeText, hasPresentationLayout
      hasPeople, hasHuman, hasMascot, hasScene, tooIllustrative
    Reason: logos with people, mascots, or illustrative scenes were getting
    qualityStatus: 'pass' in the main pipeline because the shorter list did
    not check these fields. isCommercialLogoPass (used in hybrid-test route)
    already checked all 8. The two paths are now consistent.
    Score threshold (score < 70) intentionally NOT added — it would change
    the main pipeline quality semantics beyond the scope of this fix.
    Recommendation ranking order unchanged.

  P2-A — services/ideogramService.js
    Added handcrafted_organic to TYPO_MAP with the same description as
    handcrafted_expressive:
      handcrafted_organic: "expressive custom lettering with handcrafted character and natural rhythm"
    Reason: the frontend fix in commit 49104d4 changed the hero-section.tsx
    TYPOGRAPHY_VIBE_TO_BACKEND mapping from handcrafted_expressive: "luxury_minimal"
    to handcrafted_expressive: "handcrafted_organic". The Next.js route.ts path
    (free-text injection) handled this correctly. However the Elementor webhook
    path (logoApiRoutes.js → generateIdeogramLogos → buildTypographyDirection)
    looked up the key in TYPO_MAP, which did not contain handcrafted_organic,
    causing silent fallback to keyword inference. Key now resolves correctly on
    both code paths.

12i.3 Pending Items (carry-forward from 12h.5 + new)

  Carry-forward from 12h.5:
  * Vercel deployment check — confirm commit 49104d4 is Ready on Vercel.
  * payment.succeeded webhook — real E2E test not yet run (sandbox or live purchase).
  * free_signup backfill — migration exists at
    migrations/20260627000002_backfill_free_signup_shadow_grants.sql, NOT applied.
    Apply in Supabase SQL Editor. Verify: SELECT count(*) FROM credit_grants
    WHERE source_id = 'backfill_20260628'; → expect 9 rows.
  * Shadow allocation row generation check — run one generation after backfill.
  * Blue color online test — generate one logo with Blue selected.
  * Designer Service inquiry/booking flow — not implemented.
  * Dedicated OG/social preview image (1200×630) — not urgent.
  * lib/stripe/ dead code — not deleted, defer to cleanup pass.
  * Hybrid route — internal only. Do NOT connect /generate-logo-hybrid-test to live /generate-logo.

  Backend Batch 2 (queued, not started):
  * server.js legacy ESM prototype — review and delete or archive.
  * /webhook/elementor no-op stub in index.js — review and remove.
  * /generate-logo-hybrid-test and /generate-logo-openai-test — review double-key
    auth inconsistency (LOGOFUNNY_INTERNAL_TEST_SECRET vs LOGOFUNNY_INTERNAL_API_KEY).

  Backend Batch 3 (queued, not started):
  * R2 upload failure handling — logo uploads silently return null imageUrl.
  * /generate-logo-pipeline stub and /generate-logo-dual redundancy review.
  * requestId format cleanup (optional, low priority).

12i.4 Current Git State (both repos)

  Frontend: main @ 49104d4 — working tree clean.
            Untracked preview files (app/generate-preview/, components/generate-page-preview.tsx)
            intentionally uncommitted.
  Backend:  main @ 5d0fbf2 — working tree clean.

⸻

12j. Backend Batch 2A — Legacy Prototype & Dead Stub Removal (2026-07-01)

12j.1 Summary

  Commit: 87afdcc
  Message: Remove legacy server and elementor stub
  Branch: main (logofunny-backend)
  Files changed: 2 (2 insertions, 561 deletions)
  Syntax check: node --check index.js passed.
  Test routes: not changed.
  Payment/webhook/credits: not touched.
  Migrations: not touched.
  No generation or external API calls made.

12j.2 Changes

  server.js — deleted via git rm
    510-line ESM prototype (`import` syntax) in a CJS repo (no "type": "module").
    Was never the production entry point: package.json scripts pointed to index.js.
    Would crash immediately with SyntaxError if run directly.
    No other file in the repo referenced it; no frontend reference found.
    Contained: EJS frontend, cookie-based auth bypass, Stripe key read, mock SVG
    generator, PDF export, ZIP export, i18n — a completely separate application.
    Deletion is zero-risk; git history retains the full content.

  index.js — /webhook/elementor stub removed
    Route: POST /webhook/elementor
    Handler called normalizeElementorForm(), logged body/files, returned { ok: true }
    unconditionally. Code comment confirmed it was a debug stub:
    "先只返回成功，确认 webhook 真正打通".
    No callers found in frontend or external config. No Elementor form still pointed
    at this address. Real generation path is /generate-logo in logoApiRoutes.js
    (requireInternalKey protected).

  index.js — normalizeElementorForm() removed
    Helper used exclusively by the /webhook/elementor stub.
    Mapped Elementor form_fields to a normalized input object.
    Removed together with the stub; no other callers.

  index.js — multer require and upload initialization removed
    const multer = require("multer") and const upload = multer() were only used
    by the /webhook/elementor route (upload.any()). Removed after stub deletion
    confirmed they had no remaining uses.

12j.3 Pending Items (carry-forward from 12i.3 + new)

  Carry-forward operational items:
  * Vercel deployment check — confirm commit 49104d4 is Ready on Vercel.
  * payment.succeeded webhook — real E2E test not yet run (sandbox or live purchase).
  * free_signup backfill — migration exists at
    migrations/20260627000002_backfill_free_signup_shadow_grants.sql, NOT applied.
    Apply in Supabase SQL Editor. Verify: SELECT count(*) FROM credit_grants
    WHERE source_id = 'backfill_20260628'; → expect 9 rows.
  * Shadow allocation row generation check — run one generation after backfill.
  * Blue color online test — generate one logo with Blue selected.
  * Designer Service inquiry/booking flow — not implemented.
  * Dedicated OG/social preview image (1200×630) — not urgent.
  * lib/stripe/ dead code — not deleted, defer to cleanup pass.
  * Hybrid route — internal only. Do NOT connect /generate-logo-hybrid-test to live /generate-logo.

  Backend Batch 2B (queued, not started):
  * /generate-logo-hybrid-test and /generate-logo-openai-test — double-key auth
    inconsistency. Both use LOGOFUNNY_INTERNAL_TEST_SECRET only; all other internal
    routes use LOGOFUNNY_INTERNAL_API_KEY via requireInternalKey. Decision pending:
    add requireInternalKey as first middleware on both test routes (requires callers
    to carry both keys), or accept current single-key model.

  Backend Batch 3 (queued, not started):
  * R2 upload failure handling — logo uploads silently return null imageUrl.
  * /generate-logo-pipeline stub and /generate-logo-dual redundancy review.
  * buildPrompts require in index.js — appears unused; defer to P3 cleanup pass.
  * requestId format cleanup (optional, low priority).

12j.4 Current Git State (both repos)

  Frontend: main @ 49104d4 — working tree clean.
            Untracked preview files (app/generate-preview/, components/generate-page-preview.tsx)
            intentionally uncommitted.
  Backend:  main @ 87afdcc — working tree clean.

⸻

12k. Backend Batch 2B — Test Route Auth Hardening (2026-07-01)

12k.1 Summary

  Commit: 898f633
  Message: Add requireInternalKey to test routes
  Branch: main (logofunny-backend)
  Files changed: 1 (routes/logoApiRoutes.js, 2 insertions, 2 deletions)
  Syntax check: node --check passed.
  Payment/webhook/credits: not touched.
  Migrations: not touched.
  No generation or external API calls made.

12k.2 Changes

  routes/logoApiRoutes.js — added requireInternalKey as first middleware on both test routes

  Problem: /generate-logo-openai-test and /generate-logo-hybrid-test only checked
  LOGOFUNNY_INTERNAL_TEST_SECRET via an internal x-logofunny-test-secret header check.
  All other internal routes use requireInternalKey middleware first (LOGOFUNNY_INTERNAL_API_KEY).
  The two test routes had weaker auth — single key only.

  Fix: requireInternalKey added as the FIRST middleware on both routes.
  Callers must now supply both:
    x-logofunny-internal-key  — checked by requireInternalKey (LOGOFUNNY_INTERNAL_API_KEY)
    x-logofunny-test-secret   — checked internally in each route handler

  Internal test-secret check unchanged — still present inside each handler.
  Route handlers and response shapes unchanged.
  Live /generate-logo not touched.

12k.3 Current Git State (at commit)

  Frontend: main @ 49104d4 — working tree clean.
  Backend:  main @ 898f633 — working tree clean.

⸻

12l. Backend Batch 3A — Pipeline Route Removal + R2 Observability (2026-07-01)

12l.1 Summary

  Commit: 15bdb0a
  Message: Remove pipeline route and improve R2 logging
  Branch: main (logofunny-backend)
  Files changed: 1 (routes/logoApiRoutes.js, 10 insertions, 74 deletions)
  Syntax check: node --check passed.
  No response shape changes. No success:true/false behavior changes.
  Payment/webhook/credits: not touched.
  Migrations: not touched.
  No generation or external API calls made.

12l.2 Changes

  routes/logoApiRoutes.js — deleted /generate-logo-pipeline

  Route: POST /generate-logo-pipeline (64 lines removed)
  Reason: route called generateLogoMock() — the mock generator, not Ideogram.
  Was permanently marked with comment: "TEMP: disable multi-candidate pipeline".
  Zero frontend callers confirmed via grep. Protected by requireInternalKey.
  Response shape (top/candidates/rankingMethod) was completely different from all other routes.
  git history retains the full deleted content.

  routes/logoApiRoutes.js — threaded requestId into R2 upload failure logs

  normalizeResultToItem(result) → normalizeResultToItem(result, reqId = null)
  Three console.error catch blocks for R2 upload failures now append 'requestId=', reqId.
  runDualTrackPipeline(mapped) → runDualTrackPipeline(mapped, requestId = null)
  All 5 internal normalizeResultToItem call sites now pass requestId.
  /generate-logo and /generate-logo-dual now pass their local requestId to runDualTrackPipeline.
  /generate-logo-fast calls normalizeResultToItem(result) unchanged — default reqId = null is correct.
  All changes backward compatible. No behavior change. No response shape change.

12l.3 Backend Batch 3 Remaining Items (deferred)

  Completed this batch:
  * /generate-logo-pipeline: deleted.
  * requestId threading to R2 error logs: done.

  Still deferred:
  * R2 all-null imageUrl — if all slots return imageUrl: null due to R2 failure,
    response still returns success: true. Deferred: requires frontend null-slot handling
    confirmation before changing response semantics.
  * /generate-logo-dual — zero frontend callers, still protected by requireInternalKey.
    Low urgency. Deferred to future cleanup pass.
  * buildPrompts require in index.js — appears unused. Deferred to P3 cleanup pass.
  * requestId format (switch to uuid) — low priority, deferred.

12l.4 Pending Operational Items (full carry-forward)

  * Vercel deployment check — confirm commit 49104d4 is Ready on Vercel.
  * payment.succeeded webhook — real E2E test not yet run (sandbox or live purchase).
  * free_signup backfill — NOT applied to production.
    File: migrations/20260627000002_backfill_free_signup_shadow_grants.sql
    Apply in Supabase SQL Editor.
    Verify: SELECT count(*) FROM credit_grants WHERE source_id = 'backfill_20260628'; → expect 9 rows.
  * Shadow allocation row check — run one generation as test user after backfill to confirm
    generation_charge_allocations row appears.
  * Blue color online test — generate one logo with Blue selected; confirm blue is visible.
  * Designer Service inquiry/booking flow — not implemented.
  * Dedicated OG/social preview image (1200×630) — not urgent, no code change needed now.
  * lib/stripe/ dead code — not deleted. Defer to cleanup pass.
  * Hybrid route — internal only. Do NOT connect /generate-logo-hybrid-test to live /generate-logo.

12l.5 Current Git State (both repos)

  Frontend: main @ 49104d4 — working tree clean.
            Untracked preview files (app/generate-preview/, components/generate-page-preview.tsx)
            intentionally uncommitted.
  Backend:  main @ 15bdb0a — working tree clean.

⸻

12m. Backend Batch 3B — Dual Route + Dead Import Removal (2026-07-01)

12m.1 Summary

  Commit: 810768a
  Message: Remove dual route and dead import
  Branch: main (logofunny-backend)
  Files changed: 2 (index.js: 2 deletions; routes/logoApiRoutes.js: 39 deletions)
  Syntax check: node --check index.js and node --check routes/logoApiRoutes.js both passed.
  No R2 all-null imageUrl response semantics changed.
  No response shape changes.
  Payment/webhook/credits: not touched.
  Migrations: not touched.
  No generation or external API calls made.

12m.2 Changes

  routes/logoApiRoutes.js — deleted /generate-logo-dual (39 lines)

  Route: POST /generate-logo-dual
  Reason: zero frontend callers (grep confirmed), zero internal script callers.
  Functionally identical to /generate-logo minus reference image support:
  called runDualTrackPipeline() with the same logic but wrapped data directly
  without the top-level imageUrl or referenceApplied fields.
  Protected by requireInternalKey — never exposed publicly.
  git history retains the full deleted content.

  index.js — removed unused buildPrompts require (2 lines)

  Line removed: const { buildPrompts } = require("./utils/promptEngine");
  Reason: buildPrompts was imported in index.js but never called in index.js scope.
  Active callers (routes/aiRoutes.js and routes/debugRoutes.js) each require
  promptEngine directly — unchanged. utils/promptEngine.js unchanged.
  Zero behavior change; pure dead-import cleanup.

12m.3 Backend Batch 3 Status

  All three originally queued Batch 3 items are now resolved:

  Completed:
  * /generate-logo-pipeline: deleted (Batch 3A, commit 15bdb0a).
  * requestId threading to R2 error logs: done (Batch 3A, commit 15bdb0a).
  * /generate-logo-dual: deleted (Batch 3B, commit 810768a).
  * buildPrompts dead import in index.js: deleted (Batch 3B, commit 810768a).

  Still deferred (not blocking):
  * R2 all-null imageUrl — backend returns success: true when all slots have null
    imageUrl. Frontend already handles this correctly (deliverableResults filter +
    refund + 502 if empty). Changing backend response semantics is optional and
    deferred until a deliberate decision is made.
  * requestId format (switch to uuid) — low priority, deferred.

12m.4 Pending Operational Items (full carry-forward)

  * Vercel deployment check — confirm commit 49104d4 is Ready on Vercel.
  * payment.succeeded webhook — real E2E test not yet run (sandbox or live purchase).
  * free_signup backfill — NOT applied to production.
    File: migrations/20260627000002_backfill_free_signup_shadow_grants.sql
    Apply in Supabase SQL Editor.
    Verify: SELECT count(*) FROM credit_grants WHERE source_id = 'backfill_20260628'; → expect 9 rows.
  * Shadow allocation row check — run one generation as test user after backfill.
  * Blue color online test — generate one logo with Blue selected; confirm blue is visible.
  * Designer Service inquiry/booking flow — not implemented.
  * Dedicated OG/social preview image (1200×630) — not urgent.
  * lib/stripe/ dead code — not deleted. Defer to cleanup pass.
  * Hybrid route — internal only. Do NOT connect /generate-logo-hybrid-test to live /generate-logo.

12m.5 Current Git State (both repos)

  Frontend: main @ 49104d4 — working tree clean.
            Untracked preview files (app/generate-preview/, components/generate-page-preview.tsx)
            intentionally uncommitted.
  Backend:  main @ 810768a — working tree clean.

⸻

13. How to Continue in a New Chat

Copy this opening message into a new ChatGPT conversation:

老策，继续 LogoFunny backend。从 LOGOFUNNY_PROJECT_STATE.md 继续，不要重新猜。当前重点是 Hybrid v1.4 Step 1：只检查并完成 /generate-logo-hybrid-test 的 quality metadata。先确认 routes/logoApiRoutes.js 当前 diff、node -c、git status；不要碰 live /generate-logo、OpenAI prompt、frontend、Dodo、credits、refund、referral、Supabase。commit 和 push 必须等我明确同意。