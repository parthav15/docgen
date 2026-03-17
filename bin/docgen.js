#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { resolve } from 'path';
import { scan } from '../src/scanner.js';
import { analyze } from '../src/analyzer.js';
import { generateDependencyGraph } from '../src/generators/dependency-graph.js';
import { writeDocs } from '../src/generators/write-docs.js';

const program = new Command();

program
  .name('docgen')
  .description('Generate full documentation for any codebase in 60 seconds')
  .version('1.0.0')
  .argument('[path]', 'Path to the project to document', '.')
  .requiredOption('-p, --provider <provider>', 'AI provider: claude | openai | gemini')
  .requiredOption('-k, --key <apiKey>', 'API key for the chosen provider')
  .option('-m, --model <model>', 'Specific model to use (defaults to best available)')
  .option('-o, --output <dir>', 'Output directory for generated docs', './docs')
  .option('--no-graph', 'Skip dependency graph generation')
  .action(async (projectPath, options) => {
    const startTime = Date.now();
    const resolvedPath = resolve(projectPath);
    const outputDir = resolve(options.output);

    console.log('');
    console.log(chalk.bold.green('  docgen') + chalk.dim(' — codebase documentation generator'));
    console.log(chalk.dim(`  Project: ${resolvedPath}`));
    console.log(chalk.dim(`  Provider: ${options.provider}`));
    console.log('');

    try {
      // Step 1: Scan
      const spinner = ora('Scanning codebase...').start();
      const codebaseMap = await scan(projectPath);
      spinner.succeed(
        `Scanned ${chalk.bold(codebaseMap.totalFiles)} files` +
        chalk.dim(` (${codebaseMap.framework} / ${codebaseMap.language})`)
      );

      if (codebaseMap.totalFiles === 0) {
        console.log(chalk.yellow('\n  No source files found. Check the path and try again.\n'));
        process.exit(1);
      }

      // Step 2: Analyze with AI
      spinner.start(`Generating documentation with ${options.provider}...`);
      const sections = await analyze(codebaseMap, options);
      const sectionCount = Object.keys(sections).length;
      spinner.succeed(`Generated ${chalk.bold(sectionCount)} documentation sections`);

      // Step 3: Dependency graph
      let graphResult = null;
      if (options.graph !== false) {
        spinner.start('Building dependency graph...');
        graphResult = await generateDependencyGraph(resolvedPath, outputDir);
        if (graphResult.skipped) {
          spinner.warn('Dependency graph skipped (JS/TS projects only)');
        } else {
          spinner.succeed(
            `Dependency graph: ${chalk.bold(graphResult.moduleCount)} modules, ` +
            `${chalk.bold(graphResult.totalDeps)} connections` +
            (graphResult.circularCount > 0
              ? chalk.yellow(`, ${graphResult.circularCount} circular`)
              : '') +
            (graphResult.orphanCount > 0
              ? chalk.dim(`, ${graphResult.orphanCount} orphans`)
              : '')
          );
        }
      }

      // Step 4: Write docs
      spinner.start('Writing docs...');
      const written = writeDocs(sections, outputDir);
      spinner.succeed(`Wrote ${chalk.bold(written.length)} files to ${chalk.cyan(options.output + '/')}`);

      // Summary
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log('');
      console.log(chalk.green.bold('  Done!') + chalk.dim(` (${elapsed}s)`));
      console.log('');
      console.log(chalk.dim('  Generated files:'));
      for (const file of written) {
        console.log(`    ${chalk.cyan('→')} ${options.output}/${file}`);
      }
      if (graphResult && !graphResult.skipped) {
        console.log(`    ${chalk.cyan('→')} ${options.output}/dependency-graph.svg`);
        console.log(`    ${chalk.cyan('→')} ${options.output}/dependency-graph.md`);
      }
      console.log('');

    } catch (err) {
      console.log('');
      console.log(chalk.red.bold('  Error: ') + err.message);

      if (err.message.includes('API key') || err.message.includes('authentication') || err.message.includes('401')) {
        console.log(chalk.dim('  Check that your API key is valid and has the right permissions.'));
      }
      if (err.message.includes('rate limit') || err.message.includes('429')) {
        console.log(chalk.dim('  You hit a rate limit. Wait a moment and try again.'));
      }

      console.log('');
      process.exit(1);
    }
  });

program.parse();
