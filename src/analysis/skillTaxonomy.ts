import type { ExtractedSkillItem, SkillCategory } from '../types/analysis.ts';

/**
 * Custom Skill Taxonomy mapping aliases, abbreviations, version suffixes,
 * and naming variations to canonical standardized skill names.
 */
const SKILL_ALIASES: Record<string, string> = {
  // Programming Languages
  js: 'JavaScript',
  javascript: 'JavaScript',
  'java script': 'JavaScript',
  ecmascript: 'JavaScript',
  es6: 'JavaScript',
  'es6+': 'JavaScript',
  es2015: 'JavaScript',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  py: 'Python',
  python: 'Python',
  python3: 'Python',
  'python 3': 'Python',
  python2: 'Python',
  java: 'Java',
  'java 8': 'Java',
  'java 11': 'Java',
  'java 17': 'Java',
  'java 21': 'Java',
  jdk: 'Java',
  'c++': 'C++',
  cpp: 'C++',
  'c/c++': 'C++',
  'c#': 'C#',
  csharp: 'C#',
  'c sharp': 'C#',
  golang: 'Go',
  'go lang': 'Go',
  go: 'Go',
  rust: 'Rust',
  'rust lang': 'Rust',
  ruby: 'Ruby',
  php: 'PHP',
  swift: 'Swift',
  kotlin: 'Kotlin',
  scala: 'Scala',
  r: 'R',
  'r language': 'R',
  'r programming': 'R',
  sql: 'SQL',
  'structured query language': 'SQL',
  bash: 'Bash',
  'shell scripting': 'Bash',
  shell: 'Bash',
  powershell: 'PowerShell',
  html: 'HTML',
  html5: 'HTML',
  css: 'CSS',
  css3: 'CSS',
  sass: 'Sass',
  scss: 'Sass',
  matlab: 'MATLAB',
  dart: 'Dart',

  // Frontend Frameworks & Libraries
  react: 'React',
  reactjs: 'React',
  'react.js': 'React',
  'react js': 'React',
  'react native': 'React Native',
  reactnative: 'React Native',
  nextjs: 'Next.js',
  'next.js': 'Next.js',
  'next js': 'Next.js',
  vue: 'Vue.js',
  vuejs: 'Vue.js',
  'vue.js': 'Vue.js',
  'vue 3': 'Vue.js',
  nuxt: 'Nuxt.js',
  nuxtjs: 'Nuxt.js',
  'nuxt.js': 'Nuxt.js',
  angular: 'Angular',
  angularjs: 'Angular',
  'angular.js': 'Angular',
  svelte: 'Svelte',
  sveltekit: 'SvelteKit',
  tailwind: 'Tailwind CSS',
  tailwindcss: 'Tailwind CSS',
  'tailwind css': 'Tailwind CSS',
  bootstrap: 'Bootstrap',
  redux: 'Redux',
  'redux toolkit': 'Redux',
  rtk: 'Redux',
  zustand: 'Zustand',
  jquery: 'jQuery',
  webpack: 'Webpack',
  vite: 'Vite',
  'vite.js': 'Vite',
  storybook: 'Storybook',
  mui: 'Material UI',
  'material-ui': 'Material UI',
  'material ui': 'Material UI',

  // Backend Frameworks & Runtimes
  node: 'Node.js',
  nodejs: 'Node.js',
  'node.js': 'Node.js',
  'node js': 'Node.js',
  express: 'Express.js',
  expressjs: 'Express.js',
  'express.js': 'Express.js',
  nestjs: 'NestJS',
  'nest.js': 'NestJS',
  fastapi: 'FastAPI',
  'fast api': 'FastAPI',
  django: 'Django',
  'django rest framework': 'Django REST Framework',
  drf: 'Django REST Framework',
  flask: 'Flask',
  spring: 'Spring Boot',
  'spring boot': 'Spring Boot',
  springboot: 'Spring Boot',
  'spring framework': 'Spring Boot',
  rails: 'Ruby on Rails',
  'ruby on rails': 'Ruby on Rails',
  ror: 'Ruby on Rails',
  dotnet: '.NET',
  '.net': '.NET',
  '.net core': '.NET',
  'asp.net': 'ASP.NET Core',
  'asp.net core': 'ASP.NET Core',
  laravel: 'Laravel',
  graphql: 'GraphQL',
  'apollo graphql': 'GraphQL',
  grpc: 'gRPC',
  rest: 'REST API',
  'rest api': 'REST API',
  'rest apis': 'REST API',
  'restful api': 'REST API',
  'restful apis': 'REST API',
  'restful web services': 'REST API',
  'rest api development': 'REST API',
  'restful services': 'REST API',
  websockets: 'WebSockets',
  websocket: 'WebSockets',
  'socket.io': 'WebSockets',
  microservices: 'Microservices',
  'microservice architecture': 'Microservices',
  'microservices architecture': 'Microservices',

  // Databases & ORMs
  postgres: 'PostgreSQL',
  postgresql: 'PostgreSQL',
  'postgresql database': 'PostgreSQL',
  'postgres db': 'PostgreSQL',
  psql: 'PostgreSQL',
  mysql: 'MySQL',
  'mysql database': 'MySQL',
  mariadb: 'MariaDB',
  sqlite: 'SQLite',
  sqlite3: 'SQLite',
  mongo: 'MongoDB',
  mongodb: 'MongoDB',
  'mongo db': 'MongoDB',
  redis: 'Redis',
  'redis cache': 'Redis',
  dynamodb: 'DynamoDB',
  'aws dynamodb': 'DynamoDB',
  elasticsearch: 'Elasticsearch',
  'elastic search': 'Elasticsearch',
  cassandra: 'Apache Cassandra',
  oracle: 'Oracle Database',
  'oracle db': 'Oracle Database',
  mssql: 'SQL Server',
  'sql server': 'SQL Server',
  'microsoft sql server': 'SQL Server',
  firestore: 'Cloud Firestore',
  firebase: 'Firebase',
  supabase: 'Supabase',
  prisma: 'Prisma',
  'prisma orm': 'Prisma',
  drizzle: 'Drizzle ORM',
  'drizzle orm': 'Drizzle ORM',
  sqlalchemy: 'SQLAlchemy',
  hibernate: 'Hibernate',
  typeorm: 'TypeORM',
  snowflake: 'Snowflake',
  bigquery: 'BigQuery',
  'google bigquery': 'BigQuery',
  redshift: 'Amazon Redshift',

  // Cloud & DevOps
  aws: 'AWS',
  'amazon web services': 'AWS',
  'amazon aws': 'AWS',
  gcp: 'Google Cloud Platform',
  'google cloud': 'Google Cloud Platform',
  'google cloud platform': 'Google Cloud Platform',
  azure: 'Microsoft Azure',
  'ms azure': 'Microsoft Azure',
  'microsoft azure': 'Microsoft Azure',
  docker: 'Docker',
  'docker compose': 'Docker',
  dockerize: 'Docker',
  containerization: 'Docker',
  k8s: 'Kubernetes',
  kubernetes: 'Kubernetes',
  helm: 'Helm',
  terraform: 'Terraform',
  iac: 'Infrastructure as Code',
  'infrastructure as code': 'Infrastructure as Code',
  ansible: 'Ansible',
  jenkins: 'Jenkins',
  'github actions': 'GitHub Actions',
  'gitlab ci': 'GitLab CI/CD',
  'gitlab ci/cd': 'GitLab CI/CD',
  'ci/cd': 'CI/CD',
  cicd: 'CI/CD',
  'ci/cd pipelines': 'CI/CD',
  'continuous integration': 'CI/CD',
  'continuous deployment': 'CI/CD',
  linux: 'Linux',
  unix: 'Linux',
  nginx: 'Nginx',
  prometheus: 'Prometheus',
  grafana: 'Grafana',
  datadog: 'Datadog',
  cloudfront: 'AWS CloudFront',
  s3: 'AWS S3',
  'aws s3': 'AWS S3',
  ec2: 'AWS EC2',
  'aws ec2': 'AWS EC2',
  lambda: 'AWS Lambda',
  'aws lambda': 'AWS Lambda',
  'cloud run': 'Google Cloud Run',
  vercel: 'Vercel',

  // Data, ML & AI
  ml: 'Machine Learning',
  'machine learning': 'Machine Learning',
  dl: 'Deep Learning',
  'deep learning': 'Deep Learning',
  nlp: 'Natural Language Processing',
  'natural language processing': 'Natural Language Processing',
  llm: 'Large Language Models',
  llms: 'Large Language Models',
  'large language models': 'Large Language Models',
  'generative ai': 'Generative AI',
  genai: 'Generative AI',
  rag: 'RAG',
  'retrieval augmented generation': 'RAG',
  pytorch: 'PyTorch',
  tensorflow: 'TensorFlow',
  tf: 'TensorFlow',
  keras: 'Keras',
  sklearn: 'Scikit-learn',
  'scikit-learn': 'Scikit-learn',
  'scikit learn': 'Scikit-learn',
  pandas: 'Pandas',
  numpy: 'NumPy',
  scipy: 'SciPy',
  spacy: 'spaCy',
  huggingface: 'Hugging Face',
  'hugging face': 'Hugging Face',
  langchain: 'LangChain',
  opencv: 'OpenCV',
  spark: 'Apache Spark',
  pyspark: 'Apache Spark',
  'apache spark': 'Apache Spark',
  airflow: 'Apache Airflow',
  'apache airflow': 'Apache Airflow',
  kafka: 'Apache Kafka',
  'apache kafka': 'Apache Kafka',
  tableau: 'Tableau',
  'power bi': 'Power BI',
  powerbi: 'Power BI',
  excel: 'Microsoft Excel',
  'ms excel': 'Microsoft Excel',

  // Dev Tools & Testing
  git: 'Git',
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
  jira: 'Jira',
  figma: 'Figma',
  postman: 'Postman',
  jest: 'Jest',
  vitest: 'Vitest',
  pytest: 'Pytest',
  cypress: 'Cypress',
  playwright: 'Playwright',
  selenium: 'Selenium',
  'unit testing': 'Unit Testing',
  tdd: 'Test-Driven Development',
  'test-driven development': 'Test-Driven Development',
  agile: 'Agile Methodology',
  'agile methodology': 'Agile Methodology',
  'agile/scrum': 'Agile Methodology',
  scrum: 'Scrum',
  oauth: 'OAuth 2.0',
  'oauth2': 'OAuth 2.0',
  'oauth 2.0': 'OAuth 2.0',
  jwt: 'JWT',

  // Soft Skills & Business
  communication: 'Communication',
  'verbal and written communication': 'Communication',
  'written communication': 'Communication',
  leadership: 'Leadership',
  'team leadership': 'Leadership',
  'technical leadership': 'Leadership',
  'problem solving': 'Problem Solving',
  'problem-solving': 'Problem Solving',
  teamwork: 'Collaboration',
  collaboration: 'Collaboration',
  'cross-functional collaboration': 'Collaboration',
  'stakeholder management': 'Stakeholder Management',
  'project management': 'Project Management',
  'product management': 'Product Management',
  'system design': 'System Design',
  'distributed systems': 'Distributed Systems',
  mentoring: 'Mentorship',
  mentorship: 'Mentorship',
};

