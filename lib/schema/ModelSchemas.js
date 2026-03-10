import _ from 'lodash'

/**
 * @typedef {import('./Framework')} Framework
 * @typedef {import('./ModelSchema')} ModelSchema
 * @typedef {import('./Schema')} Schema
 */

/**
 * Encapsulates a collection of ModelSchema
 * @todo Validation, maybe, if this set of files is used in the AAT
 */
class ModelSchemas {
  /**
   * @param {Object} options
   * @param {Framework} options.framework
   * @param {[ModelSchema]} options.schemas
   */
  constructor ({
    framework = null,
    schemas = []
  } = {}) {
    /** @type {Framework} */
    this.framework = framework
    /** @type {[ModelSchema]} */
    this.schemas = schemas
  }

  /**
   * Returns an array of translatable attribute paths derived from the schemas.
   * @param {Object} [item] the JSON object to check translatable attributes for
   * @returns {[string]}
   */
  getTranslatablePaths (item) {
    return _.uniq(this.schemas.reduce((paths, modelSchema) => {
      paths.push(...modelSchema.getTranslatablePaths(item))
      return paths
    }, []))
  }
}

export default ModelSchemas
