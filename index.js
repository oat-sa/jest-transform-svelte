const svelte = require('svelte/compiler');
const { transformSync, transform } = require('@babel/core');
const typescript = require('typescript');

const styleRegex = /<style[^>]*>[\S\s]*?<\/style>/g;
const dynImportRegex = /\bimport\(/g;

// Fixes the '_Sample.default is not a constructor' error when importing in Jest.
const esInterop = 'Object.defineProperty(exports, "__esModule", { value: true });';

// Default transform options - you can modify these as needed
const defaultOptions = {
    preprocess: null,
    compilerOptions: {},
    noStyles: false
};

/**
 * Normalize svelte sources (strip out styles if configured)
 * @param {string} source
 * @param {boolean} noStyles
 * @returns {string} the normalized source
 */
function getNormalizedSource(source, noStyles = false) {
    return noStyles !== false ? source.replace(styleRegex, '') : source;
}

/**
 * Simple synchronous TypeScript preprocessing
 * @param {string} source
 * @returns {string} the processed source
 */
function preprocessTypeScript(source) {
    // Extract script content with TypeScript
    const scriptMatch = source.match(/<script[^>]*lang=["']typescript["'][^>]*>([\s\S]*?)<\/script>/);
    if (!scriptMatch) {
        return source;
    }
    
    const tsCode = scriptMatch[1];
    
    // Transpile TypeScript to JavaScript
    const result = typescript.transpile(tsCode, {
        target: typescript.ScriptTarget.ES2015,
        module: typescript.ModuleKind.ES2015,
    });
    
    // Replace the script block
    return source.replace(
        /<script[^>]*lang=["']typescript["'][^>]*>[\s\S]*?<\/script>/,
        `<script>${result}</script>`
    );
}

/**
 * Compile the svelte source file
 * @param {string} source
 * @param {string} filename
 * @param {boolean} supportsStaticESM - if true we compiled to ESM
 * @param {Object} compilerOptions
 * @returns {Object} the compilation object
 */
function svelteCompile(source, filename, supportsStaticESM = false, compilerOptions = {}) {
    try {
        return svelte.compile(
            source,
            Object.assign(
                {
                    filename,
                    css: false,
                    // Allow tests to set component props.
                    accessors: true,
                    // Debugging and runtime checks
                    dev: false,
                    // Emit CommonJS that Jest can understand.
                    format: supportsStaticESM ? 'esm' : 'cjs'
                },
                compilerOptions
            )
        );
    } catch (error) {
        console.error(`Error compiling Svelte component ${filename}:`, error);
        throw new Error(`Svelte compilation failed for ${filename}: ${error.message}`);
    }
}

module.exports = {
    canInstrument: true,

    /**
     * Process a source file synchronously
     * @param {string} source
     * @param {string} filename
     * @param {Object} options - jest configuration options
     * @param {Object} config - runtime configuration
     * @returns {{code: string, map: string}} the transformation output
     */
    process(source, filename, options, config) {
        try {
            const { supportsDynamicImport = false, supportsStaticESM = false } = config || {};
            const transformOptions = (options && options.transformOptions) || defaultOptions;
            const { compilerOptions } = transformOptions;

            let processed = getNormalizedSource(source, true);
            
            // Handle TypeScript preprocessing synchronously
            if (processed.includes('lang="typescript"') || processed.includes("lang='typescript'")) {
                processed = preprocessTypeScript(processed);
            }

            const compiled = svelteCompile(processed, filename, supportsStaticESM, compilerOptions);

            if (!supportsDynamicImport && dynImportRegex.test(compiled.js.code)) {
                const output = transformSync(compiled.js.code, {
                    configFile: false,
                    inputSourceMap: compiled.js.map,
                    sourceMaps: true,
                    compact: false,
                    plugins: [['babel-plugin-dynamic-import-node', { esInterop: true }]]
                });

                return {
                    code: output.code + esInterop,
                    map: output.map
                };
            }

            return {
                code: compiled.js.code + esInterop,
                map: compiled.js.map
            };
        } catch (error) {
            console.error(`Jest transform error for ${filename}:`, error);
            throw error;
        }
    },

    /**
     * Process a source file asynchronously
     * @param {string} source
     * @param {string} filename
     * @param {Object} options - jest configuration options
     * @param {Object} config - runtime configuration
     * @returns {Promise<{code: string, map: string}>} the transformation output
     */
    processAsync(source, filename, options, config) {
        try {
            const { supportsDynamicImport = false, supportsStaticESM = false } = config || {};

            // Get options from Jest config or use defaults
            const transformOptions = (options && options.transformOptions) || defaultOptions;
            const { preprocess: preprocessConfig, compilerOptions, noStyles } = transformOptions;

            return Promise.resolve()
                .then(() => {
                    const normalized = getNormalizedSource(source, true);

                    if (preprocessConfig) {
                        return svelte.preprocess(normalized, preprocessConfig, { filename })
                            .then(result => result.code);
                    }
                    return normalized;
                })
                .then(preprocessed => {
                    const compiled = svelteCompile(preprocessed, filename, supportsStaticESM, compilerOptions);

                    if (!supportsDynamicImport && dynImportRegex.test(compiled.js.code)) {
                        return transform(compiled.js.code, {
                            configFile: false,
                            inputSourceMap: compiled.js.map,
                            sourceMaps: true,
                            compact: false,
                            plugins: [['babel-plugin-dynamic-import-node', { esInterop: true }]]
                        }).then(output => ({
                            code: output.code + esInterop,
                            map: output.map
                        }));
                    }
                    return {
                        code: compiled.js.code + esInterop,
                        map: compiled.js.map
                    };
                })
                .catch(error => {
                    console.error(`Jest transform async error for ${filename}:`, error);
                    throw error;
                });
        } catch (error) {
            console.error(`Jest transform async setup error for ${filename}:`, error);
            throw error;
        }
    }
};
