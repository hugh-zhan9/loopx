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

### Get a widget

- 接口 URL：\`GET /widgets/{id}\`

- Operation ID: \`getWidget\`

#### Request fields

| Field | Location | Type | Required / Nullable | Description |
|---|---|---|---|---|
| \`id\` | path | string | required / non-null | Widget identifier. |

#### Request content

\`\`\`http
GET /widgets/wdg_1 HTTP/1.1
\`\`\`

#### Response fields

| Field | Type | Required / Nullable | Description |
|---|---|---|---|
| \`id\` | string | required / non-null | Widget identifier. |

#### Response content

\`\`\`json
{"id":"wdg_1"}
\`\`\`
`;

const validYaml = `openapi: 3.1.0
info:
  title: Widget API
  version: 1.0.0
paths:
  /widgets/{id}:
    get:
      summary: Get a widget
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


  it('requires matching summaries and complete concrete request examples', async () => {
    for (const [markdown, message] of [
      [validMarkdown.replace('### Get a widget', '### Another operation'), /summary mismatch/],
      [validMarkdown.replace(/#### Request content[\s\S]*?#### Response fields/, '#### Response fields'), /needs a Request content/],
      [validMarkdown.replace('GET /widgets/wdg_1 HTTP/1.1', 'GET /other/wdg_1 HTTP/1.1'), /request example.*method and path/],
      [validMarkdown.replace('GET /widgets/wdg_1 HTTP/1.1', 'GET /widgets/{id} HTTP/1.1'), /request example.*concrete/],
    ]) {
      await assert.rejects(validate(validYaml, markdown), (error) => {
        assert.match(error.stderr, message);
        return true;
      });
    }
  });


  it('includes effective server base paths and respects operation/path overrides', async () => {
    const withServer = validYaml.replace('paths:', 'servers:\n  - url: https://api.example.test/v1\npaths:');
    const request = (prefix) => validMarkdown.replace('GET /widgets/wdg_1 HTTP/1.1', `GET ${prefix}/widgets/wdg_1 HTTP/1.1`);
    await validate(withServer, request('/v1'));
    await assert.rejects(validate(withServer, validMarkdown), (error) => {
      assert.match(error.stderr, /request example.*method and path/);
      return true;
    });
    const pathOverride = withServer.replace('  /widgets/{id}:', '  /widgets/{id}:\n    servers:\n      - url: /v2');
    await validate(pathOverride, request('/v2'));
    const operationOverride = pathOverride.replace('    get:', '    get:\n      servers:\n        - url: /v3\n        - url: https://backup.example.test/backup');
    await validate(operationOverride, request('/v3'));
    await validate(operationOverride, request('/backup'));
    await assert.rejects(validate(operationOverride, request('/v1')));
    await validate(operationOverride.replace('      servers:\n        - url: /v3\n        - url: https://backup.example.test/backup', '      servers: []'), validMarkdown);
    const variables = validYaml.replace('paths:', `servers:
  - url: https://{host}:{port}/{version}
    variables:
      host: { default: api.example.test }
      port: { default: '443' }
      version: { default: v1, enum: [v1, v2] }
