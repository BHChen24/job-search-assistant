# Resume Gap Analysis

**Compared against:** 13 analyzed job posting(s).

## Strengths

**Java and Spring Boot**

- Market demand: Java appears as a required skill in 4 of 13 postings, all in the software cluster that best matches the candidate's background.
- Resume evidence: Built and maintained Spring Boot REST endpoints for shipment tracking; Java listed in hard skills.

**JavaScript / TypeScript / React / Node.js front-end and full-stack skills**

- Market demand: 4 of 13 postings require JavaScript, TypeScript, or front-end frameworks, including software-engineer and full-stack roles.
- Resume evidence: Built React dashboard components against a Node.js/Express API; Recipe Planner is TypeScript + React + Express.

**SQL and database skills (PostgreSQL, MySQL)**

- Market demand: 6 of 13 postings require SQL and database skills, including software and data/analyst roles.
- Resume evidence: Wrote SQL queries and views for the reporting database; uses PostgreSQL and MySQL; integration tests against a PostgreSQL test container.

**CI/CD, containerization, and DevOps practices**

- Market demand: 6 of 13 postings require CI/CD, cloud, and DevOps practices, the second-most-common theme after Python.
- Resume evidence: GitHub Actions pipeline that runs tests and deploys a Docker image; moved a nightly batch report to a containerized job.

**Full-lifecycle development, testing, and code review**

- Market demand: 7 of 13 postings describe full lifecycle software development; testing and quality emphasis is embedded across the software cluster.
- Resume evidence: Added integration tests raising coverage 45% to 78%, reviewed pull requests, wrote onboarding docs, uses Jest and JUnit.


## Gaps by effort to close

### Quick wins — resume wording and framing

**Python with tangible project evidence**

- Market demand: Python is the most frequently named programming language in the sample, required in 6 of 13 postings spanning software, data, and DevOps roles.
- Why it is a gap: Python is listed in the hard-skills section but no work experience or project actually demonstrates it, so the claim is thin for a skill this heavily demanded.
- Next step: Add a Python script to an existing repo, e.g., a pandas-based analysis of the transit-delay data from Transit Delay Notifier or a Python implementation of the feed poller, then add one bullet such as 'Wrote Python data-processing script that analyzes transit delay feeds' (~1-2 days of work).

### Short term — days to weeks

**Security-related skills (secure development)**

- Market demand: Security-related skills are required in 6 of 13 postings, and the financial-services employers explicitly emphasize secure development and regulatory compliance.
- Why it is a gap: The resume's only audit-related work is accessibility; there is no mention of application security, authentication, or OWASP concepts, which banks repeatedly screen for.
- Next step: Work through the free OWASP Top 10 labs on PortSwigger Web Security Academy (~10-15 hours), add JWT/bcrypt authentication and input validation to Recipe Planner, then add a resume line such as 'Applied OWASP Top 10 secure coding practices and token-based authentication' (~2 weeks).

**Kafka / event streaming**

- Market demand: 1 software posting (software-engineer-i) prefers Kafka or Confluent Cloud; demand evidence is weak and should be treated as optional differentiation rather than a blocker.
- Why it is a gap: The resume shows Redis caching but no event-streaming platform; with only one posting asking for it, this is a low-priority gap worth closing only if time allows.
- Next step: Complete Confluent's self-paced Kafka Fundamentals training and sit the Confluent Fundamentals exam (~20-30 hours over 2-3 weeks). Verify current exam pricing before registering, since it was not confirmed in this research.

### Medium term — weeks to months

**Cloud platform (AWS) and first professional certification**

