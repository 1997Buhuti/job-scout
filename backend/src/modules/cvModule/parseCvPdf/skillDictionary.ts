/**
 * Curated skill dictionary for CV parsing
 * Maps skill variations to canonical forms
 * Format: { canonicalForm: [variations...] }
 */

/**
 * Tech skills - Programming Languages
 */
export const TECH_SKILLS_LANGUAGES: Record<string, string[]> = {
  JavaScript: ['javascript', 'js', 'javascript', 'es6', 'es2015', 'es2016', 'es2017', 'es2018', 'es2019', 'es2020', 'es2021', 'es2022', 'es2023'],
  TypeScript: ['typescript', 'ts', 'typescript', 'tsx'],
  Python: ['python', 'py', 'python2', 'python3', 'python-2', 'python-3'],
  Java: ['java', 'javase', 'jdk', 'jvm'],
  CSharp: ['csharp', 'c#', 'c-sharp', '.net'],
  C: ['c', 'c-language'],
  CPlusPlus: ['cplusplus', 'c++', 'c-plus-plus'],
  Go: ['go', 'golang', 'go-lang'],
  Rust: ['rust', 'rust-lang', 'rs'],
  Swift: ['swift', 'swift-lang'],
  Kotlin: ['kotlin', 'kt'],
  PHP: ['php', 'php7', 'php8'],
  Ruby: ['ruby', 'ruby-on-rails', 'rails'],
  Scala: ['scala', 'scala-lang'],
  Perl: ['perl', 'perl5'],
  Haskell: ['haskell', 'hs'],
  R: ['r-lang', 'r-language'],
  Matlab: ['matlab', 'mat-lab'],
  Lua: ['lua', 'luajit'],
  Dart: ['dart', 'dart-lang'],
  SQL: ['sql', 'structured-query-language'],
  Shell: ['shell', 'bash', 'zsh', 'powershell', 'sh'],
};

/**
 * Tech skills - Web Frontend
 */
export const TECH_SKILLS_FRONTEND: Record<string, string[]> = {
  React: ['react', 'reactjs', 'react-js', 'react.js'],
  ReactNative: ['react-native', 'reactnative', 'rn'],
  Redux: ['redux', 'react-redux'],
  NextJS: ['nextjs', 'next.js', 'next'],
  Vue: ['vue', 'vuejs', 'vue.js'],
  VueRouter: ['vue-router', 'vue-route'],
  Pinia: ['pinia', 'vuex'],
  Angular: ['angular', 'angularjs', 'angular-2', 'angular-4', 'angular-5', 'angular-6', 'angular-7', 'angular-8', 'angular-9', 'angular-10', 'angular-11', 'angular-12', 'angular-13', 'angular-14', 'angular-15', 'angular-16'],
  jQuery: ['jquery', 'jquery-js'],
  Svelte: ['svelte', 'sveltejs'],
  TailwindCSS: ['tailwindcss', 'tailwind', 'tailwind-css'],
  Bootstrap: ['bootstrap', 'bs', 'bootstrap-4', 'bootstrap-5'],
  MaterialUI: ['material-ui', 'materialui', 'mui', 'material-design'],
  CSS: ['css', 'css3', 'css-3'],
  HTML: ['html', 'html5', 'html-5'],
  SCSS: ['scss', 'sass', 'sass-css'],
  LESS: ['less', 'less-css'],
  Webpack: ['webpack', 'webpack-bundler'],
  Vite: ['vite', 'vitejs'],
  Babel: ['babel', 'babel-js'],
  Jest: ['jest', 'jest-js'],
  Cypress: ['cypress', 'cypress-io'],
  Selenium: ['selenium', 'selenium-webdriver', 'selenium-webdriver'],
  Puppeteer: ['puppeteer', 'puppeteer-js'],
  ESLint: ['eslint', 'es-lint'],
  Prettier: ['prettier', 'pretty-print'],
};

/**
 * Tech skills - Web Backend
 */
