# md2hd for Obsidian

[md2hd](https://md2hd.com) maps in an Obsidian tab. Right-click a note or
folder and pick **Open as md2hd map**, or run the *Map the current folder* /
*Map the whole vault* commands. Frontmatter becomes nodes, wikilinks become
edges, and the map re-renders when the vault changes — Obsidian's editor is
the write path, the map is the read path.

The map mounts in a shadow root, so the plugin's styles and Obsidian's never
touch, in either direction. No rail — the stage is the whole frame.

## Install

Until the plugin lands in the community directory:

1. Download `manifest.json` and `main.js` from the latest release.
2. Put them in `<vault>/.obsidian/plugins/md2hd/`.
3. Enable **md2hd** in Settings → Community plugins.

## Build from source

```
npm install
npm test     # builds main.js, then smoke-checks it
```

The repo is standalone — `src/` carries the map renderer, synced out of the
[md2hd monorepo](https://github.com/evan-steinhilb/md2hd) by maintainers
(`npm run sync`, which needs the monorepo checkout around it).

## Writing maps

Any markdown works, but frontmatter gives the map its shape — see the
[reference](https://md2hd.com/reference) for node types, `rel:` links, and
the `type: map` config block.

## License

MIT
