import _ from 'lodash'
import path from 'path'
import fs from 'fs-extra'
import globs from 'globs'
import ExtensionSchema from './schema/ExtensionSchema.js'
import ModelSchema from './schema/ModelSchema.js'
import ModelSchemas from './schema/ModelSchemas.js'
import Plugins from './Plugins.js'
import AdaptSchemas from 'adapt-schemas'

/**
 * @typedef {import('./Framework')} Framework
 * @typedef {import('./Plugins')} Plugins
 * @typedef {import('./plugins/Plugin')} Plugin
 */

/**
 * Represents all of the schemas in a course.
 * @todo Work out how to do schema inheritance properly (i.e. component+accordion)
 * @todo Stop deriving schema types (model/extension) from bower and/or folder paths
 * @todo Stop deriving schema names from bower.json or filenames
 * @todo Combining and applying multiple schemas for validation or defaults needs consideration
 */
class Schemas {
  /**
   * @param {Object} options
   * @param {Framework} options.framework
   * @param {function} options.includedFilter
   * @param {Plugins} options.plugins
   * @param {string} options.sourcePath
   * @param {function} options.log
   * @param {function} options.warn
   * @param {Object} options.schemasConfig
   */
  constructor ({
    framework = null,
    includedFilter = function () { return true },
    plugins = null,
    sourcePath = '',
    log = console.log,
    warn = console.warn,
    schemasConfig = {}
  } = {}) {
    /** @type {Framework} */
    this.framework = framework
    /** @type {function} */
    this.includedFilter = includedFilter
    /** @type {string} */
    this.sourcePath = sourcePath.replace(/\\/g, '/')
    /** @type {Plugins} */
    this.plugins = plugins
    /** @type {[Schema]]} */
    this.schemas = null
    /** @type {function} */
    this.log = log
    /** @type {function} */
    this.warn = warn
    /** @type {Object} */
    this.schemasConfig = schemasConfig
    /** @type {AdaptSchemas} */
    this.ajvSchemas = null
  }

  /** @returns {Schemas} */
  load () {
    /**
     * @param {Plugin} plugin
     * @param {string} filePath
     */
    const createSchema = (plugin, filePath) => {
      const json = fs.readJSONSync(filePath)
      if (this.framework.isSchemaVersionGte('1.0.0')) {
        const isExtensionSchema = Boolean(json.$patch || !(json.properties || json.$merge))
        const InferredSchemaClass = (isExtensionSchema ? ExtensionSchema : ModelSchema)
        const inferredSchemaName = path.parse(filePath).name.split('.')[0]
        return new InferredSchemaClass({
          name: inferredSchemaName,
          plugin,
          framework: this.framework,
          parent: this,
          filePath,
          globalsType: plugin.type,
          targetAttribute: plugin.targetAttribute
        })
      }
      const isExtensionSchema = Boolean(json.properties.pluginLocations)
      const InferredSchemaClass = (isExtensionSchema ? ExtensionSchema : ModelSchema)
      const inferredSchemaName = (plugin.name === 'core')
        ? path.parse(filePath).name.split('.')[0] // if core, get schema name from file name
        : isExtensionSchema
          ? plugin.name // assume schema name is plugin name
          : plugin.targetAttribute // assume schema name is plugin._[type] value
      return new InferredSchemaClass({
        name: inferredSchemaName,
        plugin,
        framework: this.framework,
        parent: this,
        filePath,
        globalsType: plugin.type,
        targetAttribute: plugin.targetAttribute
      })
    }

    this.plugins = new Plugins({
      framework: this.framework,
      includedFilter: this.includedFilter,
      sourcePath: this.sourcePath,
      log: this.log,
      warn: this.warn
    })
    this.plugins.load()

    this.schemas = []
    this.plugins.plugins.forEach(plugin => globs.sync(plugin.schemaLocations).forEach(filePath => {
      const schema = createSchema(plugin, filePath)
      schema.load()
      this.schemas.push(schema)
    }))

    if (this.framework.isSchemaVersionGte('1.0.0')) {
      this.ajvSchemas = new AdaptSchemas(this.schemasConfig || {})
      this.ajvSchemas.init()
      this.ajvSchemas.loadSchemas(this.schemas.map(s => s.filePath), {
        cwd: this.sourcePath,
        ignore: ['**/node_modules/**']
      })
      this.ajvSchemas.getSchema('course')
    } else {
      this._generateCourseGlobals()
      this._generateModelExtensions()
    }

    return this
  }