export const TECH_SKILLS_BACKEND: Record<string, string[]> = {
  NodeJS: ['nodejs', 'node.js', 'node', 'node-js'],
  Express: ['express', 'expressjs', 'express.js'],
  Koa: ['koa', 'koajs'],
  NestJS: ['nestjs', 'nest.js', 'nest'],
  Fastify: ['fastify', 'fastify-js'],
  Hapi: ['hapi', 'hapi-js'],
  Loopback: ['loopback', 'loopbackjs'],
  ApolloServer: ['apollo-server', 'apollo-server-express', 'graphql-apollo'],
  GraphQL: ['graphql', 'graph-ql', 'gql'],
  RESTAPI: ['rest-api', 'restful-api', 'rest', 'restful'],
  WebSockets: ['websockets', 'websocket', 'ws'],
  SocketIO: ['socketio', 'socket.io', 'socket-io'],
  gRPC: ['grpc', 'g-rpc'],
  RabbitMQ: ['rabbitmq', 'rabbit-mq'],
  Kafka: ['kafka', 'apache-kafka'],
  Redis: ['redis', 'redis-db'],
  MongoDB: ['mongodb', 'mongo-db', 'mongo'],
  PostgreSQL: ['postgresql', 'postgres', 'pg', 'postgresql-12', 'postgresql-13', 'postgresql-14', 'postgresql-15'],
  MySQL: ['mysql', 'my-sql'],
  SQLite: ['sqlite', 'sqlite3'],
  DynamoDB: ['dynamodb', 'dynamo-db'],
  Elasticsearch: ['elasticsearch', 'elastic-search', 'es'],
  Firebase: ['firebase', 'fire-base'],
  Prisma: ['prisma', 'prisma-orm'],
  TypeORM: ['typeorm', 'type-orm'],
  Sequelize: ['sequelize', 'sequelizejs'],
};

/**
 * Tech skills - Cloud & DevOps
 */
export const TECH_SKILLS_CLOUD: Record<string, string[]> = {
  AWS: ['aws', 'amazon-web-services', 'amazon web services'],
  EC2: ['ec2', 'elastic-compute-cloud'],
  S3: ['s3', 'simple-storage-service'],
  Lambda: ['lambda', 'aws-lambda'],
  APIGateway: ['apigateway', 'api-gateway', 'aws-api-gateway'],
  DynamoDB: ['dynamodb', 'dynamo-db', 'aws-dynamodb'],
  RDS: ['rds', 'relational-database-service'],
  ECS: ['ecs', 'elastic-container-service'],
  EKS: ['eks', 'elastic-kubernetes-service'],
  Kubernetes: ['kubernetes', 'k8s', 'k-8-s', 'kube'],
  Docker: ['docker', 'docker-desktop', 'docker-engine'],
  CI: ['ci', 'continuous-integration'],
  CD: ['cd', 'continuous-deployment', 'continuous-delivery'],
  GitHubActions: ['github-actions', 'github-actions-ci', 'gh-actions', 'github actions'],
  GitLabCI: ['gitlab-ci', 'gitlab-ci-cd', 'gitlab ci/cd'],
  Jenkins: ['jenkins', 'hudson'],
  TravisCI: ['travis-ci', 'travis ci'],
  CircleCI: ['circleci', 'circle-ci'],
  Azure: ['azure', 'azure-cloud', 'microsoft-azure'],
  AzureFunctions: ['azure-functions', 'azure-functions-core-tools', 'azure functions'],
  AzureAppService: ['azure-app-service', 'azure app service'],
  AzureAKS: ['azure-aks', 'azure kubernetes service'],
  GoogleCloud: ['google-cloud', 'gcp', 'google cloud platform', 'g-cloud'],
  GKE: ['gke', 'google-kubernetes-engine'],
  Firebase: ['firebase', 'fire-base', 'google-firebase'],
  Vercel: ['vercel', 'vercel-cli'],
  Netlify: ['netlify', 'netlify-cli'],
  Heroku: ['heroku', 'heroku-cli'],
};

/**
 * Tech skills - Mobile
 */
export const TECH_SKILLS_MOBILE: Record<string, string[]> = {
  iOS: ['ios', 'iphone', 'apple-ios', 'ios-development'],
  Android: ['android', 'android-dev', 'android-development'],
  Flutter: ['flutter', 'flutter-io', 'google-flutter'],
  ReactNative: ['react-native', 'reactnative', 'react-native-android', 'react-native-ios'],
  Swift: ['swift', 'swift-lang', 'swift-ui'],
  Kotlin: ['kotlin', 'kotlin-android'],
  Java: ['java', 'java-android'],
};

/**
 * Tech skills - Testing
 */
