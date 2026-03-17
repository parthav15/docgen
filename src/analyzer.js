import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function buildPrompt(codebaseMap) {
  const template = readFileSync(join(__dirname, '..', 'templates', 'prompt.md'), 'utf-8');

  const formatFiles = (files) =>
    files.map(f => `### ${f.path} (${f.lines} lines)\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n');

  return template
    .replace('{{framework}}', codebaseMap.framework)
    .replace('{{language}}', codebaseMap.language)
    .replace('{{fileCount}}', String(codebaseMap.totalFiles))
    .replace('{{configFiles}}', formatFiles(codebaseMap.config))
    .replace('{{routeFiles}}', formatFiles(codebaseMap.routes))
    .replace('{{schemaFiles}}', formatFiles(codebaseMap.schemas))
    .replace('{{sourceFiles}}', formatFiles(codebaseMap.source));
}

function parseSections(response) {
  const sections = {};
  const sectionNames = ['ARCHITECTURE', 'API_ROUTES', 'DATABASE_SCHEMA', 'GETTING_STARTED'];

  for (let i = 0; i < sectionNames.length; i++) {
    const name = sectionNames[i];
    const marker = `## SECTION: ${name}`;
    const nextMarker = i < sectionNames.length - 1 ? `## SECTION: ${sectionNames[i + 1]}` : null;

    const startIdx = response.indexOf(marker);
    if (startIdx === -1) continue;

    const contentStart = startIdx + marker.length;
    const endIdx = nextMarker ? response.indexOf(nextMarker) : response.length;

    let content = response.slice(contentStart, endIdx === -1 ? response.length : endIdx).trim();

    // Clean up: add a proper title
    const titles = {
      ARCHITECTURE: '# Architecture Overview',
      API_ROUTES: '# API Routes',
      DATABASE_SCHEMA: '# Database Schema',
      GETTING_STARTED: '# Getting Started',
    };
    content = `${titles[name]}\n\n${content}`;
    sections[name] = content;
  }

  return sections;
}

async function analyzeWithClaude(prompt, apiKey, model) {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: model || 'claude-sonnet-4-20250514',
    max_tokens: 16000,
    messages: [{ role: 'user', content: prompt }],
  });
  return response.content[0].text;
}

async function analyzeWithOpenAI(prompt, apiKey, model) {
  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({
    model: model || 'gpt-4.1',
    max_tokens: 16000,
    messages: [{ role: 'user', content: prompt }],
  });
  return response.choices[0].message.content;
}

async function analyzeWithGemini(prompt, apiKey, model) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const geminiModel = genAI.getGenerativeModel({ model: model || 'gemini-2.5-flash' });
  const result = await geminiModel.generateContent(prompt);
  return result.response.text();
}

export async function analyze(codebaseMap, options) {
  const { provider, key, model } = options;
  const prompt = buildPrompt(codebaseMap);

  let rawResponse;

  switch (provider) {
    case 'claude':
      rawResponse = await analyzeWithClaude(prompt, key, model);
      break;
    case 'openai':
      rawResponse = await analyzeWithOpenAI(prompt, key, model);
      break;
    case 'gemini':
      rawResponse = await analyzeWithGemini(prompt, key, model);
      break;
    default:
      throw new Error(`Unknown provider: ${provider}. Use claude, openai, or gemini.`);
  }

  const sections = parseSections(rawResponse);

  // If parsing failed (AI didn't use section markers), save as single file
  if (Object.keys(sections).length === 0) {
    sections.ARCHITECTURE = `# Project Documentation\n\n${rawResponse}`;
  }

  return sections;
}