const KNOWN_ACRONYMS = new Set([
  'API',
  'AWS',
  'BI',
  'CD',
  'CI',
  'CLI',
  'CRM',
  'CSS',
  'DB',
  'ETL',
  'ERP',
  'GCP',
  'GPU',
  'HTML',
  'HTTP',
  'IAM',
  'JSON',
  'JWT',
  'KPI',
  'LLM',
  'ML',
  'NLP',
  'OCR',
  'OKR',
  'ORM',
  'QA',
  'RAG',
  'REST',
  'ROI',
  'SaaS',
  'SDK',
  'SEO',
  'SLA',
  'SQL',
  'SSO',
  'TDD',
  'UI',
  'UX',
  'VPC',
  'XML',
]);

function cleanWhitespaceAndPunctuation(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^[-•*·\s]+|[,;:\s]+$/g, '');
}

function smartTitleCase(raw: string): string {
  return raw
    .split(' ')
    .map((word) => {
      if (!word) return word;
      const upper = word.toUpperCase();
      if (KNOWN_ACRONYMS.has(upper)) return upper;
      // Keep mixed-case technology brand names (e.g., GraphQL, PyTorch, FastAPI, Next.js)
      if (/[a-z][A-Z]/.test(word) || /\.[a-z]+$/i.test(word)) {
        return word;
      }
      if (word.length <= 2 && /^[A-Z]+$/.test(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/**
 * Normalizes any raw skill string into its canonical taxonomy form.
 * Unseen skills are cleanly formatted rather than dropped.
 */
export function normalizeSkillName(rawSkill: string): string {
  const cleaned = cleanWhitespaceAndPunctuation(rawSkill);
  if (!cleaned) return '';

  const lower = cleaned.toLowerCase();
  if (SKILL_ALIASES[lower]) {
    return SKILL_ALIASES[lower];
  }

  // Try stripping trailing version or generic suffix like " database" or " framework"
  const stripped = lower
    .replace(/\s+(database|framework|library|programming language|language|programming|tool)$/i, '')
    .trim();
  if (stripped && SKILL_ALIASES[stripped]) {
    return SKILL_ALIASES[stripped];
  }

  // Strip minor dots/spaces for JS libraries like "react js" or "node.js"
  const compact = lower.replace(/[\s._-]+/g, '');
  if (SKILL_ALIASES[compact]) {
    return SKILL_ALIASES[compact];
  }

  return smartTitleCase(cleaned);
}

/**
 * Deduplicates a list of extracted skill items by canonical name (case-insensitive),
 * keeping the strongest importance ('required' over 'preferred') and preserving evidence.
 */
export function normalizeAndDeduplicateSkills(
  items: Array<{
    rawName: string;
    category: SkillCategory;
    importance?: 'required' | 'preferred';
    evidenceQuote?: string;
  }>
): ExtractedSkillItem[] {
  const map = new Map<string, ExtractedSkillItem>();

  for (const item of items) {
    const rawName = cleanWhitespaceAndPunctuation(item.rawName);
    if (!rawName || rawName.length < 2) continue;

    const canonicalName = normalizeSkillName(rawName);
    if (!canonicalName) continue;

    const key = canonicalName.toLowerCase();
    const existing = map.get(key);

    if (!existing) {
      map.set(key, {
        rawName,
        canonicalName,
        category: item.category,
        importance: item.importance ?? 'required',
        evidenceQuote: item.evidenceQuote?.trim() || undefined,
      });
    } else {
      if (item.importance === 'required') {
        existing.importance = 'required';
      }
      if (!existing.evidenceQuote && item.evidenceQuote?.trim()) {
        existing.evidenceQuote = item.evidenceQuote.trim();
      }
    }
  }

  return Array.from(map.values());
}

export function getSkillKey(skill: string): string {
  return normalizeSkillName(skill).toLowerCase();
}