export const TECH_SKILLS_TESTING: Record<string, string[]> = {
  'Unit Testing': ['unit-testing', 'unit testing', 'unittest'],
  'Integration Testing': ['integration-testing', 'integration testing'],
  E2ETesting: ['e2e-testing', 'e2e testing', 'end-to-end testing'],
  'Test-Driven Development': ['tdd', 'test-driven-development', 'test driven development'],
  'Behavior-Driven Development': ['bdd', 'behavior-driven-development', 'behavior driven development'],
  Jest: ['jest', 'jestjs', 'jest-testing'],
  Mocha: ['mocha', 'mocha-js'],
  Chai: ['chai', 'chaijs'],
  Sinon: ['sinon', 'sinonjs'],
  Enzyme: ['enzyme', 'enzymejs'],
  Cypress: ['cypress', 'cypress-io', 'cypress-testing'],
  Selenium: ['selenium', 'selenium-webdriver', 'selenium-testing'],
  Postman: ['postman', 'postman-api', 'postman-testing'],
  Swagger: ['swagger', 'openapi', 'open-api'],
  Vitest: ['vitest', 'vitestjs'],
};

/**
 * Tech skills - Databases & Data
 */
export const TECH_SKILLS_DATABASES: Record<string, string[]> = {
  PostgreSQL: ['postgresql', 'postgres', 'pg'],
  MySQL: ['mysql', 'my-sql'],
  MongoDB: ['mongodb', 'mongo-db', 'mongo'],
  Redis: ['redis', 'redis-db', 'redis-cache'],
  SQLite: ['sqlite', 'sqlite3'],
  DynamoDB: ['dynamodb', 'dynamo-db', 'aws-dynamodb'],
  Elasticsearch: ['elasticsearch', 'elastic-search', 'es'],
  Cassandra: ['cassandra', 'apache-cassandra'],
  MariaDB: ['mariadb', 'mariadb-server'],
  Oracle: ['oracle', 'oracle-db', 'oracle-sql'],
  SQLServer: ['sql-server', 'mssql', 'microsoft-sql-server'],
  Neo4j: ['neo4j', 'neo4j-graph'],
  CouchDB: ['couchdb', 'couch-db'],
  Firestore: ['firestore', 'fire-store'],
  Prisma: ['prisma', 'prisma-orm'],
  TypeORM: ['typeorm', 'type-orm'],
  Sequelize: ['sequelize', 'sequelizejs'],
};

/**
 * Tech skills - Data Engineering & Analytics
 */
export const TECH_SKILLS_DATA: Record<string, string[]> = {
  'Data Analysis': ['data-analysis', 'data analysis', 'data-analyst'],
  'Data Science': ['data-science', 'data science'],
  'Machine Learning': ['machine-learning', 'machine learning', 'ml', 'machine-learn'],
  DeepLearning: ['deep-learning', 'deep learning', 'dl'],
  'Natural Language Processing': ['nlp', 'natural-language-processing', 'natural language processing'],
  'Computer Vision': ['computer-vision', 'computer vision', 'cv'],
  'Data Visualization': ['data-visualization', 'data visualization', 'dataviz'],
  Tableau: ['tableau', 'tableau-software'],
  PowerBI: ['powerbi', 'power-bi', 'power-bi-desktop'],
  Python: ['python', 'py', 'python-data', 'pandas', 'numpy', 'scipy', 'matplotlib', 'seaborn'],
  R: ['r-lang', 'r-language', 'r-data'],
  Spark: ['spark', 'apache-spark', 'apache spark'],
  Hadoop: ['hadoop', 'apache-hadoop'],
  Kafka: ['kafka', 'apache-kafka'],
  Airflow: ['airflow', 'apache-airflow'],
};

/**
 * Tech skills - DevOps & SRE
 */
