import madge from 'madge';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export async function generateDependencyGraph(projectPath, outputDir) {
  mkdirSync(outputDir, { recursive: true });
  try {
    const result = await madge(projectPath, {
      fileExtensions: ['js', 'ts', 'jsx', 'tsx'],
      excludeRegExp: [/node_modules/, /\.test\./, /\.spec\./, /\.d\.ts$/, /dist\//, /build\//, /\.next\//],
      tsConfig: null,
    });

    // Generate SVG
    const svgPath = join(outputDir, 'dependency-graph.svg');
    await result.image(svgPath);

    // Get analysis data
    const circular = result.circular();
    const orphans = result.orphans();
    const obj = result.obj();

    // Count total dependencies
    let totalDeps = 0;
    const moduleCount = Object.keys(obj).length;
    for (const deps of Object.values(obj)) {
      totalDeps += deps.length;
    }

    // Find most-imported modules (most depended on)
    const importCounts = {};
    for (const [, deps] of Object.entries(obj)) {
      for (const dep of deps) {
        importCounts[dep] = (importCounts[dep] || 0) + 1;
      }
    }
    const mostImported = Object.entries(importCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    // Build markdown summary
    let md = '# Dependency Graph\n\n';
    md += '![Dependency Graph](./dependency-graph.svg)\n\n';
    md += `**${moduleCount} modules** with **${totalDeps} connections**\n\n`;

    // Most imported modules
    if (mostImported.length > 0) {
      md += '## Most-Used Modules\n\n';
      md += 'These files are imported by the most other files — they are the backbone of the project:\n\n';
      md += '| Module | Imported By |\n|--------|------------|\n';
      for (const [mod, count] of mostImported) {
        md += `| \`${mod}\` | ${count} files |\n`;
      }
      md += '\n';
    }

    // Circular dependencies
    if (circular.length > 0) {
      md += '## Circular Dependencies\n\n';
      md += 'These modules import each other in a loop, which can cause bugs and makes the code harder to reason about:\n\n';
      for (const chain of circular) {
        md += `- ${chain.map(c => `\`${c}\``).join(' → ')} → *(back to start)*\n`;
      }
      md += '\n';
    } else {
      md += '## Circular Dependencies\n\nNone found.\n\n';
    }

    // Orphan modules
    if (orphans.length > 0) {
      md += '## Orphan Modules\n\n';
      md += 'These files are not imported by anything else. They might be entry points, or they might be dead code:\n\n';
      for (const file of orphans) {
        md += `- \`${file}\`\n`;
      }
      md += '\n';
    } else {
      md += '## Orphan Modules\n\nNone found — every file is imported by at least one other file.\n\n';
    }

    writeFileSync(join(outputDir, 'dependency-graph.md'), md);

    return {
      svgPath,
      moduleCount,
      totalDeps,
      circularCount: circular.length,
      orphanCount: orphans.length,
    };
  } catch (err) {
    // If madge fails (e.g., Python project), generate a note
    const md = '# Dependency Graph\n\nDependency graph generation is only supported for JavaScript/TypeScript projects.\n\nFor this project, use your IDE\'s "Go to Definition" or "Find All References" features to trace dependencies.\n';
    writeFileSync(join(outputDir, 'dependency-graph.md'), md);

    return {
      svgPath: null,
      moduleCount: 0,
      totalDeps: 0,
      circularCount: 0,
      orphanCount: 0,
      skipped: true,
    };
  }
}
