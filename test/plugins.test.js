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

function loadPlugins (rootPath, warn = noop) {
  const framework = new Framework({ rootPath, schemaVersion: '1.0.0', log: noop, warn })
  return framework.getPlugins({ includedFilter: () => true }).plugins
}

test("doesn't warn about node_modules packages that aren't Adapt plugins", () => {
  const root = makeRoot()
  try {
    writePackageJSON(path.join(root, 'node_modules/@babel/core'), { name: '@babel/core', version: '8.0.0' })
    writePackageJSON(path.join(root, 'node_modules/string-width-cjs'), { name: 'string-width', version: '4.2.3' })
    const warnings = []
    assert.equal(loadPlugins(root, message => warnings.push(message)).length, 0)
    assert.deepEqual(warnings, [])
  } finally {
    fs.removeSync(root)
  }
})

test('matches a scoped plugin folder against its scoped package name', () => {
  const root = makeRoot()
  try {
    writePackageJSON(path.join(root, 'node_modules/@scope/adapt-good'), {
      name: '@scope/adapt-good',
      version: '1.0.0',
      keywords: ['adapt-plugin', 'adapt-extension']
    })
    writePackageJSON(path.join(root, 'node_modules/adapt-renamed'), {
      name: 'adapt-original',
      version: '1.0.0',
      keywords: ['adapt-plugin', 'adapt-extension']
    })
    const warnings = []
    loadPlugins(root, message => warnings.push(message))
    assert.deepEqual(warnings, ['Plugin folder name adapt-renamed does not match package name adapt-original.'])
  } finally {
    fs.removeSync(root)
  }
})

test('finds a plugin under node_modules with the adapt-plugin keyword', () => {
  const root = makeRoot()
  try {
    writePackageJSON(path.join(root, 'node_modules/adapt-my-extension'), {
      name: 'adapt-my-extension',
      version: '1.0.0',
      keywords: ['adapt-plugin', 'adapt-extension']
    })
    const plugins = loadPlugins(root)
    assert.equal(plugins.length, 1)
    assert.equal(plugins[0].name, 'adapt-my-extension')
    assert.equal(plugins[0].type, 'extension')
  } finally {
    fs.removeSync(root)
  }
})

test('excludes node_modules packages without the adapt-plugin keyword', () => {
  const root = makeRoot()
  try {
    writePackageJSON(path.join(root, 'node_modules/lodash'), {
      name: 'lodash',
      version: '4.0.0'
    })
    const plugins = loadPlugins(root)
    assert.equal(plugins.length, 0)
  } finally {
    fs.removeSync(root)
  }
})

test('categorized-folder entry wins over a node_modules entry with the same name', () => {
  const root = makeRoot()
  try {
    writePackageJSON(path.join(root, 'src/extensions/adapt-my-extension'), {
      name: 'adapt-my-extension',
      version: '1.0.0',
      extension: 'my-extension'
    })
    writePackageJSON(path.join(root, 'node_modules/adapt-my-extension'), {
      name: 'adapt-my-extension',
      version: '2.0.0',
      keywords: ['adapt-plugin', 'adapt-extension']
    })
    const plugins = loadPlugins(root)
    assert.equal(plugins.length, 1)
    assert.equal(plugins[0].version, '1.0.0')
    assert.ok(plugins[0].sourcePath.includes('/extensions/'))
  } finally {
    fs.removeSync(root)
  }
})

test('categorized-folder-only course loads identically to today (no node_modules)', () => {
  const root = makeRoot()
  try {
    writePackageJSON(path.join(root, 'src/extensions/adapt-my-extension'), {
      name: 'adapt-my-extension',
      version: '1.0.0',
      extension: 'my-extension'
    })
    const plugins = loadPlugins(root)
    assert.equal(plugins.length, 1)
    assert.equal(plugins[0].name, 'adapt-my-extension')
    assert.equal(plugins[0].type, 'extension')
  } finally {
    fs.removeSync(root)
  }
})

test('finds a scoped package under node_modules/@scope/*', () => {
  const root = makeRoot()
  try {
    writePackageJSON(path.join(root, 'node_modules/@scope/adapt-my-extension'), {
      name: 'adapt-my-extension',
      version: '1.0.0',
      keywords: ['adapt-plugin', 'adapt-extension']
    })
    const plugins = loadPlugins(root)
    assert.equal(plugins.length, 1)
    assert.ok(plugins[0].sourcePath.includes('/node_modules/@scope/'))
  } finally {
    fs.removeSync(root)
  }
})

test('useSourcePlugins: false ignores src/ plugins', () => {
  const root = makeRoot()
  try {
    writePackageJSON(path.join(root, 'src/components/adapt-in-src'), {
      name: 'adapt-in-src',
      version: '1.0.0',
      keywords: ['adapt-plugin', 'adapt-component']
    })
    writePackageJSON(path.join(root, 'node_modules/adapt-in-modules'), {
      name: 'adapt-in-modules',
      version: '1.0.0',
      keywords: ['adapt-plugin', 'adapt-component']
    })
    const framework = new Framework({ rootPath: root, schemaVersion: '1.0.0', useSourcePlugins: false, log: noop, warn: noop })
    assert.deepEqual(framework.getPlugins({ includedFilter: () => true }).pluginNames, ['adapt-in-modules'])
    assert.deepEqual(loadPlugins(root).map(plugin => plugin.name).sort(), ['adapt-in-modules', 'adapt-in-src'])
  } finally {
    fs.removeSync(root)
  }
})

test('a stub package.json without a type falls back to bower.json', () => {
  const root = makeRoot()
  try {
    const dir = path.join(root, 'src/components/adapt-legacy')
    writePackageJSON(dir, { name: 'adapt-legacy', devDependencies: { eslint: '*' } })
    fs.writeJSONSync(path.join(dir, 'bower.json'), { name: 'adapt-legacy', version: '2.0.0', component: 'legacy' })
    const plugins = loadPlugins(root)
    assert.equal(plugins.length, 1)
    assert.equal(plugins[0].version, '2.0.0')
    assert.equal(plugins[0].type, 'component')
    assert.equal(plugins[0].folderName, 'adapt-legacy')
  } finally {
    fs.removeSync(root)
  }
})

test("doesn't warn that src/core is named adapt-contrib-core", () => {
  const root = makeRoot()
  try {
    writePackageJSON(path.join(root, 'src/core'), {
      name: 'adapt-contrib-core',
      version: '6.0.0',
      keywords: ['adapt-plugin', 'adapt-core']
    })
    const warnings = []
    const plugins = loadPlugins(root, message => warnings.push(message))
    assert.equal(plugins[0].type, 'core')
    assert.equal(plugins[0].folderName, 'core')
    assert.deepEqual(warnings, [])
  } finally {
    fs.removeSync(root)
  }
})
