// Network side of the catalog scripts. Only these scripts ever call LeetCode's unofficial
// endpoint: the app never does (PRD section 8). Requests are anonymous: no cookies, no account,
// a generic User-Agent. Problem statements are never requested.

const USER_AGENT = 'Mozilla/5.0 (compatible; catalog-seed-builder)';
const TIMEOUT_MS = 30_000;
const TRIES = 3;

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

/** One request with a 30-second timeout, up to three tries with a growing pause, and a plain error at the end. */
export async function fetchWithRetry(what: string, url: string, init: RequestInit = {}): Promise<Response> {
  let lastProblem = '';
  for (let attempt = 1; attempt <= TRIES; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: { 'User-Agent': USER_AGENT, ...init.headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.ok) return response;
      lastProblem = `it answered HTTP ${response.status}`;
    } catch (error) {
      lastProblem = error instanceof Error && error.name === 'TimeoutError' ? 'it took longer than 30 seconds' : 'the connection failed';
    }
    if (attempt < TRIES) await sleep(2000 * attempt);
  }
  throw new Error(`Could not fetch ${what} from ${url}: ${lastProblem} (tried ${TRIES} times). The existing catalog file was left untouched.`);
}

export async function fetchCodeforces(): Promise<unknown> {
  const response = await fetchWithRetry('the Codeforces problem list', 'https://codeforces.com/api/problemset.problems');
  return response.json();
}

export async function fetchCses(): Promise<string> {
  const response = await fetchWithRetry('the CSES problem set', 'https://cses.fi/problemset/');
  return response.text();
}

// List fields only: no `content`, no statement, no hints, no solutions.
const LEETCODE_QUERY = `query catalogPage($skip: Int!, $limit: Int!) {
  problemsetQuestionList: questionList(categorySlug: "", limit: $limit, skip: $skip, filters: {}) {
    total: totalNum
    questions: data {
      questionFrontendId
      title
      titleSlug
      difficulty
      isPaidOnly
      topicTags { name }
      stats
    }
  }
}`;
const LEETCODE_PAGE = 100;

interface LeetcodePage {
  data?: { problemsetQuestionList?: { total: number; questions: unknown[] } | null };
}

export async function fetchLeetcode(): Promise<unknown[]> {
  const questions: unknown[] = [];
  let total = Infinity;
  while (questions.length < total) {
    const response = await fetchWithRetry('the LeetCode problem list', 'https://leetcode.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Referer: 'https://leetcode.com/problemset/' },
      body: JSON.stringify({ query: LEETCODE_QUERY, variables: { skip: questions.length, limit: LEETCODE_PAGE } }),
    });
    const list = ((await response.json()) as LeetcodePage).data?.problemsetQuestionList;
    if (!list || !Array.isArray(list.questions)) throw new Error('LeetCode answered, but not with a problem list. The existing catalog file was left untouched.');
    if (list.questions.length === 0) break;
    total = list.total;
    questions.push(...list.questions);
    await sleep(500);
  }
  if (questions.length < total) throw new Error(`LeetCode listed ${total} problems but only ${questions.length} arrived. The existing catalog file was left untouched.`);
  return questions;
}
