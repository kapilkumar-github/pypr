import { createServer, type Server } from 'node:http';

export const MOCK_OPENROUTER_PORT = 4199;
export const MOCK_OPENROUTER_KEY = 'e2e-fake-openrouter-key';

const parsed = {
  basics: {
    full_name: 'Jordan Example',
    headline: 'Product Engineer',
    email: 'jordan@example.com',
    phone: null,
    location: 'Berlin',
    summary: 'Engineer who likes simple systems.',
  },
  links: [{ label: 'Portfolio', url: 'jordan.design' }],
  section_titles: {
    experience: 'Experience',
    education: null,
    skills: null,
    projects: null,
    certifications: null,
    awards: null,
    languages: null,
  },
  experience: [
    {
      position: 'Senior Engineer',
      company: 'Example GmbH',
      location: 'Berlin',
      start_date: '2021-03',
      end_date: null,
      current: true,
      summary: null,
      highlights: ['Built the billing platform', 'Led a team of four'],
    },
  ],
  education: [
    {
      institution: 'Example University',
      degree: 'BSc',
      field: 'Computer Science',
      location: null,
      start_date: '2014',
      end_date: '2018',
      grade: null,
      summary: null,
    },
  ],
  skills: [{ name: null, keywords: ['TypeScript', 'PostgreSQL', 'Kubernetes'] }],
  projects: [],
  certifications: [],
  awards: [],
  languages: [],
  custom_sections: [],
  section_order: ['experience', 'education', 'skills'],
};

/** Stands in for OpenRouter's chat completions endpoint in end-to-end tests. */
export function startMockOpenRouter(): Promise<Server> {
  const server = createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/api/v1/chat/completions') {
      res.writeHead(404).end();
      return;
    }
    if (req.headers.authorization !== `Bearer ${MOCK_OPENROUTER_KEY}`) {
      res.writeHead(401, { 'content-type': 'application/json' }).end('{"error":{"code":401}}');
      return;
    }
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(parsed) } }],
          usage: { prompt_tokens: 1000, completion_tokens: 400 },
        }),
      );
    });
  });
  return new Promise((resolve) =>
    server.listen(MOCK_OPENROUTER_PORT, '127.0.0.1', () => {
      resolve(server);
    }),
  );
}