  /**
   * Copy globals schema extensions from model/extension plugins to the course._globals
   * schema.
   * @returns {Schemas}
   * @example
   * courseModelSchema.properties._globals.properties._components.properties._accordion
   */
  _generateCourseGlobals () {
    const courseSchema = this.getCourseSchema()
    this.schemas.forEach(schema => {
      const globalsPart = schema.getCourseGlobalsPart()
      if (!globalsPart) {
        return
      }
      _.merge(courseSchema.json.properties._globals.properties, globalsPart)
    })
    return this
  }

  /**
   * Copy pluginLocations schema extensions from the extension plugins to the appropriate model schemas
   * @returns {Schemas}
   * @example
   * courseModelSchema.properties._assessment
   * articleModelSchema.properties._trickle
   * blockModelSchema.properties._trickle
   */
  _generateModelExtensions () {
    const extensionSchemas = this.schemas.filter(schema => schema instanceof ExtensionSchema)
    extensionSchemas.forEach(schema => {
      const extensionParts = schema.getModelExtensionParts()
      if (!extensionParts) {
        return
      }
      for (const modelName in extensionParts) {
        const extensionPart = extensionParts[modelName]
        /**
         * Check if the sub-schema part has any defined properties.
         * A lot of extension schemas have empty objects with no properties.
         */
        if (!extensionPart.properties) {
          continue
        }
        const modelSchema = this.getModelSchemaByName(modelName)
        if (!modelSchema) {
          const err = new Error(`Cannot add extensions to model which doesn't exits ${modelName}`)
          err.number = 10012
          throw err
        }
        /**
         * Notice that the targetAttribute is not used here, we allow the extension schema
         * to define its own _[targetAttribute] to extend any core model.
         */
        modelSchema.json.properties = _.merge({}, modelSchema.json.properties, extensionPart.properties)
      }
    })
    return this
  }

  /**
   * @returns {string[]}
   */
  getSchemaNames () {
    return this.schemas.map(({ name }) => name)
  }

  /**
   * @param {string} schemaName
   * @returns {ModelSchema}
   */
  getModelSchemaByName (schemaName) {
    const modelSchemas = this.schemas.filter(schema => schema instanceof ModelSchema)
    return modelSchemas.find(({ name }) => name === schemaName)
  }

  /** @returns {ModelSchema} */
  getCourseSchema () {
    return this.getModelSchemaByName('course')
  }

  /** @returns {ModelSchema} */
  getConfigSchema () {
    return this.getModelSchemaByName('config')
  }

  /**
   * Uses a model JSON to derive the appropriate schemas for the model.
   * @param {Object} json
   * @returns {ModelSchemas}
   */
  getSchemasForModelJSON (json) {
    let schemas = []
    if (this.framework.isSchemaVersionGte('1.0.0')) {
      const candidates = []
      if (json._model) {
        candidates.push(this.getModelSchemaByName(json._model))
      }
      if (json._component) {
        candidates.push(this.getModelSchemaByName(json._component + '-component'))
      }
      if (json._type) {
        candidates.push(this.getModelSchemaByName(json._type))
        if (json._type === 'menu' || json._type === 'page') {
          candidates.push(this.getModelSchemaByName('contentobject'))
        }
      }
      const resolved = candidates.filter(Boolean)[0]
      if (resolved) schemas.push(resolved)
    } else {
      if (json._type) {
        if (json._type === 'menu' || json._type === 'page') {
          schemas.push(this.getModelSchemaByName('contentobject'))
        }
        schemas.push(this.getModelSchemaByName(json._type))
      }
      if (json._component) {
        schemas.push(this.getModelSchemaByName(json._component))
      }
      if (json._model) {
        schemas.push(this.getModelSchemaByName(json._model))
      }
    }
    schemas = schemas.filter(Boolean)
    if (!schemas.length) {
      const err = new Error(`No schema found for model JSON with _type ${json._type}, _component ${json._component} or _model ${json._model}`)
      err.number = 10015
      throw err
    }
    return new ModelSchemas({
      framework: this.framework,
      schemas
    })
  }
}

export default Schemas
