import globs from 'globs'
import Plugin from './plugins/Plugin.js'

/**
 * @typedef {import('./Framework')} Framework
 * @typedef {import('./JSONFileItem')} JSONFileItem
 */

/**
 * Represents all of the plugins in the src/ folder.
 */
class Plugins {
  /**
   * @param {Object} options
   * @param {Framework} options.framework
   * @param {function} options.includedFilter
   * @param {string} options.sourcePath
   * @param {function} options.log
   * @param {function} options.warn
   */
  constructor ({
    framework = null,
    includedFilter = function () { return true },
    sourcePath = process.cwd() + '/src/',
    courseDir = 'course',
    log = console.log,
    warn = console.warn
  } = {}) {
    /** @type {Framework} */
    this.framework = framework
    /** @type {function} */
    this.includedFilter = includedFilter
    /** @type {string} */
    this.sourcePath = sourcePath
    /** @type {string} */
    this.courseDir = courseDir
    /** @type {function} */
    this.log = log
    /** @type {function} */
    this.warn = warn
    /** @type {[Plugin]} */
    this.plugins = []
  }

  /**
   * Returns the locations of all plugins in the src/ folder.
   * @returns {[string]}
   */
  get pluginLocations () {
    return [
      `${this.sourcePath}core/`,
      `${this.sourcePath}!(core|${this.courseDir})/*/`
    ]
  }

  /**
   * Returns the locations of all plugins installed in node_modules, alongside
   * the sourcePath rather than inside it.
   * @returns {[string]}
   */
  get nodeModulesLocations () {
    const root = this.framework.rootPath.replace(/\/?$/, '/')
    return [
      `${root}node_modules/*/`,
      `${root}node_modules/@*/*/`
    ]
  }

  /** @returns {Plugins} */
  load () {
    const typeKeyName = this.framework.pluginTypesSingular
    const isUnderNodeModules = sourcePath => sourcePath.includes('/node_modules/')

    const loadedPlugins = [
      ...globs.sync(this.pluginLocations),
      ...globs.sync(this.nodeModulesLocations)
    ]
      .filter(sourcePath => this.includedFilter(sourcePath))
      .map(sourcePath => {
        const plugin = new Plugin({
          framework: this.framework,
          sourcePath,
          log: this.log,
          warn: this.warn
        })
        plugin.load()
        return plugin
      })
      .filter(plugin => {
        // node_modules will contain many irrelevant transitive dependencies,
        // so only plugins explicitly opting in via the adapt-plugin keyword
        // are considered here; categorized-folder plugins are unaffected.
        if (!isUnderNodeModules(plugin.sourcePath)) return true
        const keywords = plugin.packageJSONFile?.firstFileItem?.item?.keywords
        return Array.isArray(keywords) && keywords.includes('adapt-plugin')
      })

    // Dedup by name, first occurrence wins. pluginLocations are globbed
    // before nodeModulesLocations, so a categorized-folder entry always
    // takes precedence over a node_modules entry for the same plugin name.
    const dedupedPlugins = []
    const seenNames = new Set()
    for (const plugin of loadedPlugins) {
      if (seenNames.has(plugin.name)) continue
      seenNames.add(plugin.name)
      dedupedPlugins.push(plugin)
    }

    this.plugins = dedupedPlugins
      .filter(plugin => {
        try {
          if (plugin.type === 'menu' && this.framework.specifiedMenus && !this.framework.specifiedMenus.includes(plugin.name)) {
            return false
          }
          if (plugin.type === 'theme' && this.framework.specifiedThemes && !this.framework.specifiedThemes.includes(plugin.name)) {
            return false
          }
          return true
        } catch (err) {
          this.warn(`Error loading plugin ${plugin.name}: ${err.message}`)
          return false
        }
      })
      .sort((a, b) => {
        const typeIndexA = typeKeyName.findIndex(type => a.type === type)
        const typeIndexB = typeKeyName.findIndex(type => b.type === type)
        if (typeIndexA !== typeIndexB) {
          return typeIndexA - typeIndexB
        }
        return a.name.localeCompare(b.name)
      })
    return this
  }

  /** @returns {JSONFileItem} */
  getAllPackageJSONFileItems () {
    return this.plugins.reduce((items, plugin) => {
      items.push(...plugin.packageJSONFile.fileItems)
      return items
    }, [])
  }

  /**
   * @returns {string[]}
   */
  get pluginNames () {
    return this.plugins.map(plugin => plugin.name)
  }
}

export default Plugins
