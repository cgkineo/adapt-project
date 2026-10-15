import assert from 'node:assert/strict'
import { test } from 'node:test'
import os from 'node:os'
import path from 'node:path'
import fs from 'fs-extra'
import Framework from '../lib/Framework.js'

const noop = () => {}

function makeRoot () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'adapt-project-test-'))
}

function writePackageJSON (dir, data) {
  fs.ensureDirSync(dir)
  fs.writeJSONSync(path.join(dir, 'package.json'), data)
}

function writeSchema (dir, name, data) {
  fs.ensureDirSync(path.join(dir, 'schema'))
  fs.writeJSONSync(path.join(dir, 'schema', `${name}.schema.json`), data)
}

function loadSchemas (rootPath) {
  const framework = new Framework({ rootPath, schemaVersion: '1.0.0', log: noop, warn: noop })
  return framework.getSchemas({ includedFilter: () => true }).schemas
}

// Schemas#load() always resolves the base 'course' model (Schemas.js:130), so every fixture
// needs a minimal core plugin providing it - standing in for adapt-contrib-core in production.
function writeCorePlugin (root) {
  const coreDir = path.join(root, 'node_modules/adapt-core')
  writePackageJSON(coreDir, {
    name: 'adapt-core',
    version: '1.0.0',
    core: true,
    keywords: ['adapt-plugin']
  })
  writeSchema(coreDir, 'course', {
    $anchor: 'course',
    type: 'object',
    properties: {
      _id: { type: 'string' }
    }
  })
}

test('a v1 schema using the legacy `globals` key registers as invalid', () => {
  const root = makeRoot()
  try {
    writeCorePlugin(root)
    const pluginDir = path.join(root, 'node_modules/adapt-my-extension')
    writePackageJSON(pluginDir, {
      name: 'adapt-my-extension',
      version: '1.0.0',
      targetAttribute: '_myExtension',
      keywords: ['adapt-plugin', 'adapt-extension']
    })
    writeSchema(pluginDir, 'course', {
      $anchor: 'my-extension-course',
      type: 'object',
      globals: {
        _myExtension: {
          type: 'object',
          title: 'My Extension',
          properties: {
            _devTools: { type: 'object', title: 'Dev tools' }
          }
        }
      },
      properties: {
        _myExtension: {
          type: 'object',
          title: 'My Extension',
          properties: {
            _isEnabled: { type: 'boolean', title: 'Enabled' }
          }
        }
      }
    })

    const schemas = loadSchemas(root)
    const schema = schemas.find(s => s.name === 'my-extension-course')

    assert.ok(schema, 'expected the schema to still load')
    assert.equal(schema.isValid, false)
    assert.equal(schema.validationWarnings.length, 1)
    assert.match(schema.validationWarnings[0], /legacy 'globals' key/)
  } finally {
    fs.removeSync(root)
  }
})

test('a v1 schema without a `globals` key is unaffected', () => {
  const root = makeRoot()
  try {
    writeCorePlugin(root)
    const pluginDir = path.join(root, 'node_modules/adapt-my-extension')
    writePackageJSON(pluginDir, {
      name: 'adapt-my-extension',
      version: '1.0.0',
      targetAttribute: '_myExtension',
      keywords: ['adapt-plugin', 'adapt-extension']
    })
    writeSchema(pluginDir, 'course', {
      $patch: {
        source: { $ref: 'course' },
        with: {
          properties: {
            _myExtension: {
              type: 'object',
              title: 'My Extension',
              properties: {
                _isEnabled: { type: 'boolean', title: 'Enabled' }
              }
            }
          }
        }
      }
    })

    const schemas = loadSchemas(root)
    const schema = schemas.find(s => s.plugin?.name === 'adapt-my-extension')

    assert.ok(schema, 'expected the schema to still load')
    assert.equal(schema.isValid, true)
    assert.deepEqual(schema.validationWarnings, [])
  } finally {
    fs.removeSync(root)
  }
})
