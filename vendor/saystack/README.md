# saystack

The desktop and web apps read replies aloud with saystack: the player above
the composer, the word marked in the reply, and the glow that follows the
voice (and the microphone while you dictate). Dictation streams the
microphone through saystack too, and the daemon forwards it to oMLX with
saystack's server packages.

saystack is not on npm yet, so its packages install from the tarballs in this
folder. The `overrides` in `pnpm-workspace.yaml` point every `@saystack/*`
dependency here, including the ones the saystack packages have on each other.

To pick up a newer saystack from a checkout next to this repository:

```bash
dest="$PWD/vendor/saystack"
for p in core react web react-web react-native server engine-openai-compatible; do
  (cd ../saystack/packages/$p && pnpm build && pnpm pack --pack-destination "$dest")
done
pnpm install
```

Then restart `bin/dev`: Vite keeps its own copy of dependencies.

When saystack is published, delete this folder and the `@saystack/*`
overrides. The versions in `packages/ui-web/package.json` then come from npm.
