import path from 'path'
import JSONFile from './JSONFile.js'
import Data from './Data.js'
import Translate from './Translate.js'
import Plugins from './Plugins.js'
import Schemas from './Schemas.js'

/**
 * @typedef {import('./JSONFileItem')} JSONFileItem
 */

/**
 * The class represents an Adapt Framework root directory. It provides APIs for
 * plugins, schemas, data and translations.
 */
class Framework {
  /**
   * @param {Object} options
   * @param {string} options.rootPath
   * @param {string} options.outputPath
   * @param {string} options.sourcePath
   * @param {function} options.includedFilter
   * @param {string} options.jsonext
   * @param {string} options.trackingIdType,
   * @param {boolean} options.useOutputData
   * @param {function} options.log
   * @param {function} options.warn
   */
  constructor ({
    rootPath = process.cwd(),
    outputPath = path.join(rootPath, '/build/'),
    sourcePath = path.join(rootPath, '/src/'),
    courseDir = 'course',
    includedFilter = function () { return true },
    jsonext = 'json',
    trackingIdType = 'block',
    useOutputData = false,
    log = console.log,
    warn = console.warn
  } = {}) {
    /** @type {string} */
    this.rootPath = rootPath.replace(/\\/g, '/')
    /** @type {string} */
    this.outputPath = path.resolve(this.rootPath, outputPath).replace(/\\/g, '/').replace(/\/?$/, '/')
    /** @type {string} */
    this.sourcePath = path.resolve(this.rootPath, sourcePath).replace(/\\/g, '/').replace(/\/?$/, '/')
    /** @type {string} */
    this.courseDir = courseDir
    /** @type {function} */
    this.includedFilter = includedFilter
    /** @type {string} */
    this.jsonext = jsonext
    /** @type {string} */
    this.trackingIdType = trackingIdType
    /** @type {boolean} */
    this.useOutputData = useOutputData
    /** @type {function} */
    this.log = log
    /** @type {function} */
    this.warn = warn
    /** @type {JSONFile} */
    this.packageJSONFile = null
  }

  /** @returns {Framework} */
  load () {
    this.packageJSONFile = new JSONFile({
      framework: this,
      path: path.join(this.rootPath, 'package.json').replace(/\\/g, '/')
    })
    this.packageJSONFile.load()
    return this
  }

  /** @returns {JSONFileItem} */
  getPackageJSONFileItem () {
    return this.packageJSONFile.firstFileItem
  }

  /** @returns {string} */
  get version () {
    return this.getPackageJSONFileItem().item.version
  }

  /**
   * Returns a Data instance for either the src/course or build/course folder
   * depending on the specification of the useOutputData property on either the
   * function or the Framework instance.
   * @returns {Data}
   */
  getData ({
    useOutputData = this.useOutputData,
    performLoad = true
  } = {}) {
    const data = new Data({
      framework: this,
      sourcePath: useOutputData ? this.outputPath : this.sourcePath,
      courseDir: this.courseDir,
      jsonext: this.jsonext,
      trackingIdType: this.trackingIdType,
      log: this.log
    })
    if (performLoad) data.load()
    return data
  }

  /** @returns {Plugins} */
  getPlugins ({
    includedFilter = this.includedFilter
  } = {}) {
    const plugins = new Plugins({
      framework: this.framework,
      includedFilter,
      sourcePath: this.sourcePath,
      log: this.log,
      warn: this.warn
    })
    plugins.load()
    return plugins
  }

  /** @returns {Schemas} */
  getSchemas ({
    includedFilter = this.includedFilter
  } = {}) {
    const schemas = new Schemas({
      framework: this,
      includedFilter,
      sourcePath: this.sourcePath,
      log: this.log
    })
    schemas.load()
    return schemas
  }

  /** @returns {Translate} */
  getTranslate ({
    includedFilter = this.includedFilter,
    masterLang = 'en',
    targetLang = null,
    format = 'csv',
    csvDelimiter = ',',
    shouldReplaceExisting = false,
    languagePath = '',
    isTest = false
  } = {}) {
    const translate = new Translate({
      framework: this,
      includedFilter,
      masterLang,
      targetLang,
      format,
      csvDelimiter,
      shouldReplaceExisting,
      jsonext: this.jsonext,
      sourcePath: this.sourcePath,
      languagePath,
      outputPath: this.outputPath,
      courseDir: this.courseDir,
      useOutputData: this.useOutputData,
      isTest,
      log: this.log,
      warn: this.warn
    })
    translate.load()
    return translate
  }

