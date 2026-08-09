import 'dotenv/config';
import {
  query,
  isSDKAssistantMessage,
  isSDKResultMessage,
  isSDKUserMessage,
} from '@opengame/sdk';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { allTestCases } from '../test-cases/game-test.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

interface TestResult {
  version: string;
  testCase: string;
  success: boolean;
  duration: number;
  generatedFiles: string[];
  assistantMessages: string[];
  error?: string;
  timestamp: string;
}

function getVersion(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  return `v-${timestamp}`;
}

function getTestCase(): { id: string; name: string; prompt: string } {
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const testCaseName = args[0] || 'default';

  const testCase = allTestCases[testCaseName as keyof typeof allTestCases];
  if (!testCase) {
    console.error(`Unknown test case: ${testCaseName}`);
    process.exit(1);
  }

  return testCase;
}

async function prepareTestEnvironment(outputDir: string): Promise<void> {
  await fs.mkdir(outputDir, { recursive: true });

  const customPromptPath = path.join(PROJECT_ROOT, 'prompts', 'custom.md');
  const outputQwenDir = path.join(outputDir, '.qwen');
  const outputSystemMd = path.join(outputQwenDir, 'system.md');

  await fs.mkdir(outputQwenDir, { recursive: true });

  // Calculate absolute paths for templates and docs
  const templatesDir = path.join(PROJECT_ROOT, 'templates');
  const docsDir = path.join(PROJECT_ROOT, 'docs');

  // Read prompt, replace placeholders with absolute paths, then write
  let promptContent = await fs.readFile(customPromptPath, 'utf-8');
  promptContent = promptContent
    .replace(/\{TEMPLATES_DIR\}/g, templatesDir)
    .replace(/\{DOCS_DIR\}/g, docsDir);
  await fs.writeFile(outputSystemMd, promptContent, 'utf-8');

  console.log(`✅ Test will run in ${outputDir}`);
  console.log(`✅ System prompt can be checked in: ${outputSystemMd}`);
  console.log(`📁 TEMPLATES_DIR: ${templatesDir}`);
  console.log(`📁 DOCS_DIR: ${docsDir}`);
}

