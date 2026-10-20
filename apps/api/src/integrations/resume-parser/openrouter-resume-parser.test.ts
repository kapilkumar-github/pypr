import { describe, expect, it, vi } from 'vitest';
import { sampleParsedResume } from '../../../test/support/parsed-resume-factory.js';
import { OpenRouterResumeParser } from './openrouter-resume-parser.js';
import { parsedResumeJsonSchema } from './parsed-resume.js';
import { ResumeParserError } from './resume-parser.js';

const completion = (content: string, extra: object = {}) =>
  new Response(
    JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content } }], ...extra }),
    { status: 200 },
  );

function parserWith(respond: () => Promise<Response>) {
  const fetchMock = vi.fn(respond);
  const parser = new OpenRouterResumeParser({
    apiKey: 'sk-or-test',
    model: 'openai/gpt-4.1-mini',
    timeoutMs: 1_000,
    fetch: fetchMock,
  });
  return { parser, fetchMock };
}

const expectKind = async (promise: Promise<unknown>, kind: string) => {
  await expect(promise).rejects.toBeInstanceOf(ResumeParserError);
  await expect(promise).rejects.toMatchObject({ kind });
};

describe('OpenRouterResumeParser', () => {
  it('sends a strict structured-output request and returns the validated result', async () => {
    const { parser, fetchMock } = parserWith(() =>
      Promise.resolve(completion(JSON.stringify(sampleParsedResume()))),
    );
    const result = await parser.parse({ text: 'Jordan Example\nSenior Engineer' });
    expect(result).toEqual(sampleParsedResume());

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-or-test');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'openai/gpt-4.1-mini',
      temperature: 0,
      response_format: { type: 'json_schema', json_schema: { name: 'resume', strict: true } },
      provider: { require_parameters: true, data_collection: 'deny' },
    });
    const messages = body.messages as { role: string; content: string }[];
    expect(messages[1]?.content).toContain('<resume>\nJordan Example\nSenior Engineer\n</resume>');
    expect(messages[0]?.content).toMatch(/Never invent/);
  });

  it('builds a strict JSON schema: closed objects with every field required', () => {
    const schema = parsedResumeJsonSchema() as {
      additionalProperties: boolean;
      required: string[];
      properties: Record<string, unknown>;
    };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required.sort()).toEqual(Object.keys(schema.properties).sort());
    expect(schema).not.toHaveProperty('$schema');
  });

  it('rejects output that is not JSON, does not match the schema, or was cut off', async () => {
    await expectKind(
      parserWith(() => Promise.resolve(completion('not json'))).parser.parse({ text: 'x' }),
      'invalid_output',
    );
    await expectKind(
      parserWith(() => Promise.resolve(completion(JSON.stringify({ basics: {} })))).parser.parse({
        text: 'x',
      }),
      'invalid_output',
    );
    const cutOff = new Response(
      JSON.stringify({
        choices: [{ finish_reason: 'length', message: { content: '{"basics":' } }],
      }),
    );
    await expectKind(
      parserWith(() => Promise.resolve(cutOff)).parser.parse({ text: 'x' }),
      'invalid_output',
    );
    await expectKind(
      parserWith(() => Promise.resolve(new Response('{"unexpected":true}'))).parser.parse({
        text: 'x',
      }),
      'invalid_output',
    );
  });

  it.each([
    [429, 'rate_limited'],
    [401, 'not_configured'],
    [402, 'unavailable'],
    [408, 'timeout'],
    [500, 'unavailable'],
    [503, 'unavailable'],
  ])('maps HTTP %i to %s', async (status, kind) => {
    await expectKind(
      parserWith(() => Promise.resolve(new Response('{}', { status }))).parser.parse({ text: 'x' }),
      kind,
    );
  });

  it('maps errors OpenRouter reports inside a 200 body', async () => {
    const body = new Response(JSON.stringify({ error: { code: 429, message: 'slow down' } }));
    await expectKind(
      parserWith(() => Promise.resolve(body)).parser.parse({ text: 'x' }),
      'rate_limited',
    );
  });

  it('maps timeouts and network failures', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    await expectKind(
      parserWith(() => Promise.reject(timeout)).parser.parse({ text: 'x' }),
      'timeout',
    );
    await expectKind(
      parserWith(() => Promise.reject(new TypeError('fetch failed'))).parser.parse({ text: 'x' }),
      'unavailable',
    );
  });

  it('never puts the resume text or API key in error messages', async () => {
    const error: unknown = await parserWith(() =>
      Promise.resolve(new Response('{}', { status: 500 })),
    )
      .parser.parse({ text: 'SECRET RESUME TEXT' })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(ResumeParserError);
    const text = error instanceof Error ? `${error.name}: ${error.message}` : '';
    expect(text).not.toContain('SECRET RESUME TEXT');
    expect(text).not.toContain('sk-or-test');
  });
});
