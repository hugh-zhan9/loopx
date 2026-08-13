import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, it } from 'node:test';

import { inspectRuntimeDependencies } from '../src/runtime-maintenance.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, '..');
const validator = join(repoRoot, 'skills', 'generate-api-docs', 'scripts', 'validate_api_docs.rb');

async function validate(yaml, markdown) {
  const root = await mkdtemp(join(tmpdir(), 'loopx-api-docs-'));
  const yamlPath = join(root, 'api.openapi.yaml');
  const markdownPath = join(root, 'api.md');
  await writeFile(yamlPath, yaml);
  await writeFile(markdownPath, markdown);
  return execFileAsync('ruby', [validator, yamlPath, markdownPath]);
}

const validMarkdown = `# Widget API

### GET /widgets/{id}

- Operation ID: \`getWidget\`

#### Request fields

| Field | Location | Type | Required / Nullable | Description |
|---|---|---|---|---|
| \`id\` | path | string | required / non-null | Widget identifier. |

#### Response fields: 200

| Field | Type | Required / Nullable | Description |
|---|---|---|---|
| \`id\` | string | required / non-null | Widget identifier. |

#### Response content: 200

\`\`\`json
{"id":"wdg_1"}
\`\`\`
`;

const validYaml = `openapi: 3.0.3
info:
  title: Widget API
  version: 1.0.0
paths:
  /widgets/{id}:
    get:
      operationId: getWidget
      parameters:
        - name: id
          in: path
          required: true
          description: Widget identifier.
          schema: { type: string }
      responses:
        "200":
          description: Success.
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Widget"
components:
  schemas:
    Widget:
      type: object
      required: [id]
      properties:
        id:
          $ref: "#/components/schemas/WidgetId"
    WidgetId:
      type: string
      description: Widget identifier.
`;

describe('generate-api-docs validator', () => {
  it('accepts synchronized field-level Markdown and reusable property schemas', async () => {
    const { stdout } = await validate(validYaml, validMarkdown);
    assert.match(stdout, /1 operations, 1 unique operationIds/);
  });

  it('rejects unknown response statuses and empty field/content sections', async () => {
    const markdown = validMarkdown
      .replaceAll('Response fields: 200', 'Response fields: 999')
      .replaceAll('Response content: 200', 'Response content: 999')
      .replace(/\| Field \| Type[\s\S]*?Widget identifier\. \|\n\n#### Response content/, '\n#### Response content')
      .replace(/```json\n[\s\S]*?\n```/, '```json\n```');

    await assert.rejects(
      validate(validYaml, markdown),
      (error) => {
        assert.match(error.stderr, /unknown statuses: 999/);
        assert.match(error.stderr, /lacks response fields for statuses: 200/);
        assert.match(error.stderr, /needs a field table/);
        assert.match(error.stderr, /needs a non-empty fenced example/);
        return true;
      },
    );
  });

  it('rejects invented Markdown fields and response content', async () => {
    const markdown = validMarkdown
      .replace('| `id` | string | required / non-null | Widget identifier. |', '| `totallyWrong` | boolean | optional / nullable | Invented. |')
      .replace('{"id":"wdg_1"}', '{"garbage":true}');

    await assert.rejects(
      validate(validYaml, markdown),
      (error) => {
        assert.match(error.stderr, /misses fields: id/);
        assert.match(error.stderr, /has unknown fields: totallyWrong/);
        assert.match(error.stderr, /Response content: 200 has unknown fields: garbage/);
        assert.match(error.stderr, /Response content: 200 misses required fields: id/);
        return true;
      },
    );
  });

  it('rejects a property reference whose effective schema has no description', async () => {
    const yaml = validYaml.replace(
      `    WidgetId:\n      type: string\n      description: Widget identifier.`,
      `    WidgetId:\n      type: string`,
    );
    await assert.rejects(
      validate(yaml, validMarkdown),
      (error) => {
        assert.match(error.stderr, /properties\/id needs a non-empty description/);
        return true;
      },
    );
  });

  it('uses [] for scalar arrays and does not require object container rows', async () => {
    const yaml = validYaml
      .replace('      required: [id]', '      required: [id, labels, owner]')
      .replace(
        `        id:\n          $ref: "#/components/schemas/WidgetId"`,
        `        id:\n          $ref: "#/components/schemas/WidgetId"\n        labels:\n          type: array\n          description: Widget labels.\n          items: { type: string }\n        owner:\n          type: object\n          description: Widget owner.\n          required: [name]\n          properties:\n            name:\n              type: string\n              description: Owner name.`,
      );
    const markdown = validMarkdown.replace(
      '| `id` | string | required / non-null | Widget identifier. |',
      '| `id` | string | required / non-null | Widget identifier. |\n| `labels[]` | array<string> | required / non-null | Widget labels. |\n| `owner.name` | string | required / non-null | Owner name. |',
    ).replace('{"id":"wdg_1"}', '{"id":"wdg_1","labels":["new"],"owner":{"name":"Alex"}}');

    const { stdout } = await validate(yaml, markdown);
    assert.match(stdout, /1 operations/);
  });

  it('distinguishes same-named request fields by location', async () => {
    const yaml = validYaml.replace(
      `      operationId: getWidget\n      parameters:`,
      `      operationId: getWidget\n      requestBody:\n        required: true\n        content:\n          application/json:\n            schema:\n              type: object\n              required: [id]\n              properties:\n                id:\n                  type: integer\n                  description: Numeric body identifier.\n      parameters:`,
    );
    const markdown = validMarkdown.replace(
      '| `id` | path | string | required / non-null | Widget identifier. |',
      '| `id` | path | string | required / non-null | Widget identifier. |\n| `id` | body | integer | required / non-null | Numeric body identifier. |',
    );

    const { stdout } = await validate(yaml, markdown);
    assert.match(stdout, /1 operations/);

    await assert.rejects(
      validate(yaml, markdown.replace('| `id` | body | integer |', '| `id` | header | integer |')),
      (error) => {
        assert.match(error.stderr, /misses fields: body:id/);
        assert.match(error.stderr, /has unknown fields: header:id/);
        return true;
      },
    );
  });

  it('discovers operations through a local Path Item reference', async () => {
    const yaml = `openapi: 3.1.0
info:
  title: Widget API
  version: 1.0.0
paths:
  /widgets/{id}:
    $ref: "#/components/pathItems/WidgetById"
components:
  pathItems:
    WidgetById:
      get:
        operationId: getWidget
        parameters:
          - name: id
            in: path
            required: true
            description: Widget identifier.
            schema: { type: string }
        responses:
          "200":
            description: Success.
            content:
              application/json:
                schema:
                  $ref: "#/components/schemas/Widget"
  schemas:
    Widget:
      type: object
      required: [id]
      properties:
        id:
          $ref: "#/components/schemas/WidgetId"
    WidgetId:
      type: string
      description: Widget identifier.
`;

    const { stdout } = await validate(yaml, validMarkdown);
    assert.match(stdout, /1 operations/);
  });
});

describe('generate-api-docs runtime dependency', () => {
  it('reports Ruby availability and fails closed when PATH cannot resolve Ruby', () => {
    assert.equal(inspectRuntimeDependencies().ruby.available, true);
    assert.deepEqual(inspectRuntimeDependencies({ ...process.env, PATH: '' }).ruby, {
      available: false,
      version: null,
      requiredBy: ['generate-api-docs'],
    });
  });
});