async function test(): Promise<TestResult> {
  const version = getVersion();
  const testCase = getTestCase();
  const startTime = Date.now();

  const outputDir = path.join(PROJECT_ROOT, 'output', version);
  await prepareTestEnvironment(outputDir);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 Start Testing');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📦 Version: ${version}`);
  console.log(`📝 Test Case: ${testCase.name} (${testCase.id})`);
  console.log(`📂 Output Directory: outputs/${version}/`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const messages: string[] = [];
  const generatedFiles: string[] = [];
  let success = false;
  let error: string | undefined;

  try {
    console.log('🔍 Running Query...\n');

    const result = query({
      prompt: testCase.prompt,
      options: {
        cwd: outputDir,
        model: 'anthropic/claude-opus-4.6',
        authType: 'openai',
        env: {
          ...process.env,
          OPENAI_BASE_URL: 'https://openrouter.ai/api/v1',
          OPENAI_API_KEY: process.env.OPENROUTER_API_KEY || '',
          QWEN_SYSTEM_MD: '1',
          HOME: process.env.HOME || process.env.USERPROFILE || '',
          USERPROFILE: process.env.USERPROFILE || process.env.HOME || '',
          REASONING_MODEL_API_KEY: process.env.REASONING_MODEL_API_KEY || '',
          IMAGE_MODEL_API_KEY: process.env.IMAGE_MODEL_API_KEY || '',
          GAME_TEMPLATES_DIR: path.join(PROJECT_ROOT, 'templates'),
          GAME_DOCS_DIR: path.join(PROJECT_ROOT, 'docs'),
          // Prepend custom bin dir to PATH if tools like ffmpeg are installed elsewhere.
          // Adjust this path to match your environment (e.g., conda, homebrew, etc.).
          PATH: `${process.env.CUSTOM_BIN_DIR || ''}${process.env.CUSTOM_BIN_DIR ? ':' : ''}${process.env.PATH || '/usr/bin:/bin'}`,
          MODEL_REQUEST_TIMEOUT: '1200000',
        },
        permissionMode: 'yolo',
      },
    });

    for await (const message of result) {
      if (isSDKUserMessage(message)) {
        const content = message.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'tool_result') {
              const toolResult = block as any;
              const resultContent =
                typeof toolResult.content === 'string'
                  ? toolResult.content
                  : JSON.stringify(toolResult.content);

              if (
                toolResult.is_error ||
                resultContent.includes('Error') ||
                resultContent.includes('failed') ||
                resultContent.includes('terminated')
              ) {
                console.error(`\n🔴 Tool Result Error:`);
                console.error(`   Tool ID: ${toolResult.tool_use_id}`);
                console.error(`   Content: ${resultContent.slice(0, 800)}`);
              }
            }
          }
        }
      }

      if (isSDKAssistantMessage(message)) {
        const text = message.message.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('');

        if (text.trim()) {
          messages.push(text);
          console.log(
            '🤖 Assistant:',
            text.slice(0, 300) + (text.length > 300 ? '...' : ''),
          );

          if (text.includes('API Error') || text.includes('[API Error')) {
            console.error(`\n⚠️ API Error in assistant response:`);
            const errorMatch = text.match(
              /\[API Error[^\]]*\]|API Error[^.\n]*/g,
            );
            if (errorMatch) {
              errorMatch.forEach((err) => console.error(`   ${err}`));
            }
          }
        }

        const toolCalls = message.message.content.filter(
          (b) => b.type === 'tool_use',
        );
        if (toolCalls.length > 0) {
          const timestamp = new Date().toLocaleTimeString('en-US', {
            hour12: false,
          });
          console.log(`🔧 [${timestamp}] Invoked ${toolCalls.length} tools:`);
          toolCalls.forEach((tool, index) => {
            console.log(`   [${index + 1}] Tool: ${tool.name}\n`);
            console.log(`       Input Params:`);
            try {
              const inputStr = JSON.stringify(tool.input, null, 2);
              const indentedInput = inputStr
                .split('\n')
                .map((line) => `       ${line}`)
                .join('\n');
              console.log(indentedInput);
            } catch (e) {
              console.log(`       Raw Input: ${tool.input}`);
            }
            console.log('');
          });
        }
      } else if (isSDKResultMessage(message)) {
        success = message.subtype === 'success';
        console.log(`\n📋 Test Result: ${message.subtype}`);

        if (!success) {
          const errObj = (message as any).error;
          const fullMsg = message as any;
          error = errObj?.message || 'Query failed';

          console.error(`\n🔴 API Error Details:`);
          console.error(`   Message: ${error}`);
          if (errObj?.type) console.error(`   Type: ${errObj.type}`);
          if (errObj?.status || errObj?.status_code)
            console.error(`   Status: ${errObj.status || errObj.status_code}`);
          if (errObj?.request_id || errObj?.requestId)
            console.error(
              `   Request ID: ${errObj.request_id || errObj.requestId}`,
            );
          if (fullMsg.model) console.error(`   Model: ${fullMsg.model}`);

          if (errObj) {
            console.error(`   Full Error:`);
            try {
              const errStr = JSON.stringify(errObj, null, 2);
              errStr
                .split('\n')
                .forEach((line) => console.error(`     ${line}`));
            } catch {
              console.error(`     ${errObj}`);
            }
          }
        }
      }
    }

    const files = await fs.readdir(outputDir);
    generatedFiles.push(...files.filter((f) => !f.startsWith('.')));
  } catch (e: any) {
    error = e.message;
    console.error('❌ Test Failed:', error);

    console.error(`\n🔴 Exception Details:`);
    if (e.type) console.error(`   Type: ${e.type}`);
    if (e.status || e.status_code || e.statusCode) {
      console.error(`   Status: ${e.status || e.status_code || e.statusCode}`);
    }
    if (e.request_id || e.requestId || e.headers?.['x-request-id']) {
      console.error(
        `   Request ID: ${e.request_id || e.requestId || e.headers?.['x-request-id']}`,
      );
    }
    if (e.model) console.error(`   Model: ${e.model}`);
    if (e.code) console.error(`   Code: ${e.code}`);

    success = false;
  }
  const endTime = Date.now();
  const duration = endTime - startTime;

  const result: TestResult = {
    version,
    testCase: testCase.id,
    success,
    duration,
    generatedFiles,
    assistantMessages: messages,
    error,
    timestamp: new Date().toISOString(),
  };
  await fs.writeFile(
    path.join(outputDir, 'result.json'),
    JSON.stringify(result, null, 2),
    'utf-8',
  );

  await fs.writeFile(
    path.join(outputDir, 'conversation.txt'),
    messages.join('\n\n---\n\n'),
    'utf-8',
  );

  return result;
}

function printResult(result: TestResult) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Test Results');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Status: ${result.success ? '✅ Success' : '❌ Failed'}`);
  console.log(`Duration: ${(result.duration / 1000).toFixed(2)}s`);
  console.log(`Files: ${result.generatedFiles.length}`);

  if (result.error) {
    console.log(`Error: ${result.error}`);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('📁 Generated Files:');
  if (result.generatedFiles.length > 0) {
    result.generatedFiles.forEach((file) => {
      console.log(`   ✓ ${file}`);
    });
  } else {
    console.log('   (No files generated)');
  }

  console.log('\n💡 View Results:');
  console.log(`   cd output/${result.version}/`);

  if (result.generatedFiles.some((f) => f.endsWith('.html'))) {
    const htmlFile = result.generatedFiles.find((f) => f.endsWith('.html'));
    console.log(`\n🌐 Open in Browser:`);
    console.log(`   start output/${result.version}/${htmlFile}  # Windows`);
    console.log(`   open output/${result.version}/${htmlFile}   # macOS`);
  }

  console.log('\n📄 View Details:');
  console.log(`   cat output/${result.version}/result.json`);
  console.log(`   cat output/${result.version}/conversation.txt`);
  console.log('');
}

async function main() {
  try {
    const result = await test();
    printResult(result);
    process.exit(result.success ? 0 : 1);
  } catch (e: any) {
    console.error('❌ Fatal error:', e);
    process.exit(1);
  }
}

main();