- Market demand: 5 of 7 software postings require cloud/CI-CD/DevOps practices and 3 ask for cloud-native/microservice development; the singled-out DevOps posting explicitly names AWS CDK, AWS services, and AWS certifications. Separately, 2 postings prefer professional certifications and the resume currently lists none.
- Why it is a gap: The resume shows Docker and GitHub Actions but never names a cloud provider, so it cannot match 'AWS'/'cloud' keywords; there is also no certification section to satisfy the certification preference.
- Next step: Complete AWS Certified Cloud Practitioner: free 6-hour Cloud Practitioner Essentials course plus AWS Skill Builder labs, then sit the USD 100 exam (~3-5 weeks). Afterwards deploy Recipe Planner to AWS with an AWS CDK stack (EC2 or ECS plus RDS PostgreSQL) and list the certification on the resume.

**Financial markets, regulatory, and risk knowledge**

- Market demand: Financial/quantitative modelling is required in 2 postings and financial markets/regulatory/risk knowledge is preferred in 3; 8 of 13 postings come from financial-services employers.
- Why it is a gap: The resume has no finance, risk, or regulatory exposure, which is a recurring theme in the banking-dominated sample even for software roles.
- Next step: Take the free-to-audit Yale 'Financial Markets' course on Coursera (~4-6 weeks at a few hours per week) and build a small Python analytics project on public financial data (e.g., pandas + yfinance) to pair with the Python gap; add one line such as 'Familiarity with financial data and regulatory environments'.

### Long term — significant investment

**Bachelor's degree / education credential**

- Market demand: 4 postings require a bachelor's degree or equivalent and 3 (the quantitative cluster) require a graduate degree; banking and quant roles treat this as a hard filter in several cases.
- Why it is a gap: The resume lists a two-year diploma, and the resume's own limitations note the credential is written as 'Diploma'; this will screen the candidate out of the graduate-degree quant roles outright and some bachelor's-required software roles.
- Next step: Enroll part-time in the University of the People online B.Sc. in Computer Science (tuition-free, ~USD 7,260 total in assessment fees, roughly 3-4 years part-time). In the meantime, target the 5 postings with no education requirement and the 'equivalent experience' language rather than the graduate-degree roles.

## Unique value

- **Accessibility engineering experience (keyboard navigation, colour contrast fixes from an audit)** — None of the analyzed postings explicitly ask for accessibility, yet the banking and pharma employers stress inclusion and mission-led culture; this is a rare, concrete signal most applicants cannot show.
- **Quantified performance/containerization impact (cut a nightly batch from 40 to 12 minutes)** — Even the mid-level software postings emphasize efficiency and CI/CD; a 3.3x runtime reduction with Docker is a measurable, impact-oriented story that stands out at junior level.
- **Testing discipline early in career (integration tests with PostgreSQL test containers, coverage 45% to 78%)** — Banks and pharma postings repeatedly mention engineering quality and regulated environments; demonstrated test-first habits and coverage metrics differentiate the candidate from juniors who ship code without tests.
- **Full-stack breadth across Java/Spring and TypeScript/React/Node plus SQL and Redis** — The software cluster splits between Java-oriented and JS/TS-oriented roles; few candidates can credibly match both halves, which widens the set of postings the candidate can target.

## Limitations

- Python is listed in hard skills but has no work or project evidence in the resume; the strength above is inferred from the skills list only.
- The analyzed sample is only 13 postings and unevenly clustered (7 software, 4 data/quantitative, 1 DevOps, 1 cybersecurity), so DevOps- and cybersecurity-related trends come from single postings and should not be over-generalized.
- Three postings (quant cluster) require graduate degrees; no short- or medium-term action closes that filter, so the candidate should prioritize software-cluster roles.
- The resume's employer and institution names are marked '(fictional)' and the credential is written 'Diploma'; authenticity and credential type could not be verified.
- The resume has no soft-skills or certifications sections; soft-skill demand could not be matched from the market data.
- Posting dates are unresolved for 8 of 13 postings and salary currency is not stated for some, per the market analysis.
- Confluent exam pricing could not be confirmed in this research, so the Kafka recommendation avoids claiming the exam is free.

## Evidence

- Supporting data for each gap: `output/gap/analysis.json`
