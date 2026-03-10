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

  /** @returns {Plugins} */
  load () {
    const typeKeyName = this.framework.pluginTypesSingular
    this.plugins = globs.sync(this.pluginLocations)
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
        if (plugin.type === 'menu' && this.framework.specifiedMenus && !this.framework.specifiedMenus.includes(plugin.name)) {
          return false
        }
        if (plugin.type === 'theme' && this.framework.specifiedThemes && !this.framework.specifiedThemes.includes(plugin.name)) {
          return false
        }
        return true
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
  getPluginNames () {
    return this.plugins.map(plugin => plugin.name)
  }
}

export default Plugins
