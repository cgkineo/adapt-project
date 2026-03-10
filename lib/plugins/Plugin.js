import semver from 'semver'
import globs from 'globs'
import JSONFile from '../JSONFile.js'
import fs from 'fs'

/**
 * Represents a single plugin location, bower.json, version, name and schema
 * locations.
   * @todo Should be able to define multiple schemas for all plugins in the AAT
   * and in the Framework
   * @todo Switch to package.json with the move to npm
   * @todo Plugin type is inferred from the JSON.
   * @todo Component _globals target attribute is inferred from the _component
 */
class Plugin {
  /**
   * @param {Object} options
   * @param {Framework} options.framework
   * @param {string} options.sourcePath
   * @param {string} options.jsonext
   * @param {function} options.log
   */
  constructor ({
    framework = null,
    sourcePath = '',
    log = console.log,
    warn = console.warn
  } = {}) {
    /** @type {Framework} */
    this.framework = framework
    /** @type {string} */
    this.sourcePath = sourcePath.replace(/\\/g, '/')
    /** @type {function} */
    this.log = log
    /** @type {function} */
    this.warn = warn
    /** @type {JSONFile} */
    this.packageJSONFile = null
  }

  /** @returns {Plugin} */
  load () {
    const pathDerivedName = this.sourcePath.split('/').filter(Boolean).pop()
    const files = globs.sync(this.packageJSONLocations)
    const firstFile = files[0]
    if (firstFile) {
      // use the first package definition found (this will be bower.json / package.json)
      this.packageJSONFile = new JSONFile({
        path: firstFile
      })
    } else {
      // no json found, make some up (this will usually be the core)
      this.packageJSONFile = new JSONFile({
        path: null,
        data: {
          name: pathDerivedName
        }
      })
    }
    this.packageJSONFile.load()
    const packageName = (this.packageJSONFile.firstFileItem.item.name)
    if (packageName !== pathDerivedName) {
      // assume path name is also plugin name, this shouldn't be necessary
      this.warn(`Plugin folder name ${pathDerivedName} does not match package name ${packageName}.`)
    }
    if (this.requiredFramework && !this.isFrameworkCompatible) {
      this.warn(`Required framework version (${this.requiredFramework}) for plugin ${packageName} not satisfied by current framework version (${this.framework.version}).`)
    }
    return this
  }

  /**
   * Informs the Schemas API from where to fetch the schemas defined in this
   * plugin.
   * @returns {[string]}
   */
  get schemaLocations () {
    if (this.framework.isSchemaVersionGte('1.0.0')) {
      return [
        `${this.sourcePath}schema/*.schema.json`
      ]
    }
    return [
      `${this.sourcePath}properties.schema`,
      `${this.sourcePath}schema/*.schema`
    ]
  }

  /**
   * @returns {[string]}
   */
  get readmeLocations () {
    return [
      `${this.sourcePath}readme.md`
    ]
  }

  /**
   * @returns {[string]}
   */
  get packageJSONLocations () {
    if (this.framework.usePackageJSON) {
      return [
        `${this.sourcePath}package.json`
      ]
    }
    if (this.framework.isSchemaVersionGte('1.0.0')) {
      return [
        `${this.sourcePath}bower.json`,
        `${this.sourcePath}package.json`
      ]
    }
    return [
      `${this.sourcePath}bower.json`
    ]
  }

  /** @returns {string} */
  get name () {
    return this.packageJSONFile.firstFileItem.item.name
  }

  /** @returns {string} */
  get version () {
    return this.packageJSONFile.firstFileItem.item.version
  }

  /** @returns {string} */
  get requiredFramework () {
    return this.packageJSONFile.firstFileItem.item.framework
  }

  /** @returns {boolean} */
  get isFrameworkCompatible () {
    if (!this.framework || !this.framework.version) return true

    return semver.satisfies(this.framework.version, this.requiredFramework)
  }

  /**
   * Returns the plugin type name.
   * @returns {string}
   */
  get type () {
    const typeKeyName = this.framework.pluginTypesSingular
    if (this.framework.isSchemaVersionGte('1.0.0')) {
      const config = this.packageJSONFile.firstFileItem.item
      const configKeys = Object.keys(config)
      let foundType = configKeys.find(key => typeKeyName.includes(key))
      if (!foundType && config.keywords) {
        foundType = typeKeyName.find(key => config.keywords.includes(`adapt-${key}`))
      }
      if (!foundType) {
        throw new Error(`Unknown plugin type for ${this.name}`)
      }
      return foundType
    }
    if (this.name === 'core') {
      return 'component'
    }
    const config = this.packageJSONFile.firstFileItem.item
    const configKeys = Object.keys(config)
    const foundType = configKeys.find(key => typeKeyName.includes(key))
    if (!foundType) {
      throw new Error(`Unknown plugin type for ${this.name}`)
    }
    return foundType
  }

  /**
   * @returns {string}
   */
  get targetAttribute () {
    if (this.type === 'component') {
      return this.packageJSONFile.firstFileItem.item.component
    }
    return this.packageJSONFile.firstFileItem.item.targetAttribute
  }

  get readme () {
    const readmeFile = globs.sync(this.readmeLocations)[0]
    if (readmeFile) {
      return fs.readFileSync(readmeFile, 'utf-8')
    }
    return null
  }

  get description () {
    this.packageJSONFile.load()
    const json = this.packageJSONFile.firstFileItem.item
    return {
      name: json.name,
      key: this.framework.pluginTypesSingular.reduce((acc, type) => {
        if (json[type]) acc = json[type]
        return acc
      }, null) || '',
      type: this.type,
      version: json.version,
      displayName: json.displayName || json.name,
      description: json.description || '',
      targetAttribute: this.targetAttribute,
      homepage: json.homepage || '',
      repository: json.repository?.url || ''
    }
  }
}

export default Plugin
