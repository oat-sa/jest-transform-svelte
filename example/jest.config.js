const sveltePreprocess = require('svelte-preprocess');

module.exports = {
	transform: {
		'^.+\\.js$': 'babel-jest',
		'^.+\\.svelte$': [
			'jest-transform-svelte',
			{
				preprocess: sveltePreprocess({
					typescript: {
						tsconfigFile: './tsconfig.json'
					}
				}),
				debug: false,
				noStyles: true,
				compilerOptions: {}
			}
		]
	},
	moduleFileExtensions: ['js', 'svelte'],
	coverageReporters: ['html'],
	bail: false,
	verbose: false,
	testEnvironment: 'jsdom'
};
