/**
 * `git.ts`, against real repositories built in a temp directory.
 *
 * The parser is exercised on captured text where a real repository cannot
 * produce the shape cheaply, and everything else runs against an actual `git
 * log`, because the parts most likely to break are the ones that depend on how
 * git actually prints: the accented paths the corpus carries, and what happens
 * when there is no repository at all.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { after, before, describe, it } from 'node:test';

import { toPosix } from '../src/config.ts';
import {
    COMMIT_MARKER,
    daysSince,
    FIELD_SEPARATOR,
    lastTouchByFile,
    lastTouchUnderDir,
    newestDate,
    parseCommitLog,
    readCommitLog,
} from '../src/git.ts';

const HAS_GIT = spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;

let fixtureRoot: string;
let caseCount = 0;

before(() => {
    fixtureRoot = mkdtempSync(path.join(tmpdir(), 'studylink-git-'));
});

after(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
});

type Stage = {
    /** Author and committer date, pinned so the assertions are not clock-bound. */
    readonly date: string;
    readonly files: Record<string, string>;
    /** Paths removed in this commit, so a deletion can be exercised. */
    readonly removed?: readonly string[];
};

function git(cwd: string, args: readonly string[], env: Record<string, string> = {}): void {
    const result = spawnSync('git', [...args], {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, ...env },
    });
    if (result.status !== 0) {
        throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
    }
}

/** Build a repository whose history is exactly `stages`, oldest first. */
function repo(stages: readonly Stage[]): string {
    caseCount += 1;
    const root = path.join(fixtureRoot, `case-${String(caseCount)}`);
    mkdirSync(root, { recursive: true });
    git(root, ['init', '-q', '-b', 'main']);

    for (const stage of stages) {
        for (const [relative, contents] of Object.entries(stage.files)) {
            const target = path.join(root, relative);
            mkdirSync(path.dirname(target), { recursive: true });
            writeFileSync(target, contents, 'utf8');
        }
        for (const relative of stage.removed ?? []) {
            rmSync(path.join(root, relative), { force: true });
        }
        git(root, ['add', '-A']);
        git(
            root,
            [
                '-c',
                'user.name=studylink test',
                '-c',
                'user.email=test@example.com',
                '-c',
                'commit.gpgsign=false',
                'commit',
                '-q',
                '-m',
                stage.date,
            ],
            {
                GIT_AUTHOR_DATE: `${stage.date}T12:00:00+0000`,
                GIT_COMMITTER_DATE: `${stage.date}T12:00:00+0000`,
            }
        );
    }

    return toPosix(root);
}

describe('parsing a commit log', () => {
    it('reads a commit header and the paths under it', () => {
        const text = [
            `${COMMIT_MARKER}abc123${FIELD_SEPARATOR}2026-09-02`,
            'Books/README.md',
            'Books/Chapter 1.md',
            '',
            `${COMMIT_MARKER}def456${FIELD_SEPARATOR}2026-07-11`,
            'Midu.dev/README.md',
        ].join('\n');

        assert.deepEqual(parseCommitLog(text), [
            { sha: 'abc123', date: '2026-09-02', files: ['Books/README.md', 'Books/Chapter 1.md'] },
            { sha: 'def456', date: '2026-07-11', files: ['Midu.dev/README.md'] },
        ]);
    });

    it('keeps a commit that touched no file, which is what a merge looks like', () => {
        const text = [
            `${COMMIT_MARKER}merge1${FIELD_SEPARATOR}2026-09-02`,
            '',
            `${COMMIT_MARKER}real01${FIELD_SEPARATOR}2026-09-01`,
            'a.md',
        ].join('\n');
        const commits = parseCommitLog(text);

        assert.equal(commits.length, 2);
        assert.deepEqual(commits[0]?.files, []);
    });

    it('returns nothing for empty output', () => {
        assert.deepEqual(parseCommitLog(''), []);
    });
});

describe('folding a commit stream into dates', () => {
    it('takes the newest date per file, whatever order the commits arrive in', () => {
        // The log is ordered by committer date but the dates recorded are author
        // dates, so first-seen would be wrong after a rebase. This is the
        // mutation that swapping the fold for `if (!dates.has(file))` introduces.
        const dates = lastTouchByFile([
            { sha: 'a', date: '2026-01-01', files: ['note.md'] },
            { sha: 'b', date: '2026-05-05', files: ['note.md'] },
            { sha: 'c', date: '2026-03-03', files: ['note.md'] },
        ]);

        assert.equal(dates.get('note.md'), '2026-05-05');
    });

    it('ignores a commit with no date rather than recording an empty one', () => {
        const dates = lastTouchByFile([{ sha: 'a', date: '', files: ['note.md'] }]);

        assert.equal(dates.size, 0);
    });

    it('finds the newest date at or under a directory', () => {
        const dates = new Map([
            ['Books/One/a.md', '2026-01-01'],
            ['Books/One/nested/b.md', '2026-04-04'],
            ['Books/Onelike/c.md', '2026-12-12'],
            ['Books/Two/d.md', '2026-09-09'],
        ]);

        // `Books/Onelike` must not be swept in by a prefix compare that forgets
        // the separator, or one resource inherits another's date.
        assert.equal(lastTouchUnderDir(dates, 'Books/One'), '2026-04-04');
        assert.equal(lastTouchUnderDir(dates, 'Books/Missing'), null);
    });

    it('picks the newest of a mixed set and stays null when all are unknown', () => {
        assert.equal(newestDate([null, '2026-01-01', null, '2026-02-02']), '2026-02-02');
        assert.equal(newestDate([null, null]), null);
        assert.equal(newestDate([]), null);
    });
});