export const TECH_SKILLS_DEVOPS: Record<string, string[]> = {
  Docker: ['docker', 'docker-desktop', 'docker-engine'],
  Kubernetes: ['kubernetes', 'k8s', 'k-8-s', 'kube'],
  AWS: ['aws', 'amazon-web-services'],
  Azure: ['azure', 'azure-cloud'],
  GCP: ['gcp', 'google-cloud-platform'],
  Terraform: ['terraform', 'terraform-io', 'hashicorp-terraform'],
  Ansible: ['ansible', 'ansible-playbook'],
  Chef: ['chef', 'chef-automate'],
  Puppet: ['puppet', 'puppetlabs'],
  CloudFormation: ['cloudformation', 'cloud-formation', 'aws-cloudformation'],
  CloudDeploy: ['clouddeploy', 'cloud-deploy'],
  Jenkins: ['jenkins', 'hudson'],
  GitLabCI: ['gitlab-ci', 'gitlab-ci-cd'],
  GitHubActions: ['github-actions', 'github-actions-ci'],
  CircleCI: ['circleci', 'circle-ci'],
  TravisCI: ['travis-ci', 'travis ci'],
  Bamboo: ['bamboo', 'atlassian-bamboo'],
  TeamCity: ['teamcity', 'jetbrains-teamcity'],
  Git: ['git', 'git-scm', 'git-version-control'],
  GitHub: ['github', 'git-hub'],
  GitLab: ['gitlab', 'git-lab'],
  Bitbucket: ['bitbucket', 'bitbucket-org'],
  Monitoring: ['monitoring', 'monitoring-tools'],
  Logging: ['logging', 'log-management'],
  Prometheus: ['prometheus', 'prometheus-io'],
  Grafana: ['grafana', 'grafana-labs'],
  ELK: ['elk', 'elk-stack', 'elasticsearch-logstash-kibana'],
  Loki: ['loki', 'grafana-loki'],
  Sentry: ['sentry', 'getsentry'],
  Datadog: ['datadog', 'datadog-agent'],
  NewRelic: ['newrelic', 'new-relic'],
  PagerDuty: ['pagerduty', 'pager-duty'],
};

/**
 * Tech skills - Security
 */
export const TECH_SKILLS_SECURITY: Record<string, string[]> = {
  'Application Security': ['app-sec', 'application-security', 'application security'],
  'Web Application Security': ['web-application-security', 'web app security', 'wasc'],
  'Information Security': ['info-sec', 'information-security', 'information security'],
  'Cyber Security': ['cyber-security', 'cybersecurity', 'cyber-security'],
  PenetrationTesting: ['pen-testing', 'penetration-testing', 'pentest'],
  VulnerabilityAssessment: ['vulnerability-assessment', 'vulnerability assessment', 'vuln-assess'],
  OWASP: ['owasp', 'owasp-top-10'],
  SSLTLS: ['ssltls', 'ssl-tls', 'ssl', 'tls', 'https'],
  OAuth2: ['oauth2', 'oauth-2', 'oauth', 'openid-connect'],
  JWT: ['jwt', 'json-web-token', 'json-web-tokens'],
  SAML: ['saml', 'saml2', 'security-assertion-markup-language'],
  PKI: ['pki', 'public-key-infrastructure'],
  'Zero Trust': ['zero-trust', 'zero trust'],
};

/**
 * Tech skills - Soft Skills
 */
export const SOFT_SKILLS: Record<string, string[]> = {
  'Problem Solving': ['problem-solving', 'problem solving', 'critical-thinking', 'critical thinking'],
  'Communication': ['communication', 'comm', 'verbal-communication', 'verbal communication'],
  'Teamwork': ['teamwork', 'team-work', 'collaboration', 'team-player'],
  'Leadership': ['leadership', 'lead', 'managerial-skills', 'managerial skills'],
  'Time Management': ['time-management', 'time management', 'prioritization'],
  'Adaptability': ['adaptability', 'flexibility', 'agile'],
  ' Creativity': ['creativity', 'innovation'],
  'Work Ethic': ['work-ethic', 'work ethic', 'dedication'],
  'Interpersonal Skills': ['interpersonal-skills', 'interpersonal skills', 'people-skills', 'people skills'],
  'Conflict Resolution': ['conflict-resolution', 'conflict resolution', 'mediation'],
  'Mentoring': ['mentoring', 'mentorship', 'coaching'],
  'Presentation Skills': ['presentation-skills', 'presentation skills', 'public-speaking', 'public speaking'],
  'Negotiation': ['negotiation', 'persuasion'],
  'Strategic Thinking': ['strategic-thinking', 'strategic thinking', 'planning'],
  'Decision Making': ['decision-making', 'decision making', 'judgment'],
  'Emotional Intelligence': ['emotional-intelligence', 'emotional intelligence', 'eq'],
  'Customer Service': ['customer-service', 'customer service'],
  'Project Management': ['project-management', 'project management', 'pm'],
  'Agile': ['agile', 'scrum', 'kanban', 'agile-methodology'],
  'Documentation': ['documentation', 'technical-writing', 'technical writing'],
};

