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

function writeJSON (file, data) {
  fs.ensureDirSync(path.dirname(file))
  fs.writeJSONSync(file, data)
}

const translatable = { type: 'string', _adapt: { translatable: true } }

// A core plugin with course and component models, and one component plugin whose
// translatable text sits inside an array of objects.
function writeProject (root) {
  const core = path.join(root, 'node_modules/adapt-core')
  writeJSON(path.join(core, 'package.json'), { name: 'adapt-core', version: '1.0.0', core: true, keywords: ['adapt-plugin'] })
  writeJSON(path.join(core, 'schema/course.schema.json'), {
    $anchor: 'course', type: 'object', properties: { _id: { type: 'string' }, title: translatable }
  })
  writeJSON(path.join(core, 'schema/component.schema.json'), {
    $anchor: 'component', type: 'object', properties: { _id: { type: 'string' }, title: translatable }
  })
  const list = path.join(root, 'node_modules/adapt-list')
  writeJSON(path.join(list, 'package.json'), { name: 'adapt-list', version: '1.0.0', component: 'list', keywords: ['adapt-plugin', 'adapt-component'] })
  writeJSON(path.join(list, 'schema/component.schema.json'), {
    $anchor: 'list-component',
    $merge: {
      source: { $ref: 'component' },
      with: { properties: { _items: { type: 'array', items: { type: 'object', properties: { text: translatable, _score: { type: 'number' } } } } } }
    }
  })
  const course = path.join(root, 'src/course')
  writeJSON(path.join(course, 'config.json'), { _defaultLanguage: 'en' })
  writeJSON(path.join(course, 'en/course.json'), { _id: 'course', _type: 'course', title: 'Course title' })
  writeJSON(path.join(course, 'en/components.json'), [{
    _id: 'c-1',
    _type: 'component',
    _component: 'list',
    title: 'List title',
    _items: [{ text: 'First', _score: 1 }, { text: 'Second', _score: 2 }]
  }])
}

test('a v1 export includes translatable fields inside arrays, one row per item', async () => {
  const root = makeRoot()
  try {
    writeProject(root)
    const languagePath = path.join(root, 'languagefiles') + '/'
    const framework = new Framework({ rootPath: root, schemaVersion: '1.0.0', log: noop, warn: noop })
    await framework.getTranslate({ format: 'json', languagePath }).export()
    const rows = fs.readJSONSync(path.join(languagePath, 'en/export.json'))
    const keys = rows.map(r => `${r.file}/${r.id}${r.path}`).sort()
    assert.deepEqual(keys, [
      'components/c-1/_items/0/text/',
      'components/c-1/_items/1/text/',
      'components/c-1/title/',
      'course/course/title/'
    ])
  } finally {
    fs.removeSync(root)
  }
})
