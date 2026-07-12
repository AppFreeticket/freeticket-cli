# Changesets

Every user-facing CLI change must include a changeset created with `pnpm changeset`.
Choose the SemVer bump that matches the change and commit the generated Markdown file.

After that change reaches `main`, GitHub creates or updates the **Version Packages**
pull request. Merging that generated pull request updates the package version and
changelog; the release workflow then publishes the new version to npm through OIDC.
