import { register, permutateThemes } from '@tokens-studio/sd-transforms';
import StyleDictionary from 'style-dictionary';
import {
  logBrokenReferenceLevels,
  logVerbosityLevels,
  logWarningLevels,
} from 'style-dictionary/enums';
import { promises } from 'fs';

register(StyleDictionary, {
  /* options here if needed */
});

async function run() {
  const $themes = JSON.parse(await promises.readFile('./tokens/$themes.json', 'utf-8'));
  const themes = permutateThemes($themes, { separator: '_' });
  // Build theme configs but exclude responsive and dimension-only token sets
  // Also deduplicate permuted names: strip breakpoint suffixes so we only produce one file per base theme
  const themeMap = new Map();
  const breakpointSuffixRe = /_(phone|tablet|laptop|desktop)$/;
  Object.entries(themes).forEach(([name, tokensets]) => {
    const baseName = name.replace(breakpointSuffixRe, '');
    if (themeMap.has(baseName)) return; // already captured
    const sources = tokensets
      .filter(tokenset => !/^(responsive\/|dimensions\/)/.test(tokenset))
      .map(tokenset => `./tokens/${tokenset}.json`);
    themeMap.set(baseName, sources);
  });

  const configs = Array.from(themeMap.entries()).map(([baseName, sources]) => ({
    source: sources,
    preprocessors: ['tokens-studio'], // <-- since 0.16.0 this must be explicit
    platforms: {
      css: {
        transformGroup: 'tokens-studio',
        transforms: ['name/kebab'],
        files: [
          {
            destination: `./build/css/theme-${baseName}.css`,
            format: 'css/variables',
          },
        ],
      },
      flutter: {
        transformGroup: 'tokens-studio',
        transforms: ['name/kebab'],
        files: [
          {
            destination: `./build/flutter/theme-${baseName}.dart`,
            format: 'flutter/class.dart',
          },
        ],
      },
    },
  }));

  // Build responsive/dimensions tokens separately (one build per responsive file)
  const LOG_CONFIG = {
    log: {
      warnings: logWarningLevels.warn,
      verbosity: logVerbosityLevels.verbose,
      errors: { brokenReferences: logBrokenReferenceLevels.warn },
    },
  };

  function createStyleDictionary(cfg) {
    return new StyleDictionary({ ...LOG_CONFIG, ...cfg });
  }

  async function cleanAndBuild(cfg) {
    const sd = createStyleDictionary(cfg);
    await sd.cleanAllPlatforms(); // optionally, cleanup files first..
    await sd.buildAllPlatforms();
  }

  const responsiveFiles = ['phone', 'tablet', 'laptop', 'desktop'];
  // include type/core so scale/leading referenced by responsive files resolve
  for (const name of responsiveFiles) {
    const responsiveCfg = {
      source: [
        './tokens/dimensions/dimensions.json',
        './tokens/type/core.json',
        `./tokens/responsive/${name}.json`,
      ],
      preprocessors: ['tokens-studio'],
      platforms: {
        css: {
          transformGroup: 'tokens-studio',
          transforms: ['name/kebab'],
          buildPath: './build/css/',
          files: [
            {
              destination: `vars-responsive-${name}.css`,
              format: 'css/variables',
            },
          ],
        },
        flutter: {
          transformGroup: 'tokens-studio',
          transforms: ['name/kebab'],
          buildPath: './build/flutter/',
          files: [
            {
              destination: `vars-responsive-${name}.dart`,
              format: 'flutter/class.dart',
            },
          ],
        },
      },
    };

    // build each responsive file separately to avoid cross-file collisions
    await cleanAndBuild(responsiveCfg);
  }

  await Promise.all(configs.map(cleanAndBuild));
}

run().catch(console.error);