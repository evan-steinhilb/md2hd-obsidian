/**
 * md2hd for Obsidian — the map stage in a workspace tab.
 *
 * The view is EmbedMap out of src/ (synced from the md2hd monorepo), mounted
 * in a shadow root so the
 * app's stylesheet and Obsidian's never meet. Files come from the vault in
 * the CLI's shape — folder-name-prefixed paths — and the vault's own change
 * events stand in for the CLI's refresh-the-tab.
 */
import { ItemView, Notice, Plugin, TFile, TFolder, type WorkspaceLeaf } from 'obsidian'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import EmbedMap from './src/ui/EmbedMap'
import css from './.gen/css.js'
import skill from './.gen/skill.js'

const VIEW = 'md2hd-map'
// Matches the CLI and the app's folder import.
const MD = /\.(md|markdown|txt)$/i

class MapView extends ItemView {
  private target = '' // vault-relative file or folder path; '' is the whole vault
  private root: Root | null = null

  getViewType() {
    return VIEW
  }

  getDisplayText() {
    return this.target ? this.name() : 'md2hd map'
  }

  getIcon() {
    return 'waypoints'
  }

  getState() {
    return { target: this.target }
  }

  async setState(state: { target?: string }, result: unknown) {
    this.target = typeof state?.target === 'string' ? state.target : ''
    await super.setState(state, result as never)
    void this.render()
  }

  async onOpen() {
    this.contentEl.empty()
    this.contentEl.style.padding = '0'
    // Absolute fill rather than height:100% — the pane's height chain is
    // Obsidian's business, and React Flow renders nothing at measured zero.
    this.contentEl.style.position = 'relative'
    const host = this.contentEl.createDiv()
    host.style.cssText = 'position:absolute;inset:0'
    const shadow = host.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = css
    shadow.appendChild(style)
    const mount = shadow.appendChild(document.createElement('div'))
    mount.style.height = '100%'
    this.root = createRoot(mount)

    const refresh = (file: { path: string }) => {
      if (this.inScope(file.path)) void this.render()
    }
    this.registerEvent(this.app.vault.on('modify', refresh))
    this.registerEvent(this.app.vault.on('create', refresh))
    this.registerEvent(this.app.vault.on('delete', refresh))
    // A rename can move a file across the scope line in either direction.
    this.registerEvent(this.app.vault.on('rename', () => void this.render()))
    void this.render()
  }

  async onClose() {
    this.root?.unmount()
  }

  private inScope(path: string) {
    if (!MD.test(path)) return false
    if (!this.target) return true
    return path === this.target || path.startsWith(this.target + '/')
  }

  private name() {
    return this.target
      ? this.target.split('/').pop()!.replace(/\.\w+$/, '')
      : this.app.vault.getName()
  }

  private async render() {
    if (!this.root) return
    const vault = this.app.vault
    const scoped = vault.getFiles().filter((f) => this.inScope(f.path))
    // Paths keep the target's own name as prefix, mirroring the CLI: mapping
    // `projects/notes` yields `notes/a.md`, a single file yields its basename.
    const strip = this.target.includes('/')
      ? this.target.slice(0, this.target.lastIndexOf('/') + 1)
      : ''
    const files = await Promise.all(
      scoped.map(async (f) => ({ path: f.path.slice(strip.length), text: await vault.cachedRead(f) })),
    )
    this.root.render(createElement(EmbedMap, { key: this.target, files, name: this.name() }))
  }
}

export default class Md2hdPlugin extends Plugin {
  async onload() {
    this.registerView(VIEW, (leaf: WorkspaceLeaf) => new MapView(leaf))

    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        const mappable = file instanceof TFolder || (file instanceof TFile && MD.test(file.name))
        if (!mappable) return
        menu.addItem((item) =>
          item
            .setTitle('Open as md2hd map')
            .setIcon('waypoints')
            .onClick(() => this.open(file.path)),
        )
      }),
    )

    this.addCommand({
      id: 'map-folder',
      name: 'Map the current folder',
      callback: () => {
        const parent = this.app.workspace.getActiveFile()?.parent?.path ?? ''
        void this.open(parent === '/' ? '' : parent)
      },
    })

    this.addCommand({
      id: 'map-vault',
      name: 'Map the whole vault',
      callback: () => void this.open(''),
    })

    this.addCommand({
      id: 'install-agent-skill',
      name: 'Install the map-writing skill for coding agents',
      callback: () => void this.installSkill(),
    })
  }

  /**
   * Writes the bundled writing-md2hd-maps skill into the vault, once per
   * convention a coding agent might read: .agents/skills/ (the cross-agent
   * home) and .claude/skills/ (Claude Code). Overwrites on rerun, so the
   * vault's copy tracks the installed plugin version.
   */
  private async installSkill() {
    const adapter = this.app.vault.adapter
    for (const home of ['.agents', '.claude']) {
      let dir = ''
      for (const part of [home, 'skills', 'writing-md2hd-maps']) {
        dir = dir ? `${dir}/${part}` : part
        if (!(await adapter.exists(dir))) await adapter.mkdir(dir)
      }
      await adapter.write(`${dir}/SKILL.md`, skill)
    }
    new Notice('writing-md2hd-maps installed to .agents/skills/ and .claude/skills/')
  }

  private async open(target: string) {
    const leaf = this.app.workspace.getLeaf(true)
    await leaf.setViewState({ type: VIEW, active: true, state: { target } })
  }
}
