// What the model is told when it builds a plan (PRD section 7). It sees only problem metadata:
// an ID the app made up, the platform, the difficulty, the title and the app's topic tags.
import { PLAN_LEVEL_LABELS, PLAN_SHAPE, type PlanCandidate, type PlanRequest } from '../core/plan';
import { topicLabel, type TopicId } from '../core/topics';

const PLATFORM_NAMES: Record<string, string> = {
  leetcode: 'LeetCode',
  cses: 'CSES',
  codeforces: 'Codeforces',
  other: 'Other',
};

export const PLAN_SYSTEM_PROMPT = `You build study plans for people practising algorithm problems. For each topic you are given a list of candidate problems from a catalog. You choose from those candidates and arrange them into stages.

You select, you never invent. Every problem in your plan is one of the candidates, referred to by its numeric id. A problem that is not in the list cannot be opened by the app, so an id that is not listed under a topic makes the whole plan unusable.

For each topic, build three stages:

- foundations: ${PLAN_SHAPE.foundations.min} to ${PLAN_SHAPE.foundations.max} problems (usually 3 to 5) that drill the most basic form of the technique, easiest first.
- groups: ${PLAN_SHAPE.groups.min} to ${PLAN_SHAPE.groups.max} pattern groups (usually 2 to 4), one per common trick within the topic. Each group has ${PLAN_SHAPE.groupProblems.min} to ${PLAN_SHAPE.groupProblems.max} problems (usually 3 or 4), a short name for the trick, and one sentence that says what the trick is, written for someone about to practise it. For example, name "Binary search on the answer", description "Guess a value and check whether it is feasible, then narrow the range."
- challenge: up to ${PLAN_SHAPE.challenge.max} harder problems (usually 2 or 3) that combine tricks or hide the technique.

Rules:

- Use only ids listed under that topic, and use each id at most once in the whole plan.
- Aim for about the requested number of problems per topic. Fewer is fine when the candidates are thin; never pad a group with a problem that does not fit its trick.
- Match the person's level: someone new needs more easy problems and gentler challenges; someone comfortable can skip the most trivial ones.
- Prefer problems the person has not solved yet. A candidate marked "solved" may be used only when it is the clearest example of a trick.
- Group by the trick a problem really needs, judged from its title and tags. If you are not confident what a problem needs, leave it out.
- Within each list, order the problems from easier to harder.
- Group names within a topic are distinct. Names and descriptions are plain text, with no markdown.`;

function describe(candidate: PlanCandidate): string {
  const difficulty = candidate.difficultyRaw ?? 'unrated';
  const tags = candidate.sourceTags.slice(0, 6).join(', ');
  return `${candidate.id} | ${PLATFORM_NAMES[candidate.platform] ?? candidate.platform} | ${difficulty} | ${candidate.title}${tags ? ` | ${tags}` : ''}${candidate.solved ? ' | solved' : ''}`;
}

/** The request as the model reads it: what the person asked for, then the candidates per topic. */
export function buildPlanMessage(
  request: PlanRequest,
  candidates: ReadonlyMap<TopicId, readonly PlanCandidate[]>,
): string {
  const lines: string[] = [
    `Level: ${PLAN_LEVEL_LABELS[request.level]}.`,
    `About ${request.targetSize} problems per topic.`,
    `Topics, in this order: ${request.topics.map((topic) => `${topic} (${topicLabel(topic)})`).join('; ')}.`,
    '',
    'In your answer, give each topic by its id exactly as written above (for example "binary-search").',
    '',
    'Candidates. Each line is: id | platform | difficulty | title | tags, and "solved" when the person has already attempted it.',
  ];
  for (const topic of request.topics) {
    const list = candidates.get(topic) ?? [];
    lines.push('', `## ${topic} (${topicLabel(topic)}): ${list.length} candidates`);
    for (const candidate of list) lines.push(describe(candidate));
  }
  return lines.join('\n');
}

/** What the model is told when its first answer failed the checks: the problems, in plain words. */
export function buildRetryMessage(errors: readonly string[]): string {
  return [
    'That plan cannot be used. These problems were found:',
    ...errors.slice(0, 20).map((error) => `- ${error}`),
    ...(errors.length > 20 ? [`- and ${errors.length - 20} more of the same kind.`] : []),
    '',
    'Send the whole plan again with these fixed. Use only ids from the candidate lists, each at most once.',
  ].join('\n');
}
