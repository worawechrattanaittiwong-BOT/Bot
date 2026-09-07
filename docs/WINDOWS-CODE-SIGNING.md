# SCENOVA Windows Code Signing

SCENOVA Windows Installer is prepared to use **Azure Artifact Signing** (formerly Trusted Signing) in GitHub Actions.

The build stays unsigned until the signing service is configured and `SCENOVA_WINDOWS_SIGNING_ENABLED` is set to `true`.

## Why this is used

- Authenticode signs `SCENOVA-Setup.exe` with a publicly trusted publisher certificate.
- The signed file is timestamped so the signature remains valid after certificate rotation/expiry.
- GitHub Actions verifies the Authenticode signature before publishing the installer to the website.
- The certificate private key is not stored in this repository.
- Azure OIDC is used so GitHub does not need a long-lived Azure client secret.

## Azure setup

1. Create an Azure Artifact Signing account in a supported region.
2. Complete Microsoft identity validation for the publisher.
3. Create a public-trust Code Signing certificate profile.
4. Create an Entra ID App Registration / Service Principal for GitHub Actions.
5. Add a Federated Credential for this repository and branch:
   - Repository: `worawechrattanaitthiwong-creator/Bot`
   - Branch: `main`
6. Grant the service principal the **Artifact Signing Certificate Profile Signer** role on the signing account/profile.

## GitHub Secrets

Repository Settings → Secrets and variables → Actions → Secrets:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

These values are used by `azure/login` with GitHub OIDC. No Azure client secret is required.

## GitHub Variables

Repository Settings → Secrets and variables → Actions → Variables:

- `AZURE_ARTIFACT_SIGNING_ENDPOINT`
  - Example format: `https://<region>.codesigning.azure.net/`
- `AZURE_ARTIFACT_SIGNING_ACCOUNT`
- `AZURE_ARTIFACT_SIGNING_PROFILE`
- `SCENOVA_WINDOWS_EXPECTED_PUBLISHER`
  - Optional but recommended. Set this to a stable part of the certificate Subject that should identify the publisher.
- `SCENOVA_WINDOWS_SIGNING_ENABLED`
  - Keep unset or `false` while setup is incomplete.
  - Set to `true` only after all values above are configured.

## What the workflow does

On a push to `main` that rebuilds the installer:

1. Builds the self-contained `SCENOVA-Setup.exe`.
2. Authenticates to Azure through OIDC.
3. Signs only `installer-publish/SCENOVA-Setup.exe`.
4. Uses SHA-256 Authenticode and RFC3161 timestamping.
5. Calls `Get-AuthenticodeSignature` and fails the release if the signature is not `Valid`.
6. Optionally validates the Publisher subject.
7. Publishes the verified signed binary to `apps/web/public/downloads/SCENOVA-Setup.exe`.

## SmartScreen expectation

Code signing is required for a professional public Windows installer, but a valid signature does not mathematically guarantee that SmartScreen will never warn on a brand-new binary. Reputation can still build over time. The important change is that Windows can verify a trusted Publisher rather than treating the installer as an unknown unsigned executable.

## Never do this

- Do not commit a PFX/private key to Git.
- Do not put a certificate private key into the public web folder.
- Do not use a self-signed certificate for customer distribution and assume it fixes SmartScreen.
- Do not disable Windows Defender/SmartScreen as part of installation.

## Workflow

Signing is implemented in:

`.github/workflows/build-windows-installer.yml`
