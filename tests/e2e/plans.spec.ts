import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, makeUserDataDir, type RunningApp } from './launch';

// PRD section 12, M3: plan generation with one retry, no plan with a problem that is not in the
// catalog, activate a plan and have the daily loop draw from it, and the key stored encrypted.
// A scripted model stands in for Anthropic: nothing here reaches the network.

const KEY = 'sk-ant-e2e-key-0123456789';
const REQUEST = { topics: ['binary-search'], platforms: ['leetcode'], level: 'some', targetSize: 12 };

interface Api {
  getPlanOverview(): Promise<{
    llm: { hasKey: boolean; canStoreKey: boolean };
    active: null | {
      id: number;
      status: string;
      progress: { total: number; done: number; pending: number };
      sections: { items: { problem: { id: number; title: string }; isNext: boolean }[] }[];
    };
    drafts: { id: number }[];
  }>;
  generatePlan(request: object): Promise<{
    id: number;
    status: string;
    sections: { stage: string; groupName: string | null; items: { problem: { id: number; title: string } }[] }[];
  }>;
  getPlan(input: object): Promise<unknown>;
  activatePlan(input: object): Promise<{ status: string }>;
  saveApiKey(input: object): Promise<{ hasKey: boolean }>;
}

/** Calls a bridge method in the window and brings back its value, or the error's message. */
async function call<T>(running: RunningApp, method: keyof Api, input?: unknown): Promise<{ value?: T; error?: string }> {
  return running.page.evaluate(
    async ([name, argument]) => {
      const api = (globalThis as unknown as { paraleet: Record<string, (input?: unknown) => Promise<unknown>> }).paraleet;
      try {
        return { value: (await api[name as string]!(argument)) as never };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    },
    [method, input] as const,
  );
}

test('a plan is generated from catalog problems only, activated, and feeds the daily loop; the key is sealed', async () => {
  const data = makeUserDataDir();
  const answers = join(data.dir, 'model-answers.json');
  writeFileSync(answers, JSON.stringify([{ error: 'Could not reach Anthropic. Check your connection and try again.' }]));
  let running: RunningApp | null = null;
  try {
    running = await launchApp({ userDataDir: data.dir, now: '2026-11-25T20:00:00.000Z', llmAnswersFile: answers });
    await expect(running.page.getByTestId('today-title')).toHaveText('1. Two Sum');

    // No key: everything else works, and generating says what is needed, in plain words.
    const before = await call<Awaited<ReturnType<Api['getPlanOverview']>>>(running, 'getPlanOverview');
    expect(before.value?.llm).toMatchObject({ hasKey: false, canStoreKey: true });
    expect((await call(running, 'generatePlan', REQUEST)).error).toBe('Add an Anthropic API key in Settings to generate a plan.');
    expect((await call(running, 'getPlan', { planId: 999 })).error).toBe('That plan no longer exists.');
    expect(existsSync(`${answers}.calls.json`)).toBe(false);

    // The key is saved sealed, in its own file, and never in the database.
    expect((await call<{ hasKey: boolean }>(running, 'saveApiKey', { apiKey: KEY })).value?.hasKey).toBe(true);
    const keyFile = join(data.dir, 'anthropic-api-key.bin');
    expect(existsSync(keyFile)).toBe(true);
    expect(readFileSync(keyFile).includes(KEY)).toBe(false);
    expect(readFileSync(join(data.dir, 'paraleet.sqlite3')).includes(KEY)).toBe(false);

    // A request that fails shows its plain message and saves nothing.
    expect((await call(running, 'generatePlan', REQUEST)).error).toBe(
      'Could not reach Anthropic. Check your connection and try again.',
    );
    expect((await call<Awaited<ReturnType<Api['getPlanOverview']>>>(running, 'getPlanOverview')).value?.drafts).toEqual([]);

    // What the model was shown: metadata lines for the topic, no links, and not the key.
    const asked = JSON.parse(readFileSync(`${answers}.calls.json`, 'utf8')) as { model: string; turns: { text: string }[] }[];
    expect(asked).toHaveLength(1);
    expect(asked[0]?.model).toBe('claude-opus-5-5');
    const prompt = asked[0]?.turns[0]?.text ?? '';
    expect(prompt).not.toMatch(/https?:\/\//);
    expect(prompt).not.toContain(KEY);
    const ids = [...prompt.matchAll(/^(\d+) \| LeetCode \| /gm)].map((match) => Number(match[1]));
    expect(ids.length).toBeGreaterThanOrEqual(20);

    // First answer: one invented problem. The app asks again with the error; the second is good.
    const good = {
      topics: [
        {
          topic: 'binary-search',
          foundations: ids.slice(0, 3),
          groups: [
            { name: 'Search on the answer', description: 'Guess a value and check whether it is feasible.', problems: ids.slice(3, 6) },
            { name: 'Rotated arrays', description: 'Find the sorted half first.', problems: ids.slice(6, 8) },
          ],
          challenge: ids.slice(8, 10),
        },
      ],
    };
    const invented = structuredClone(good);
    invented.topics[0]!.challenge = [ids[8]!, 987654321];
    writeFileSync(answers, JSON.stringify([{ error: 'used' }, { plan: invented }, { plan: good }]));

    const draft = (await call<Awaited<ReturnType<Api['generatePlan']>>>(running, 'generatePlan', REQUEST)).value;
    expect(draft?.status).toBe('draft');
    const planned = draft?.sections.flatMap((section) => section.items.map((item) => item.problem.id)) ?? [];
    expect(planned).toEqual(ids.slice(0, 10));
    expect(planned).not.toContain(987654321);
    expect(draft?.sections.map((section) => section.groupName)).toEqual([null, 'Search on the answer', 'Rotated arrays', null]);
    const retried = JSON.parse(readFileSync(`${answers}.calls.json`, 'utf8')) as { turns: { text: string }[] }[];
    expect(retried).toHaveLength(3);
    expect(retried[2]?.turns[2]?.text).toContain('987654321');

    // A draft changes nothing about today. Activating it makes it the plan.
    await expect(running.page.getByTestId('today-title')).toHaveText('1. Two Sum');
    expect((await call<{ status: string }>(running, 'activatePlan', { planId: draft!.id })).value?.status).toBe('active');
    const firstTitle = draft!.sections[0]!.items[0]!.problem.title;

    // After a restart the plan and the key are still there.
    await running.close();
    running = await launchApp({ userDataDir: data.dir, now: '2026-11-25T21:00:00.000Z', llmAnswersFile: answers });
    const after = (await call<Awaited<ReturnType<Api['getPlanOverview']>>>(running, 'getPlanOverview')).value;
    expect(after?.llm.hasKey).toBe(true);
    expect(after?.active).toMatchObject({ id: draft!.id, status: 'active', progress: { total: 10, done: 0, pending: 10 } });

    // Tomorrow's problem comes from the plan, and reporting it moves the plan on.
    await running.setNow('2026-11-26T20:00:00.000Z');
    const main = running.page;
    await expect(main.getByTestId('today-title')).toContainText(firstTitle);
    await main.getByRole('button', { name: 'I solved it' }).click();
    await main.getByRole('radio', { name: /^Good/ }).click();
    await main.getByRole('button', { name: 'Feed Para' }).click();
    await expect(main.getByTestId('pet-status')).toHaveText('Para is fed for today');
    const moved = (await call<Awaited<ReturnType<Api['getPlanOverview']>>>(running, 'getPlanOverview')).value;
    expect(moved?.active?.progress).toMatchObject({ done: 1, pending: 9 });
    expect(moved?.active?.sections[0]?.items.map((item) => item.isNext)).toEqual([false, true, false]);
  } finally {
    await running?.close().catch(() => undefined);
    data.remove();
  }
});
