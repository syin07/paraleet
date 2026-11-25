import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, makeUserDataDir, ROOT, type RunningApp } from './launch';

// PRD sections 7 and 11, through the real Plan screen in the real app: no key, add a key in
// Settings, pick a topic, a failed request, a draft, an edit, activate, and the daily loop takes
// its next problem from the plan. A scripted model stands in for Anthropic.

const KEY = 'sk-ant-e2e-key-0123456789';
const shot = (name: string): string => join(ROOT, 'artifacts/screenshots', `e2e-${name}.png`);

test('the Plan screen in the real app: from no key to an active plan that feeds tomorrow', async () => {
  const data = makeUserDataDir();
  const answers = join(data.dir, 'model-answers.json');
  writeFileSync(answers, JSON.stringify([{ error: 'Could not reach Anthropic. Check your connection and try again.' }]));
  let running: RunningApp | null = null;
  try {
    running = await launchApp({ userDataDir: data.dir, now: '2026-11-25T20:00:00.000Z', llmAnswersFile: answers });
    const page = running.page;
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(page.getByTestId('today-title')).toHaveText('1. Two Sum');

    // No key yet: the screen says what plans need and sends the user to Settings.
    await nav.getByRole('button', { name: 'Plan' }).click();
    await expect(page.getByText('Plans need an Anthropic API key')).toBeVisible();
    await page.screenshot({ path: shot('plan-nokey') });
    await page.getByRole('button', { name: 'Add API key' }).click();
    const keyField = page.getByLabel('Anthropic API key');
    await expect(keyField).toBeVisible();
    await keyField.fill(KEY);
    const plans = page.getByRole('region', { name: 'Learning plans' });
    await plans.getByRole('button', { name: 'Save' }).click();
    await expect(plans.getByRole('button', { name: 'Remove' })).toBeVisible();
    expect(await page.content()).not.toContain(KEY);

    // With a key: nothing active, and a plan can be created.
    await nav.getByRole('button', { name: 'Plan' }).click();
    await expect(page.getByText('No active plan')).toBeVisible();
    await page.getByRole('button', { name: 'Create a plan' }).click();
    await page.getByRole('group', { name: 'Topics' }).getByRole('button', { name: /^Binary search/ }).click();
    await page.getByRole('radio', { name: '10' }).click();
    await expect(page.getByText('About 10 problems from 1 topic')).toBeVisible();
    await page.screenshot({ path: shot('plan-create') });

    // The first request fails: the message, "Try again", and what was chosen is kept.
    await page.getByRole('button', { name: 'Generate plan' }).click();
    await expect(page.getByText('Could not reach Anthropic. Check your connection and try again.')).toBeVisible();
    await expect(page.getByRole('radio', { name: '10' })).toHaveAttribute('aria-checked', 'true');

    // What the model was shown gives real catalog IDs to answer with.
    const asked = JSON.parse(readFileSync(`${answers}.calls.json`, 'utf8')) as { turns: { text: string }[] }[];
    const prompt = asked[0]?.turns[0]?.text ?? '';
    const ids = [...prompt.matchAll(/^(\d+) \| /gm)].map((match) => Number(match[1]));
    expect(ids.length).toBeGreaterThanOrEqual(10);
    const plan = {
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
    writeFileSync(answers, JSON.stringify([{ error: 'used' }, { plan }]));
    await page.getByRole('button', { name: 'Try again' }).click();

    // The draft opens for review, with the model's groups and their one-sentence descriptions.
    await expect(page.getByText('Draft plan. Remove, reorder or swap problems, then activate.')).toBeVisible();
    await expect(page.getByText('Search on the answer')).toBeVisible();
    await expect(page.getByText('Guess a value and check whether it is feasible.')).toBeVisible();
    const rows = page.getByTestId('plan-row');
    await expect(rows).toHaveCount(10);
    await page.screenshot({ path: shot('plan-draft') });

    // Remove the first problem; the second becomes the first.
    const titles = await rows.evaluateAll((nodes) => nodes.map((node) => node.querySelector('button')?.textContent ?? ''));
    await rows.first().getByRole('button', { name: /^Remove / }).click();
    await expect(rows).toHaveCount(9);
    const secondTitle = titles[1] ?? '';
    await expect(rows.first()).toContainText(secondTitle);

    // A problem title opens the browser through main, never from the page.
    await rows.first().getByRole('button', { name: secondTitle, exact: true }).click();
    await expect.poll(async () => (await running!.openedUrls()).length).toBe(1);

    // Activate: it is the plan now, with one Next badge on its first problem.
    await page.getByRole('button', { name: 'Activate plan' }).click();
    await expect(page.getByRole('button', { name: 'Archive', exact: true })).toBeVisible();
    await expect(page.getByText('Next', { exact: true })).toHaveCount(1);
    await expect(rows.filter({ has: page.getByText('Next', { exact: true }) })).toContainText(secondTitle);
    await expect(page.getByTestId('plan-overall')).toContainText('0 / 9');
    await page.screenshot({ path: shot('plan-active') });

    // Tomorrow's problem is the plan's Next one; reporting it moves the plan on.
    await running.setNow('2026-11-26T20:00:00.000Z');
    await nav.getByRole('button', { name: 'Today' }).click();
    await expect(page.getByTestId('today-title')).toContainText(secondTitle);
    await page.getByRole('button', { name: 'I solved it' }).click();
    await page.getByRole('radio', { name: /^Good/ }).click();
    await page.getByRole('button', { name: 'Feed Para' }).click();
    await expect(page.getByTestId('pet-status')).toHaveText('Para is fed for today');
    await nav.getByRole('button', { name: 'Plan' }).click();
    await expect(page.getByTestId('plan-overall')).toContainText('1 / 9');
    await expect(page.getByText('Next', { exact: true })).toHaveCount(1);
    await expect(rows.filter({ has: page.getByText('Next', { exact: true }) })).not.toContainText(secondTitle);

    // Archive asks first, and then nothing is active.
    await page.getByRole('button', { name: 'Archive', exact: true }).click();
    await page.getByRole('dialog', { name: 'Archive this plan?' }).getByRole('button', { name: 'Archive plan' }).click();
    await expect(page.getByText('No active plan')).toBeVisible();
  } finally {
    await running?.close().catch(() => undefined);
    data.remove();
  }
});
