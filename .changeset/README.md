# Changesets

Every user-facing CLI change must include a changeset created with `pnpm changeset`.
Choose the SemVer bump that matches the change and commit the generated Markdown file.

After that change reaches `main`, GitHub updates the package version and changelog,
commits them to `main`, and publishes the new version to npm through OIDC.
