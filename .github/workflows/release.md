name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: windows-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'yarn'

      - run: yarn install --frozen-lockfile

      - run: yarn build

      - run: yarn test

      # ---------------------------------------------------------------------------
      # Code signing
      #
      # Two signing paths are supported. Set the secrets for whichever you use.
      #
      # Option A — Traditional certificate (PFX / p12):
      #   CSC_LINK          Base64-encoded .p12 file  (echo -n file.p12 | base64)
      #   CSC_KEY_PASSWORD  Password for the .p12
      #
      # Option B — Azure Trusted Signing (recommended for EV):
      #   AZURE_TENANT_ID              Azure AD tenant
      #   AZURE_CLIENT_ID              App registration client ID
      #   AZURE_CLIENT_SECRET          App registration secret
      #   AZURE_TRUSTED_SIGNING_ACCOUNT_NAME   Trusted Signing account name
      #   AZURE_TRUSTED_SIGNING_ENDPOINT       e.g. https://eus.codesigning.azure.net
      #   AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME  Certificate profile name
      #
      # If neither set of secrets is present the build still succeeds but produces
      # an unsigned installer (suitable for internal testing, not public release).
      # ---------------------------------------------------------------------------

      - name: Package (sign with PFX if secret present)
        if: ${{ env.CSC_LINK != '' }}
        env:
          CSC_LINK: ${{ secrets.CSC_LINK }}
          CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: yarn package

      - name: Package (sign with Azure Trusted Signing if secret present)
        if: ${{ env.AZURE_CLIENT_SECRET != '' && env.CSC_LINK == '' }}
        env:
          AZURE_TENANT_ID: ${{ secrets.AZURE_TENANT_ID }}
          AZURE_CLIENT_ID: ${{ secrets.AZURE_CLIENT_ID }}
          AZURE_CLIENT_SECRET: ${{ secrets.AZURE_CLIENT_SECRET }}
          AZURE_TRUSTED_SIGNING_ACCOUNT_NAME: ${{ secrets.AZURE_TRUSTED_SIGNING_ACCOUNT_NAME }}
          AZURE_TRUSTED_SIGNING_ENDPOINT: ${{ secrets.AZURE_TRUSTED_SIGNING_ENDPOINT }}
          AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME: ${{ secrets.AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: yarn package

      - name: Package (unsigned — no signing secrets present)
        if: ${{ env.CSC_LINK == '' && env.AZURE_CLIENT_SECRET == '' }}
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: yarn package

      - name: Publish to GitHub Releases
        uses: softprops/action-gh-release@v2
        with:
          files: |
            dist/*.exe
            dist/*.yml
            dist/*.blockmap
          draft: false
          prerelease: ${{ contains(github.ref_name, '-') }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
