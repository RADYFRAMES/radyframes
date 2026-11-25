# RADYFRAMES CREATIVE MEDIA (Next.js + Supabase)

## Run locally
1. `npm install`
2. Copy `.env.example` to `.env.local` and configure the Supabase project URL and anon key.
3. In Supabase SQL Editor, run `001_init.sql`, create the admin user, then run
   `002_make_super_admin.sql` and `003_portfolio_import_rows.sql`.
4. Turn off public sign-ups and configure the callback URL as `http://localhost:3000/auth/callback`.
5. Run `npm run dev`, then open `http://localhost:3000`.

Never commit `.env.local`. The service-role key is used only by the local import script and must
never be exposed as `NEXT_PUBLIC_*`.

## Portfolio inventory import

The importer reads every worksheet, records every non-empty source row, extracts YouTube links,
retains duplicate video-ID occurrences as source-row records, and leaves each new project as
`pending_review`. It does not update a pre-existing project. Invalid YouTube-looking URLs and
rows without video URLs remain in the JSON report/source archive.

1. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` from Supabase **Project Settings → API**. Set
   `NEXT_PUBLIC_SITE_URL` to the local/deployed site origin.
2. In Supabase SQL Editor, run `001_init.sql`, create the admin user, then run
   `002_make_super_admin.sql`, `003_portfolio_import_rows.sql`, and
   `004_portfolio_review.sql` in order. Migration 003 enables RLS on provenance rows and
   grants its import RPC only to `service_role`; migration 004 adds explicit review decisions.
3. Add `SUPABASE_SERVICE_ROLE_KEY` from **Project Settings → API** to `.env.local` only.
   Never prefix it with `NEXT_PUBLIC_` or expose it in the browser.
4. Run a dry run and online oEmbed/thumbnail checks (no database writes):

   ```powershell
   npm run portfolio:import -- --input "C:\path\to\portfolio.xlsx" --verify-links --dry-run
   ```

   The structured JSON report defaults to `src/data/portfolio-inventory.json`. Review its
   worksheets, row counts, invalid links, duplicates, category values and aspect ratios.
5. Only after reviewing the report and confirming the correct credentials, import with the
   explicit `--apply` flag:

   ```powershell
   npm run portfolio:import -- --input "C:\path\to\portfolio.xlsx" --verify-links --apply
   ```

The database stores each distinct YouTube ID in `projects` and every original occurrence,
including duplicate IDs and all raw source columns, in `portfolio_import_rows`. A duplicate can
therefore be reviewed without creating duplicate public cards or overwriting an existing project.
Public cards show only Supabase rows with `published` status.

The admin login uses Supabase Auth email and password. Configure
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` (copied from
`.env.example`) and restart `npm run dev`. The user must also have a row in `admins`; the existing
`002_make_super_admin.sql` assigns the initial super-admin role. The app does not create a default
account or bypass this role check.

## Public portfolio display

When Supabase is not configured, `npm run dev` shows a clearly labelled local preview from
`src/data/portfolio-inventory.json`. These records remain Pending Review, are not written to
Supabase, and the known unavailable videos are excluded. This preview is development-only; a
production build without Supabase configuration shows setup guidance instead and never serves
the inventory as public work.

If Supabase is configured but the portfolio tables are missing from the API schema cache
(PostgREST `PGRST205`), development also uses this labeled preview. Other database errors are
not treated as a missing-schema fallback.

The homepage cinematic hero accepts an optional owner-provided direct video source in
`NEXT_PUBLIC_HERO_VIDEO_URL`: use an HTTPS MP4/WebM URL or a path to a video placed in `public`.
The hero never autoplays; controls remain unavailable until a valid source is configured.
No hero video source is supplied by the project.

To show the live portfolio, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
in the local or deployment environment, apply the existing Supabase migrations, and ensure the
desired projects have actually been published. Approval alone does not publish a project. The
homepage queries the published projects at request time. The public gallery does not need the
service-role key; keep that key server-only for the importer.

The four-video showcase is configured at `/admin/showcase`. It saves its selection and animation
options to the existing public `site_settings` table, but the selector only accepts four distinct
inventory records in Pending Review, Approved or Published status. Public output still resolves
those IDs against published projects only. No schema migration is required for this feature.

Manage real project records and categories at `/admin/projects`. All changes are authenticated
Supabase operations; the page requires configured Supabase credentials and an admin user.
Review the source workbook, unresolved metadata, categories and approval status at `/admin/review`.
The inventory remains read-only until its exact workbook hash has been imported. Approvals and
rejections are stored separately from publication; only `published` projects appear publicly.

## Custom project thumbnails

Custom thumbnail storage requires owner approval and application of
`supabase/migrations/006_projects_thumbnail_path.sql`; do not run it automatically.
The rollback note is `supabase/migrations/006_projects_thumbnail_path.rollback.md`.

Configure a GitHub App installation with Contents read/write access limited to the target
repository, then provide the `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`,
`GITHUB_APP_INSTALLATION_ID`, `GITHUB_REPOSITORY_OWNER`, `GITHUB_REPOSITORY_NAME`, and
`GITHUB_DEPLOYMENT_BRANCH` variables in server-only local/deployment environments. The private
key and installation tokens must never use a `NEXT_PUBLIC_` name. The app writes immutable
WebP assets beneath `public/thumbnails/`; Vercel must be connected to the repository and
deployment branch for committed assets to be deployed. Only super admins can upload
JPEG, PNG, or WebP images (up to 8 MB); server-side signature checks and optimization are
applied before storage.

Run parser tests with `npm run test:portfolio-import` and thumbnail workflow tests with
`npm run test:thumbnail-manager`.

## Stage 1 studio workflows

The Stage 1 UI adds the About page, owner-editable studio content and five-language avatar,
adoption-source selectors, private DI reviews, and guestbook moderation. Unknown profile,
social, skill, feedback, and process information is left for owner input rather than invented.
The profile image field accepts a URL; private media upload/storage is not configured.

Adoption sources, DI reviews, and guestbook moderation require the proposed
`supabase/migrations/005_stage1_studio_workflows.sql`. Review that SQL before running it
manually in the Supabase SQL Editor. This workspace has not connected to or written to
Supabase, and it has not executed this migration. The proposal grants public guestbook reads
for approved entries only; it does not permit anonymous submissions. Public submissions remain
disabled until an anti-spam provider and secure submission workflow are configured.
Until the migration is applied, the related admin screens show that setup is required, while
the existing portfolio remains available.

Public studio content is saved only when an authenticated admin checks the approval control
and presses **Save approved content**. Avatar voice playback uses a matching voice already
installed in the visitor's browser; when one is unavailable, the introduction remains readable.
Stage 2's assistant/draft history and Stage 3's agreement/GST schema are not implemented.
No email, e-signature, cloud-storage, anti-spam, agreement, or GST service is configured by
Stage 1.
