/**
 * Curated skill dictionary used by the CV extractor.
 *
 * How to add a skill: append `skill('Canonical Name', ['alias', ...])` to the
 * right group below. Matching rules:
 *
 * - The canonical name and `aliases` are matched case-insensitively anywhere
 *   in the CV, on word boundaries ("Java" never matches inside "JavaScript").
 * - Terms that are ordinary English words or tiny tokens ("Go", "R", "Express",
 *   "js") must NOT be safe terms. List them under `strict: 'cs'` (matched
 *   case-sensitively anywhere, e.g. "Swift") or `strict: 'weak'` /
 *   `weak: [...]` (matched only as an exact token inside the CV's Skills
 *   section, e.g. "Skills: Go, R, js").
 * - Spaces in a term match any run of spaces, newlines or hyphens.
 */

export interface SkillEntry {
  /** Canonical, display-ready label (what ends up in `CvProfile.skills`). */
  name: string;
  /** Safe aliases: case-insensitive, matched anywhere on word boundaries. */
  aliases: string[];
  /** Case-sensitive terms, matched anywhere on word boundaries. */
  cs: string[];
  /** Ambiguous terms: only matched as an exact token in the Skills section. */
  weak: string[];
}

interface SkillOptions {
  /** Where the canonical name itself is allowed to match. Default: safe. */
  strict?: 'cs' | 'weak';
  cs?: string[];
  weak?: string[];
}

const skill = (name: string, aliases: string[] = [], options: SkillOptions = {}): SkillEntry => {
  const entry: SkillEntry = {
    name,
    aliases: [...aliases],
    cs: [...(options.cs ?? [])],
    weak: [...(options.weak ?? [])],
  };
  if (options.strict === 'cs') entry.cs.push(name);
  else if (options.strict === 'weak') entry.weak.push(name);
  else entry.aliases.push(name);
  return entry;
};

const LANGUAGES: SkillEntry[] = [
  skill('JavaScript', ['ecmascript', 'es6', 'es2015'], { weak: ['js'] }),
  skill('TypeScript', [], { weak: ['ts'] }),
  skill('Python', ['python3']),
  skill('Java'),
  skill('C#', ['csharp', 'c sharp']),
  skill('C++', ['cpp']),
  skill('C', [], { strict: 'weak' }),
  skill('Go', ['golang'], { strict: 'weak' }),
  skill('Rust'),
  skill('Swift', [], { strict: 'cs' }),
  skill('Kotlin'),
  skill('PHP'),
  skill('Ruby'),
  skill('Scala'),
  skill('Perl'),
  skill('R', [], { strict: 'weak' }),
  skill('MATLAB'),
  skill('Dart', [], { strict: 'cs' }),
  skill('SQL'),
  skill('Bash', ['shell scripting', 'shell script']),
  skill('PowerShell'),
  skill('HTML', ['html5']),
  skill('CSS', ['css3']),
  skill('Sass', ['scss']),
];

const FRONTEND: SkillEntry[] = [
  skill('React', ['reactjs', 'react.js', 'react js'], { strict: 'cs' }),
  skill('React Native', ['react-native']),
  skill('Redux', ['redux toolkit']),
  skill('Next.js', ['nextjs', 'next js']),
  skill('Vue.js', ['vue', 'vuejs', 'vue js']),
  skill('Nuxt', ['nuxtjs']),
  skill('Angular', ['angularjs']),
  skill('Svelte'),
  skill('jQuery'),
  skill('Tailwind CSS', ['tailwind', 'tailwindcss']),
  skill('Bootstrap'),
  skill('Material UI', ['mui', 'material-ui']),
  skill('Webpack'),
  skill('Vite'),
  skill('Storybook'),
  skill('Responsive Design'),
  skill('Accessibility', ['wcag']),
  skill('SEO'),
];

const BACKEND: SkillEntry[] = [
  skill('Node.js', ['nodejs', 'node js'], { weak: ['node'] }),
  skill('Express', ['expressjs', 'express.js'], { strict: 'weak' }),
  skill('NestJS', ['nest.js']),
  skill('Django'),
  skill('Flask'),
  skill('FastAPI'),
  skill('Spring Boot', ['springboot']),
  skill('.NET', ['dotnet', '.net core', 'asp.net']),
  skill('Laravel'),
  skill('Ruby on Rails', [], { weak: ['rails'] }),
  skill('GraphQL'),
  skill('REST APIs', ['rest api', 'restful api', 'restful apis', 'restful services']),
  skill('gRPC'),
  skill('WebSockets', ['websocket']),
  skill('Socket.IO'),
  skill('Microservices', ['microservice']),
  skill('Serverless', ['serverless framework']),
];

