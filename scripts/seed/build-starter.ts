// Builds seed/starter.json from live LeetCode metadata. Run with: npm run seed:starter
//
// This is a build-time script. The app never calls LeetCode's unofficial endpoint at runtime
// (PRD section 8). Only metadata and links are fetched and stored, never problem statements.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { starterSeedSchema, validateSeedProblems, type SeedProblem, type StarterSeed } from '../../src/data/seedFormat';
import { leetcodeAdapter } from '../../src/platforms';
import { STARTER_PICKS } from './starter-picks';

const ENDPOINT = 'https://leetcode.com/graphql';
const QUERY = `query starterProblem($slug: String!) {
  question(titleSlug: $slug) {
    questionFrontendId
    title
    titleSlug
    difficulty
    isPaidOnly
    topicTags { name }
  }
}`;

interface Question {
  questionFrontendId: string;
  title: string;
  titleSlug: string;
  difficulty: string;
  isPaidOnly: boolean;
  topicTags: { name: string }[];
}

async function fetchQuestion(slug: string): Promise<Question> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Referer: 'https://leetcode.com/problemset/',
      'User-Agent': 'Mozilla/5.0 (seed-builder)',
    },
    body: JSON.stringify({ query: QUERY, variables: { slug } }),
  });
  if (!response.ok) throw new Error(`${slug}: LeetCode answered HTTP ${response.status}`);
  const body = (await response.json()) as { data?: { question: Question | null } };
  const question = body.data?.question;
  if (!question) throw new Error(`${slug}: no such problem on LeetCode`);
  return question;
}

function toSeedProblem(slug: string, question: Question): SeedProblem {
  if (question.titleSlug !== slug) throw new Error(`${slug}: LeetCode returned "${question.titleSlug}"`);
  if (question.isPaidOnly) throw new Error(`${slug}: paid-only problems cannot be on the starter list`);
  if (question.difficulty !== 'Easy' && question.difficulty !== 'Medium') {
    throw new Error(`${slug}: the starter list is easy and medium only, got ${question.difficulty}`);
  }
  const sourceTags = question.topicTags.map((tag) => tag.name);
  return {
    platform: 'leetcode',
    platformId: slug,
    displayId: question.questionFrontendId,
    title: question.title.trim(),
    url: leetcodeAdapter.buildUrl(slug),
    difficultyRaw: question.difficulty,
    difficultyNorm: leetcodeAdapter.normalizeDifficulty(question.difficulty),
    topics: leetcodeAdapter.mapTags(sourceTags),
    sourceTags,
  };
}

async function main(): Promise<void> {
  const problems: SeedProblem[] = [];
  for (const slug of STARTER_PICKS) {
    problems.push(toSeedProblem(slug, await fetchQuestion(slug)));
    process.stdout.write('.');
    await new Promise((done) => setTimeout(done, 250));
  }
  process.stdout.write('\n');

  const seed: StarterSeed = starterSeedSchema.parse({
    generatedAt: new Date().toISOString(),
    source: 'LeetCode GraphQL (question metadata), fetched by scripts/seed/build-starter.ts',
    problems,
  });
  const errors = validateSeedProblems(seed.problems);
  if (errors.length > 0) throw new Error(`Seed validation failed:\n${errors.join('\n')}`);
  const untagged = seed.problems.filter((problem) => problem.topics.length === 0);
  if (untagged.length > 0) {
    throw new Error(`No topic mapped for: ${untagged.map((problem) => problem.platformId).join(', ')}`);
  }

  const file = resolve(import.meta.dirname, '../../seed/starter.json');
  writeFileSync(file, `${JSON.stringify(seed, null, 2)}\n`);
  console.log(`Wrote ${seed.problems.length} problems to ${file}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
