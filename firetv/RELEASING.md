# Fire TV release signing

Release builds are signed with the FEFC release keystore. **Do not commit** the `.jks` or passwords.

## GitHub Actions secrets (repo `FanEditFanClub/fefc-collection`)

| Secret | Contents |
|--------|----------|
| `FEFC_KEYSTORE_B64` | Base64 of `fefc-release.jks` |
| `FEFC_KEYSTORE_PASSWORD` | Keystore password |
| `FEFC_KEY_ALIAS` | Key alias (`fefc`) |
| `FEFC_KEY_PASSWORD` | Key password |

Decode the keystore in CI with something like:

```bash
echo "$FEFC_KEYSTORE_B64" | base64 -d > firetv/fefc-release.jks
```

Then write `firetv/signing.properties` from the password/alias secrets (file is gitignored).

## Box backup

A backup of the keystore and `signing.properties` lives on the agent box at:

`/workspace/fefc/keys/`

Keep that directory private (mode `700` / files `600`). Prefer rotating via new secrets rather than committing anything under `keys/`.