describe('counting days', () => {
    it('measures whole calendar days and never goes negative', () => {
        const now = new Date('2026-09-06T03:00:00Z');

        assert.equal(daysSince('2026-09-06', now), 0);
        assert.equal(daysSince('2026-09-02', now), 4);
        assert.equal(daysSince('2026-07-11', now), 57);
        assert.equal(daysSince('2026-12-25', now), 0, 'a future date is not negative days old');
    });

    it('does not change with the hour the tool is run at', () => {
        assert.equal(
            daysSince('2026-09-02', new Date('2026-09-06T00:00:01Z')),
            daysSince('2026-09-02', new Date('2026-09-06T23:59:59Z'))
        );
    });
});

describe('reading a real repository', { skip: !HAS_GIT }, () => {
    it('reports the newest commit touching each file', () => {
        const root = repo([
            { date: '2026-07-11', files: { 'a.md': 'one', 'b.md': 'one' } },
            { date: '2026-09-02', files: { 'a.md': 'two' } },
        ]);
        const log = readCommitLog(root);
        const dates = lastTouchByFile(log.commits);

        assert.equal(log.unavailable, null);
        assert.equal(log.commits.length, 2);
        assert.equal(dates.get('a.md'), '2026-09-02');
        assert.equal(dates.get('b.md'), '2026-07-11');
    });

    it('returns accented paths as they are on disk, not octal-escaped', () => {
        // Without `core.quotepath=false` git prints "Formula 1\302\256/README.md"
        // and every lookup for that resource misses.
        const accented =
            'Santander/High-Performance Leadership - Lessons from Formula 1®/README.md';
        const spanish = 'Midu.dev/Introducción al Web Scraping con Python.md';
        const root = repo([{ date: '2026-09-02', files: { [accented]: 'one', [spanish]: 'one' } }]);
        const dates = lastTouchByFile(readCommitLog(root).commits);

        assert.equal(dates.get(accented), '2026-09-02');
        assert.equal(dates.get(spanish), '2026-09-02');
    });

    it('records the commit that deleted a file, so a stale path is visible', () => {
        const root = repo([
            { date: '2026-07-11', files: { 'gone.md': 'one' } },
            { date: '2026-09-02', files: {}, removed: ['gone.md'] },
        ]);
        const dates = lastTouchByFile(readCommitLog(root).commits);

        assert.equal(dates.get('gone.md'), '2026-09-02');
    });

    it('uses the author date, not the committer date', () => {
        caseCount += 1;
        const root = path.join(fixtureRoot, `case-${String(caseCount)}`);
        mkdirSync(root, { recursive: true });
        git(root, ['init', '-q', '-b', 'main']);
        writeFileSync(path.join(root, 'a.md'), 'one', 'utf8');
        git(root, ['add', '-A']);
        git(
            root,
            [
                '-c',
                'user.name=studylink test',
                '-c',
                'user.email=test@example.com',
                '-c',
                'commit.gpgsign=false',
                'commit',
                '-q',
                '-m',
                'rebased',
            ],
            {
                GIT_AUTHOR_DATE: '2025-02-27T12:00:00+0000',
                GIT_COMMITTER_DATE: '2026-04-03T12:00:00+0000',
            }
        );

        const dates = lastTouchByFile(readCommitLog(toPosix(root)).commits);

        assert.equal(dates.get('a.md'), '2025-02-27');
    });

    it('reports a repository with no commits as unavailable rather than throwing', () => {
        const root = repo([]);
        const log = readCommitLog(root);

        assert.deepEqual(log.commits, []);
        assert.ok(log.unavailable !== null, 'an empty repository should carry a reason');
    });
});

describe('reading something that is not a repository', () => {
    it('comes back empty with a reason instead of throwing', () => {
        caseCount += 1;
        const root = path.join(fixtureRoot, `case-${String(caseCount)}`);
        mkdirSync(root, { recursive: true });

        const log = readCommitLog(toPosix(root));

        assert.deepEqual(log.commits, []);
        assert.ok(log.unavailable !== null, 'a non-repository should carry a reason');
        assert.equal(lastTouchByFile(log.commits).size, 0);
    });

    it('comes back empty with a reason for a directory that does not exist', () => {
        const log = readCommitLog(toPosix(path.join(fixtureRoot, 'no-such-directory')));

        assert.deepEqual(log.commits, []);
        assert.ok(log.unavailable !== null);
    });
});