paths:`);
    await validate(variables, request('/v1'));
    await validate(variables, request('/v2'));
    await validate(variables.replace('default: v1, enum: [v1, v2]', 'default: v1/public'), request('/v1/public'));
    await assert.rejects(validate(variables, request('/v9')));
  });

  it('checks required headers and query parameters in the request example', async () => {
    const yaml = validYaml.replace('      parameters:', `      parameters:
        - name: limit
          in: query
          required: true
          description: Page size.
          schema: { type: integer }
        - name: X-Client
          in: header
          required: true
          description: Client identifier.
          schema: { type: string }`);
    const markdown = validMarkdown.replace('#### Request content', `| \`limit\` | query | integer | required / non-null | Page size. |
| \`X-Client\` | header | string | required / non-null | Client identifier. |

#### Request content`);
    await assert.rejects(validate(yaml, markdown), (error) => {
      assert.match(error.stderr, /request example misses required query:limit/);
      assert.match(error.stderr, /request example misses required header:X-Client/);
      return true;
    });
    await validate(yaml, markdown.replace('GET /widgets/wdg_1 HTTP/1.1', 'GET /widgets/wdg_1?limit=10 HTTP/1.1\nX-Client: demo'));
    const filterYaml = yaml.replace('name: limit', 'name: filter').replace('schema: { type: integer }', 'schema: { type: string }');
    const filterMarkdown = markdown.replace('| `limit` | query | integer |', '| `filter` | query | string |')
      .replace('GET /widgets/wdg_1 HTTP/1.1', 'GET /widgets/wdg_1?filter=%7B%22active%22%3Atrue%7D HTTP/1.1\nX-Client: demo');
    await validate(filterYaml, filterMarkdown);
  });

  it('accepts no-input and bodyless operations without inventing a body', async () => {
    const yaml = `openapi: 3.1.0
info: { title: Ping, version: 1.0.0 }
paths:
  /ping:
    get:
      summary: Ping
      operationId: ping
      responses:
        "204": { description: Healthy. }
`;
    const markdown = `### Ping
- 接口 URL：\`GET /ping\`
- Operation ID: \`ping\`
#### Request fields
None.
#### Request content
No request parameters or body.
#### Response fields
No response body.
#### Response content
No response body.
`;
    await validate(yaml, markdown);
    await validate(yaml.replace('"204"', '"2XX"'), markdown);
    // An endpoint whose actual contract only returns a redirect needs no invented 2xx.
    await validate(yaml.replace('"204"', '"302"'), markdown
      .replace('#### Response fields', '#### Response fields: 302')
      .replace('#### Response content', '#### Response content: 302'));
  });

  it('documents a shared default error once and validates its fields and content', async () => {
    const yaml = validYaml.replace('      responses:', `      responses:
        default:
          $ref: "#/components/responses/DefaultError"`).replace('components:\n', `components:
  responses:
    DefaultError:
      description: Common error.
      content:
        application/json:
          schema:
            type: object
            required: [code]
            properties:
              code:
                type: string
                description: Error code.
                enum: [FAILED]
`);
    const shared = `
## Common errors

### Default error: #/components/responses/DefaultError

#### Response fields
| Field | Type | Required / Nullable | Description |
|---|---|---|---|
| \`code\` | string enum | required / non-null | Error code. |

#### Response content
\`\`\`json
{"code":"FAILED"}
\`\`\`
`;
    const markdown = validMarkdown.replace('- Operation ID:', '- Default error: `#/components/responses/DefaultError`\n- Operation ID:');
    await validate(yaml, markdown + shared);
    await assert.rejects(validate(yaml, markdown), (error) => {
      assert.match(error.stderr, /missing shared default error/);
      return true;
    });
    await assert.rejects(validate(yaml, markdown + shared.replace('{"code":"FAILED"}', '{"code":"BOGUS"}')), (error) => {
      assert.match(error.stderr, /outside enum/);
      return true;
    });
    await assert.rejects(validate(yaml, validMarkdown + shared), (error) => {
      assert.match(error.stderr, /needs Default error reference/);
      return true;
    });
  });

  it('rejects old endpoint headings with a migration hint', async () => {
    const legacy = validMarkdown.replace('### Get a widget\n\n- 接口 URL：`GET /widgets/{id}`', '### GET /widgets/{id}');
    await assert.rejects(validate(validYaml, legacy), (error) => {
      assert.match(error.stderr, /legacy endpoint heading.*summary.*接口 URL/);
      return true;
    });
  });

  it('rejects OpenAPI 3.0 documents', async () => {
    await assert.rejects(
      validate(validYaml.replace('openapi: 3.1.0', 'openapi: 3.0.3'), validMarkdown),
      (error) => {
        assert.match(error.stderr, /openapi must be a 3\.1\.x version/);
        return true;
      },
    );
  });

  it('rejects unknown response statuses and empty field/content sections', async () => {
    const markdown = validMarkdown
      .replaceAll('Response fields', 'Response fields: 999')
      .replaceAll('Response content', 'Response content: 999')
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

  it('uses [] for scalar arrays and requires object container rows', async () => {
    const yaml = validYaml
      .replace('      required: [id]', '      required: [id, labels, owner]')
      .replace(
        `        id:\n          $ref: "#/components/schemas/WidgetId"`,
        `        id:\n          $ref: "#/components/schemas/WidgetId"\n        labels:\n          type: array\n          description: Widget labels.\n          items: { type: string }\n        owner:\n          type: object\n          description: Widget owner.\n          required: [name]\n          properties:\n            name:\n              type: string\n              description: Owner name.`,
      );
    const markdown = validMarkdown.replace(
      '| `id` | string | required / non-null | Widget identifier. |',
      '| `id` | string | required / non-null | Widget identifier. |\n| `labels[]` | array<string> | required / non-null | Widget labels. |\n| `owner` | object | required / non-null | Widget owner. |\n| `owner.name` | string | required / non-null | Owner name. |',
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

    const completeMarkdown = markdown.replace('#### Response fields', '```json\n{"id":1}\n```\n\n#### Response fields');
    const { stdout } = await validate(yaml, completeMarkdown);
    assert.match(stdout, /1 operations/);
    await assert.rejects(validate(yaml, completeMarkdown.replace('{"id":1}', '{"id":"wrong-type"}')), (error) => {
      assert.match(error.stderr, /request.id has String, expected integer/);
      return true;
    });

    await assert.rejects(
      validate(yaml, completeMarkdown.replace('| `id` | body | integer |', '| `id` | header | integer |')),
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
        summary: Get a widget
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
