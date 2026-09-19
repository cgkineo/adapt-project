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

function loadPlugins (rootPath) {
  const framework = new Framework({ rootPath, schemaVersion: '1.0.0', log: noop, warn: noop })
  return framework.getPlugins({ includedFilter: () => true }).plugins
}

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