  /** @returns {Framework} */
  applyGlobalsDefaults ({
    includedFilter = this.includedFilter,
    useOutputData = this.useOutputData,
    schemas = this.getSchemas({
      includedFilter
    }),
    data = this.getData(useOutputData)
  } = {}) {
    const courseSchema = schemas.getCourseSchema()
    data.languages.forEach(language => {
      const { file, item: course } = language.getCourseFileItem()
      course._globals = courseSchema.applyDefaults(course._globals, '_globals')
      file.changed()
    })
    data.save()
    return this
  }

  /** @returns {Framework} */
  applyScreenSizeDefaults ({
    includedFilter = this.includedFilter,
    useOutputData = this.useOutputData,
    schemas = this.getSchemas({
      includedFilter
    }),
    data = this.getData(useOutputData)
  } = {}) {
    const configSchema = schemas.getConfigSchema()
    const { file, item: config } = data.getConfigFileItem()
    config.screenSize = configSchema.applyDefaults(config.screenSize, 'screenSize')
    file.changed()
    data.save()
    return this
  }

  /**
   * Creates an includedFilter function based on config.build.includes and
   * config.build.excludes from the course config.json. Automatically resolves
   * plugin dependencies found in plugin bower.json / package.json files.
   * @returns {function} A filter function: (sourcePath: string) => boolean
   */
  makeIncludeFilter () {
    const data = this.getData()
    const configFileItem = data.getConfigFileItem()
    const buildConfig = (configFileItem && configFileItem.item && configFileItem.item.build) || {}
    const buildIncludes = buildConfig.includes && buildConfig.includes.length ? buildConfig.includes : null
    const buildExcludes = buildConfig.excludes && buildConfig.excludes.length ? buildConfig.excludes : null

    if (!buildIncludes && !buildExcludes) {
      return function () { return true }
    }

    // Resolve plugin dependencies for includes
    let resolvedIncludes = null
    if (buildIncludes) {
      const allPlugins = this.getPlugins({ includedFilter: () => true })
      const dependencies = []

      allPlugins.plugins.forEach(plugin => {
        if (!buildIncludes.includes(plugin.name)) return
        const packageData = plugin.packageJSONFile.firstFileItem.item
        const deps = packageData.dependencies
        if (!deps || typeof deps !== 'object') return
        Object.keys(deps).forEach(depName => {
          if (!buildIncludes.includes(depName) && !dependencies.includes(depName)) {
            dependencies.push(depName)
          }
        })
      })

      resolvedIncludes = [].concat(buildIncludes, dependencies)
    }

    // Build regex patterns
    const pluginTypes = ['components', 'extensions', 'menu', 'theme']
    const sourcedir = 'src/'

    let includedRegExp = null
    let nestedIncludedRegExp = null
    if (resolvedIncludes) {
      const includePatterns = resolvedIncludes.map(plugin => {
        return pluginTypes.map(type => sourcedir + type + '/' + plugin + '/').join('|')
      }).join('|')
      const corePattern = sourcedir + 'core/'
      includedRegExp = new RegExp(corePattern + '|' + includePatterns, 'i')

      const nestedPatterns = resolvedIncludes.map(plugin => {
        return sourcedir + '([^/]*)/([^/]*)/' + 'less/plugins' + '/' + plugin + '/'
      }).join('|')
      nestedIncludedRegExp = new RegExp(nestedPatterns, 'i')
    }

    let excludedRegExp = null
    if (buildExcludes) {
      const excludePatterns = buildExcludes.map(plugin => {
        return pluginTypes.map(type => sourcedir + type + '/' + plugin + '/').join('|')
      }).join('|')
      excludedRegExp = new RegExp(excludePatterns, 'i')
    }

    // Return the filter closure
    return function includedFilter (pluginPath) {
      pluginPath = pluginPath.replace(/\\/g, '/')

      const isIncluded = resolvedIncludes ? pluginPath.search(includedRegExp) !== -1 : undefined
      const isExcluded = buildExcludes ? pluginPath.search(excludedRegExp) !== -1 : false

      if (isExcluded || isIncluded === false) {
        return false
      }

      const nestedPluginsPath = !!pluginPath.match(/(?:.)+(?:\/less\/plugins)/g)
      if (!nestedPluginsPath) {
        return true
      }

      if (resolvedIncludes) {
        return !!pluginPath.match(nestedIncludedRegExp)
      }

      return true
    }
  }
}

export default Framework