const DATABASES: SkillEntry[] = [
  skill('PostgreSQL', ['postgres']),
  skill('MySQL'),
  skill('MongoDB', ['mongo']),
  skill('Redis'),
  skill('DynamoDB', ['dynamo db']),
  skill('SQLite'),
  skill('Elasticsearch', ['elastic search']),
  skill('Cassandra'),
  skill('MariaDB'),
  skill('Oracle', [], { strict: 'weak' }),
  skill('SQL Server', ['mssql', 'microsoft sql server']),
  skill('Firebase'),
  skill('Firestore'),
  skill('Prisma'),
  skill('Neo4j'),
];

const CLOUD_DEVOPS: SkillEntry[] = [
  skill('AWS', ['amazon web services']),
  skill('AWS Amplify'),
  skill('EC2'),
  skill('S3', [], { strict: 'cs' }),
  skill('Lambda', ['aws lambda'], { strict: 'weak' }),
  skill('API Gateway'),
  skill('CloudFormation'),
  skill('CloudWatch'),
  skill('Cognito', ['amazon cognito']),
  skill('SQS', [], { strict: 'cs' }),
  skill('SNS', [], { strict: 'cs' }),
  skill('ECS', [], { strict: 'cs' }),
  skill('EKS', [], { strict: 'cs' }),
  skill('RDS', [], { strict: 'cs' }),
  skill('IAM', [], { strict: 'cs' }),
  skill('Azure', ['microsoft azure']),
  skill('Google Cloud', ['gcp', 'google cloud platform']),
  skill('Docker'),
  skill('Kubernetes', ['k8s']),
  skill('Terraform'),
  skill('Ansible'),
  skill('Jenkins'),
  skill('GitHub Actions'),
  skill('GitLab CI', ['gitlab ci/cd', 'gitlab-ci']),
  skill('CircleCI'),
  skill('CI/CD', ['ci cd', 'cicd', 'continuous integration', 'continuous delivery', 'continuous deployment']),
  skill('Linux'),
  skill('Nginx'),
  skill('Git'),
  skill('GitHub'),
  skill('GitLab'),
  skill('Bitbucket'),
  skill('Prometheus'),
  skill('Grafana'),
  skill('Datadog'),
  skill('Sentry', [], { strict: 'cs' }),
  skill('ELK Stack', ['elk stack']),
];

const DATA_AI: SkillEntry[] = [
  skill('Machine Learning'),
  skill('Deep Learning'),
  skill('NLP', ['natural language processing']),
  skill('Computer Vision'),
  skill('Data Analysis', ['data analytics']),
  skill('Data Science'),
  skill('Data Visualization'),
  skill('Pandas', [], { strict: 'cs' }),
  skill('NumPy'),
  skill('scikit-learn', ['sklearn', 'scikit learn']),
  skill('TensorFlow'),
  skill('PyTorch'),
  skill('Keras'),
  skill('Spark', ['apache spark'], { strict: 'weak' }),
  skill('Hadoop'),
  skill('Kafka', ['apache kafka']),
  skill('Airflow', ['apache airflow']),
  skill('Tableau'),
  skill('Power BI', ['powerbi']),
  skill('Excel', ['microsoft excel'], { strict: 'cs' }),
  skill('ETL'),
  skill('Big Data'),
  skill('LLM', ['llms', 'large language models']),
  skill('Generative AI', ['genai', 'gen ai']),
  skill('Prompt Engineering'),
  skill('OpenAI'),
  skill('LangChain'),
  skill('RAG', ['retrieval augmented generation', 'retrieval-augmented generation'], { strict: 'cs' }),
];

const MOBILE: SkillEntry[] = [
  skill('Android'),
  skill('iOS'),
  skill('Flutter'),
  skill('SwiftUI'),
  skill('Jetpack Compose'),
];

const TESTING: SkillEntry[] = [
  skill('Jest'),
  skill('Vitest'),
  skill('Cypress'),
  skill('Playwright'),
  skill('Selenium'),
  skill('Mocha'),
  skill('JUnit'),
  skill('Pytest'),
  skill('Postman'),
  skill('React Testing Library'),
  skill('Unit Testing', ['unit tests']),
  skill('Integration Testing'),
  skill('End-to-End Testing', ['e2e testing', 'e2e tests']),
  skill('TDD', ['test driven development', 'test-driven development']),
];

const SECURITY: SkillEntry[] = [
  skill('OAuth', ['oauth2', 'oauth 2.0']),
  skill('JWT', ['json web token', 'json web tokens']),
  skill('OWASP'),
  skill('Penetration Testing', ['pentesting', 'pen testing']),
  skill('Cybersecurity', ['cyber security']),
  skill('SSO', ['single sign-on', 'single sign on'], { strict: 'cs' }),
  skill('SAML'),
];