/**
 * Tech skills - Tools & Platforms
 */
export const TECH_SKILLS_TOOLS: Record<string, string[]> = {
  Git: ['git', 'git-scm', 'git-version-control'],
  GitHub: ['github', 'git-hub'],
  GitLab: ['gitlab', 'git-lab'],
  Bitbucket: ['bitbucket', 'bitbucket-org'],
  VSCode: ['vscode', 'vs-code', 'visual-studio-code'],
  IntelliJ: ['intellij', 'intellij-idea', 'jetbrains'],
  WebStorm: ['webstorm', 'jetbrains-webstorm'],
  PyCharm: ['pycharm', 'jetbrains-pycharm'],
  Eclipse: ['eclipse', 'eclipse-ide'],
  VisualStudio: ['visualstudio', 'visual-studio', 'vs', 'vs2019', 'vs2022'],
  Postman: ['postman', 'postman-api'],
  Swagger: ['swagger', 'openapi'],
  Figma: ['figma', 'figma-design'],
  AdobeXD: ['adobexd', 'adobe-xd', 'xd'],
  Sketch: ['sketch', 'sketch-app'],
  Linux: ['linux', 'ubuntu', 'debian', 'centos', 'redhat', 'fedora'],
  Windows: ['windows', 'win', 'windows-10', 'windows-11'],
  Mac: ['mac', 'macos', 'mac-os', 'osx', 'apple-macos'],
  Terminal: ['terminal', 'bash', 'zsh', 'shell'],
  CLI: ['cli', 'command-line-interface', 'command line interface'],
  API: ['api', 'api-design', 'api-development'],
  REST: ['rest', 'rest-api', 'restful-api'],
  GraphQL: ['graphql', 'graph-ql'],
};

/**
 * Sri Lankan Job Market Relevant Skills
 * Based on local tech industry demand
 */
export const SL_SKILLS: Record<string, string[]> = {
  'Sri Lanka Job Market': ['sri-lanka', 'sri lanka', 'sri lankan-job-market'],
  LocalCompliance: ['local-compliance', 'sri-lanka-compliance', 'local-labor-law'],
  SLStartup: ['sri-lanka-startup', 'sri-lankan-startup', 'startup-sri-lanka'],
  OffshoreDev: ['offshore-development', 'offshore-development-team', 'offshore-team'],
  RemoteWork: ['remote-work', 'remote-team', 'distributed-team'],
  Freelancing: ['freelancing', 'freelance', 'freelance-development'],
  ClientManagement: ['client-management', 'client-handling', 'client-communication'],
  ProjectScoping: ['project-scoping', 'project-planning', 'requirement-gathering'],
  TechnicalWriting: ['technical-writing', 'technical-documentation', 'specs-writing'],
};

/**
 * Complete skill dictionary combining all categories
 * Map: { canonicalForm: [allVariations...] }
 */
export const SKILL_DICTIONARY: Record<string, string[]> = {
  ...TECH_SKILLS_LANGUAGES,
  ...TECH_SKILLS_FRONTEND,
  ...TECH_SKILLS_BACKEND,
  ...TECH_SKILLS_CLOUD,
  ...TECH_SKILLS_MOBILE,
  ...TECH_SKILLS_TESTING,
  ...TECH_SKILLS_DATABASES,
  ...TECH_SKILLS_DATA,
  ...TECH_SKILLS_DEVOPS,
  ...TECH_SKILLS_SECURITY,
  ...SOFT_SKILLS,
  ...TECH_SKILLS_TOOLS,
  ...SL_SKILLS,
};

/**
 * Reverse lookup: variation -> canonical form
 */
export const VARIATION_TO_CANONICAL: Record<string, string> = {};
Object.entries(SKILL_DICTIONARY).forEach(([canonical, variations]) => {
  variations.forEach((variation) => {
    VARIATION_TO_CANONICAL[variation.toLowerCase()] = canonical;
  });
});

/**
 * Get all canonical skills as an array
 */
export const CANONICAL_SKILLS: string[] = Object.keys(SKILL_DICTIONARY);

/**
 * Get total count of canonical skills
 */
export const SKILL_COUNT: number = CANONICAL_SKILLS.length;