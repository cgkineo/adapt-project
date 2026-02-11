# adapt-project

Node.js library for managing Adapt Learning Framework projects — plugins, schemas, course data, and translations. 

## Installation

```bash
npm install adapt-project
```

## Overview

`adapt-project` provides a programmatic API for working with Adapt Framework project directories. It handles:

- **Course data** — Load and manage multilingual content structured as hierarchical JSON (`course > menu/page > article > block > component`)
- **Schemas** — Discover and validate content models using JSON schemas from plugins
- **Plugins** — Discover installed plugins from the `src/` directory and read their metadata
- **Translations** — Export translatable strings and import translated content (CSV, JSON, XLIFF)

## Quick Start

```js
const { Framework } = require('adapt-project');

const framework = new Framework({
  rootPath: '/path/to/adapt-project'
}).load();

// Load course data
const data = framework.getData();
data.languages.forEach(lang => {
  const course = lang.getCourseFileItem();
  console.log(`${lang.name}: ${course.item._id}`);
});

// Load schemas
const schemas = framework.getSchemas();

// Discover plugins
const plugins = framework.getPlugins();

// Export translations
const translate = framework.getTranslate({
  masterLang: 'en',
  format: 'csv'
});
await translate.export();
```

## API

### `Framework`

Main entry point representing an Adapt Framework root directory.

```js
const framework = new Framework({
  rootPath: process.cwd(),   // Project root
  outputPath: './build/',    // Build output directory
  sourcePath: './src/',      // Source code directory
  courseDir: 'course',       // Course data subdirectory name
  jsonext: 'json',           // JSON file extension (json or txt)
  trackingIdType: 'block',   // Content type to assign tracking IDs to
  useOutputData: false,      // Read from build output instead of source
  includedFilter: () => true,// Plugin filter function
  log: console.log,
  warn: console.warn
}).load();
```

| Method | Returns | Description |
|---|---|---|
| `load()` | `Framework` | Load the project's `package.json` |
| `getData()` | `Data` | Get course data instance |
| `getPlugins()` | `Plugins` | Discover and load all plugins |
| `getSchemas()` | `Schemas` | Load all plugin schemas |
| `getTranslate(options)` | `Translate` | Get translation import/export instance |
| `makeIncludeFilter()` | `function` | Build a plugin filter from `config.json` build includes/excludes |
| `applyGlobalsDefaults()` | `Framework` | Apply schema defaults to `_globals` in course data |
| `applyScreenSizeDefaults()` | `Framework` | Apply schema defaults to `screenSize` in config |

### `Data`

Manages the `course/` folder — config, languages, and all content items.

| Method | Returns | Description |
|---|---|---|
| `load()` | `Data` | Scan and load all language directories |
| `getLanguage(name)` | `Language` | Get a specific language by folder name |
| `getConfigFileItem()` | `JSONFileItem` | Get the `config.json` file item |
| `copyLanguage(from, to)` | `Language` | Duplicate a language folder |
| `checkIds()` | `Data` | Validate `_id` / `_parentId` structure across all languages |
| `addTrackingIds()` | `Data` | Auto-assign sequential `_trackingId` values |
| `removeTrackingIds()` | `Data` | Strip `_trackingId` from all items |
| `save()` | `Data` | Persist all changes to disk |

### `Translate`

Export and import translatable strings identified by schema annotations.

```js
const translate = framework.getTranslate({
  masterLang: 'en',
  targetLang: 'fr',
  format: 'csv',         // 'csv', 'json', or 'xlf'
  csvDelimiter: ',',
  shouldReplaceExisting: false
});

await translate.export();  // Export master language strings
await translate.import();  // Import translated strings into target language
```

Supported formats:
- **CSV** — One file per content type, with auto-detected encoding and delimiter
- **JSON** — Single `export.json` with all translatable strings
- **XLIFF 1.2** — Single `source.xlf` file

## Content Hierarchy

Adapt course content follows this structure:

```
course/
  config.json          — Global configuration
  en/                  — Language folder
    course.json        — Course metadata and _globals
    contentObjects.json — Menus and pages
    articles.json      — Articles within pages
    blocks.json        — Blocks within articles
    components.json    — Components within blocks
```

Each content item has:
- `_id` — Unique identifier
- `_type` — Model type (`course`, `menu`, `page`, `article`, `block`, `component`)
- `_parentId` — Reference to parent item
- `_trackingId` — Sequential tracking identifier (auto-generated)

## Directory Layout

```
adapt-project/
  index.js               — Module exports
  lib/
    Framework.js         — Main entry point
    Data.js              — Course data management
    Schemas.js           — Schema discovery and validation
    Plugins.js           — Plugin discovery
    Translate.js         — Translation export/import
    JSONFile.js          — JSON file I/O
    JSONFileItem.js      — JSON sub-item wrapper
    data/
      Language.js        — Single language folder
      LanguageFile.js    — Single language file
    plugins/
      Plugin.js          — Plugin representation
    schema/
      Schema.js          — Base schema class
      GlobalsSchema.js   — Global config schema
      ModelSchema.js     — Content model schema
      ExtensionSchema.js — Model extension schema
      ModelSchemas.js    — Schema collection
```

## License

GPL-3.0