const PRACTICES_TOOLS: SkillEntry[] = [
  skill('Agile'),
  skill('Scrum'),
  skill('Kanban'),
  skill('Jira'),
  skill('Confluence'),
  skill('Figma'),
  skill('Adobe XD', ['adobexd']),
  skill('Photoshop', ['adobe photoshop']),
  skill('UI/UX', ['ui ux', 'ux design', 'ui design']),
  skill('System Design'),
  skill('Design Patterns'),
  skill('OOP', ['object oriented programming', 'object-oriented programming'], { strict: 'cs' }),
  skill('Data Structures', ['data structures and algorithms', 'dsa']),
  skill('Algorithms'),
  skill('Code Review', ['code reviews']),
  skill('WordPress'),
  skill('Shopify'),
  skill('Salesforce'),
  skill('SAP', [], { strict: 'cs' }),
];

const SOFT_SKILLS: SkillEntry[] = [
  skill('Leadership'),
  skill('Communication', ['communication skills'], { strict: 'weak' }),
  skill('Teamwork', ['team work', 'team player']),
  skill('Problem Solving', ['problem-solving']),
  skill('Project Management'),
  skill('Stakeholder Management'),
  skill('Mentoring', ['mentorship']),
  skill('Time Management'),
  skill('Critical Thinking'),
  skill('Public Speaking'),
  skill('Customer Service'),
  skill('Negotiation', [], { strict: 'weak' }),
  skill('Collaboration', [], { strict: 'weak' }),
  skill('Adaptability', [], { strict: 'weak' }),
  skill('Analytical Skills', ['analytical thinking']),
  skill('Presentation Skills'),
  skill('Technical Writing', ['technical documentation']),
];

export const SKILL_ENTRIES: SkillEntry[] = [
  ...LANGUAGES,
  ...FRONTEND,
  ...BACKEND,
  ...DATABASES,
  ...CLOUD_DEVOPS,
  ...DATA_AI,
  ...MOBILE,
  ...TESTING,
  ...SECURITY,
  ...PRACTICES_TOOLS,
  ...SOFT_SKILLS,
];

/* ------------------------------------------------------------------ */
/* Matching                                                            */
/* ------------------------------------------------------------------ */

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Spaces in a term match any run of whitespace/hyphens (handles line wraps). */
const termToPattern = (term: string): string => escapeRegex(term).replace(/ /g, '[\\s-]+');

const buildRegex = (terms: string[], flags: string): RegExp | null => {
  if (terms.length === 0) return null;
  // Longest first so "react native" wins over "react".
  const body = [...terms].sort((a, b) => b.length - a.length).map(termToPattern).join('|');
  return new RegExp(`(^|[^A-Za-z0-9])(?:${body})(?![A-Za-z0-9])`, flags);
};

interface CompiledSkill {
  name: string;
  safe: RegExp | null;
  caseSensitive: RegExp | null;
}

let compiled: CompiledSkill[] | null = null;
let tokenLookup: Map<string, string> | null = null;

const getCompiled = (): CompiledSkill[] => {
  if (!compiled) {
    compiled = SKILL_ENTRIES.map((entry) => ({
      name: entry.name,
      safe: buildRegex(entry.aliases, 'i'),
      caseSensitive: buildRegex(entry.cs, ''),
    }));
  }
  return compiled;
};

const getTokenLookup = (): Map<string, string> => {
  if (!tokenLookup) {
    tokenLookup = new Map();
    for (const entry of SKILL_ENTRIES) {
      for (const term of [entry.name, ...entry.aliases, ...entry.cs, ...entry.weak]) {
        const key = term.toLowerCase();
        if (!tokenLookup.has(key)) tokenLookup.set(key, entry.name);
      }
    }
  }
  return tokenLookup;
};

/**
 * Returns the canonical skill for an exact token (any term type, case
 * insensitive), e.g. "ReactJS" -> "React", "js" -> "JavaScript", "go" -> "Go".
 */
export function lookupSkillToken(token: string): string | undefined {
  return getTokenLookup().get(token.trim().toLowerCase());
}

/**
 * Finds dictionary skills anywhere in `text` using only safe terms
 * (case-insensitive aliases and case-sensitive terms). Results are ordered by
 * first appearance in the text.
 */
export function findSkillsInText(text: string): string[] {
  const hits: Array<{ name: string; index: number }> = [];

  for (const entry of getCompiled()) {
    let index = -1;
    for (const regex of [entry.safe, entry.caseSensitive]) {
      if (!regex) continue;
      const match = regex.exec(text);
      if (match) {
        const at = match.index + match[1].length;
        if (index === -1 || at < index) index = at;
      }
    }
    if (index !== -1) hits.push({ name: entry.name, index });
  }

  return hits.sort((a, b) => a.index - b.index).map((hit) => hit.name);
}
